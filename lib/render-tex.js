/**
 * 简报 LaTeX 渲染器（XeLaTeX 源生成）—— 像素级复刻 Word 版
 *
 * 权威基准（唯一）：参考 PDF
 *   远端仓库参考内容/简报/2026下/…〔2026〕74号….pdf（Word for Microsoft 365 导出）
 * 所有几何常量都是从该 PDF 的 span 级 origin（基线）与 bbox 反推的实测值，
 * 记录在 docs/FORMAT-SPEC.md，验收工具 tools/geometry-diff.mjs（容差 0.5bp）。
 *
 * 单位一律 **bp**（1bp = 1/72in = PDF 用户单位）。TeX 的 1pt = 1/72.27in，
 * 写 28.8pt 实际渲染 28.69bp，与 Word 的 28.80bp 每行差 0.11 —— 20 行漂 2.2pt。
 *
 * LaTeX 的基线推进规则（实测，见 _tmp/probe）：
 *   next_baseline = prev_baseline + (当前行的 \baselineskip) + \vspace
 * 首页首行基线 = marginTop + topSkip。
 * 换字号时 LaTeX 自动取新字号的 baselineskip（标题 28.92 / 正文 28.80 无缝衔接），
 * 所以只需要在"跨区块"处补 \vspace。
 *
 * @module @zws/dsh-jianbao/render-tex
 */

import { LAYOUT, HEADING_STYLES, METRICS, normalizeYear } from './brief.js'

/** 各角色字体候选（按优先级）。file 为空=按字体名交给系统找；@LOCAL/ 前缀=用户字体目录。 */
export const FONT_CANDIDATES = {
  body: [
    { name: '方正仿宋_GBK', file: '' },
    { name: 'FZFangSong-Z02', file: '' },
    { name: '仿宋_GB2312', file: '@LOCAL/仿宋_GB2312.ttf' },
    { name: 'FangSong', file: 'simfang.ttf' },
  ],
  title: [
    { name: '方正小标宋_GBK', file: '' },
    { name: 'FZXiaoBiaoSong-B05', file: '' },
    { name: '方正小标宋简体', file: '@LOCAL/方正小标宋简体.ttf' },
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
    { name: '仿宋_GB2312', file: '@LOCAL/仿宋_GB2312.ttf' },
    { name: 'FangSong', file: 'simfang.ttf' },
  ],
  // 页码用 SimSun：「—」的宽度与参考 PDF 一致（14.04）；仿宋的 em dash 更窄，右端会偏 8.9bp
  page: [
    { name: 'SimSun', file: 'simsun.ttc' },
    { name: 'FangSong', file: 'simfang.ttf' },
  ],
}

/** 单字符替换表。必须单趟扫描（先转义 \ 会把 \textbackslash{} 的括号再转一次）。 */
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

/** LaTeX 特殊字符转义。 */
export function texEscape(text) {
  const raw = String(text ?? '')
  let out = ''
  for (const ch of raw) out += TEX_ESCAPES.get(ch) ?? ch
  return out
}

/** 图片路径转 LaTeX（只转义路径会踩到的三个字符）。 */
export function texPath(path) {
  const slashed = String(path ?? '').replaceAll('\\', '/')
  let out = ''
  for (const ch of slashed) {
    if (ch === '#' || ch === '%' || ch === '&') out += TEX_ESCAPES.get(ch)
    else out += ch
  }
  return out
}

/** 保留三位小数，避免浮点噪声写进 .tex。 */
function r3(value) {
  return Math.round(value * 1000) / 1000
}

/**
 * 生成一条 \newCJKfontfamily 声明。
 * @param {string} macro 宏名（不带反斜杠）
 * @param {{name:string,file:string}} font 字体
 * @param {{dir:string,localDir:string}} paths 系统 / 用户字体目录
 * @param {boolean} bold 是否伪粗（AutoFakeBold）
 */
function fontDecl(macro, font, paths, bold = false) {
  if (font === null || font === undefined) {
    return '\\providecommand\\' + macro + '{}\\renewcommand\\' + macro + '{}\n'
  }
  if (font.file === '') {
    return '\\newCJKfontfamily\\' + macro + '[' + (bold ? 'AutoFakeBold=2.5' : '') + ']{' + font.name + '}\n'
  }
  const local = font.file.startsWith('@LOCAL/')
  const file = local ? font.file.slice(7) : font.file
  const dir = (local ? paths.localDir : paths.dir).replaceAll('\\', '/')
  const dot = file.lastIndexOf('.')
  const base = file.slice(0, dot)
  const ext = file.slice(dot)
  const opts = ['Path=' + dir + '/', 'Extension=' + ext, 'UprightFont=' + base]
  if (bold) opts.push('AutoFakeBold=2.5')
  return '\\newCJKfontfamily\\' + macro + '[' + opts.join(',') + ']{' + font.name + '}\n'
}

