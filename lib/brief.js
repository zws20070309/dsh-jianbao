/**
 * 简报数据模型与写作规范（宿主半 + 渲染器共用）
 *
 * 规范来源：参考文件 docs/学院简报生成器_说明.md 与 source_code/学院简报生成器.py
 * 的实测结论（3.0.9 版）。这里把「排版规则」从 Word(DOCX) 的 twips 语义
 * 搬到 LaTeX 的点值语义，二者可换算：1pt = 20 twips，故 576 twips = 28.8pt。
 *
 * 版式（用户给定 + 参考实测）：
 *   纸张      A4 210mm × 297mm
 *   页边距    上 3.7cm / 下 3.5cm / 左 2.8cm / 右 2.6cm
 *   行距      固定值 28.8 磅（标题与全文一致）
 *   正文标题  2 号（22pt）方正小标宋
 *   正文      3 号（16pt）方正仿宋_GBK，首行缩进 2 字符
 *   一级标题  方正黑体简体 20pt
 *   二级标题  方正楷体_GBK 三号（16pt）加粗
 *   三级标题  方正仿宋_GBK 三号（16pt）加粗
 *   抄送区    仿宋 15pt + 两条通栏横线
 *   页码      — N — 14pt 右对齐
 *
 * @module @zws/dsh-jianbao/brief
 */

/** 简报类型。用词纪律跟类型走（note 字段就是纪律）。 */
export const BRIEF_TYPES = {
  meeting: {
    id: 'meeting',
    label: '会议简报',
    verb: '召开',
    noun: '会议',
    attend: '出席本次会议',
    note: '统一用「会议」一词，主讲/主持按会议议程写',
  },
  activity: {
    id: 'activity',
    label: '活动简报',
    verb: '开展',
    noun: '活动',
    attend: '出席本次活动',
    note: '统一用「活动」一词',
  },
  contest: {
    id: 'contest',
    label: '竞赛简报',
    verb: '举办',
    noun: '竞赛',
    attend: '出席本次竞赛',
    note: '主题名含「大赛」全文用大赛，含「比赛」用比赛，含「竞赛」用竞赛，不混用',
  },
  lecture: {
    id: 'lecture',
    label: '讲座简报',
    verb: '开展',
    noun: '讲座',
    attend: '出席本次讲座',
    note: '统一用「讲座」一词；用「主讲」不用「主持」',
  },
}

/** 参加人群常见下拉项（可自由输入）。 */
export const AUDIENCE_OPTIONS = [
  '2026级新生',
  '全体学生',
  '全体班主任',
  '班主任及学生代表',
  '入党积极分子',
  '各班团支书',
  '参赛选手及学生代表',
  '学生会全体成员',
  '2026级应用物理班全体学生',
  '2026级应用物理班师生',
]

/** 标题级别 → 版式（用户给定规则，pt / 字体名 / 是否加粗）。 */
export const HEADING_STYLES = {
  1: { level: 1, label: '一级标题', sizePt: 20, font: '方正黑体简体', bold: false, number: '一、' },
  2: { level: 2, label: '二级标题', sizePt: 16, font: '方正楷体_GBK', bold: true, number: '（一）' },
  3: { level: 3, label: '三级标题', sizePt: 16, font: '方正仿宋_GBK', bold: true, number: '1.' },
}

/**
 * 版面常量。全部以 pt 为单位（LaTeX 原生单位），并附 cm 冗余换算，
 * 方便与 DOCX 时代的 twips 值对账（1cm ≈ 28.3465pt）。
 */
