
import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeYear, LAYOUT, METRICS } from '../lib/brief.js'
import { renderTex } from '../lib/render-tex.js'

test('报头年份：中文数字 / 带「年」/ 全角，一律规范成四位阿拉伯数字', () => {
  // 63/63 样本的报头都是「2026年　第N期」；中文数字只出现在大标题里。
  assert.equal(normalizeYear('二零二六年'), '2026')
  assert.equal(normalizeYear('二〇二六'), '2026')
  assert.equal(normalizeYear('2026年'), '2026')
  assert.equal(normalizeYear('2026'), '2026')
  // 全角数字
  assert.equal(normalizeYear('２０２６年'), '2026')
  // 空 → 当年
  assert.equal(normalizeYear(''), String(new Date().getFullYear()))
  assert.equal(normalizeYear(null), String(new Date().getFullYear()))
  assert.equal(normalizeYear(undefined), String(new Date().getFullYear()))
})

test('报头不能渲染成「二零二六年年」：年份自带「年」时只补一个', () => {
  const tex = renderTex({
    title: '标题',
    issue: '第91期',
    year: '二零二六年',
    blocks: [{ type: 'p', text: '正文。' }],
  })
  assert.match(tex, /2026\\hspace\*\{3\.82bp\}年/u)
  assert.equal(/年年/u.test(tex), false)
  assert.equal(/二零二六/u.test(tex), false)
})

test('插图留白常量：20.7bp（参考样本图底与页脚的最小实测间距）', () => {
  assert.equal(LAYOUT.imageKeepPt, 20.7)
  // 图与上下文之间的留白：只用 \centering 时实测只剩 0.49bp（图贴文字），
  // 参考样本是 6.97 / 10.25 / 20.32bp。取 10bp 落在参考区间内。
  assert.equal(LAYOUT.imageGapPt, 10)
  assert.ok(LAYOUT.imageGapPt >= 6.97 && LAYOUT.imageGapPt <= 20.32)
})

test('正文末行不能压页脚：\maxdepth 必须归零，textheight 按 22 行算', () => {
  const d = {
    title: '标题',
    issue: '第1期',
    year: '2026',
    blocks: [{ type: 'p', text: '正文。' }],
    cc: ['校领导、院领导', '党委（校长）办公室、党委宣传部'],
  }
  const tex = renderTex(d)
  // \maxdepth 默认 4pt：不归零的话断页时末行可以多探出约 4bp，
  // 越过 textheight 的约束直接压在页脚「— N —」上（用户实测截图）。
  assert.equal(tex.includes('\\setlength{\\maxdepth}{0bp}'), true)
  // textheight = textBaselineLimit − marginTop + bodyPt*0.25
  const expected = Number((METRICS.textBaselineLimit - METRICS.marginTop + METRICS.bodyPt * 0.25).toFixed(3))
  assert.equal(tex.includes('\\setlength{\\textheight}{' + expected + 'bp}'), true)
  // 上限必须容得下 22 行（127.94 + 21×28.8 = 732.74），且让末行字形底不碰页脚字顶 740.80
  const lastBaseline = METRICS.topSkip + METRICS.marginTop + 21 * METRICS.linePt
  assert.ok(METRICS.textBaselineLimit >= lastBaseline, 'textheight 必须容得下 22 行')
  assert.ok(lastBaseline + METRICS.bodyPt * 0.25 < 740.8, '末行字形底不能碰到页脚字顶')
})

test('插图前后用 \\addvspace 而不是 \\vspace*（后者会阻止断页）', () => {
  const tex = renderTex({
    title: '标题',
    issue: '第1期',
    year: '2026',
    blocks: [
      { type: 'p', text: '正文。' },
      { type: 'image', src: 'assets/a.png' },
    ],
  })
  // \vspace* 是不可丢弃的胶，会阻止此处断页 —— 图放不下时整段推到下一页，
  // 上一页底部留一大片空白（实测第 2 页只剩 6 行、第 2 页只有 1 行那种空页）。
  // \addvspace 在断页点会被丢弃，不影响分页，视觉结果一致（实测都是 10.5bp）。
  assert.equal(tex.includes('\\addvspace{' + LAYOUT.imageGapPt + 'bp}'), true)
  assert.equal(/\\vspace\*\{' \+ LAYOUT\.imageGapPt/u.test(tex), false)
  // 不能再自己插 \newpage：图是单个盒子，TeX 本来就会整体移到下一页。
  // 探针实测此时 \\pagetotal 常常已 ≥ \\pagegoal（页面已溢出），
  // 再 \\newpage 就是断第二次 —— 那正是空页的来源。
  assert.equal(tex.includes('\\settoheight'), false)
  assert.equal(tex.includes('\\newpage\n\\fi'), false)
})
