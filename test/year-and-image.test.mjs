
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

test('插图前会先量高再决定是否换页（避免图顶着页脚）', () => {
  const tex = renderTex({
    title: '标题',
    issue: '第1期',
    year: '2026',
    blocks: [
      { type: 'p', text: '正文。' },
      { type: 'image', src: 'assets/a.png' },
    ],
  })
  // 量高 → 比较剩余纵深 → 放不下才 \newpage
  assert.equal(tex.includes('\\settoheight{\\dimen0}'), true)
  assert.equal(tex.includes('\\pagegoal-\\pagetotal'), true)
  assert.equal(tex.includes('\\dimen0+' + LAYOUT.imageKeepPt + 'bp'), true)
})
