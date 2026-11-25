/**
 * 简报 LaTeX 渲染器（XeLaTeX 源生成）
 *
 * 为什么是 XeLaTeX 而不是 XeLaTeX+ctexart：
 *   参考实现是 Word，靠 twips/固定行距/浮动图精确还原版式。LaTeX 侧用最少的宏包
 *   （geometry / fontspec / graphicx / fancyhdr / xcolor）直接给出同名同号的排版，
 *   不引入 ctex 的章节语义（简报没有 chapter/section 概念，只有自然段与小标题）。
 *
 * 版式落地对照（用户给定规则 → LaTeX）：
 *   A4                       → geometry paper=a4paper
 *   上下左右 3.7/3.5/2.8/2.6 → geometry top/bottom/left/right
 *   固定行距 28.8pt          → \fontsize{16pt}{28.8pt}\selectfont（行距随字号声明）
 *   正文 3号（16pt）方正仿宋 → \setmainfont 指向 simfang.ttf（本机无方正字库时自动回落）
 *   大标题 2号（22pt）小标宋 → 独立 group \sizeBody 内改字号
 *   一级黑体20pt / 二级楷体16pt粗 / 三级仿宋16pt粗 → 三个宏
 *
 * 字体策略（**必须**可运行，不允许因缺字体而编译失败）：
 *   1) 用户可用 setFont 指定字体文件路径（工作台「环境检测」里能看到本机有哪些）；
 *   2) 默认按「方正 → Windows 系统字体」两级回落：方正小标宋_GBK → SimSun，
 *      方正仿宋_GBK → simfang.ttf，方正黑体简体 → simhei.ttf，方正楷体_GBK → simkai.ttf；
 *   3) 仍然找不到就退回 xeCJK 的默认中文字体（不指定字体，只用字号），
 *      并在编译日志里给出 warning —— 拿到 PDF 优先于字体完全一致。
 *
 * @module @zws/dsh-tuiwen/render-tex
 */

import { LAYOUT, UNITS, HEADING_STYLES } from './brief.js'

/** 各角色默认字体候选（按优先级）。每一项是 {name, file}，file 为空表示交给系统按名字找。 */
export const FONT_CANDIDATES = {
  body: [
    { name: '方正仿宋_GBK', file: '' },
    { name: 'FZFangSong-Z02', file: '' },
    { name: 'FangSong', file: 'simfang.ttf' },
  ],
  title: [
    { name: '方正小标宋_GBK', file: '' },
    { name: 'FZXiaoBiaoSong-B05', file: '' },
    { name: 'SimSun', file: 'simsun.ttc' },
  ],
  h1: [
    { name: '方正黑体简体', file: '' },
    { name: 'FZHei-B01', file: '' },
    { name: 'SimHei', file: 'simhei.ttf' },
  ],
  h2: [
    { name: '方正楷体_GBK', file: '' },
    { name: 'FZKai-Z03', file: '' },
    { name: 'KaiTi', file: 'simkai.ttf' },
  ],
  h3: [
    { name: '方正仿宋_GBK', file: '' },
    { name: 'FangSong', file: 'simfang.ttf' },
  ],
  cc: [
    { name: '仿宋_GB2312', file: '' },
    { name: 'FangSong', file: 'simfang.ttf' },
  ],
}

/** 单字符替换表。**必须单趟扫描**：先转义 \ 再转义 { 会把 \textbackslash{} 里的
 * 花括号又转义一遍，输出变成 \textbackslash\{\}（已踩过）。 */
const TEX_ESCAPES = new Map([
  ['\\', '\\textbackslash{}'],
  ['&', '\\&'],
  ['%', '\\%'],
  ['$', '\\$'],
  ['#', '\\#'],
  ['_', '\\_'],
  ['{', '\\{'],
  ['}', '\\}'],
  ['~', '\\textasciitilde{}'],
  ['^', '\\textasciicircum{}'],
])

/** LaTeX 特殊字符转义（中文正文里出现 # $ % & _ { } ~ ^ \ 时不能炸）。 */
export function texEscape(text) {
  const raw = String(text ?? '')
  let out = ''
  for (const ch of raw) out += TEX_ESCAPES.get(ch) ?? ch
  return out
}