export const LAYOUT = {
  paper: { widthMm: 210, heightMm: 297 },
  /** 参考实测：2098/1985/1588/1474 twips → 104.9/99.25/79.4/73.7 pt */
  margin: { topCm: 3.7, bottomCm: 3.5, leftCm: 2.8, rightCm: 2.6 },
  /** 固定行距 28.8pt（参考实测 576 twips） */
  linePt: 28.8,
  titleSizePt: 22,
  bodySizePt: 16,
  ccSizePt: 15,
  pageNumberSizePt: 14,
  /** 版心宽 = 21 − 2.8 − 2.6 = 15.6cm */
  textWidthCm: 15.6,
  /** 大图最大宽度（参考：约 15cm 单张独占） */
  largeImageWidthCm: 15,
  largeImageMaxHeightCm: 10,
  /**
   * 成对并排的小图宽度。
   *
   * 必须满足 2×w + 间隙 ≤ 版心宽 15.6cm，否则两张图排不进一行，
   * LaTeX 会把它们挤成上下两行（用户实测就遇到了：两张图 y 区间分别是
   * 140.8–313.7 与 314.7–487.6，明显是堆叠而不是并排）。
   *
   * 原来写 8.3：8.3×2 + 0.4 = 17.0 > 15.6，**必然溢出**。
   * 语料实测图片宽度中位 8.44、最常见 7.5（99 张里 22 张正好 7.5cm），
   * 取 7.5：7.5×2 + 0.4 = 15.4 ≤ 15.6，正好并排。
   */
  smallImageWidthCm: 7.5,
  /** 成对小图最大高度（参考 6.1，按 4:3 比例给 7.5cm 宽留出余量） */
  smallImageMaxHeightCm: 5.6,
  /** 两张图之间的水平间隙（LaTeX \hspace） */
  pairGapCm: 0.4,
  /**
   * 环绕图的顶部负偏移。
   *
   * wrapfig 默认会给图片上方留一段 \intextsep（约 12bp），
   * 而参考 PDF 的环绕图是与当前行齐平的（图片顶 529.4，同段行顶 527.0，
   * 只差 2.4bp）。所以要把这段间距抵掉。
   *
   * 这个常量之前只在 render-tex.js 里被引用、brief.js 里根本没定义，
   * 一旦走 wrap=square 分支就会生成 `space*{-undefined bp}` 而编译失败。
   */
  wrapOverlapPt: 10,
}

/**
 * 版式实测常量 —— **唯一权威来源**：参考 PDF
 *   远端仓库参考内容/简报/2026下/…〔2026〕74号….pdf（Word for Microsoft 365 导出）
 *
 * 这些数字不是估算，是逐 span 读 origin（基线）与 bbox 反推出来的，单位一律 **bp**
 * （1bp = 1/72in = PDF 用户单位）。实测记录见 docs/FORMAT-SPEC.md，
 * 验收工具 tools/geometry-diff.mjs（逐行比对坐标，容差 0.5bp）。
 *
 * 为什么不用 TeX 的 pt：1pt = 1/72.27in，写 28.8pt 实际渲染 28.69bp，
 * 与 Word 的 28.80bp 每行差 0.11，20 行就漂 2.2pt —— 用 bp 才等值。
 */
