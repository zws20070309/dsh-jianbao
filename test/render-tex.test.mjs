/**
 * 渲染器自测：版式映射、转义、页数估算。不跑 LaTeX，纯字符串断言。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { LAYOUT, UNITS } from '../lib/brief.js'
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

test('页面几何：A4 + 3.7/3.5/2.8/2.6cm + 固定行距 28.8pt', () => {
  const tex = renderTex(doc)
  assert.match(tex, /\\documentclass\[UTF8,fontset=none,a4paper\]\{ctexart\}/u)
  assert.match(tex, /top=3\.7cm,bottom=3\.5cm,left=2\.8cm,right=2\.6cm/u)
  assert.match(tex, /\\fontsize\{16pt\}\{28\.8pt\}\\selectfont/u)
  assert.match(tex, /\\setlength\{\\parindent\}\{0pt\}/u)
})

test('三号正文与二、一、三级标题的字号/字体宏都用上', () => {
  const tex = renderTex(doc)
  // 大标题 22pt
  assert.match(tex, /\{\\FZTitle\\fontsize\{22pt\}\{28\.8pt\}\\selectfont/u)
  // 一级标题 20pt（方正黑体）
  assert.match(tex, /\{\\FZHOne\\fontsize\{20pt\}\{28\.8pt\}\\selectfont 一、赛前准备\}/u)
  // 二级标题 16pt 加粗（方正楷体）
  assert.match(tex, /\\FZHTwo\\bfseries \\fontsize\{16pt\}\{28\.8pt\}\\selectfont （一）赛制安排/u)
  // 三级标题 16pt 加粗（方正仿宋）
  assert.match(tex, /\\FZHThree\\bfseries \\fontsize\{16pt\}\{28\.8pt\}\\selectfont 1\. 报名情况/u)
})

test('首行缩进 2 字符：正文段前有 2em', () => {
  const tex = renderTex(doc)
  assert.match(tex, /\\par\\noindent\\hspace\*\{2em\}为了深入贯彻落实/u)
})

test('抄送区：两条通栏横线 + 压到末页底部（\\vfill）', () => {
  const tex = renderTex(doc)
  assert.match(tex, /\\vfill/u)
  assert.equal((tex.match(/\\rule\{\\textwidth\}\{0\.5pt\}/gu) || []).length, 2)
  assert.match(tex, /抄送：校领导、院领导/u)
  assert.match(tex, /党委（校长）办公室、党委宣传部/u)
})

test('页脚「— N —」：14pt 右对齐，可关闭', () => {
  const tex = renderTex(doc)
  assert.match(tex, /\\fancyfoot\[R\]\{\\fontsize\{14pt\}\{14pt\}\\selectfont \\textemdash\\;\\thepage\\;\\textemdash\}/u)
  const noPage = renderTex({ ...doc, withPageNumber: false })
  assert.match(noPage, /\\fancyfoot\{\}/u)
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
  assert.match(tex, /\\newCJKfontfamily\\FZBody\[BoldFont=方正仿宋_GBK\]\{方正仿宋_GBK\}/u)
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

test('插图：大图独占 / 成对并排，受最大宽高约束', () => {
  const withImages = renderTex({
    ...doc,
    blocks: [
      { type: 'p', text: '正文。' },
      { type: 'image', src: 'assets/a.png', caption: '图注' },
      { type: 'imagePair', srcs: ['assets/b.png', 'assets/c.png'] },
    ],
  })
  assert.match(withImages, new RegExp('width=' + LAYOUT.largeImageWidthCm + 'cm,height=' + LAYOUT.largeImageMaxHeightCm + 'cm', 'u'))
  assert.match(withImages, new RegExp('width=' + LAYOUT.smallImageWidthCm + 'cm', 'u'))
  assert.match(withImages, /图注/u)
})

test('成对插图：两张图并排 + 图注各挂图下（tabular 对齐）', () => {
  const tex = renderTex({
    ...doc,
    blocks: [{ type: 'imagePair', srcs: ['assets/a.png', 'assets/b.png'], captions: ['现场讲解', '分组实验'] }],
  })
  // 两张图在同一行（用 & 分隔），且整块包在等宽 tabular 里
  assert.match(tex, /\\begin\{tabular\}.*\n.*includegraphics.*&.*includegraphics/u)
  assert.match(tex, /现场讲解\} & \{\\FZCc/u)
  assert.match(tex, /分组实验/u)
})

test('成对插图：没有图注时不生成 tabular（保持原来的单行并排）', () => {
  const tex = renderTex({
    ...doc,
    blocks: [{ type: 'imagePair', srcs: ['assets/a.png', 'assets/b.png'] }],
  })
  assert.equal(/\\begin\{tabular\}/u.test(tex), false)
  assert.match(tex, /\\includegraphics.*\\hspace\{0\.4cm\}\\includegraphics/u)
})

test('每页行数：正文区高度 ÷ 28.8pt', () => {
  const expected = Math.floor((29.7 - 3.7 - 3.5) / UNITS.ptToCm(28.8))
  assert.equal(linesPerPage(), expected)
  assert.equal(linesPerPage(), 22)
})