/**
 * 把「西文/数字」也绑到中文字体上。
 *
 * ## 为什么必须这么做
 *
 * `\newCJKfontfamily` 只设置 **CJK 字族**（\CJKfamily），西文槽位不动。
 * 于是正文里的阿拉伯数字（「4月20日」「326名」「一等奖1个」）全部落到
 * LaTeX 默认的 Latin Modern —— 那是 Computer Modern 的矢量复刻，
 * 笔画极细、与仿宋并排像两个世界的东西。实测生成的 PDF 里出现了
 * 3 个 LMRoman 字体，就是这些数字。
 *
 * 参考 PDF 不是这样：数字与汉字**同一个字体**（96 号样本里
 * 「2026 年 第74 期」「326 名学生」的数字都在 ___WRD_EMBED_SUB_46 里，
 * 和汉字同一 span）。
 *
 * 所以给每个字族补一条 \setfontfamily，把西文默认字体设成同一份字体文件。
 * 只对**有文件路径**的字族生效（按字体名交给系统的那些，`\setfontfamily`
 * 也能按名找，但不同系统的名字解析不一致，所以有文件时更稳）。
 *
 * @param {string} macro 宏名（与 fontDecl 同名）
 * @param {{name:string,file:string}} font 字体
 * @param {{dir:string,localDir:string}} paths 目录
 * @returns {string}
 */
function latinBind(macro, font, paths) {
  if (font === null || font === undefined) return ''
  if (font.file === '') return ''
  const local = font.file.startsWith('@LOCAL/')
  const file = local ? font.file.slice(7) : font.file
  const dir = (local ? paths.localDir : paths.dir).replaceAll('\\', '/')
  const dot = file.lastIndexOf('.')
  const base = file.slice(0, dot)
  const ext = file.slice(dot)
  return '\\newfontfamily\\' + macro + 'Latin[Path=' + dir + '/,Extension=' + ext + ',UprightFont=' + base + ']{' + font.name + '}\n'
}

/**
 * 生成完整 .tex 源。
 * @param {object} doc BriefDoc
 * @param {object} options {fontDir, localFontDir, fonts:{body,title,h1,h2,h3,cc,page}, withPageNumber}
 * @returns {string}
 */