export const METRICS = {
  /** 页面 595.32 × 841.92 bp（A4） */
  pageW: 595.32,
  pageH: 841.92,
  /** 页边距：1588/1474/2098/1985 twips ÷ 20 */
  marginLeft: 79.4,
  marginRight: 73.7,
  marginTop: 104.9,
  marginBottom: 99.25,
  /** 版心宽 = 595.32 − 79.4 − 73.7 */
  textWidth: 442.22,

  /** 正文 15.96bp / 行距 28.80bp / 汉字步进 15.832bp */
  bodyPt: 15.96,
  linePt: 28.8,
  charPitch: 15.832,
  /** \ziju 字距微调（em 倍数）：让每行落 28 个汉字，断行点与参考一致 */
  charTrack: '-0.01043',

  /** 大标题 21.96bp / 行距 28.92bp（实测标题两行基线差） */
  titlePt: 21.96,
  titleLinePt: 28.92,
  /**
   * 标题专用字距（em 倍数）。
   *
   * 正文字距 charTrack = -0.01043 是为 15.96bp 正文调的（让每行落 28 个汉字），
   * 但它会**继承到标题**上，把标题也压窄 21.96 × 0.01043 = 0.229bp/字。
   *
   * 实测对比（同一句 29 字标题）：
   *   参考 PDF 汉字步进 21.85bp（比率 0.99499）
   *   我们        汉字步进 21.74bp（比率 0.98998）
   * 每字差 0.11bp，22 个字累计 2.4bp —— 足够让断行点少放一个字
   * （参考首行到「入学」，我们只到「入」）。
   *
   * 所以标题单独设字距 -0.00542（= -0.01043 + 0.00501）。
   */
  titleCharTrack: '-0.00542',
  /**
   * 标题里汉字与数字之间的自动间距（em）。
   *
   * 实测参考 PDF 标题「召开2026级」：「开」→「2」的间距是 24.948bp，
   * 而汉字步进是 21.85 —— 额外 3.098bp = 0.1411em。
   * 我们的 xeCJK 默认 CJKecglue 是 0.25em，在 21.96bp 字号下给 5.49bp，
   * 比参考多 2.48bp。22 个字累计下来足够挤掉一个字的宽度，
   * 所以断行点比参考少一个字。
   *
   * 标题单独用 0.1411em，正文仍保留原来的 0.25em（正文断行已对齐）。
   */
  titleEcglue: '0.1411em',

  /** 一级标题 19.93bp；二三级 15.96bp 加粗 */
  h1Pt: 19.93,
  h2Pt: 15.96,
  h3Pt: 15.96,

  /** 抄送 15.00bp；页码 14.04bp */
  ccPt: 15.0,
  pagePt: 14.04,
  /**
   * 页脚数字段的**占位**宽度。
   *
   * 参考实测：数字 span「 1 」bbox 宽 17.55（468.82→486.37），
   * 但下一条 em dash 起点是 489.82 —— 中间还有 3.45bp 的尾随空格，
   * 所以真实占位 = 489.82 − 468.82 = 21.00。按 17.55 排会让第二条 dash
   * 左移 3.45（实测 486.37 vs 参考 489.82）。
   */
  pageNumBox: 21.0,
  /** 页脚每个 em dash 的定宽（参考实测 14.04） */
  pageDashBox: 14.04,
  /**
   * 页脚最后一条 em dash 的右端（= 可交付的墨迹边界）。
   *
   * 参考 PDF 的行 bbox 到 506.01，但那是 Word 原文末尾一个**没有墨迹的空格**
   * （span「 」503.76→506.01）。排版上不需要它：任何阅读器看到的最后一道墨
   * 都在 503.86。所以验收按 503.86 比，不去追那 2.15bp 的空白。
   */
  footerInkRight: 503.86,
  /** 尾随空白的预留宽度（只为让行 bbox 结构与参考一致，无墨迹） */
  pageTailBox: 2.15,
  /**
   * 页脚整串左端绝对位置（参考四页实测：首个 em dash origin = 454.78）。
   *
   * 实际写进 \put 的是它减去 footerLeftNudge：eso-pic 的 \AtPageLowerLeft
   * 对 put 的水平原点有 7.98bp 的固有偏移（实测：给 454.78 得到 462.76），
   * 与字宽无关，是宏包坐标系的问题，所以直接补掉。
   */
  footerDashLeft: 454.78,
  footerLeftNudge: 7.98,
  /** 页脚右端落点：参考 506.01。缩进 20.43 是实测出来的抵消量（em dash 右侧自带空白） */
  footerRightIndent: 20.43,
  footSkip: 13.69,
  /** \footskip 只影响 footer 盒位置，基线微调用 \raisebox（正值=上移） */
  footerRaise: 3.422,

  /** 首页各区块基线（实测） */
  issueBaseline: 252.38,
  masthead1: 277.49,
  masthead2: 306.29,
  title1: 367.73,
  body1: 454.39,
  /** 第 2 页起首行基线 / 对应 topSkip */
  page2Baseline: 127.94,
  topSkip: 23.04,

  /** 报头右列左边界（第 17 字符格） */
  mastheadRightX: 348.07,

  /** 抄送区（基线 / 横线 / 缩进） */
  ccBaseline1: 705.02,
  ccBaseline2: 733.82,
  rule1Y: 687.25,
  rule2Y: 740.55,
  rulePt: 1.0,
  /** 抄送首行缩进 296 twips；次行 1184 twips */
  ccIndent1: 14.8,
  ccIndent2: 59.2,
  /** 版心底(742.67) − 末条横线(740.55) */
  ccBottomGap: 2.12,
  /** rule1(687.25) → 抄送首行基线(705.02)：LaTeX 自然给 29.30，收紧 11.53 */
  ccGapRule1: -11.53,
  /** 报头「撰 稿 人」字间显式空格：实测参考为 7.68 / 7.83，取 7.75 */
  mastWordGap: 7.75,
  /** 期号「年」与「第」之间：实测参考 7.80 */
  issueGap: 7.8,
  /** 抄送末行基线(733.82) → rule2(740.55)：LaTeX 自然给 28.30，收紧 21.57 */
  ccGapRule2: -21.57,
  /** 末条横线落点补偿（LaTeX 实测比目标高 0.5） */
  ccBottomNudge: 0.5,
  /**
   * vfill 补偿量。
   *
   * textheight 为了避开页脚收窄到 636.72（正文基线限 737.63），
   * 而抄送要压版心底 742.67，两者差 1.05bp。
   * vfill 把光标停在 textheight 底，所以要补回这段。
   */
  ccVfillNudge: 0,
  /**
   * 抄送块整体下移量。
   *
   * textheight 收窄后 \vfill 停在 737.63 而不是版心底 742.67，
   * 抄送整体上移 1.05bp（实测首行 703.97 vs 期望 705.02）。
   * \vfill 之后的 \vspace 会被它吸收，所以不能直接补；
   * 改为把这段距离加进抄送块**自身的高度**（末条 vspace 减 1.05），
   * 整个块就往下落到版心底。
   */
  ccBlockShift: 1.05,

  /** 页码基线 */
  footerBaseline: 752.856,

  /**
   * 正文最后一行的基线**上限**（不能再往下排）。
   *
   * 为什么不是版心底 742.67：页脚「— N —」的字形顶部在
   * 752.856 − 0.8×14.04 ≈ 741.62，正文 15.96bp 字的 descent ≈ 3.99，
   * 所以正文基线一旦超过 741.62 − 3.99 = 737.63，就会和页码印在一起。
   *
   * 实测证据：上一版按版心底排，首页末行基线落到 742.39，
   * 与页脚基线 752.86 只差 10.47bp —— 渲染出来「张某某同志、王」
   * 和「— 1 —」叠在一起。参考 PDF 首页末行基线是 713.62
   * （下一行会到 742.42，撞页脚），正好卡在这个上限之上。
   *
   * 按 737.63 算，首页 10 行、末行 713.59，与参考的 713.62 差 0.03bp。
   */
  textBaselineLimit: 737.63,

  /**
   * 抄送区必须落在**偶数页**（语料实测规律）。
   *
   * 63 份 docx 的页数分布：2 页 8 篇、3 页 1 篇、**4 页 51 篇**、6 页 3 篇。
   * 4 页占 81%，是这种简报的标准篇幅。而 4 页文档的空段落占比高达 60–82%
   * （2 页文档只有 9–52%）—— 也就是说，正文写完并没有自然填满四页，
   * 是**刻意用空行把正文顶到第 4 页**，让抄送区落在偶数页上。
   *
   * 参考 PDF 也是如此：第 3 页只有 3 行正文 + 一张大图，第 4 页只有抄送。
   * 所以渲染器要在「抄送会落在奇数页」时补空页，把抄送推到下一个偶数页。
   */
  ccOnEvenPage: true,
}

