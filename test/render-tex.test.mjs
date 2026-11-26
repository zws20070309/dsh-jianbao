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
  // 正文首行缩进 2 字符（语料 63/63 篇、230 段全是 firstLineChars=200）
  assert.match(tex, /\\setlength\{\\parindent\}\{2em\}/u)
})

test('字号全部按实测 bp 写：正文 15.96 / 标题 21.96 / 一级 19.93 / 抄送 15', () => {
  const tex = renderTex(doc)
  assert.match(tex, /\{\\FZTitleLatin\\FZTitle\\fontsize\{21\.96bp\}\{28\.92bp\}\\selectfont/u)
  assert.match(tex, /\{\\FZHOneLatin\\FZHOne\\fontsize\{19\.93bp\}\{28\.8bp\}\\selectfont 一、赛前准备\}/u)
  assert.match(tex, /\{\\FZHTwoLatin\\FZHTwo\\bfseries \\fontsize\{15\.96bp\}\{28\.8bp\}\\selectfont （一）赛制安排\}/u)
  assert.match(tex, /\{\\FZHThreeLatin\\FZHThree\\bfseries \\fontsize\{15\.96bp\}\{28\.8bp\}\\selectfont 1\. 报名情况\}/u)
  assert.match(tex, /\\FZCcLatin\\FZCc\\fontsize\{15bp\}\{15bp\}\\selectfont/u)
})

test('正文段首行缩进 2 字符（语料 63/63 篇 · 230 段全是 firstLineChars=200）', () => {
  const tex = renderTex(doc)
  // 以 docx 源为准：每一篇的正文段落都设了 w:firstLineChars="200"（2 字符）。
  // 之前判成「不缩进」是错的 —— 那是照着 74 号 PDF 的渲染结果反推的，
  // 而那份 PDF 恰恰丢掉了 docx 里的缩进设置。
  assert.match(tex, /\\setlength\{\\parindent\}\{2em\}/u)
  // 正文段落不能带 \noindent，否则缩进被吃掉
  assert.equal(/\\noindent 为了深入贯彻落实/u.test(tex), false, '正文段落不该写 \noindent')
  assert.match(tex, /\n为了深入贯彻落实/u, '正文段落应以裸文本开头（吃 parindent）')
})

test('抄送区：两条通栏线 + 绝对定位压末页底，缩进 14.8 / 59.2bp', () => {
  const tex = renderTex(doc)
  // 抄送不再用 \vfill 压底（那样一遇到 \newpage 就堆到页顶，实测横线跑到 y=127），
  // 改成 eso-pic 绝对定位，位置直接取参考实测值：
  //   rule1 y=687.25 / rule2 y=740.55（页面顶部起算）
  //   cc 首行基线 704.02 / 次行 732.82
  // 带星号：覆盖式注册，只对下一次 shipout（末页）生效
  assert.match(tex, /\\AddToShipoutPictureFG\*\{\\AtPageLowerLeft\{%/u)
  // 后面必须跟 \null 逼出一次 shipout，否则整段不会被画出来
  assert.match(tex, /\}\}\n\\null/u)
  assert.equal((tex.match(/\\rule\{442\.22bp\}/gu) || []).length, 2)
  // 横线：toY(687.25)+nudge = 841.92-687.25-0.5 = 154.17
  assert.match(tex, /\\put\(\\LenToUnit\{79\.4bp\},\\LenToUnit\{154\.17bp\}\)/u)
  // 抄送首行：x = 79.4+14.8 = 94.2, y = 841.92-704.02 = 137.9
  assert.match(tex, /\\put\(\\LenToUnit\{94\.2bp\},\\LenToUnit\{137\.9bp\}\)/u)
  assert.match(tex, /抄送：校领导、院领导/u)
  // 次行：x = 79.4+59.2 = 138.6, y = 841.92-732.82 = 109.1
  assert.match(tex, /\\put\(\\LenToUnit\{138\.6bp\},\\LenToUnit\{109\.1bp\}\)/u)
  assert.match(tex, /党委（校长）办公室、党委宣传部/u)
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
  // 注意不能简单断言「没有 AddToShipoutPictureFG」——
  // 抄送区现在也用同一机制做绝对定位。要精确检查**页脚**那一段不在。
  assert.equal(noPage.includes('\\FZPage\\fontsize{14.04bp}'), false, '关页码时不该画页脚')
  assert.equal(noPage.includes('\\\\FZPageLatin'), false, '关页码时不该声明页脚字族')
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
  // 参考实测结构（逐字符宽度）：2026 [3.82] 年 [7.17] 第74 [3.76] 期 [7.17]
  // 注意 issueText 已含「第N期」，外层只补前后两个间隙。
  assert.match(tex, /2026\\hspace\*\{3\.82bp\}年\\hspace\*\{7\.17bp\}第12期/u)
  // 末尾不能补间隙：Word 居中忽略行尾空白，TeX 的 \makebox 会算进盒宽，
  // 多补 7.17bp 整行就左移 3.5bp（实测 x0 239.56 vs 参考 243.29）。
  assert.equal(/第12期\\hspace\*/u.test(tex), false)
  assert.equal(/textbackslash\{\}hspace/u.test(tex), false)
  // 不能出现重复的「期」（曾经渲染成「第18 期期」）
  assert.equal(/期期/u.test(tex), false)
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

test('环绕图的负偏移不能是 undefined（wrapOverlapPt 必须在 METRICS 里有定义）', () => {
  // render-tex.js 曾引用 LAYOUT.wrapOverlapPt，而 brief.js 里根本没定义这个常量 ——
  // 一旦走 wrap=square 分支就会生成 '\vspace*{-undefined bp}'，编译直接失败。
  const tex = renderTex({
    ...doc,
    blocks: [{ type: 'image', src: 'assets/a.png', wrap: 'square', side: 'r' }],
  })
  assert.equal(/undefined/u.test(tex), false, '.tex 里出现了 undefined')
  assert.equal(typeof LAYOUT.wrapOverlapPt, 'number')
  assert.ok(LAYOUT.wrapOverlapPt > 0)
  assert.match(tex, /\\vspace\*\{-[\d.]+bp\}/u)
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
  // 参考 PDF 第 4 页 span 级实测：抄送两行 origin_y = 704.02 / 732.82
  assert.equal(METRICS.ccBaseline1, 704.02)
  assert.equal(METRICS.ccBaseline2, 732.82)
  assert.equal(METRICS.footerBaseline, 752.856)
})

test('抄送必须落偶数页：交给 TeX 判断，而不是在 JS 里估页号', () => {
  // 语料实测：63 篇里 4 页占 51 篇（81%）；4 页文档的空段落占 60–82%，
  // 2 页文档只有 9–52% —— 说明正文写完并没填满四页，是**刻意用空行把正文
  // 顶到第 4 页**，让抄送压偶数页。参考 PDF 也一样：第 3 页只有 3 行正文
  // 加一张大图，第 4 页只有抄送。
  //
  // 实现上不能按基线推页号：正文换页后 prev 会小于首页基线（第 2 页从
  // topSkip 重新起算），任何这种公式都会算错页号（实测把抄送推到了奇数页）。
  // 交给 TeX 自己看 \value{page} 才对。
  const tex = renderTex(doc)
  assert.match(tex, /\\ifodd\\value\{page\}\\newpage\\fi/u)
  assert.equal(METRICS.ccOnEvenPage, true)
})