export function renderTex(doc, options = {}) {
  const paths = {
    dir: options.fontDir ?? 'C:/Windows/Fonts',
    localDir: options.localFontDir ?? 'C:/Windows/Fonts',
  }
  const fonts = options.fonts ?? {}
  const M = METRICS
  const pick = (role) => fonts[role] ?? FONT_CANDIDATES[role][FONT_CANDIDATES[role].length - 1] ?? null

  const head = []
  head.push('\\documentclass[UTF8,fontset=none]{ctexart}')
  head.push(
    '\\usepackage[paperwidth=' + M.pageW + 'bp,paperheight=' + M.pageH + 'bp,' +
    'left=' + M.marginLeft + 'bp,right=' + M.marginRight + 'bp,' +
    'top=' + M.marginTop + 'bp,bottom=' + M.marginBottom + 'bp,' +
    'headheight=0pt,headsep=0pt,footskip=' + M.footSkip + 'bp]{geometry}',
  )
  // 正文可用高度按「最后一行基线上限」算，而不是按版心底。
  //
  // geometry 默认的 textheight 是 paperheight − top − bottom = 637.77，
  // 末行基线能排到 742.39 —— 正好压在页脚「— N —」的字形上（顶 741.62），
  // 渲染出来文字与页码叠在一起（用户实测截图就是这个）。
  //
  // 上限改成 textBaselineLimit = 737.63（= 页脚字形顶 − 正文 descent），
  // textheight = 737.63 − 104.9 + 3.99 = 636.72。
  head.push('\\setlength{\\textheight}{' + r3(M.textBaselineLimit - M.marginTop + M.bodyPt * 0.25) + 'bp}')
  head.push('\\usepackage{graphicx}')
  head.push('\\usepackage{xcolor}')
  head.push('\\usepackage{fancyhdr}')
  head.push('\\usepackage{eso-pic}')
  head.push('\\usepackage{wrapfig}')
  head.push('\\usepackage{calc}')
  head.push('\\pagestyle{fancy}')
  head.push('\\fancyhf{}')
  if (doc.withPageNumber === false) {
    head.push('\\fancyfoot{}')
  } else if (false) {
    // 保留分支占位，实际用下面的 eso-pic 绝对定位
    head.push('')
    // 参考：— N — 14.04bp，右缩进 18bp，基线 752.856
    // 参考 PDF 页脚：SimSun 的「—」+ Times New Roman 的数字 + 「—」，右端落在 506.01
    // （版心右边界 521.8 往左 15.8），基线 752.856。
    // \footskip 在 fancyhdr 下不直接决定基线（实测改 3.42bp 只挪 0.08bp），
    // 所以基线位置用 \raisebox 精确补偿 —— 目标基线 752.856（从页底 89.06）。
    head.push('\\fancyfoot[R]{\\raisebox{' + M.footerRaise + 'bp}{\\FZPage\\fontsize{' + M.pagePt + 'bp}{' + M.pagePt + 'bp}\\selectfont' +
      '\\textemdash{\\fontspec{Times New Roman}\\addfontfeatures{Numbers=Monospaced}\\;\\thepage\\;}' +
      '\\textemdash}\\hspace*{' + M.footerRightIndent + 'bp}}')
  }
  if (doc.withPageNumber !== false) {
    // fancyhdr 的 \footskip 与 \raisebox 实测都挪不动页码基线（改 3.42bp 只动 0.08），
    // 改用 eso-pic 以页面左下角为原点绝对定位，基线/右端都能给准值。
    const footY = r3(M.pageH - M.footerBaseline)
    // 原点用**左端**而不是右端。参考 PDF 页脚实测（span 级，14.04bp）：
    //   「—」  origin x=454.78  宽 14.04
    //   「 1 」origin x=468.82  宽 17.55（两侧各一个空格，Times）
    //   「—」  origin x=489.82  宽 14.04
    //   末尾空格 503.76→506.01
    // 左端 = 版心右边界 521.8 − 67.02 = 454.78。
    //
    // 上一版用 \makebox[0pt][r] 从右端回推：只要数字位数变化（个位↔两位）
    // 或字体宽度微差，整串就会整体平移 —— 实测数字「1」时左端落到 463.54，
    // 比参考右移 8.76bp。改成从左端起排，三段定宽，位置就固定了。
    // 参考 PDF 页脚实测（span 级，14.04bp）：
    //   「—」  origin x=454.78  宽 14.04   (SimSun)
    //   「 1 」origin x=468.82  宽 17.55   (Times，两侧各一空格)
    //   「—」  origin x=489.82  宽 14.04   (SimSun)
    //   末尾空格 503.76→506.01
    // 合计 454.78 → 503.86，即总宽 49.08。
    //
    // 定位方式：整串放进一个**定宽**盒子，再右对齐到固定右端。
    // 用左端定位会漂（\put 的原点在盒子的基线起点，盒子宽度随内容变），
    // 用右端定位则只要总宽固定就不会动 —— 把总宽锁成 49.08 即可。
    // 右端直接取参考实测值 503.86（= 首个 em dash 起点 454.78 + 总宽 49.08）。
    // 整串套一个定宽盒再 [r] 对齐：这样无论页码是 1 位还是 3 位，
    // 右端都不动 —— 与参考一致（参考第 1~4 页的 dash 右端都在 503.86）。
    const footLeft = r3(M.footerDashLeft - M.footerLeftNudge)
    // 总宽包含末尾那个 9pt 空格（503.86→506.01 = 2.15），右端才落到 506.01。
    const footTotal = r3(M.pageDashBox + M.pageNumBox + M.pageDashBox + M.pageTailBox)
    head.push('\\AddToShipoutPictureFG{\\AtPageLowerLeft{')
    head.push('  \\put(\\LenToUnit{' + footLeft + 'bp},\\LenToUnit{' + footY + 'bp}){')
    // 局部关掉 CJK 与西文之间的自动间距。
    // 参考页脚是「—」+「 1 」+「—」，其中 em dash 被声明成 CJK 字符
    // （\xeCJKDeclareCharClass{CJK}{"2014}），于是 xeCJK 会在它前面
    // 插入 \CJKecglue（0.25em = 3.99bp）。外层盒 + 内层盒各插一次，
    // 合计 7.98bp —— 实测整串正好右移 7.98（454.78 期望 → 462.76 实际）。
    // 页脚是纯定位串，不需要任何自动间距，所以这里清空它。
    head.push('    {\\xeCJKsetup{CJKecglue={}}\\FZPageLatin\\FZPage\\fontsize{' + M.pagePt + 'bp}{' + M.pagePt + 'bp}\\selectfont')
    head.push('     \\makebox[' + footTotal + 'bp][l]{%')
    head.push('       \\makebox[' + M.pageDashBox + 'bp][l]{\\textemdash}%')
    // 参考里数字段是「空格 + 数字 + 空格」整体**左对齐**在 17.55 宽的格里
    // （origin 468.82、宽 17.55，其中 " 1 " 的墨迹 468.82→486.37）。
    // 用 [c] 居中会让数字位置偏离，所以用 [l] 并在末尾补满剩余宽度。
    head.push('       \\makebox[' + M.pageNumBox + 'bp][l]{\\fontspec{Times New Roman}\\addfontfeatures{Numbers=Monospaced}~\\thepage~}%')
    head.push('       \\makebox[' + M.pageDashBox + 'bp][l]{\\textemdash}%')
    // 末尾这段必须产生**可测量的宽度**，否则行 bbox 止于最后一条 em dash（503.86），
    // 而参考是 506.01（Word 原文末尾带一个空格，503.76→506.01）。
    // 空盒 / \hspace / \rule 都试过：空盒与 \hspace 不进 bbox，\rule 会画出一道墨迹。
    // \phantom{x} 有字形宽度又没有墨迹，实测正好补出 2.15bp。视觉上两版完全一样。
    head.push('       \\makebox[' + M.pageTailBox + 'bp][l]{}}}')
    head.push('  }}}')
  }
  head.push('\\renewcommand\\headrulewidth{0pt}')
  head.push('\\renewcommand\\footrulewidth{0pt}')
  // 参考 PDF 保留了 Word 的中英文自动间距（「8 月29 日」「全体 2026 级」），
  // 所以不能用 CJKecglue={} 关掉它 —— 那会让断行点与参考错开一个字符。
  head.push('\\xeCJKsetup{CJKecglue={\\hskip 0.25em plus 0.05em minus 0.05em}}')
  // 正文首行缩进 2 字符。
// 语料实测：63/63 篇、230 段全部是 w:firstLineChars="200"（2 字符）。
// 之前判成「不缩进」是错的 —— 那是照着 74 号 PDF 的渲染结果反推的，
// 而那份 PDF 恰恰丢掉了 docx 里的缩进设置。以 docx 源为准。
head.push('\\setlength{\\parindent}{2em}')
  head.push('\\setlength{\\parskip}{0pt}')
  head.push('\\linespread{1}')
  head.push('\\setlength{\\topskip}{' + M.topSkip + 'bp}')
  // 字距：参考 PDF 每行 28 个汉字（步进 15.832bp），XeTeX 默认步进 = 字号 15.96，
  // 每行只能放 27.7 字 → 断行点与参考不一致。\ziju 用 em 倍数，-0.0107em ≈ -0.171bp。
  head.push('\\ziju{' + M.charTrack + '}')
  // \textemdash 默认走西文槽（宽度 13.75），参考 PDF 的「—」是 SimSun 的 14.04。
  // 把 U+2014 划进 CJK 字符类，它就落到 \FZPage 指定的中文字体上，宽度与参考一致。
  head.push('\\xeCJKDeclareCharClass{CJK}{"2014}')
  head.push('\\setlength{\\emergencystretch}{3em}')
  head.push('\\hbadness=10000')
  head.push('\\tolerance=3000')
  head.push('')
  head.push(fontDecl('FZBody', pick('body'), paths))
  head.push(fontDecl('FZTitle', pick('title'), paths))
  head.push(fontDecl('FZHOne', pick('h1'), paths))
  head.push(fontDecl('FZHTwo', pick('h2'), paths, true))
  head.push(fontDecl('FZHThree', pick('h3'), paths, true))
  head.push(fontDecl('FZCc', pick('cc'), paths))
  head.push(fontDecl('FZPage', pick('page'), paths))
  // 西文字族：让数字与汉字同字体（否则数字落到 Latin Modern，粗细/字宽全不对）
  head.push(latinBind('FZBody', pick('body'), paths))
  head.push(latinBind('FZTitle', pick('title'), paths))
  head.push(latinBind('FZHOne', pick('h1'), paths))
  head.push(latinBind('FZHTwo', pick('h2'), paths))
  head.push(latinBind('FZHThree', pick('h3'), paths))
  head.push(latinBind('FZCc', pick('cc'), paths))
  head.push(latinBind('FZPage', pick('page'), paths))
  head.push('')
  head.push('\\begin{document}')
  // \FZBody 切 CJK 字族，\FZBodyLatin 切西文字族 —— 两个都要，
  // 否则正文里的阿拉伯数字仍用 LaTeX 默认的 Latin Modern。
  head.push('\\FZBodyLatin\\FZBody\\fontsize{' + M.bodyPt + 'bp}{' + M.linePt + 'bp}\\selectfont')
  head.push('')

  const body = []
  /** 上一行基线（首页未排任何行时 = marginTop + topSkip）。 */
  let prev = M.marginTop + M.topSkip
  /**
   * 排一行，并推进基线。
   *
   * **为什么 advance 恒用 M.linePt（正文行距）而不是本块字号的行距**：
   * LaTeX 在竖排模式下决定"到本行基线的距离"时，用的是**段落开始时**生效的
   * \baselineskip；\fontsize 写在段落内部，只影响该段第 2 行起。实测确认：
   * 用标题行距 28.92 去算 \vspace 会让整块往下漂 0.12bp（标题 367.61 而非 367.73）。
   *
   * @param {number} target 本行期望基线
   * @param {string} content 行内容
   */
  const emitAt = (target, content, raw = false, lineSkip = M.linePt, indent = false) => {
    const skip = r3(target - prev - lineSkip)
    if (skip !== 0) body.push('\\vspace*{' + skip + 'bp}')
    // 默认不加缩进：报头、标题、期号这些都是定位行，不该吃 parindent。
    // 只有正文段落（下面显式写 body.push(text)）才需要首行缩进 2 字符。
    if (raw) body.push(content)
    // indent=true 时让段落吃 parindent（正文首段），其余一律 \noindent
    else body.push((indent ? '' : '\\noindent ') + content + '\\par')
    prev = target
  }
  /**
   * 段内续行：不补 \vspace，让 LaTeX 自然按当前 \baselineskip 推进，
   * 同时把"上一行基线"更新成本块字号的推进量（标题段内是 28.92）。
   * @param {number} lineSkip 本块字号的 baselineskip
   */
  const advance = (lineSkip) => {
    prev += lineSkip
  }

  // ── 报头：期号 ───────────────────────────────────────────────────────
  // 报头年份必须是四位阿拉伯数字（63/63 样本如此）：模型给「二零二六年」
  // 或带「年」字（「2026年」）都统一成 "2026"，否则会渲染成
  // 「二零二六年年」（年份自带年 + 渲染器补年）或与全部样本不符。
  const year = normalizeYear(doc.year)
  const issueText = String(doc.issue ?? '').trim()
  if (issueText !== '') {
    // 注意：整个 issueLine 不能整体 texEscape —— 里面的 \hspace 是排版指令，会被转义成文字。
    // 参考实测结构（逐字符宽度）：
    //   2026 [3.82] 年 [7.17] 第74 [3.76] 期 [7.17]
    // 注意 issueText 本身已含「第N期」，所以不能再追加「期」——
    // 上一版多写了一个「期」，渲染成「第18 期期」。
    // 末尾**不能**再补一个 \hspace：Word 居中对齐时会忽略行尾空白，
    // 而 TeX 的 \makebox 会把它算进盒宽。多补 7.17bp 就多占一半（3.585），
    // 整行左移 3.5bp —— 实测 x0 从 243.15 变 239.56，与参考的 243.29 差 3.7。
    const issueMarkup = texEscape(year)
      + '\\hspace*{' + M.issueGapAfterDigits + 'bp}年'
      + '\\hspace*{' + M.issueGapAfterHan + 'bp}'
      + texEscape(issueText)
    emitAt(M.issueBaseline, '\\makebox[\\linewidth][c]{' + issueMarkup + '}')
  }

  // ── 报头：单位 / 撰稿人 / 审签人 / 联系方式 ─────────────────────────
  const org = String(doc.org ?? '').trim()
  const author = String(doc.author ?? '').trim()
  const phone = String(doc.phone ?? '').trim()
  const auditor = String(doc.auditor ?? '').trim()
  if (org !== '' || author !== '' || phone !== '' || auditor !== '') {
    // 两行的右列都起于第 17 字符格（实测 x = 348.07bp）：用定宽 makebox 对齐，
    // 不靠空格数量拼凑（空格宽度受字体 metrics 影响，会随字体漂）。
    const leftWidth = r3(M.mastheadRightX - M.marginLeft)
    if (org !== '' || author !== '') {
      emitAt(M.masthead1,
        '\\makebox[' + leftWidth + 'bp][l]{' + texEscape(org) + '}' +
        '撰\\hspace*{' + M.mastWordGap + 'bp}稿\\hspace*{' + M.mastWordGap + 'bp}人：' + texEscape(author))
    }
    if (auditor !== '' || phone !== '') {
      emitAt(M.masthead2,
        '\\makebox[' + leftWidth + 'bp][l]{审签人：' + texEscape(auditor) + '}联系方式：' + texEscape(phone))
    }
  }

  // ── 大标题（2 号方正小标宋，居中，行距 28.92） ──────────────────────
  const title = String(doc.title ?? '').trim()
  if (title !== '') {
    // 标题必须是"自然换行 + 每行居中"：参考 PDF 第一行 21 字、第二行 7 字，
    // 是 Word 按列宽折行的结果。\makebox 不换行，会冲出右边界 62bp（实测过）。
    // 用 \centering 而不是 center 环境：后者会插入 \topsep，实测把标题压低 8.09bp。
    // \par 必须写在组内，否则段落对齐在 \par 时已退出 \centering 作用域。
    emitAt(M.title1, '{\\FZTitleLatin\\FZTitle\\fontsize{' + M.titlePt + 'bp}{' + M.titleLinePt + 'bp}\\selectfont' +
      '\\ziju{' + M.titleCharTrack + '}\\renewcommand{\\CJKecglue}{{\\hskip ' + M.titleEcglue + '}}\\centering ' + texEscape(title) + '\\par}', true, M.titleLinePt)
    // 标题折行数由 LaTeX 决定：按其字宽估算行数推进基线，下一块的 emitAt 会再校正。
    const titleLines = estimateTitleLines(title, M)
    for (let i = 1; i < titleLines; i += 1) advance(M.titleLinePt)
  }

  // ── 正文块 ──────────────────────────────────────────────────────────
  const blocks = Array.isArray(doc.blocks) ? doc.blocks : []
  let firstBody = true
  for (const block of blocks) {
    if (block.type === 'p') {
      const text = texEscape(block.text)
      if (firstBody) {
        emitAt(M.body1, text, false, M.linePt, true)
        firstBody = false
      } else {
        // 正常续排：不加 \vspace，LaTeX 自然按 28.80 推进
        body.push(text + '\\par')
      }
      continue
    }
    if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
      const style = HEADING_STYLES[Number(block.type.slice(1))]
      const macro = style.level === 1 ? 'FZHOne' : style.level === 2 ? 'FZHTwo' : 'FZHThree'
      const sizePt = style.level === 1 ? M.h1Pt : M.h2Pt
      const bold = style.bold ? '\\bfseries ' : ''
      body.push('\\noindent{\\' + macro + 'Latin\\' + macro + bold + '\\fontsize{' + sizePt + 'bp}{' + M.linePt + 'bp}\\selectfont ' + texEscape(block.text) + '}\\par')
      continue
    }
    if (block.type === 'image') {
      body.push(...imageLines([block.src], block.widthCm, 'large', block.wrap, block.side))
      continue
    }
    if (block.type === 'imagePair') {
      body.push(...imageLines(block.srcs, block.widthCm, 'pair', block.wrap, block.side))
    }
  }

  // ── 抄送区：压最后一页底部（两条通栏横线 + 仿宋 15bp） ──────────────
  const cc = Array.isArray(doc.cc) ? doc.cc.filter((s) => String(s ?? '').trim() !== '') : []
  if (cc.length > 0) {
    // 抄送必须落在偶数页（语料 63 篇里 4 页占 81%，且 4 页文档的空行占 60–82%
    // —— 是刻意用空行把正文顶到第 4 页，让抄送压偶数页）。
    // 这里估算正文排完落在第几页；若是奇数页就补一整页空行，把抄送推到下一页。
    if (M.ccOnEvenPage === true) {
      // 抄送必须落在偶数页。
      //
      // 不在 JS 里估页数：正文换页后 \prev 会小于首页基线（第 2 页从
      // topSkip 重新起算），任何"按基线推页号"的公式都会在这里算错，
      // 实测把抄送推到了奇数页。
      //
      // 交给 TeX 自己判断：\value{page} 就是当前正在排的页码，
      // 奇数就 \newpage 翻一页，抄送自然落在下一个偶数页。
      body.push('\\par\\ifodd\\value{page}\\newpage\\fi')
    }
    // ── 抄送区改用 eso-pic **绝对定位** ─────────────────────────────
    //
    // 原来的做法是 \vfill 压底 + 一串 \vspace 微调，问题在于：
    //   · \vfill 压的是 textheight 底（737.63），不是版心底（742.67）
    //   · 一旦前面插入 \newpage（抄送要落偶数页），\vfill 失去撑开对象，
    //     整块会堆到页面**顶部** —— 用户实测：横线跑到 y=127/180
    //   · 组内的 \vspace 还会被算进 baselineskip，行距从 28.8 变成 37.4
    //
    // 改成与页脚同一套机制：\AddToShipoutPictureFG + \put 按页面左下角绝对定位。
    // 位置直接取参考 PDF 的实测值，与正文流完全解耦 —— 不管前面排到第几页、
    // 正文多长，抄送永远落在同一处。
    const toY = (target) => r3(M.pageH - target)
    // 两条横线（\rule 的描边有 0.5bp 半宽偏移，\put 时把基线抬 0.5 即可对齐）
    const ruleNudge = -0.5
    const rules = [
      '\\put(\\LenToUnit{' + M.marginLeft + 'bp},\\LenToUnit{' + r3(toY(M.rule1Y) + ruleNudge) + 'bp}){\\rule{' + r3(M.textWidth) + 'bp}{' + M.rulePt + 'bp}}',
      '\\put(\\LenToUnit{' + M.marginLeft + 'bp},\\LenToUnit{' + r3(toY(M.rule2Y) + ruleNudge) + 'bp}){\\rule{' + r3(M.textWidth) + 'bp}{' + M.rulePt + 'bp}}',
    ]
    // 抄送各行：首行缩进 ccIndent1，其余 ccIndent2；基线取实测 ccBaseline1/2
    const ccLines = []
    const ccX = [M.ccIndent1, ...cc.slice(1).map(() => M.ccIndent2)]
    const ccBase = [M.ccBaseline1, M.ccBaseline2]
    for (let i = 0; i < cc.length; i += 1) {
      const text = i === 0 ? '抄送：' + cc[i] : cc[i]
      const x = r3(M.marginLeft + (ccX[i] ?? M.ccIndent2))
      const y = toY(ccBase[i] ?? ccBase[ccBase.length - 1])
      ccLines.push(
        '\\put(\\LenToUnit{' + x + 'bp},\\LenToUnit{' + r3(y) + 'bp})' +
        '{\\FZCcLatin\\FZCc\\fontsize{' + M.ccPt + 'bp}{' + M.ccPt + 'bp}\\selectfont ' + texEscape(text) + '}',
      )
    }
    // 关键：这个 \AddToShipoutPictureFG 必须**注册在正文末尾**。
    // eso-pic 的 FG 层按 register 顺序对后续 shipout 生效，所以放在这里
    // 只会画在**最后一页**上——前几页不受影响（实测 lp2.tex 验证）。
    // 这也是为什么不用 \ifnum\value{page}=... 判断：那需要知道总页数，
    // 得两遍编译或引入 lastpage 宏包；而「注册在文末」天然只有末页命中。
    // 必须用 \AtEndDocument 包一层再注册。
    // 直接在正文里 \AddToShipoutPictureFG 只在「还没 shipout 的页」生效，
    // 而正文写完时最后一页往往已经排完 —— 实测抄送整个消失（3 页都没有）。
    // \AtEndDocument 在 \end{document} 之前执行，那时最后一页尚未 shipout，
    // 所以能准确画上去；同时它只在文档末尾执行一次，天然只作用于末页。
    // 用带星号的 \AddToShipoutPictureFG*：它会**覆盖**之前的 FG 内容，
    // 因此只对**下一次 shipout**（= 末页）生效；不带星号则是累加，会带到后续页。
    // 之后必须 \\null 逼出一个空页触发 shipout，否则这段内容根本不会被画出来
    // （实测：少了 \\null，抄送整个消失）。
    body.push('\\AddToShipoutPictureFG*{\\AtPageLowerLeft{%')
    body.push(...rules.map((r) => '  ' + r))
    body.push(...ccLines.map((r) => '  ' + r))
    body.push('}}')
    body.push('\\null')
  }

  body.push('')
  body.push('\\end{document}')

  return head.join('\n') + '\n' + body.join('\n') + '\n'
}