/** 单位换算工具（渲染器与自测共用）。 */
export const UNITS = {
  cmToPt: (cm) => (cm * 72) / 2.54,
  ptToCm: (pt) => (pt * 2.54) / 72,
  twipsToPt: (tw) => tw / 20,
  ptToTwips: (pt) => pt * 20,
}

/** 期号默认值。 */
export const DEFAULT_ISSUE = '第XX期'

/**
 * 一份简报的完整数据模型。
 * @typedef {object} BriefDoc
 * @property {string} title        主副题式大标题
 * @property {string} issue        期号，如「第12期」
 * @property {string} author       撰稿人
 * @property {string} auditor      审签人（可空）
 * @property {string} phone        联系方式
 * @property {string} [org]        报头单位名
 * @property {string[]} cc         抄送单位（默认两条）
 * @property {Array} blocks        正文块：{type:'p'|'h1'|'h2'|'h3'|'image'|'imagePair', ...}
 * @property {boolean} [withPageNumber]
 */

/** 生成空白简报骨架。 */
export function emptyBrief() {
  return {
    title: '',
    issue: DEFAULT_ISSUE,
    author: '',
    auditor: '',
    phone: '',
    org: '西藏大学理学院',
    cc: ['校领导、院领导', '党委（校长）办公室、党委宣传部'],
    blocks: [],
    withPageNumber: true,
  }
}

