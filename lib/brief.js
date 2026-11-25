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
 * @module @zws/dsh-tuiwen/brief
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
  /** 小图（成对并排）最大宽 / 高（参考：8.3 × 6.1） */
  smallImageWidthCm: 8.3,
  smallImageMaxHeightCm: 6.1,
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

/** 「2026年8月31日」「8.31」「8/31」「8-31」→「8月31日」。 */
export function extractMonthDay(input) {
  const text = String(input ?? '')
  // 顺序要紧：四位年份的写法必须排在「8.31」「8/31」之前，
  // 否则「2026-04-27」会被 (d{1,2})-(d{1,2}) 抢先匹配成「26月4日」。
  const patterns = [
    /(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})/u,
    /(\d{1,2})月(\d{1,2})日?/u,
    /(\d{1,2})\.(\d{1,2})/u,
    /(\d{1,2})\/(\d{1,2})/u,
    /(\d{1,2})-(\d{1,2})/u,
  ]
  for (const pattern of patterns) {
    const m = pattern.exec(text)
    if (m === null) continue
    const groups = m.length === 4 ? [m[2], m[3]] : [m[1], m[2]]
    const month = Number(groups[0])
    const day = Number(groups[1])
    if (!Number.isFinite(month) || !Number.isFinite(day)) continue
    if (month < 1 || month > 12 || day < 1 || day > 31) continue
    return month + '月' + day + '日'
  }
  return text
}

/** 「14:30」「14：30」→「14:30」；没有就空串。 */
export function extractTimeHm(input) {
  const m = /(\d{1,2})[:：](\d{2})/.exec(String(input ?? ''))
  if (m === null) return ''
  return m[1] + ':' + m[2]
}

/** 顿号/逗号/空格分隔的人名 → 数组（去空）。 */
export function splitNames(input) {
  return String(input ?? '')
    .split(/[、,，;；\s]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
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

/** 竞赛用词纪律：主题名没带「赛」类字样时标题补「大赛」。 */
export function ensureContestWording(title, topic) {
  const MARK = ['大赛', '比赛', '竞赛', '挑战赛', '选拔赛', '联赛', '杯赛']
  const text = String(title ?? '')
  if (MARK.some((w) => text.includes(w))) return text
  const name = String(topic ?? '').trim()
  if (name !== '' && MARK.some((w) => name.includes(w))) return text
  if (name !== '' && text.includes(name)) return text.replace(name, name + '大赛')
  return text + '大赛'
}