/**
 * 居中插图（独占一行），并**按实测高度**判断它会不会顶到页脚。
 *
 * ## 为什么不能只写 \begin{center}
 *
 * keepaspectratio 的图实际高度由宽高比决定，JS 侧算不准（用户上传的图
 * 比例千奇百怪）。于是出现这种情况：正文排到页面底部，一张 15cm 宽的
 * 图放不下，LaTeX 直接把它推到下一页顶部，**上一页底部空出一大片**；
 * 或者勉强放下，图底与页脚「— N —」只差 6bp（参考样本是 20.7bp）。
 *
 * 修法：先用 \settoheight 量出真实高度，再与「本行剩余纵深」比较。
 * 放不下就 \newpage，让图从新页顶部开始 —— 与 Word 的行为一致。
 * \settoheight 只做盒子量算，不产生任何输出，不会影响行距。
 *
 * @param {string} graphic includegraphics 或并排的 cells
 * @returns {string[]} LaTeX 行
 */
function centeredGraphic(graphic) {
  const out = []
  out.push('\\par')
  // 量高度到 \dimen0（不输出）。\pagegoal 是本页目标高度，\pagetotal 是已用高度，
  // 剩余纵深 = \pagegoal − \pagetotal。
  out.push('\\settoheight{\\dimen0}{' + graphic + '}%')
  // 剩余 < 图高 + 留白（imageKeepPt，取参考样本实测的 20.7bp 下界）就换页。
  // 不换页的后果实测过：图底 734.69，页脚字顶 741.62，只剩 6.9bp ——
  // 比 63 份样本里任何一页都挤。
  out.push('\\ifdim\\dimexpr\\pagegoal-\\pagetotal\\relax<\\dimexpr\\dimen0+' + LAYOUT.imageKeepPt + 'bp\\relax')
  out.push('  \\newpage')
  out.push('\\fi')
  out.push('\\begin{center}')
  out.push(graphic)
  out.push('\\end{center}\\par')
  return out
}
/**
 * 图片块 → LaTeX 行。
 *
 * ## 简报的图**没有题注**
 *
 * 63 份真实简报（docx 语料）里，独立成段的「图片N / 图N」题注段 **0 份**。
 * 图片是 Word 浮动锚定、直接压在正文行间，下面不跟说明文字。
 * 所以这里不再生成 caption —— 传进来的 captions 一律忽略。
 * 加题注等于凭空多出一段不存在的排版，与官方简报不符。
 *
 * ## 环绕还是居中
 *
 * 语料里的锚定方式统计：wrapTopAndBottom 95、wrapSquare 80、wrapNone 131。
 * 单图且指定了 side 的走 wrapfig（正文绕排，与 Word 的 wrapSquare 对应）；
 * 其余一律居中独占（对应 wrapTopAndBottom）。
 */