/**
 * 生成一条 \newCJKfontfamily 声明。
 * @param {string} macro 宏名（不带反斜杠）
 * @param {{name:string,file:string}} font 字体
 * @param {string} fontDir 字体目录（带结尾斜杠，LaTeX 路径用正斜杠）
 * @param {boolean} bold 是否带粗体
 */
function fontDecl(macro, font, fontDir, bold = false) {
  if (font === null || font === undefined) {
    // 全部候选都不可用：不做声明，宏指向默认中文字体
    return '\\providecommand\\' + macro + '{}\\renewcommand\\' + macro + '{}\n'
  }
  const dir = fontDir.replaceAll('\\', '/')
  if (font.file === '') {
    // 交给系统按字体名查找（用户机器上装了方正字库时走这条）
    return (
      '\\newCJKfontfamily\\' + macro + '[BoldFont=' + font.name + ']{' + font.name + '}\n'
    )
  }
  const ext = font.file.slice(font.file.lastIndexOf('.'))
  const base = font.file.slice(0, font.file.lastIndexOf('.'))
  const opts = [
    'Path=' + dir + '/',
    'Extension=' + ext,
    'UprightFont=' + base,
    // Windows 自带的楷体/仿宋没有独立粗体字面，BoldFont 指回自身等于没加粗。
    // AutoFakeBold 让 XeTeX 做伪粗（0.4pt 描边），二级/三级标题的「加粗」才真的看得出来。
    bold ? 'BoldFont=' + base : '',
    bold ? 'AutoFakeBold=2.5' : '',
  ].filter((s) => s !== '')
  return '\\newCJKfontfamily\\' + macro + '[' + opts.join(',') + ']{' + font.name + '}\n'
}

/**
 * 生成完整 .tex 源。
 * @param {object} doc BriefDoc
 * @param {object} options {fontDir, fonts:{body,title,h1,h2,h3,cc}, withPageNumber}
 * @returns {string}
 */