/**
 * 把「活动信息」表单变成写作素材（对应参考实现里 build_llm_prompts 的 user 侧字段）。
 * 纯函数，方便自测。
 * @param {object} form 工作台表单
 * @returns {{briefType:object, timeText:string, timeHm:string, leaders:string[], audience:string}}
 */
export function normalizeForm(form) {
  const type = BRIEF_TYPES[form?.briefType] ?? BRIEF_TYPES.activity
  const rawTime = String(form?.activityTime ?? '').trim()
  return {
    briefType: type,
    timeText: extractMonthDay(rawTime),
    timeHm: extractTimeHm(rawTime),
    leaders: splitNames(form?.leaderName),
    audience: String(form?.audience ?? '').trim(),
  }
}

/**
 * 日期解析：单个日期、同一月内的日期段、跨月的日期段都认。
 *
 * 为什么必须支持区间：活动常常不是一个时刻 —— 「20号到24号」「4月20日至24日」
 * 「4月28日—5月3日」都是常态。原来的实现只抓第一段日期，
 * 「2026年4月20日到24日」会被截成「4月20日」，末几天凭空消失。
 *
 * 支持的写法（分隔符放宽到「到 / 至 / ~ / — / -」）：
 *   2026年4月27日 14:30         → 4月27日
 *   4月20日到24日                → 4月20日至24日
 *   4月20日—5月3日               → 4月20日至5月3日
 *   8.20-8.24 / 8/20~8/24        → 8月20日至24日
 *   20号到24号（无月份）          → 20日至24日（没法补月份，不硬编）
 *
 * 输出统一成「X月Y日」或「X月Y日至[Z月]Y日」——中文里这种写法最自然，
 * 「至」比「-」更像简报用语。
 *
 * @param {string} input 用户填的时间
 * @returns {string} 规整后的日期文本；认不出就原样返回
 */