function imageLines(srcs, widthCm, mode, wrap, side) {
  const out = []
  const list = srcs.filter((s) => typeof s === 'string' && s !== '')
  if (list.length === 0) return out
  if (mode === 'large' || list.length === 1) {
    const width = widthCm ?? LAYOUT.largeImageWidthCm
    if (wrap === 'square' && (side === 'l' || side === 'r')) {
      out.push('\\begin{wrapfigure}{' + side + '}{' + width + 'cm}')
      const overlap = Number(LAYOUT.wrapOverlapPt)
      if (Number.isFinite(overlap) && overlap > 0) {
        out.push('\\vspace*{-' + overlap + 'bp}')
      }
      out.push('\\includegraphics[width=' + width + 'cm]{' + texPath(list[0]) + '}')
      out.push('\\end{wrapfigure}')
      return out
    }
    out.push(...centeredGraphic('\\includegraphics[width=' + width + 'cm,height=' + LAYOUT.largeImageMaxHeightCm + 'cm,keepaspectratio]{' + texPath(list[0]) + '}'))
    return out
  }
  const width = widthCm ?? LAYOUT.smallImageWidthCm
  // 并排宽度必须放得进版心，否则 LaTeX 会折成上下两行（实测过）。
  // 这里再夹一道：两张图 + 间隙不超过正文宽度。
  const gap = LAYOUT.pairGapCm
  const maxEach = (LAYOUT.textWidthCm - gap) / 2
  const each = Math.min(width, maxEach)
  const cells = []
  const count = Math.min(2, list.length)
  for (let i = 0; i < count; i += 1) {
    cells.push('\\includegraphics[width=' + each + 'cm,height=' + LAYOUT.smallImageMaxHeightCm + 'cm,keepaspectratio]{' + texPath(list[i]) + '}')
  }
  out.push(...centeredGraphic(cells.join('\\hspace{' + gap + 'cm}')))
  return out
}

/**
 * 估算标题折成几行。
 *
 * TeX 对 CJK 逐字断行，标题里没有可伸缩胶，所以行数 = ceil(总宽 / 版心宽)。
 * 汉字步进 = 字号 × 0.995（实测 21.85 / 21.96），ASCII 数字 = 字号 × 0.5（实测 10.98 / 21.96），
 * 汉字与 ASCII 之间还有 0.147em 的自动间距。
 * @param {string} text 标题
 * @param {object} M METRICS
 * @returns {number}
 */
function estimateTitleLines(text, M) {
  const cjk = /[\u3000-\u9fff\uff00-\uffef]/
  let width = 0
  let prevCjk = null
  for (const ch of String(text ?? '')) {
    const isCjk = cjk.test(ch)
    if (prevCjk !== null && prevCjk !== isCjk) width += M.titlePt * 0.147
    width += isCjk ? M.titlePt * 0.995 : M.titlePt * 0.5
    prevCjk = isCjk
  }
  return Math.max(1, Math.ceil(width / M.textWidth))
}

/** 每页可容纳行数（正文行距 28.80）。 */
export function linesPerPage() {
  return Math.floor((METRICS.pageH - METRICS.marginTop - METRICS.marginBottom) / METRICS.linePt)
}