export function renderTex(doc, options = {}) {
  const fontDir = options.fontDir ?? 'C:/Windows/Fonts'
  const fonts = options.fonts ?? {}
  const margin = LAYOUT.margin
  const linePt = LAYOUT.linePt
  const bodyPt = LAYOUT.bodySizePt
  const ccPt = LAYOUT.ccSizePt
  const pnPt = LAYOUT.pageNumberSizePt

  const pick = (role) => fonts[role] ?? FONT_CANDIDATES[role][FONT_CANDIDATES[role].length - 1] ?? null

  const head = []
  head.push('\\documentclass[UTF8,fontset=none,a4paper]{ctexart}')
  head.push('\\usepackage[a4paper,top=' + margin.topCm + 'cm,bottom=' + margin.bottomCm + 'cm,left=' + margin.leftCm + 'cm,right=' + margin.rightCm + 'cm,headsep=0.5cm,footskip=1.2cm]{geometry}')
  head.push('\\usepackage{graphicx}')
  head.push('\\usepackage{xcolor}')
  head.push('\\usepackage{fancyhdr}')
  head.push('\\usepackage{calc}')
  head.push('\\pagestyle{fancy}')
  head.push('\\fancyhf{}')
  if (doc.withPageNumber === false) {
    head.push('\\fancyfoot{}')
  } else {
    head.push('\\fancyfoot[R]{\\fontsize{' + pnPt + 'pt}{' + pnPt + 'pt}\\selectfont \\textemdash\\;\\thepage\\;\\textemdash}')
  }
  head.push('\\renewcommand\\headrulewidth{0pt}')
  head.push('\\renewcommand\\footrulewidth{0pt}')
  // 不缩进、不额外段距：段距完全由 28.8pt 固定行距表达（与 Word 版一致）
  // 关掉中英文之间的自动空隙：Word 版没有这层间距，「第12期」不能变成「第 12 期」
  head.push('\\xeCJKsetup{CJKecglue={}}')
  head.push('\\setlength{\\parindent}{0pt}')
  head.push('\\setlength{\\parskip}{0pt}')
  head.push('')
  // 字体声明
  head.push(fontDecl('FZBody', pick('body'), fontDir))
  head.push(fontDecl('FZTitle', pick('title'), fontDir))
  head.push(fontDecl('FZHOne', pick('h1'), fontDir))
  head.push(fontDecl('FZHTwo', pick('h2'), fontDir, true))
  head.push(fontDecl('FZHThree', pick('h3'), fontDir, true))
  head.push(fontDecl('FZCc', pick('cc'), fontDir))
  head.push('')
  head.push('\\begin{document}')
  head.push('\\FZBody')
  head.push('\\fontsize{' + bodyPt + 'pt}{' + linePt + 'pt}\\selectfont')
  head.push('')

  const body = []

  // ── 报头区：期号 / 撰稿人-审签人-联系方式 ────────────────────────────────
  // 报头首行：「2026年　第12期」——参考实现是「{年}年 {期号}」，
  // 年份没显式给就用当年（用户的简报几乎都是当期的，留空让他每次填是负担）。
  const year = String(doc.year ?? '').trim() === '' ? String(new Date().getFullYear()) : String(doc.year).trim()
  const issueText = String(doc.issue ?? '').trim()
  const issueLine = issueText === '' ? '' : [year + '年', issueText].join('　')
  if (issueLine !== '') {
    // 参考实现在首行前留约 5.1cm 的顶空（Word 段前 124.6pt + 上边距），这里补 1.4cm
    body.push('\\vspace*{1.4cm}')
    body.push('\\begin{center}')
    body.push('\\fontsize{' + bodyPt + 'pt}{' + linePt + 'pt}\\selectfont ' + texEscape(issueLine))
    body.push('\\end{center}')
  }
  const org = String(doc.org ?? '').trim()
  const author = String(doc.author ?? '').trim()
  const phone = String(doc.phone ?? '').trim()
  const auditor = String(doc.auditor ?? '').trim()
  if (org !== '' || author !== '' || phone !== '') {
    // 两行报头：左单位、右撰稿人；第二行审签人+联系方式。
    // 用 \makebox 固定列宽对齐，避免依赖字符网格（LaTeX 没有 Word 的 docGrid）。
    body.push('\\par\\noindent ' + texEscape(org) + '\\hfill 撰 稿 人：' + texEscape(author) + '\\par')
    if (auditor !== '' || phone !== '') {
      body.push('\\par\\noindent 审签人：' + texEscape(auditor) + '\\hfill 联系方式：' + texEscape(phone) + '\\par')
    }
  }
  body.push('')

  // ── 大标题 ────────────────────────────────────────────────────────────
  const title = String(doc.title ?? '').trim()
  if (title !== '') {
    body.push('\\begin{center}')
    body.push('{\\FZTitle\\fontsize{' + LAYOUT.titleSizePt + 'pt}{' + linePt + 'pt}\\selectfont ' + texEscape(title) + '\\par}')
    body.push('\\end{center}')
    body.push('\\vspace{0pt}')
  }

  // ── 正文块 ────────────────────────────────────────────────────────────
  for (const block of Array.isArray(doc.blocks) ? doc.blocks : []) {
    if (block.type === 'p') {
      // 首行缩进 2 字符：2em 在 16pt 字号下正好 2 字
      body.push('\\par\\noindent\\hspace*{2em}' + texEscape(block.text) + '\\par')
      continue
    }
    if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
      const style = HEADING_STYLES[Number(block.type.slice(1))]
      const macro = style.level === 1 ? 'FZHOne' : style.level === 2 ? 'FZHTwo' : 'FZHThree'
      const bold = style.bold ? '\\bfseries ' : ''
      body.push('\\par\\noindent{\\' + macro + bold + '\\fontsize{' + style.sizePt + 'pt}{' + linePt + 'pt}\\selectfont ' + texEscape(block.text) + '}\\par')
      continue
    }
    if (block.type === 'image') {
      body.push(...imageLines([block.src], [block.caption], block.widthCm, 'large'))
      continue
    }
    if (block.type === 'imagePair') {
      body.push(...imageLines(block.srcs, block.captions ?? [], block.widthCm, 'pair'))
    }
  }

  // ── 抄送区 ────────────────────────────────────────────────────────────
  const cc = Array.isArray(doc.cc) ? doc.cc.filter((s) => String(s ?? '').trim() !== '') : []
  if (cc.length > 0) {
    body.push('')
    // \vfill：把抄送区压到**最后一页**底部（内容跨页时也只影响末页），
    // 对应参考实现的「动态空段把抄送压到最后一页底部」
    body.push('\\vfill')
    body.push('{\\FZCc\\fontsize{' + ccPt + 'pt}{' + linePt + 'pt}\\selectfont')
    body.push('\\noindent\\rule{\\textwidth}{0.5pt}\\par')
    // 第一条抄送行：抄送：xxx；第二条只写单位（参考版式的两条通栏横线）
    body.push('\\vspace{2pt}\\noindent ' + texEscape('抄送：' + cc[0]) + '\\par')
    for (const extra of cc.slice(1)) {
      body.push('\\vspace{2pt}\\noindent\\hspace*{3em}' + texEscape(extra) + '\\par')
    }
    body.push('\\vspace{2pt}\\noindent\\rule{\\textwidth}{0.5pt}\\par')
    body.push('}')
  }

  body.push('')
  body.push('\\end{document}')

  return head.join('\n') + '\n' + body.join('\n') + '\n'
}