export function extractMonthDay(input) {
  const text = String(input ?? '')
  // 顺序要紧：四位年份的写法必须排在「8.31」「8/31」之前，
  // 否则「2026-04-27」会被 (d{1,2})-(d{1,2}) 抢先匹配成「26月4日」。
  const ONE = [
    /(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})/u,
    /(\d{1,2})月(\d{1,2})日?/u,
    /(\d{1,2})\.(\d{1,2})/u,
    /(\d{1,2})\/(\d{1,2})/u,
    /(\d{1,2})-(\d{1,2})/u,
  ]
  /** 从一个匹配里取 [月, 日]；不合法返回 undefined。 */
  const pick = (m) => {
    const groups = m.length === 4 ? [m[2], m[3]] : [m[1], m[2]]
    const month = Number(groups[0])
    const day = Number(groups[1])
    if (!Number.isFinite(month) || !Number.isFinite(day)) return undefined
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    return [month, day]
  }
  const findOne = (source) => {
    for (const pattern of ONE) {
      const m = pattern.exec(source)
      if (m === null) continue
      const got = pick(m)
      if (got !== undefined) return got
    }
    return undefined
  }

  // ① 先找「日期段」：把两个日期之间的分隔符当作切点。
  //    分隔符故意不含逗号 —— 「4月20日、21日」是枚举不是区间。
  const RANGE_SEP = /\s*(?:到|至|~|～|—|–|－|-)+\s*/u
  const segMatch = ONE.map((p) => new RegExp(p.source, 'gu')).map((p) => {
    const m = p.exec(text)
    return m
  })
  // 用第一个能匹配到的「起点日期」去找它后面紧跟的分隔符与第二个日期
  for (const pattern of ONE) {
    const re = new RegExp(pattern.source, 'gu')
    const first = re.exec(text)
    if (first === null) continue
    const start = pick(first)
    if (start === undefined) continue
    const after = first.index + first[0].length
    const rest = text.slice(after)
    const sep = RANGE_SEP.exec(rest)
    if (sep === null || sep.index > 6) break
    const tail = rest.slice(sep.index + sep[0].length)
    // 第二段的三种写法，按信息量从多到少试：
    //   a. 带月份 + 分隔符 + 日  （8.20-8.24 / 4月28日—5月3日）
    //   b. 纯日期                （到24日 / 到24号）
    //   c. 纯数字                （到24）
    // 尾巴必须以「月份日期」或「数字」开头才算区间，否则说明分隔符属于别的东西
    // （比如「4月20日 14:30-16:00」里的那个 -），此时不该当成日期段。
    const endFull = (() => {
      for (const pattern of ONE) {
        const re = new RegExp('^' + pattern.source, 'u')
        const m = re.exec(tail)
        if (m === null) continue
        const got = pick(m)
        if (got !== undefined) return got
      }
      return undefined
    })()
    if (endFull !== undefined) {
      const sameMonth = endFull[0] === start[0]
      return start[0] + '月' + start[1] + '日至' + (sameMonth ? '' : endFull[0] + '月') + endFull[1] + '日'
    }
    // 只有日（可带「日/号」）：到24日 / 到24号 / 到24
    const dayOnly = /^(\d{1,2})\s*[日号]?/u.exec(tail)
    if (dayOnly !== null) {
      const day = Number(dayOnly[1])
      // 只认「带单位」或「明显是日」的：避免把「14:30」的 14 当成 14 日。
      // 判据：原文里这个数字后面紧跟「日」「号」，或者区间分隔符是中文「到/至」。
      const hadUnit = /^\d{1,2}\s*[日号]/u.test(tail)
      const chineseSep = /到|至/u.test(sep[0])
      if (Number.isFinite(day) && day >= 1 && day <= 31 && (hadUnit || chineseSep)) {
        return start[0] + '月' + start[1] + '日至' + day + '日'
      }
    }
    break
  }

  // ② 没有月份、只有「日」的区间：「20号到24号」「20日至24日」。
  //    这时凑不出月份，就不硬补 —— 只写「20日至24日」，让模型按上下文照抄。
  const bareRange = /^(\d{1,2})\s*[日号]?\s*(?:到|至|~|～|—|–|－)\s*(\d{1,2})\s*[日号]/u.exec(text)
  if (bareRange !== null) {
    const a = Number(bareRange[1])
    const b = Number(bareRange[2])
    if (a >= 1 && a <= 31 && b >= 1 && b <= 31) return a + '日至' + b + '日'
  }

  // ③ 枚举（不是区间）：「4月20日、21日」「4月20日、22日、24日」。
  //    分隔符是顿号/逗号 —— 与区间区分开，不能顺手当成「到」。
  //    这种写法在简报里通常表示"分几天办"，保留全部日期比截断更忠实。
  const enumMatch = /^(\d{1,2})月(\d{1,2})日?((?:\s*[、,，]\s*\d{1,2}\s*[日号]?)+)/u.exec(text)
  if (enumMatch !== null) {
    const month = Number(enumMatch[1])
    const days = [Number(enumMatch[2])]
    for (const part of enumMatch[3].split(/[、,，]/u)) {
      const n = Number(String(part).replace(/[^\d]/gu, ''))
      if (Number.isFinite(n) && n >= 1 && n <= 31) days.push(n)
    }
    if (month >= 1 && month <= 12 && days.length > 1) {
      return month + '月' + days.join('日、') + '日'
    }
  }

  // ④ 没有区间也没有枚举，退回单个日期。
  const one = findOne(text)
  if (one !== undefined) return one[0] + '月' + one[1] + '日'
  return text
}

/**
 * 「14:30」「14：30」→「14:30」；没有就空串。
 *
 * 一个例外：出现「每天 / 每日 / 全天」这类词时，时刻是**作息**而不是开场时间
 * （「20号到24号 每天9:00-17:00」），这时不该把它写进正文的「X时X分」位置。
 * 判据放在这里而不是调用处，免得每处都重复一遍规则。
 *
 * @param {string} input 用户填的时间
 * @returns {string} 单个时刻，或空串
 */
