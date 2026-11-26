
import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeYear, LAYOUT } from '../lib/brief.js'
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