/**
 * 图片块 → LaTeX 行。大图单张独占（居中、按宽高上限等比），成对图并排（每张 8.3cm，等高）。
 * @param {string[]} srcs 图片相对路径（相对 .tex 所在目录）
 * @param {string[]} captions 图注（可空）
 * @param {number|undefined} widthCm 覆盖宽度
 * @param {'large'|'pair'} mode
 */
function imageLines(srcs, captions, widthCm, mode) {
  const out = []
  const list = srcs.filter((s) => typeof s === 'string' && s !== '')
  if (list.length === 0) return out
  if (mode === 'large' || list.length === 1) {
    const width = widthCm ?? LAYOUT.largeImageWidthCm
    out.push('\\par\\begin{center}')
    out.push('\\includegraphics[width=' + width + 'cm,height=' + LAYOUT.largeImageMaxHeightCm + 'cm,keepaspectratio]{' + texPath(list[0]) + '}')
    const cap = String(captions?.[0] ?? '').trim()
    if (cap !== '') out.push('\\par\\vspace{2pt}{\\FZCc\\fontsize{10.5pt}{14pt}\\selectfont ' + texEscape(cap) + '}')
    out.push('\\end{center}\\par')
    return out
  }
  const width = widthCm ?? LAYOUT.smallImageWidthCm
  out.push('\\par\\begin{center}')
  const cells = []
  for (let i = 0; i < Math.min(2, list.length); i += 1) {
    cells.push('\\includegraphics[width=' + width + 'cm,height=' + LAYOUT.smallImageMaxHeightCm + 'cm,keepaspectratio]{' + texPath(list[i]) + '}')
  }
  out.push(cells.join('\\hspace{0.4cm}'))
  out.push('\\end{center}\\par')
  return out
}

/** 图片路径转 LaTeX：反斜杠→正斜杠，其余交给 texEscape（路径里可能有空格/中文，不能整体转义）。 */
export function texPath(path) {
  const slashed = String(path ?? '').replaceAll('\\', '/')
  let out = ''
  for (const ch of slashed) {
    if (ch === '#' || ch === '%' || ch === '&') out += TEX_ESCAPES.get(ch)
    else out += ch
  }
  return out
}

/** 计算固定行距下每页可容纳行数（用于「抄送压到末页底部」的行数估算）。 */
export function linesPerPage() {
  const textHeightCm = 29.7 - LAYOUT.margin.topCm - LAYOUT.margin.bottomCm
  const lineCm = UNITS.ptToCm(LAYOUT.linePt)
  return Math.floor(textHeightCm / lineCm)
}