export function extractTimeHm(input) {
  const text = String(input ?? '')
  if (/每天|每日|全天|整日/u.test(text)) return ''
  const m = /(\d{1,2})[:：](\d{2})/.exec(text)
  if (m === null) return ''
  return m[1] + ':' + m[2]
}

/** 顿号/逗号/空格分隔的人名 → 数组（去空）。 */
/**
 * 领导名单拆分。
 *
 * 难点：职务内部也用顿号。样本里有
 *   「院党委副书记、纪委书记张某某」
 * 这是**一个**领导的完整职务，不能拆成「院党委副书记」+「纪委书记张某某」。
 *
 * 判断依据：顿号两侧都是短词且都不含姓名 -> 属于职务串，保留；
 * 否则是分隔两人。做法是先把「职务串 + 姓名」粘成一个整体再切。
 *
 * 具体策略：
 *   1. 按「换行 / 分号 / 逗号」切成候选（这些不会出现在职务里）；
 *   2. 每个候选内部如果只有顿号，且末段像「职务+姓名」或纯姓名，
 *      就把前面的顿号段当作职务前缀合并回去。
 *
 * @param {string} input 用户填写的领导名单
 * @returns {string[]} 每个人的「职务+姓名」或纯姓名
 */
export function splitNames(input) {
  const text = String(input ?? '').trim()
  if (text === '') return []
  // 1) 先按明确的多人分隔符切（换行/分号/逗号/空白）。顿号留给第 2 步判断，
  //    因为职务内部也用顿号（「党委副书记、纪委书记张某某」）。
  //    空白能当分隔符是因为职务里不会出现空格。
  const coarse = text
    .split(/[\n;；,，\s]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const out = []
  for (const chunk of coarse) {
    // 2) 块内只剩顿号：判断每个顿号段是不是「职务片段」。
    const parts = chunk.split(/[、]/u).map((s) => s.trim()).filter((s) => s.length > 0)
    if (parts.length === 1) {
      out.push(parts[0])
      continue
    }
    // 职务片段：以职务词结尾但**不含姓名**（很短，通常 ≤8 字且不含常见姓名模式）。
    // 务实判据：段尾是职务词，且整段长度 ≤ 10 —— 例如「院党委副书记」「纪委书记」。
    const isTitleFragment = (s) =>
      s.length <= 10 && TITLE_SUFFIXES.some((suffix) => s.endsWith(suffix))
    // 逐段合并：只要当前段是职务片段，就并入下一段（职务串 + 姓名）。
    let buffer = ''
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]
      const last = i === parts.length - 1
      if (!last && isTitleFragment(part)) {
        buffer += (buffer === '' ? '' : '、') + part
        continue
      }
      out.push((buffer === '' ? '' : buffer + '、') + part)
      buffer = ''
    }
    if (buffer !== '') out.push(buffer)
  }
  return out
}

const TITLE_SUFFIXES = ['书记', '院长', '主任', '处长', '校长', '科长', '部长', '主席', '教授', '老师', '导员', '秘书长', '组长', '支书', '长']

/**
 * 领导称谓：名字后加「同志」，已带职务/称谓的不重复加。
 * 与参考实现 add_comrade 同规则（逐位处理，顿号连接）。
 */
export function addComrade(name) {
  const text = String(name ?? '').trim()
  if (text === '') return ''
  if (text.endsWith('同志')) return text
  if (TITLE_SUFFIXES.some((suffix) => text.endsWith(suffix))) return text
  return text + '同志'
}

/** 领导姓名数组 → 「张三同志、李四同志」；空 → 空串。 */
export function formatLeaders(names) {
  const list = Array.isArray(names) ? names : splitNames(names)
  return list.map(addComrade).filter((s) => s !== '').join('、')
}

/** 中文正文字数（不含标点与空白），与参考实现 count_chars 同口径。 */
export function countChars(text) {
  return String(text ?? '').replace(/[\s，。、；：！？（）""''“”‘’《》…—\-.!?,;:()"'[\]]/gu, '').length
}

/** 正文总字数（只统计 type==='p' 的块）。 */
export function countBodyChars(blocks) {
  let total = 0
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block?.type === 'p') total += countChars(block.text)
  }
  return total
}

