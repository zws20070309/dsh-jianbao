/**
 * 渲染器自测：版式映射、转义、页数估算、几何常量。
 *
 * 断言对象是「生成的 .tex 源」，不跑 LaTeX（真编译在 tools/selftest.mjs 与
 * tools/geometry-diff.mjs 里做）。所以这里锁的是**实测常量有没有被写错**。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { LAYOUT, METRICS, UNITS } from '../lib/brief.js'
import { FONT_CANDIDATES, linesPerPage, renderTex, texEscape, texPath } from '../lib/render-tex.js'

const doc = {
  title: '拨开心灵迷雾，解码心理世界——西藏大学理学院举办第三届心理健康知识竞赛',
  issue: '第12期',
  year: '2026',
  author: '孙某某',
  auditor: '张某某',
  phone: '13800000000',
  org: '西藏大学理学院',
  blocks: [
    { type: 'p', text: '为了深入贯彻落实立德树人根本任务，4月27日14:00，理学院举办第三届心理健康知识竞赛。' },
    { type: 'h1', text: '一、赛前准备' },
    { type: 'h2', text: '（一）赛制安排' },
    { type: 'h3', text: '1. 报名情况' },
    { type: 'p', text: '全院共 12 个班级报名参赛。' },
  ],
  cc: ['校领导、院领导', '党委（校长）办公室、党委宣传部'],
}

test('页面几何：A4 595.32×841.92bp + 左79.4/右73.7/上104.9/下99.25bp', () => {
  const tex = renderTex(doc)
  assert.match(tex, /\\documentclass\[UTF8,fontset=none\]\{ctexart\}/u)
  assert.match(tex, /paperwidth=595\.32bp,paperheight=841\.92bp/u)
  assert.match(tex, /left=79\.4bp,right=73\.7bp,top=104\.9bp,bottom=99\.25bp/u)
  assert.match(tex, /\\fontsize\{15\.96bp\}\{28\.8bp\}\\selectfont/u)
  assert.match(tex, /\\setlength\{\\parindent\}\{0pt\}/u)
})

test('字号全部按实测 bp 写：正文 15.96 / 标题 21.96 / 一级 19.93 / 抄送 15', () => {
  const tex = renderTex(doc)
  assert.match(tex, /\{\\FZTitleLatin\\FZTitle\\fontsize\{21\.96bp\}\{28\.92bp\}\\selectfont/u)
  assert.match(tex, /\{\\FZHOneLatin\\FZHOne\\fontsize\{19\.93bp\}\{28\.8bp\}\\selectfont 一、赛前准备\}/u)
  assert.match(tex, /\{\\FZHTwoLatin\\FZHTwo\\bfseries \\fontsize\{15\.96bp\}\{28\.8bp\}\\selectfont （一）赛制安排\}/u)
  assert.match(tex, /\{\\FZHThreeLatin\\FZHThree\\bfseries \\fontsize\{15\.96bp\}\{28\.8bp\}\\selectfont 1\. 报名情况\}/u)
  assert.match(tex, /\{\\FZCcLatin\\FZCc\\fontsize\{15bp\}\{28\.8bp\}\\selectfont/u)
})

test('正文段不缩进（与参考 PDF 一致：正文左边界 = 报头左边界 = 79.4）', () => {
  const tex = renderTex(doc)
  assert.equal(/\\hspace\*\{2em\}/u.test(tex), false)
  assert.match(tex, /\\noindent 为了深入贯彻落实/u)
})

test('抄送区：两条通栏线 + \\vfill 压末页底，缩进 14.8 / 59.2bp', () => {
  const tex = renderTex(doc)
  assert.match(tex, /\\par\\vfill\\nointerlineskip/u)
  assert.equal((tex.match(/\\rule\{\\linewidth\}\{1bp\}/gu) || []).length, 2)
  assert.match(tex, /\\noindent\\hspace\*\{14\.8bp\}抄送：校领导、院领导/u)
  assert.match(tex, /\\noindent\\hspace\*\{59\.2bp\}党委（校长）办公室、党委宣传部/u)
})

test('页脚：eso-pic 绝对定位到基线 752.856 / 右端 506.01', () => {
  const tex = renderTex(doc)
  assert.match(tex, /\\AddToShipoutPictureFG/u)
  // 左端锚在参考实测的 454.78，再减掉 eso-pic 坐标系 7.98bp 的固有偏移。
  const expectedX = Math.round((METRICS.footerDashLeft - METRICS.footerLeftNudge) * 1000) / 1000
  const expectedY = Math.round((METRICS.pageH - METRICS.footerBaseline) * 1000) / 1000
  assert.match(tex, new RegExp('\\\\put\\(\\\\LenToUnit\\{' + expectedX + 'bp\\},\\\\LenToUnit\\{' + expectedY + 'bp\\}\\)', 'u'))
  // 三段定宽：dash 14.04 + 数字占位 21.00 + dash 14.04 + 尾空格 2.15 = 51.23
  // 454.78 + 51.23 = 506.01，正是参考页脚的右端。
  const total = Math.round(
    (METRICS.pageDashBox + METRICS.pageNumBox + METRICS.pageDashBox + METRICS.pageTailBox) * 1000,
  ) / 1000
  assert.match(tex, new RegExp('\\\\makebox\\[' + total + 'bp\\]\\[l\\]\\{', 'u'))
  assert.match(tex, /\\makebox\[21bp\]\[l\]\{\\fontspec\{Times New Roman\}/u)
  assert.equal(Math.round((METRICS.footerDashLeft + total) * 100) / 100, 506.01, '页脚右端必须落在 506.01')
  const noPage = renderTex({ ...doc, withPageNumber: false })
  assert.equal(/AddToShipoutPictureFG/u.test(noPage), false)
})

test('字体回落：没给字体时走候选表最后一项（系统字体），不会留空宏', () => {
  const tex = renderTex(doc, { fontDir: 'C:/Windows/Fonts' })
  assert.match(tex, /\\newCJKfontfamily\\FZBody\[Path=C:\/Windows\/Fonts\//u)
  assert.equal(FONT_CANDIDATES.body.at(-1).file, 'simfang.ttf')
  assert.equal(FONT_CANDIDATES.title.at(-1).file, 'simsun.ttc')
  assert.equal(FONT_CANDIDATES.h1.at(-1).file, 'simhei.ttf')
  assert.equal(FONT_CANDIDATES.h2.at(-1).file, 'simkai.ttf')
})

test('字体回落：显式给方正字体名时只写名字，让系统按名查找', () => {
  const tex = renderTex(doc, { fonts: { body: { name: '方正仿宋_GBK', file: '' } } })
  assert.match(tex, /\\newCJKfontfamily\\FZBody\[\]\{方正仿宋_GBK\}/u)
})

test('用户字体目录：@LOCAL/ 前缀解析到 localFontDir', () => {
  const tex = renderTex(doc, {
    localFontDir: 'C:/Users/USER/AppData/Local/Microsoft/Windows/Fonts',
    fonts: { cc: { name: '仿宋_GB2312', file: '@LOCAL/仿宋_GB2312.ttf' } },
  })
  assert.match(tex, /\\newCJKfontfamily\\FZCc\[Path=C:\/Users\/ZWS\/AppData\/Local\/Microsoft\/Windows\/Fonts\//u)
})

test('伪粗体：二/三级标题在系统字体上也要真的变粗', () => {
  const tex = renderTex(doc)
  assert.match(tex, /\\newCJKfontfamily\\FZHTwo\[[^\]]*AutoFakeBold=2\.5\][^\n]*\n/u)
  assert.match(tex, /\\newCJKfontfamily\\FZHThree\[[^\]]*AutoFakeBold=2\.5\][^\n]*\n/u)
})

test('转义：LaTeX 特殊字符不会炸', () => {
  assert.equal(texEscape('50% & $5 #1_2'), '50\\% \\& \\$5 \\#1\\_2')
  assert.equal(texEscape('a\\b'), 'a\\textbackslash{}b')
  assert.equal(texPath('assets\\fig 1.png'), 'assets/fig 1.png')
})

test('期号行里的 \\hspace 不会被转义成文字', () => {
  const tex = renderTex(doc)
  assert.match(tex, /2026年\\hspace\*\{7\.8bp\}第12期/u)
  assert.equal(/textbackslash\{\}hspace/u.test(tex), false)
})

test('插图：大图独占 / 成对并排，受最大宽高约束', () => {
  const withImages = renderTex({
    ...doc,
    blocks: [
      { type: 'p', text: '正文。' },
      { type: 'image', src: 'assets/a.png' },
      { type: 'imagePair', srcs: ['assets/b.png', 'assets/c.png'] },
    ],
  })
  assert.match(withImages, new RegExp('width=' + LAYOUT.largeImageWidthCm + 'cm,height=' + LAYOUT.largeImageMaxHeightCm + 'cm', 'u'))
  assert.match(withImages, new RegExp('width=' + LAYOUT.smallImageWidthCm + 'cm', 'u'))
  assert.match(withImages, /\\includegraphics.*\\hspace\{0\.4cm\}\\includegraphics/u)
})

test('插图**不生成图注**：63 份真实简报里独立题注段为 0 份', () => {
  // 即便调用方传了 caption / captions，渲染器也必须忽略 ——
  // 参考简报的图直接压在正文行间，下面不跟任何说明文字。
  const tex = renderTex({
    ...doc,
    blocks: [
      { type: 'image', src: 'assets/a.png', caption: '图片1 现场' },
      { type: 'imagePair', srcs: ['assets/b.png', 'assets/c.png'], captions: ['图片2 甲', '图片3 乙'] },
    ],
  })
  assert.equal(/图片1|图片2|图片3/u.test(tex), false, '图注文字不得出现在 .tex 里')
  assert.equal(/\\begin\{tabular\}/u.test(tex), false, '不能为了放图注而生成表格')
  assert.equal(/caption/u.test(tex), false)
})

test('成对插图：两张图并排，不加表格也不加题注行', () => {
  const tex = renderTex({
    ...doc,
    blocks: [{ type: 'imagePair', srcs: ['assets/a.png', 'assets/b.png'] }],
  })
  assert.equal(/\\begin\{tabular\}/u.test(tex), false)
  assert.match(tex, /\\includegraphics.*\\hspace\{0\.4cm\}\\includegraphics/u)
  // 两张图在同一行：只允许一个 center 环境
  assert.equal((tex.match(/\\begin\{center\}/gu) || []).length, 1)
})

test('单图环绕：指定 wrap=square + side 时走 wrapfig（对应 Word 的 wrapSquare）', () => {
  const tex = renderTex({
    ...doc,
    blocks: [{ type: 'image', src: 'assets/a.png', wrap: 'square', side: 'r' }],
  })
  assert.match(tex, /\\begin\{wrapfigure\}\{r\}/u)
  assert.equal(/\\begin\{center\}/u.test(tex), false)
})

test('每页行数：版心高 ÷ 28.8bp = 22 行', () => {
  const expected = Math.floor((METRICS.pageH - METRICS.marginTop - METRICS.marginBottom) / METRICS.linePt)
  assert.equal(linesPerPage(), expected)
  assert.equal(linesPerPage(), 22)
})

test('几何常量与参考 PDF 一致（防止有人改坏 METRICS）', () => {
  assert.equal(METRICS.pageW, 595.32)
  assert.equal(METRICS.pageH, 841.92)
  assert.equal(METRICS.marginLeft, 79.4)
  assert.equal(METRICS.marginRight, 73.7)
  assert.equal(METRICS.marginTop, 104.9)
  assert.equal(METRICS.marginBottom, 99.25)
  assert.equal(METRICS.linePt, 28.8)
  assert.equal(METRICS.bodyPt, 15.96)
  assert.equal(METRICS.titlePt, 21.96)
  assert.equal(METRICS.h1Pt, 19.93)
  assert.equal(METRICS.ccPt, 15)
  assert.equal(METRICS.pagePt, 14.04)
  assert.equal(METRICS.issueBaseline, 252.38)
  assert.equal(METRICS.masthead1, 277.49)
  assert.equal(METRICS.masthead2, 306.29)
  assert.equal(METRICS.title1, 367.73)
  assert.equal(METRICS.body1, 454.39)
  assert.equal(METRICS.page2Baseline, 127.94)
  assert.equal(METRICS.rule1Y, 687.25)
  assert.equal(METRICS.rule2Y, 740.55)
  assert.equal(METRICS.ccBaseline1, 705.02)
  assert.equal(METRICS.ccBaseline2, 733.82)
  assert.equal(METRICS.footerBaseline, 752.856)
})