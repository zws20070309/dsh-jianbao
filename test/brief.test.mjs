/**
 * 纯函数自测：日期/人名/字数/标题/块规整。不依赖 DSH、不依赖 LaTeX。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BRIEF_TYPES,
  HEADING_STYLES,
  LAYOUT,
  UNITS,
  addComrade,
  cleanTitleRepeats,
  countChars,
  countBodyChars,
  ensureContestWording,
  extractMonthDay,
  extractTimeHm,
  formatLeaders,
  normalizeBlocks,
  normalizeForm,
  normalizeTitle,
  splitNames,
} from '../lib/brief.js'

test('版式常量与用户给定规范一致', () => {
  assert.equal(LAYOUT.paper.widthMm, 210)
  assert.equal(LAYOUT.paper.heightMm, 297)
  assert.equal(LAYOUT.margin.topCm, 3.7)
  assert.equal(LAYOUT.margin.bottomCm, 3.5)
  assert.equal(LAYOUT.margin.leftCm, 2.8)
  assert.equal(LAYOUT.margin.rightCm, 2.6)
  assert.equal(LAYOUT.linePt, 28.8)
  assert.equal(LAYOUT.titleSizePt, 22)
  assert.equal(LAYOUT.bodySizePt, 16)
  assert.equal(HEADING_STYLES[1].sizePt, 20)
  assert.equal(HEADING_STYLES[1].font, '方正黑体简体')
  assert.equal(HEADING_STYLES[2].sizePt, 16)
  assert.equal(HEADING_STYLES[2].bold, true)
  assert.equal(HEADING_STYLES[3].sizePt, 16)
  assert.equal(HEADING_STYLES[3].bold, true)
})

test('twips 与 pt 换算与 DOCX 时代的实测值对齐', () => {
  assert.equal(UNITS.twipsToPt(576), 28.8)
  assert.equal(UNITS.ptToTwips(28.8), 576)
  // 参考实现的缇级页边距 2098/1985/1588/1474 ↔ 我们的 cm 值（1cm ≈ 567 twips）
  assert.ok(Math.abs(LAYOUT.margin.topCm * 566.93 - 2098) < 3)
  assert.ok(Math.abs(LAYOUT.margin.bottomCm * 566.93 - 1985) < 3)
  assert.ok(Math.abs(LAYOUT.margin.leftCm * 566.93 - 1588) < 3)
  assert.ok(Math.abs(LAYOUT.margin.rightCm * 566.93 - 1474) < 3)
})

test('日期：多种写法统一成 X月X日', () => {
  assert.equal(extractMonthDay('2026年8月31日'), '8月31日')
  assert.equal(extractMonthDay('8.31'), '8月31日')
  assert.equal(extractMonthDay('8/31'), '8月31日')
  assert.equal(extractMonthDay('8-31'), '8月31日')
  assert.equal(extractMonthDay('2026-04-27 14:00'), '4月27日')
  assert.equal(extractMonthDay('8月31日'), '8月31日')
  // 非法值不猜
  assert.equal(extractMonthDay('待定'), '待定')
})

test('时间：只认 X:XX', () => {
  assert.equal(extractTimeHm('2026年4月27日 14:30'), '14:30')
  assert.equal(extractTimeHm('14：05'), '14:05')
  assert.equal(extractTimeHm('下午'), '')
})

test('领导称谓：加「同志」，已带职务的不重复加', () => {
  assert.equal(addComrade('周某某'), '周某某同志')
  assert.equal(addComrade('张某某同志'), '张某某同志')
  assert.equal(addComrade('李某某书记'), '李某某书记')
  assert.equal(addComrade(''), '')
  assert.equal(formatLeaders(['李某某', '刘某某']), '李某某同志、刘某某同志')
  assert.deepEqual(splitNames('李某某、刘某某，张某某'), ['李某某', '刘某某', '张某某'])
})

test('字数统计不含标点（与参考实现同口径）', () => {
  // 为了落实要求(6) + 4月27日(5) + 召开会议(4) = 15；标点与空格不计
  assert.equal(countChars('为了落实要求，4月27日召开会议。'), 15)
  assert.equal(countChars(''), 0)
  assert.equal(
    countBodyChars([
      { type: 'p', text: '第一段。' },
      { type: 'h1', text: '一、标题' },
      { type: 'p', text: '第二段。' },
    ]),
    6,
  )
})

test('块规整：丢空块、裁掉第三张以上的并排图、认不出的类型忽略', () => {
  const { blocks, paragraphs } = normalizeBlocks([
    { type: 'p', text: '  第一段  ' },
    { type: 'p', text: '   ' },
    { type: 'h2', text: '（一）小节' },
    { type: 'image', src: 'assets/a.png' },
    { type: 'imagePair', srcs: ['assets/b.png', 'assets/c.png', 'assets/d.png'] },
    { type: 'unknown', text: '忽略' },
  ])
  assert.equal(paragraphs, 1)
  assert.equal(blocks.length, 4)
  assert.equal(blocks[0].text, '第一段')
  assert.deepEqual(blocks[3].srcs, ['assets/b.png', 'assets/c.png'])
})

test('标题：留空按模板生成，重复单位名被清掉', () => {
  assert.equal(normalizeTitle('', BRIEF_TYPES.contest, '心理健康知识竞赛'), '西藏大学理学院举办心理健康知识竞赛')
  assert.equal(cleanTitleRepeats('西藏大学理学院举办西藏大学理学院竞赛'), '西藏大学理学院举办竞赛')
  assert.equal(cleanTitleRepeats('理学院理学院召开会议'), '理学院召开会议')
})

test('竞赛用词：名称没带「赛」时标题补「大赛」', () => {
  assert.equal(ensureContestWording('西藏大学理学院举办职业生涯规划', '职业生涯规划'), '西藏大学理学院举办职业生涯规划大赛')
  assert.equal(ensureContestWording('西藏大学理学院举办第三届技能大赛', '技能大赛'), '西藏大学理学院举办第三届技能大赛')
})

test('表单归一化：类型回落 + 领导拆分', () => {
  const form = normalizeForm({ briefType: 'lecture', activityTime: '2026年4月27日 14:00', leaderName: '周某某', audience: '2026级新生' })
  assert.equal(form.briefType.noun, '讲座')
  assert.equal(form.timeText, '4月27日')
  assert.equal(form.timeHm, '14:00')
  assert.deepEqual(form.leaders, ['周某某'])
  assert.equal(normalizeForm({}).briefType.id, 'activity')
})