/**
 * 结构规整：把模型给的正文规整成「4 个自然段 + 小标题 + 插图」的块数组。
 * 不编造内容 —— 缺段就报错让上层补，不静默塞模板句子。
 * @param {Array} blocks 原始块
 * @returns {{blocks:Array, paragraphs:number}}
 */
export function normalizeBlocks(blocks) {
  const list = []
  let paragraphs = 0
  for (const raw of Array.isArray(blocks) ? blocks : []) {
    const type = String(raw?.type ?? 'p')
    if (type === 'p') {
      const text = String(raw?.text ?? '').replace(/\s+/gu, ' ').trim()
      if (text === '') continue
      list.push({ type: 'p', text })
      paragraphs += 1
      continue
    }
    if (type === 'h1' || type === 'h2' || type === 'h3') {
      const text = String(raw?.text ?? '').trim()
      if (text === '') continue
      list.push({ type, text })
      continue
    }
    if (type === 'image') {
      if (String(raw?.src ?? '') === '') continue
      list.push({ type: 'image', src: String(raw.src), caption: String(raw?.caption ?? '').trim(), widthCm: Number(raw?.widthCm) || undefined })
      continue
    }
    if (type === 'imagePair') {
      const srcs = Array.isArray(raw?.srcs) ? raw.srcs.filter((s) => typeof s === 'string' && s !== '') : []
      if (srcs.length === 0) continue
      list.push({ type: 'imagePair', srcs: srcs.slice(0, 2), captions: (Array.isArray(raw?.captions) ? raw.captions : []).map((s) => String(s ?? '')), widthCm: Number(raw?.widthCm) || undefined })
    }
  }
  return { blocks: list, paragraphs }
}

/**
 * 标题美化成「主标题——西藏大学理学院+动词+主题名」。
 * 参考实现的规则：含「——」就保留；否则按类型模板拼。
 * @param {string} title 原始标题
 * @param {object} type BRIEF_TYPES 条目
 * @param {string} topic 主题名
 */
export function normalizeTitle(title, type, topic) {
  const raw = String(title ?? '').replace(/\s+/gu, ' ').trim()
  const name = String(topic ?? '').trim()
  if (raw !== '') return cleanTitleRepeats(raw)
  const verb = type?.verb ?? '开展'
  const noun = name === '' ? (type?.noun ?? '活动') : name
  return '西藏大学理学院' + verb + noun
}

/** 去掉标题里重复的单位名（参考实现 clean_title_repeats）。 */
export function cleanTitleRepeats(title) {
  const unit = '西藏大学理学院'
  let text = String(title ?? '')
  text = text.replaceAll(unit + unit, unit)
  if (text.split(unit).length - 1 > 1) {
    const idx = text.indexOf(unit) + unit.length
    text = text.slice(0, idx) + text.slice(idx).replaceAll(unit, '')
  }
  text = text.replaceAll('西藏大学西藏大学', '西藏大学')
  text = text.replaceAll('理学院理学院', '理学院')
  return text.trim()
}

/**
 * 竞赛用词纪律：主题名没带「赛」类字样时标题补「大赛」。
 *
 * **只能用于竞赛类型。** 传进来的 briefType 不是竞赛时原样返回 ——
 * 否则「开展心理健康」会被补成「开展心理健康大赛」，
 * 「召开新生见面会」变成「召开新生见面会大赛」，是硬伤。
 * 守卫放在函数里而不是调用处，避免每个调用方都要记得判类型。
 *
 * @param {string} title 标题
 * @param {string} topic 主题名
 * @param {string} [briefType] 简报类型 id（contest 才处理）
 * @returns {string}
 */
export function ensureContestWording(title, topic, briefType) {
  const text = String(title ?? '')
  if (briefType !== undefined && briefType !== 'contest') return text
  const MARK = ['大赛', '比赛', '竞赛', '挑战赛', '选拔赛', '联赛', '杯赛']
  if (MARK.some((w) => text.includes(w))) return text
  const name = String(topic ?? '').trim()
  if (name !== '' && MARK.some((w) => name.includes(w))) return text
  if (name !== '' && text.includes(name)) return text.replace(name, name + '大赛')
  return text + '大赛'
}
