/**
 * 简报工作台 —— 宿主半
 *
 * 这里只做三件事：
 *   1. 一个 Remote 服务 `jianbao`：工作台（浏览器半）读状态、存表单、收图片、编译 PDF；
 *   2. 三个模型工具：jianbao_state / jianbao_save / jianbao_render，让模型真的能写稿并出 PDF；
 *   3. 一段系统提示词：把「版式规范 + 写作纪律」常驻会话（逆向自参考实现的提示词与实测规则）。
 *
 * 版式数据在 brief.js，LaTeX 生成在 render-tex.js，环境探测在 env.js，编译在 compile.js ——
 * 本文件只做编排，不重复实现任何规则。
 *
 * 为什么图片走 base64 而不是 HTTP 上传路由：
 *   DSH 的精确 Fetch 路由默认拒绝非 owner Peer（需要每条路由自带 access rule），
 *   简报插图通常 < 3MB，走 Remote 的 JSON 参数最简单、也最少依赖宿主内部契约。
 *
 * @module @zws/dsh-jianbao
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineTool } from './tool.js'
import { readFile, writeFile } from 'node:fs/promises'

import { BRIEF_TYPES, HEADING_STYLES, LAYOUT, METRICS, countBodyChars, normalizeBlocks, normalizeTitle, normalizeYear } from './brief.js'
import { renderTex } from './render-tex.js'
import { detectEnvironment, scanFonts } from './env.js'
import { compileTex } from './compile.js'
import { optimizeImages } from './image-opt.js'
import { ALLOWED, decide, decideAgent } from './gate.js'
// 写作纪律的实测口径（63 篇真实简报蒸馏）：禁用词表、标点与人称统计。
// 检查逻辑读这里的常量，不在代码里硬编码词表 —— 补样本只改 style-corpus 一处。
import { BANNED, PUNCT_RULES } from './style-corpus.js'
import {
  assetDir,
  importImage,
  listOutputs,
  outputTimes,
  loadBrief,
  loadForm,
  outDir,
  readJson,
  readLogTail,
  saveBrief,
  saveForm,
  stateRoot,
  writeAtomic,
} from './store.js'

/** Cordis 插件名。同时是 dsh.client 扫描的锚点与 Remote 命名空间名。 */
export const name = '@zws/dsh-jianbao'

/** 本包根目录（随包技能的来源）。 */
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * 包版本。工作台的版本角标用它，方便确认"重启后到底加载的是哪一版"——
 * 改了 client.js 却没整体重启 DSH 时，光看界面分不出新旧。
 */
const PACKAGE_VERSION = (() => {
  try {
    const text = readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')
    const version = JSON.parse(text)?.version
    return typeof version === 'string' ? version : ''
  } catch {
    return ''
  }
})()

/**
 * DSH home。优先 DSH_HOME，回落 ~/.dsh —— 与宿主其它插件一致。
 * @returns {string}
 */
function DSH_HOME() {
  const explicit = process.env.DSH_HOME
  if (typeof explicit === 'string' && explicit.length > 0) return explicit
  return join(homedir(), '.dsh')
}

/** 宿主依赖：工具注册表与系统提示词。sessions 走 ctx.get 惰性读，不强依赖。 */
export const inject = ['tools', 'systemPrompt']

/** typert 协议里读 Remote 标记的稳定属性名（跨安装副本共享同一字符串）。 */
const REMOTE_METHODS = '@deepseek-ai/dsh-typert-protocol/remote-methods'
/** Cordis 服务键，同时也是 Remote 命名空间名（浏览器侧是 remote.jianbao）。 */
const SERVICE_KEY = 'jianbao'
/** 系统提示词段落身份与位置（任务背景段，排在工具说明之前）。 */
const SECTION_NAME = 'jianbao:spec'
const SECTION_ORDER = 10120
/** 环境探测缓存时长：用户刚装的宏包不该等重启。 */
const ENV_TTL = 10 * 60 * 1000
/** 单张图片上限（base64 解码后的字节数）。超过就让用户先压缩，别把 WebSocket 撑爆。 */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

/** 只允许工作区内部路径（防 ../ 逃逸）。 */
function insideWorkspace(workspace, relative) {
  const root = resolve(workspace)
  const target = isAbsolute(relative) ? resolve(relative) : resolve(root, relative)
  if (target !== root && !target.startsWith(root + sep) && !target.startsWith(root + '/')) {
    throw new Error('路径越出工作区：' + relative)
  }
  return target
}

/**
 * 从工具执行上下文取工作区根。**优先 exec.agent.session.header.cwd** ——
 * 那是这次调用真正所属的会话目录；ctx.get('sessions') 在宿主侧不一定存在，
 * 回落到 process.cwd() 会把产物写到 DSH 进程目录里（静默写错地方，最难查）。
 */
function workspaceOfExec(ctx, exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  if (typeof cwd === 'string' && cwd !== '') return resolve(cwd)
  return workspaceFor(ctx, exec?.agent?.session?.header?.id)
}

/** 取会话 id（读缓存/写状态用；拿不到就空串，服务会回落到进程 cwd）。 */
function sessionIdFor(ctx, exec) {
  const id = exec?.agent?.session?.header?.id
  return typeof id === 'string' ? id : ''
}

/** 解析工作区根：优先会话 cwd，拿不到用进程 cwd。 */
function workspaceFor(ctx, sessionId) {
  const sessions = ctx.get('sessions')
  if (sessions !== undefined && sessions !== null && typeof sessionId === 'string' && sessionId !== '') {
    try {
      const live = typeof sessions.get === 'function' ? sessions.get(sessionId) : undefined
      const cwd = live?.header?.cwd
      if (typeof cwd === 'string' && cwd !== '') return resolve(cwd)
    } catch {
      /* 会话不在线就回落到进程 cwd */
    }
  }
  return resolve(process.cwd())
}

/** 正文块的参数 schema（defineTool 的隐式属性表格式：required 写在字段上）。 */
const BLOCK_PARAM = {
  type: 'object',
  description: '正文块：p=自然段；h1/h2/h3=一二三级小标题；image=单图；imagePair=成对并排图',
  additionalProperties: true,
  properties: {
    type: { type: 'string', required: true, enum: ['p', 'h1', 'h2', 'h3', 'image', 'imagePair'], description: '块类型' },
    text: { type: 'string', description: 'p/h1/h2/h3 的文字' },
    src: { type: 'string', description: 'image：相对 .jianbao/out/ 的路径，如 assets/fig.png' },
    srcs: { type: 'array', items: { type: 'string' }, description: 'imagePair：两张图路径' },
    caption: { type: 'string', description: 'image 的图注（可空）' },
    captions: { type: 'array', items: { type: 'string' }, description: 'imagePair 的图注' },
    widthCm: { type: 'number', description: '覆盖默认宽度（cm）' },
  },
}

/** 简报数据的参数 schema（jianbao_save 的 brief 形参）。 */
const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    title: { type: 'string', description: '主副题式大标题；留空按「西藏大学理学院+动词+主题名」自动生成' },
    issue: { type: 'string', description: '期号，如「第12期」' },
    year: { type: 'string', description: '报头年份，留空用当年' },
    author: { type: 'string', description: '撰稿人' },
    auditor: { type: 'string', description: '审签人（可空）' },
    phone: { type: 'string', description: '联系方式' },
    org: { type: 'string', description: '报头单位名，默认「西藏大学理学院」' },
    briefType: { type: 'string', description: '简报类型：meeting / activity / contest / lecture' },
    activityPlace: { type: 'string', description: '活动地点（写进第 1 段「于…举行」）；用户没给就留空，不要编' },
    topic: { type: 'string', description: '主题名称，用于自动补标题' },
    cc: { type: 'array', items: { type: 'string' }, description: '抄送单位，通常两项' },
    withPageNumber: { type: 'boolean', description: '是否显示页脚「— N —」页码，默认 true' },
    blocks: { type: 'array', required: true, items: BLOCK_PARAM, description: '正文块数组（完整提交，不是增量）' },
  },
}

/**
 * 版式规范（工作台右侧说明与工具输出共用一份）。
 *
 * 数字全部来自 METRICS —— 那是从参考 PDF 逐 span 反推出来的实测值。
 * 这里不重复写死一份，避免"文档说 16pt、渲染器用 15.96bp"这种自相矛盾。
 */
export const SPEC = {
  paper: 'A4（595.32 × 841.92 bp）',
  margin: '上 104.90／下 99.25／左 79.40／右 73.70 bp（= 3.7/3.5/2.8/2.6cm，按 twips 精确换算）',
  linePt: METRICS.linePt,
  title: '大标题：' + METRICS.titlePt + 'bp 方正小标宋_GBK，居中自然折行，行距 ' + METRICS.titleLinePt + 'bp',
  body: '正文：' + METRICS.bodyPt + 'bp 方正仿宋_GBK，行距 ' + METRICS.linePt + 'bp，**首行缩进 2 字符**（63/63 份语料都是 firstLineChars=200）',
  headings: HEADING_STYLES,
  cc: '抄送区：' + METRICS.ccPt + 'bp 仿宋_GB2312，两条 1bp 通栏线，压最后一页底部',
  pageNumber: '页脚「— N —」，' + METRICS.pagePt + 'bp，基线 ' + METRICS.footerBaseline + '，右端 ' + '506.01',
  types: Object.values(BRIEF_TYPES),
}


/**
 * 字数与结构校验：只报问题，不改内容（改稿是模型/作者的活）。
 *
 * 导出是为了让测试能直接验规则 —— 这些规则是从 63 篇语料实测出来的，
 * 一旦被改坏会静默影响每一份产出。
 */
export function reviewBrief(doc) {
  const warnings = []
  const normalized = normalizeBlocks(doc?.blocks)
  const paragraphs = normalized.blocks.filter((b) => b.type === 'p')
  const chars = countBodyChars(normalized.blocks)
  if (paragraphs.length === 0) warnings.push('正文还没有任何自然段')
  // 段数按实测分布放宽：STRUCTURE.paragraphs = {3:24, 4:31, 5:7, 8:1}，
  // 4 段是众数但不是唯一正确答案 —— 3 段和 5 段合计 31 篇，占样本 49%。
  // 原来只接受「恰好 4 段」，会把近一半的真实简报判成不合规。
  else if (paragraphs.length < 3 || paragraphs.length > 5) {
    warnings.push('自然段 ' + paragraphs.length + ' 段，超出常规区间 3–5 段（样本众数 4）')
  } else if (paragraphs.length !== 4) {
    warnings.push('自然段 ' + paragraphs.length + ' 段（可以，样本里 4 段最常见；若能合到 4 段更好）')
  }
  // 区间以 63 篇真实样本的实测分布为准（style-corpus.STRUCTURE.chars）。
  //
  // 注意：STRUCTURE.chars 的 median 618 是**整篇 docx 全部文字**的口径
  // （含报头、标题、抄送），而 countBodyChars 只统计 type==='p' 的正文段。
  // 两个口径不能混用 —— 拿 618 去卡正文段，会把参考样本 74 号本身
  // （PDF 实测正文 479 字）也判成「偏少」。
  //
  // 正文口径的实测下界按 PDF 取 400（参考样本正文 479 字，我们有 431 字，都在内），
  // 上界仍取 700。两个数都落在 400–700，与语料同向。
  if (chars > 0 && chars < 400) warnings.push('正文 ' + chars + ' 字，偏少（参考样本正文 479 字，宜 400–700）')
  if (chars > 700) warnings.push('正文 ' + chars + ' 字，超过 700 字上限')
  const title = String(doc?.title ?? '').trim()
  if (title === '') warnings.push('还没有标题')
  // 阈值取自 style-corpus.TITLE_RULES（63 篇实测）：
  //   medianChars 28 / maxChars 40（82.5% 的样本 ≤40）/ hardMaxChars 63
  // 原来是 60 —— 只比硬上限松一点，等于没有预警作用。
  else if (title.length > 40) {
    warnings.push(
      '标题 ' + title.length + ' 字，偏长（样本中位 28 字，82.5% ≤40 字' +
        (title.length > 63 ? '；已超硬上限 63 字' : '') + '）',
    )
  }
  // ── 逐块检查：禁用词 / 标点 / 人称 ──────────────────────────────
  //
  // 规则全部来自 style-corpus 的实测统计，不是凭感觉列的：
  //   · BANNED         —— 63 篇里一次都没出现的 AI 腔词；
  //   · PUNCT_RULES.firstPerson —— 「我们」0 次、「我院」34 次、「我校」1 次；
  //   · PUNCT_RULES.exclamation —— 正文感叹号全样本只有 2 处，且仅限
  //     「向他们表示祝贺！」「喜报！」两种固定说法；
  //   · PUNCT_RULES.question    —— 问号 0 次。
  //
  // 运行时从 corpus 读，不在本文件硬编码 —— 以后补样本只改 corpus 一处。
  const bodyText = normalized.blocks
    .filter((b) => b.type === 'p')
    .map((b) => b.text)
    .join('\n')
  // 禁用词分两档，因为它们在语料里的性质不同：
  //
  //   · 硬禁（式微词/AI 腔）：63 篇一次都没出现，用了就是错，必须改；
  //   · 软提示（程度副词、序次词）：严格说也不是简报用语，但偶尔用在
  //     引述或强调里不至于破坏文风。把它们也当硬错会逼模型做无意义的
  //     措辞反复 —— 那比留一个「非常」更伤。
  // 硬禁表 = corpus 的 BANNED 减去软词，再补上语料里同样 0 次的几个。
  // 从 BANNED 派生而不是另抄一份，避免以后 corpus 补样本时两处漂移。
  const SOFT_BANNED = ['大大', '非常', '十分', '极其', '超级', '第一，', '第二，', '第三，', '对齐', '链路', '矩阵']
  const HARD_BANNED = [
    ...BANNED.filter((word) => !SOFT_BANNED.includes(word)),
    '与此同时', '毋庸置疑', '总而言之',
  ]
  const hardHits = HARD_BANNED.filter((word) => bodyText.includes(word))
  if (hardHits.length > 0) {
    warnings.push(
      '出现 AI 腔用语：' + hardHits.slice(0, 6).join('、') +
        (hardHits.length > 6 ? ' 等 ' + hardHits.length + ' 个' : '') +
        '（63 篇样本中一次未出现）',
    )
  }
  const softHits = SOFT_BANNED.filter((word) => bodyText.includes(word))
  if (softHits.length > 0) {
    warnings.push('建议少用『' + softHits.join('、') + '』这类程度/序次词（样本里罕见，但不影响交付）')
  }
  if (bodyText.includes('我们')) {
    warnings.push('正文出现「我们」（样本 0 次；统一用「我院」或「学院」）')
  }
  if (bodyText.includes('我校')) {
    warnings.push('正文出现「我校」（样本 1 次；学院口径用「我院」）')
  }
  const bangs = (bodyText.match(/！/gu) ?? []).length
  if (bangs > 0) {
    const allowed = (PUNCT_RULES?.exclamation?.allowOnly ?? []).filter((s) => bodyText.includes(s))
    if (allowed.length === 0) {
      warnings.push('正文出现感叹号 ' + bangs + ' 处（样本全篇仅 2 处，且只用于「向他们表示祝贺！」这类固定说法）')
    }
  }
  if (bodyText.includes('？') || bodyText.includes('?')) {
    warnings.push('正文出现问号（样本 0 次）')
  }

  for (const block of normalized.blocks) {
    if (block.type === 'image' || block.type === 'imagePair') continue
    // 破折号：样本里正文仅 6 处、且都是「机制——早进课题」这种注释式补充，
    // 标题里才大方用（16 处）。正文段里出现就提醒。
    if (block.text.includes('——') && block.type === 'p') {
      warnings.push('正文段里出现破折号（样本正文仅 6 处，属注释式补充；标题才常用来做标语——事件）')
    }
  }

  // ── 一致性与合规检查（用户实测踩过的坑）──────────────────────────
  // bodyText 在禁用词检查那里已经拼好（L234），这里直接复用

  // ① 日期冲突：同一篇简报里出现两套互不相容的日期。
  //    实测案例：表单「活动时间」填 5月12-13日，而「活动流程」里写 4月20/22/24日，
  //    模型两处都照抄，正文里就同时出现 5月 和 4月 —— 事实自相矛盾。
  const monthDays = [...new Set((bodyText.match(/\d{1,2}\s*月/g) || []).map((s) => s.replace(/\s/g, "")))]
  if (monthDays.length > 1) {
    const detail = monthDays.sort().join("、")
    warnings.push(
      "正文里出现了 " + monthDays.length + " 个不同月份（" + detail + "）：" +
      "活动时间与活动流程的日期对不上，请确认以哪个为准",
    )
  }

  // ② 第 1 段必须把六要素交代清楚 —— 用户实测对照参考 74 号后指出来的。
  //
  // 74 号原文第 1 段：「…8月29日，西藏大学理学院于图书馆二楼学术报告厅
  // 举行2026级新生见面会暨入学教育动员大会。会议由…主持，…参会。」
  // 时间、地点、主体、事件、主持、参会，一段说全。
  //
  // 我们的稿子原来会把地点漏掉（表单压根没有这个字段），所以这里做两条检查：
  //   · 给了地点却没写进第 1 段 → 告警；
  //   · 第 1 段没有日期 → 告警。
  const firstPara = paragraphs.length > 0 ? paragraphs[0].text : ''
  if (firstPara !== '') {
    const place = String(doc?.activityPlace ?? '').trim()
    if (place !== '') {
      // 地点关键词：取地名最后 4 个字做子串匹配，太短的（如「会议室」）不强求
      const key = place.replace(/\s+/gu, '')
      const hit = firstPara.replace(/\s+/gu, '').includes(key) || (key.length >= 4 && firstPara.includes(key.slice(-4)))
      if (!hit) {
        warnings.push('表单填了活动地点「' + place + '」，但第 1 段没写进去：74 号样本的开头段是「…于图书馆二楼学术报告厅举行…」，时间地点要一段交代清楚')
      }
    }
    if (!/(\d{1,2}\s*月\s*\d{1,2}\s*日)/u.test(firstPara)) {
      warnings.push('第 1 段没有日期：63 篇样本里 87% 的第 1 段就写「X月X日，」，不要把时间挪到第 2 段')
    }
  }

  // ③ 审签人与撰稿人相同：审签人必须是上级，不能自己签自己。
  const author = String(doc?.author ?? "").trim()
  const auditor = String(doc?.auditor ?? "").trim()
  if (author !== "" && author === auditor) {
    warnings.push("审签人与撰稿人相同（都是「" + author + "」）：审签人应是上级，不能自签")
  }

  return { warnings: [...new Set(warnings)], chars, paragraphs: paragraphs.length }
}

/**
 * 把「探测到的字体文件」映射成渲染器要的 { name, file } 结构。
 *
 * 渲染器的 FONT_CANDIDATES 里，`file` 是空的那些靠系统按**字体名**查找
 * （`\newCJKfontfamily{方正小标宋_GBK}`）；有文件的则直接指到磁盘。
 * 用户实际装的往往是**中文文件名**（方正小标宋简体.ttf），系统按
 * 字体名「方正小标宋简体」能不能找到，取决于字体内部的 name 表，
 * 不一定可靠。所以探测到文件就显式给路径，最稳。
 *
 * @param {object|undefined} explicit 调用方显式指定（优先）
 * @param {{found: Record<string,{file:string,dir:string}>}} scanned scanFonts() 结果
 * @returns {Record<string,{name:string,file:string}>}
 */
function resolveFonts(explicit, scanned) {
  const out = { ...(explicit ?? {}) }
  const found = scanned?.found ?? {}
  /** 角色 → 探测到的文件名 */
  const mapping = {
    body: found.fangsong,
    title: found.xiaoBiaoSong,
    h1: found.heiti,
    h2: found.kaiti,
    h3: found.fangsong,
    // 抄送区在参考 PDF 里是 FangSong_GB2312，与正文不同字体（实测第 4 页）
    cc: found.cc ?? found.fangsong,
    // 页脚用 SimSun：参考 PDF 的「—」是 14.04 宽，其余字体对不上
    page: found.songti,
  }
  for (const [role, hit] of Object.entries(mapping)) {
    if (hit === undefined || hit === null) continue
    if (out[role] !== undefined) continue // 显式指定优先
    // 探测到的文件若在用户字体目录，用 @LOCAL/ 前缀让渲染器挑对目录；
    // 否则给裸文件名，走系统字体目录。
    const isLocal = scanned.dirs !== undefined && scanned.dirs[1] === hit.dir
    out[role] = {
      name: hit.file.replace(/\.[A-Za-z0-9]+$/u, ''),
      file: (isLocal ? '@LOCAL/' : '') + hit.file,
    }
  }
  return out
}

/**
 * 编译一次：写 .tex → xelatex → 返回结果。工作台与工具共用。
 * @param {object} ctx cordis 上下文
 * @param {string} workspace 工作区根
 * @param {object} doc 简报数据
 * @param {boolean} withPdf 无 LaTeX 时只写 .tex
 */
async function renderAndCompile(ctx, workspace, doc, withPdf, sessionId) {
  const revision = Number.isFinite(doc?.revision) ? doc.revision : Date.now()
  const jobName = 'brief'
  const target = outDir(workspace, sessionId)
  // 字体解析顺序：调用方显式指定 > 本机探测到的方正字体 > 渲染器内置候选表。
  //
  // 之前这里直接把 doc.fonts（默认 {}）传下去，于是永远落到 FONT_CANDIDATES
  // 的最后一项（系统字体）—— 本机装了方正小标宋简体.ttf 也用不上，
  // 大标题回落到 SimSun，与参考 PDF 的方正小标宋不符。
  const envFonts = scanFonts()
  const fonts = resolveFonts(doc?.fonts, envFonts)
  // 插图降采样：手机原图按 4000+px 插进去等于 1900dpi，一份 4 页简报 14MB，
  // 工作台内嵌预览直接卡死（用户实测"一闪一闪的"）。这里按排版宽度
  // 重采样到 350dpi 的 JPEG —— 参考样本就是 220dpi / 0.47MB。
  // 只改 .tex 里引用的路径，brief.json 里存的仍是用户上传的原图。
  const renderBlocks = await optimizeImages({ outDir: target, blocks: doc?.blocks })
  const tex = renderTex(
    {
      ...doc,
      blocks: renderBlocks,
      dateText: String(doc?.dateText ?? '').trim(),
    },
    {
      fontDir: envFonts.dirs[0] ?? doc?.fontDir ?? 'C:/Windows/Fonts',
      localFontDir: envFonts.dirs[1] ?? envFonts.dirs[0] ?? doc?.fontDir ?? 'C:/Windows/Fonts',
      fonts,
    },
  )
  await writeAtomic(resolve(target, jobName + '.tex'), tex)
  const review = reviewBrief(doc)
  const base = { tex: resolve(target, jobName + '.tex'), chars: review.chars, warnings: review.warnings }
  if (withPdf === false) return { ...base, ok: false, pdf: '', error: '未请求编译（只导出 .tex）', pages: 0, logTail: '' }
  const env = await detectEnvironment()
  if (!env.latex.canCompilePdf) {
    return { ...base, ok: false, pdf: '', error: env.latex.error, pages: 0, logTail: env.latex.logTail ?? '' }
  }
  const result = await compileTex({ xelatex: env.latex.xelatex, workDir: target, jobName })
  if (!result.ok) {
    return { ...base, ok: false, pdf: '', error: result.error, pages: 0, logTail: result.log.split('\n').slice(-60).join('\n') }
  }
  const pages = countPdfPages(result.log)
  await writeAtomic(
    resolve(target, jobName + '.meta.json'),
    JSON.stringify({ revision, compiledAt: new Date().toISOString(), pages, chars: review.chars, warnings: review.warnings }, null, 2) + '\n',
  )
  return { ...base, ok: true, pdf: result.pdf, error: '', pages, logTail: '' }
}

/** 从 XeLaTeX 日志里数页数（「Output written on x.pdf (3 pages, ...)」）。 */
function countPdfPages(log) {
  const m = /Output written on .*\((\d+) pages?/u.exec(String(log ?? ''))
  return m === null ? 1 : Number(m[1])
}


/** jianbao Remote 服务：工作台唯一的宿主侧入口。 */
class JianbaoService {
  /**
   * @param {object} ctx cordis 上下文
   */
  constructor(ctx) {
    this.ctx = ctx
    /** @type {Map<string, {at:number, report:object}>} 环境探测缓存（按工作区） */
    this.envCache = new Map()
    /** Gateway 的 SRC 兜底靠这个绑定把服务认成 Remote 命名空间。 */
    this.typertRemote = { service: this, serviceKey: SERVICE_KEY, namespace: SERVICE_KEY }
  }

  /** 工作区根。 */
  workspace(sessionId) {
    return workspaceFor(this.ctx, sessionId)
  }

  /**
   * 一次性迁移：把这版之前写在 .jianbao/ 根下的数据搬到 sessions/<id>/。
   *
   * 按会话隔离之后，老用户原来的 form.json / brief.json / out/ 都还在根目录，
   * 直接切过去会让他们以为「简报丢了」。这里在会话首次访问时做一次拷贝：
   *   · 只拷贝，不删除原数据（保留回退余地）
   *   · 目标目录已有数据就不动（避免覆盖用户新写的）
   *   · 整个过程失败也只是没有迁移，不阻断主流程
   *
   * @param {string} workspace 工作区
   * @param {string} sessionId 会话 id
   */
  async migrateLegacyState(workspace, sessionId) {
    const id = String(sessionId ?? '').trim()
    if (id === '') return
    const legacy = stateRoot(workspace)
    const target = stateRoot(workspace, id)
    if (legacy === target) return
    try {
      const { existsSync } = await import('node:fs')
      const { cp, mkdir } = await import('node:fs/promises')
      // 目标已经有 brief.json 或 form.json，说明这个会话在用了，不迁移
      if (existsSync(resolve(target, 'brief.json')) || existsSync(resolve(target, 'form.json'))) return
      // 老数据只交给**第一个**来认领的会话。
      // 否则新建会话 B 也会把同一份老数据拷过去 —— 用户要的正是「新会话干净」，
      // 那样等于没修。用过一次就落 .migrated 标记，后来者从空开始。
      const claimed = resolve(legacy, '.migrated')
      if (existsSync(claimed)) return
      // 源也没有，就没什么可迁的
      if (!existsSync(resolve(legacy, 'brief.json')) && !existsSync(resolve(legacy, 'form.json'))) return
      await mkdir(target, { recursive: true })
      for (const name of ['form.json', 'brief.json', 'env.json']) {
        const from = resolve(legacy, name)
        if (existsSync(from)) await cp(from, resolve(target, name)).catch(() => {})
      }
      const legacyOut = resolve(legacy, 'out')
      if (existsSync(legacyOut)) {
        await cp(legacyOut, resolve(target, 'out'), { recursive: true }).catch(() => {})
      }
      // 认领完成，后来者不再迁移
      await writeAtomic(claimed, new Date().toISOString() + '\n').catch(() => {})
    } catch {
      /* 迁移失败不影响使用：用户重新填一次即可 */
    }
  }

  /**
   * 环境检测（带缓存）。第二个参数 force=true 强制重探。
   * @param {string} sessionId 会话 id
   * @param {boolean} force 是否强制重探
   */
  async env(sessionId, force) {
    const workspace = this.workspace(sessionId)
    const cached = this.envCache.get(workspace)
    if (force !== true && cached !== undefined && Date.now() - cached.at < ENV_TTL) return cached.report
    const report = await detectEnvironment()
    // 把包版本挂进环境报告：工作台据此显示版本角标，
    // 改了 client.js 却没整体重启 DSH 时能一眼看出加载的还是旧代码。
    const stamped = PACKAGE_VERSION === '' ? report : { ...report, plugin: { name, version: PACKAGE_VERSION } }
    this.envCache.set(workspace, { at: Date.now(), report: stamped })
    await writeAtomic(resolve(stateRoot(workspace, sessionId), 'env.json'), JSON.stringify(stamped, null, 2) + '\n').catch(() => {})
    return stamped
  }

  /**
   * 工作台首屏：环境 + 表单 + 简报 + 产物清单，一次取全。
   * @param {string} sessionId 会话 id
   */
  async snapshot(sessionId) {
    const workspace = this.workspace(sessionId)
    await this.migrateLegacyState(workspace, sessionId)
    const [envReport, form, brief, outputs, times] = await Promise.all([
      this.env(sessionId, false),
      loadForm(workspace, sessionId),
      loadBrief(workspace, sessionId),
      listOutputs(workspace, sessionId),
      outputTimes(workspace, sessionId),
    ])
    const meta = await readJson(resolve(outDir(workspace, sessionId), 'brief.meta.json'), null)
    return {
      workspace,
      // 产物目录的**绝对路径**。按会话隔离后是 .jianbao/sessions/<id>/out，
      // 工作台原来自己拼 '.jianbao/out'（隔离改造前的旧布局）→ 用户点开是空的。
      outDir: outDir(workspace, sessionId),
      env: envReport,
      form,
      brief,
      outputs,
      // 产物修改时间：工作台用它区分"上一轮留下的"和"这一轮刚出的"，
      // 否则新任务第一帧就显示 PDF 已生成（进度直接 75%）。
      outputTimes: times,
      meta,
      spec: SPEC,
      assetDir: assetDir(workspace, sessionId),
    }
  }

  /**
   * 保存表单（工作台每改一个字段就落一次盘，刷新不丢）。
   * @param {string} sessionId 会话 id
   * @param {object} form 表单对象
   */
  async saveForm(sessionId, form) {
    const workspace = this.workspace(sessionId)
    await saveForm(workspace, form ?? {}, sessionId)
    return { ok: true, form }
  }

  /**
   * 收一张图片（base64），落进 .jianbao/out/assets/，返回相对路径。
   * @param {string} sessionId 会话 id
   * @param {string} name 原始文件名（只用于挑扩展名与命名）
   * @param {string} dataBase64 图片内容
   */
  async uploadImage(sessionId, name, dataBase64) {
    const workspace = this.workspace(sessionId)
    const text = String(dataBase64 ?? '')
    const comma = text.indexOf(',')
    const payload = comma >= 0 ? text.slice(comma + 1) : text
    const bytes = Buffer.from(payload, 'base64')
    if (bytes.byteLength === 0) throw new Error('图片内容为空')
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('图片超过 ' + Math.round(MAX_IMAGE_BYTES / 1024 / 1024) + 'MB，请先压缩')
    const dir = assetDir(workspace, sessionId)
    await writeAtomic(resolve(dir, '.keep'), '')
    const ext = (String(name ?? '').match(/\.[A-Za-z0-9]+$/u)?.[0] ?? '.png').toLowerCase()
    const stem = String(name ?? 'fig').replace(/\.[A-Za-z0-9]+$/u, '').replace(/[^\w\u4e00-\u9fa5-]+/gu, '_').slice(0, 40) || 'fig'
    let fileName = stem + ext
    let index = 1
    const { existsSync } = await import('node:fs')
    while (existsSync(resolve(dir, fileName))) {
      fileName = stem + '-' + index + ext
      index += 1
    }
    await writeFile(resolve(dir, fileName), bytes)
    return { ok: true, src: 'assets/' + fileName, bytes: bytes.byteLength }
  }

  /**
   * 存简报并编译。
   * @param {string} sessionId 会话 id
   * @param {object} brief 简报数据
   * @param {boolean} compile 是否编译 PDF
   */
  async save(sessionId, brief, compile) {
    const workspace = this.workspace(sessionId)
    await saveBrief(workspace, brief ?? {}, sessionId)
    // compile=false 是工作台点「开始工作」时先落一份骨架用的。
    // 这时**不能**生成 .tex —— 否则 brief.tex 的 mtime 立刻变新，
    // 工作台的进度判定会把它当成「LaTeX 源文件已生成」，
    // 于是一发消息进度条就跳到 75%（用户实测反馈过）。
    if (compile === false) {
      return { ok: false, tex: '', pdf: '', pages: 0, chars: 0, warnings: [], error: '只保存，未编译', logTail: '', workspace }
    }
    const result = await renderAndCompile(this.ctx, workspace, brief, true, sessionId)
    return { ...result, workspace }
  }

  /**
   * 只编译（不重新存）：用户改了字体设置、或第一次进来点了「开始工作」。
   * @param {string} sessionId 会话 id
   */
  async compile(sessionId) {
    const workspace = this.workspace(sessionId)
    const brief = await loadBrief(workspace, sessionId)
    if (brief === null) return { ok: false, tex: '', chars: 0, warnings: ['还没有简报数据，请先在工作台填写信息并开始工作'], pdf: '', pages: 0, error: '没有简报数据', logTail: '' }
    return renderAndCompile(this.ctx, workspace, brief, true, sessionId)
  }

  /**
   * 读编译日志尾部（编译失败时给用户看真正原因）。
   * @param {string} sessionId 会话 id
   */
  async log(sessionId) {
    const workspace = this.workspace(sessionId)
    return { log: await readLogTail(workspace, sessionId, 'brief.log', 8000) }
  }

  /**
   * 读产物（PDF 的 base64，供工作台内嵌预览）。
   * @param {string} sessionId 会话 id
   */
  async pdf(sessionId) {
    const workspace = this.workspace(sessionId)
    const file = resolve(outDir(workspace, sessionId), 'brief.pdf')
    const { existsSync } = await import('node:fs')
    if (!existsSync(file)) return { ok: false, data: '', bytes: 0 }
    const bytes = await readFile(file)
    return { ok: true, data: bytes.toString('base64'), bytes: bytes.byteLength }
  }

  /**
   * 工作台门控：这个会话能不能看到「简报」标签。
   *
   * 客户端拿不到"本会话用什么 preset"的同步读接口，所以由宿主侧读
   * agentPreset 投影作答。浏览器半在注册 conversation.view 之前先问它。
   *
   * @param {string} sessionId 会话 id
   */
  async gate(sessionId) {
    const sessions = this.ctx.get('sessions')
    let session
    try {
      if (sessions !== undefined && sessions !== null && typeof sessions.get === 'function') {
        session = sessions.get(sessionId)
      }
    } catch {
      session = undefined
    }
    const verdict = decide(this.ctx, session)
    return {
      allowed: verdict.allowed === true,
      preset: typeof verdict.preset === 'string' ? verdict.preset : '',
      reason: verdict.reason,
      allowedPresets: [...ALLOWED],
    }
  }

  /**
   * 把一张已存在的本地图片拷进资产目录（工作台/工具都可用）。
   * @param {string} sessionId 会话 id
   * @param {string} path 本地路径（工作区内）
   */
  async importImage(sessionId, path) {
    const workspace = this.workspace(sessionId)
    const source = insideWorkspace(workspace, path)
    const src = await importImage(workspace, source, sessionId)
    return { ok: true, src }
  }
}


/**
 * Gateway 在找不到生成式严格定义时会读这个原型标记（dsh-api-gateway/lib/index.js:1241
 * `remoteMethods(original).find(...)`），参数名从函数源码里解析（同文件 :1715 srcDescriptor）。
 * 所以下面这些方法**不能**用默认值/解构/剩余参数 —— 参数名就是线上字段名。
 */
Object.defineProperty(JianbaoService.prototype, REMOTE_METHODS, {
  configurable: true,
  value: {
    version: 1,
    methods: [
      { method: 'snapshot', invocation: { kind: 'direct' } },
      { method: 'env', invocation: { kind: 'direct' } },
      { method: 'saveForm', invocation: { kind: 'direct' } },
      { method: 'uploadImage', invocation: { kind: 'direct' } },
      { method: 'save', invocation: { kind: 'direct' } },
      { method: 'compile', invocation: { kind: 'direct' } },
      { method: 'log', invocation: { kind: 'direct' } },
      { method: 'pdf', invocation: { kind: 'direct' } },
      { method: 'gate', invocation: { kind: 'direct' } },
    ],
  },
})

// 注意：输出 schema 走 valueSchemaSpecToJsonSchema（allowRequired=false），
// 所以这里不能写 required —— 缺字段只是不校验，不报错。
const STATE_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      workspace: { type: 'string' },
      hasBrief: { type: 'boolean' },
      brief: { type: 'object', additionalProperties: true },
      form: { type: 'object', additionalProperties: true },
      env: { type: 'object', additionalProperties: true },
      outputs: { type: 'array', items: { type: 'string' } },
      spec: { type: 'object', additionalProperties: true },
    },
  },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

const RENDER_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' },
      pdf: { type: 'string' },
      tex: { type: 'string' },
      pages: { type: 'number' },
      chars: { type: 'number' },
      error: { type: 'string' },
      logTail: { type: 'string' },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  },
  render: (_args, value) => [{
    type: 'text',
    text: value.ok
      ? '已编译出 PDF：' + value.pdf + '（' + (value.pages ?? 1) + ' 页，正文 ' + value.chars + ' 字）' + (value.warnings.length > 0 ? '\n提醒：' + value.warnings.join('；') : '')
      : '已写入 .tex，但没出 PDF：' + (value.error ?? '未知原因') + (value.logTail ? '\n日志尾部：\n' + value.logTail : ''),
  }],
}


/** 版式与写作纪律（常驻会话）。内容全部来自参考实现逆向出来的规则。 */
function guidance() {
  return [
    '## 简报写作（DSH 简报工作台）',
    '',
    '本会话里有一份简报工程：`<workspace>/.jianbao/`（brief.json 是简报数据，form.json 是基本信息，out/ 是 LaTeX 源与 PDF）。',
    '工作台入口在界面里的「简报」标签页；用户在那边填写基本信息后点「开始工作」，你在对话里负责写稿、改稿、编译。',
    '',
    '### 版式（已固化在渲染器里，不要手改）',
    '- 纸张 A4（595.32 × 841.92bp）；页边距 左79.40 / 右73.70 / 上104.90 / 下99.25bp；行距固定 28.80bp（标题与全文一致）。',
    '- 大标题 21.96bp 方正小标宋、居中自然折行；正文 15.96bp 方正仿宋_GBK，**首行缩进 2 字符**。',
    '- 一级标题 19.93bp 方正黑体简体；二级标题 15.96bp 方正楷体_GBK 加粗；三级标题 15.96bp 方正仿宋_GBK 加粗。',
    '- 抄送区 15.00bp 仿宋_GB2312 + 两条 1bp 通栏横线，压在最后一页底部；页脚「— N —」14.04bp，右端 506.01。',
    '- 正文**首行缩进 2 字符**：63 份 docx 语料里 63/63 篇、230 个正文段全部带 `w:firstLineChars="200"`。不用自己写 \\hspace*{2em}，渲染器已设 `\\parindent=2em`。',
    '',
    '### 正文结构（3–5 个自然段，4 段最常见；400–700 字，不含标点；参考样本正文 479 字）',
    '- **第 1 段**：目的句（「为了……」或「在……之际，」）+「，X月X日，」+ 主句（西藏大学理学院 **于+地点** + 召开/开展/举办/举行 + 主题名）+ 主持人 + 出席领导 + 参加人群。',
  '  六要素必须全部落在第 1 段，**不要把时间或地点挪到第 2 段**。',
  '  地点只在用户给了时才写（63 篇里 30 篇写「于/在+地点」，其余本来不写）；没给就省略，不许编。',
  '  参考 74 号原文：「…做好大学阶段的学习生活规划。8月29日，西藏大学理学院于图书馆二楼学术报告厅举行2026级新生见面会暨入学教育动员大会。会议由…主持，…参会。」',
    '- 第 2 段：前半程内容（会议议程 / 活动环节 / 讲座内容 / 赛制与选手表现）。',
    '- 第 3 段：后半程 + 互动或结果（竞赛写「经过多轮激烈角逐」后的结果）。',
    '- 第 4 段：简短总结（2–3 句，60–100 字），「此次/本次+活动名……」开头，并呼应第 1 段所选主题。',
    '',
    '### 用词纪律',
    '- 会议：统一「会议」，出席写作「XX同志出席本次会议」；活动：「活动」；竞赛：主题名含「大赛」全文用大赛、含「比赛」用比赛；讲座：统一「讲座」，用「主讲」不用「主持」。',
    '- 领导：首次出场写「完整职务+姓名+同志」，再次出场只写「姓名+同志」；提供了几位就全写，不许用「等领导」省略；没提供领导时正文不出现任何领导，改以具体组织单位作主语，不得编造。',
    '- 禁止 AI 高频词与句式：与此同时、值得注意的是、毋庸置疑、显而易见、总而言之、综上所述、不仅…而且…（改「不仅…更…」）、标志着、至关重要、深入探讨、织锦、充满活力、令人叹为观止。',
    '- 破折号只用于标题主副题或引出机构全称，不作句内停顿；不用三项并列（改用「A、B等」两项）。',
    '- 不编造未提供的数据、获奖名单、领导原话；无材料就先向用户要。',
    '',
    '### 工具',
    '- `jianbao_state`：读当前简报、表单、环境与产物清单。改稿前先读。',
    '- `jianbao_save`：把完整简报写回工程（blocks 支持 p/h1/h2/h3/image/imagePair），可选同时编译。',
    '- `jianbao_render`：重新编译现有工程出 PDF，返回路径与编译警告。',
    '- 没有 LaTeX 环境时，工具会明确告诉你「只能出 .tex，出不了 PDF」，如实转告用户，不要假装编译成功。',
  ].join('\n')
}

/**
 * 把随包技能同步到 $DSH_HOME/jianbao/skills。
 *
 * 为什么在宿主半：补丁里 skill-filesystem 的 customSkillDirs 写的是
 * `!!js dshHomePath('jianbao/skills')` —— 那是个固定路径，必须先有文件落到那里。
 * 这段逻辑原先在 preset/index.js，预设改成官方声明式行（@deepseek-ai/dsh-agent-preset）
 * 之后，那个模块不再有 Loader 行指向它，apply 永远不会执行 —— 于是全新安装时
 * 那个目录是空的，简报技能静默丢失。所以搬到宿主机半（这一行一定被挂载）。
 *
 * 幂等：内容没变就不重写（避免每次启动碰 mtime 触发技能目录重扫）。
 *
 * @returns {{dir:string, copied:number, action:'synced'|'up-to-date'|'missing'}}
 */
export function syncBundledSkills() {
  const source = join(PACKAGE_ROOT, 'preset', 'skills')
  const target = join(DSH_HOME(), 'jianbao', 'skills')
  if (!existsSync(source)) return { dir: target, copied: 0, action: 'missing' }
  let names = []
  try {
    names = readdirSync(source).filter((n) => n.endsWith('.md'))
  } catch {
    return { dir: target, copied: 0, action: 'missing' }
  }
  if (names.length === 0) return { dir: target, copied: 0, action: 'missing' }
  try {
    mkdirSync(target, { recursive: true })
  } catch {
    return { dir: target, copied: 0, action: 'missing' }
  }
  let copied = 0
  for (const name of names) {
    const from = join(source, name)
    const to = join(target, name)
    let body = ''
    try {
      body = readFileSync(from, 'utf8')
    } catch {
      continue
    }
    let existing = null
    try {
      existing = readFileSync(to, 'utf8')
    } catch {
      existing = null
    }
    if (existing === body) continue
    try {
      writeFileSync(to, body, 'utf8')
      copied += 1
    } catch {
      /* 单文件失败不阻断其余 */
    }
  }
  return { dir: target, copied, action: copied === 0 ? 'up-to-date' : 'synced' }
}

/**
 * 注册工具与服务。
 * @param {object} ctx cordis 上下文
 */
/**
 * **服务平面**：只在顶层挂载，不在预设里挂。
 *
 * ## 为什么必须拆成两个模块
 *
 * 原先一个 `apply()` 同时做两件事：`ctx.provide('jianbao', service)` 发布工作台
 * Remote 服务，以及 `ctx.tools.register()` 注册三只模型工具。放进预设后两条路都堵死：
 *
 * · **不 isolate** → cordis 的 provide 把服务写进根 isolate 表
 *     this.ctx.root[symbols.isolate][name] ??= Symbol(name)   (cordis:805)
 *   mountPreset 收尾时 leakedServices() 命中，抛
 *     Preset services require isolate realms: jianbao
 *   （官方所有 providers 行都因此带 isolate，例如 compaction / planning / delegation。）
 *
 * · **加 isolate** → 服务被隔离到预设子 scope，而网关的 collectSrcClaims() 遍历的是
 *   **网关自己的 ctx.reflect.props**，再用 this.ctx.get(serviceKey) 取实例。
 *   实测：isolate 后 root.get('svcB') === false —— 网关根本发现不了这个 Remote，
 *   浏览器那边 remote.jianbao 永远是「未挂载」。
 *
 * 两条路都不通，说明「提供 Remote 服务」这件事本来就不属于预设内部：官方所有
 * preset 的插件行（tool-fs / tool-web / tool-subagent …）都只注册工具，不 provide 服务。
 *
 * 所以拆开：
 *   · 顶层 `jianbao` 行（本文件 apply）—— provide Remote 服务 + 提示段。
 *     它不在预设里，不受 leakedServices 约束，网关也能从根 scope 发现它。
 *   · 预设内 `jianbao` 行（./tools.js）—— 只注册三只工具，
 *     自己 new 一个服务实例当实现用，不 provide。
 *
 * 两个入口都导出同一份 syncBundledSkills()，谁先跑谁落盘（幂等）。
 *
 * @param {object} ctx cordis 上下文
 */
export function apply(ctx) {
  // 随包技能先落盘：补丁里 skill-filesystem 指向 dshHomePath('jianbao/skills')。
  // 写盘失败只记日志，不阻断插件其余能力。
  try {
    const synced = syncBundledSkills()
    ctx.logger?.info?.('jianbao: bundled skills %s (%d) at %s', synced.action, synced.copied, synced.dir)
  } catch (error) {
    ctx.logger?.warn?.('jianbao: skill sync failed: %s', error?.message || String(error))
  }

  const service = new JianbaoService(ctx)
  ctx.provide(SERVICE_KEY, service)

  // 提示段**按预设门控**。此前 text 是零参函数、无条件返回正文，于是
  // 「## 简报写作（DSH 简报工作台）」这一段出现在**每一个**预设的会话里
  // （实测 ptc 会话的系统提示词末尾就挂着它，而且那句「本会话里有一份简报工程」
  // 在工作区根本没有 .jianbao/ 时是个假前提）。
  // renderPrompt 会把空串段整段丢掉（dsh-system-prompt/lib/index.js:121 的 filter），
  // 所以非简报预设返回空串就等价于「这段不存在」。
  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        interpolate: false,
        text: (context) => (decideAgent(context?.agent).allowed ? guidance() : ''),
      }),
    'jianbao:prompt-section',
  )

  // 三只工具在这里**一起注册**（顶层，全局可见）。
  //
  // 为什么不放进预设：预设子行的模块名要靠 registry 自己的 baseUrl 解析
  // （cordis-plugin-loader/lib/index.js:214-227 —— 裸包名交给 Node 内部 ESM 加载器
  // 按 baseUrl 走，相对名按 new URL(name, baseUrl)）。
  // 而 registry 的 baseUrl 在桌面版指向 asar 内，实测那一片解析不到 @zws/*；
  // 指向 profile 时又解析不到 @deepseek-ai/*。两个平面都不可靠。
  //
  // 让 @zws 彻底不出现在预设的 config.plugins 里，就不存在这个问题：
  // 预设只剩官方包名，与本插件无关。
  //
  // 代价：三只工具在顶层注册，**对所有预设的会话可见**。原来那句「可接受」是错的：
  // 它们连同上面的提示段一起把「简报」塞进了每一个会话的工具面。
  // 现在工具面靠 activation 门控收窄（见 createToolRegistrar 的注释）：
  // 非简报预设的会话里，这三只工具根本不出现在模型能看到的 schema 里。
  createToolRegistrar(ctx)()
}

/**
 * 造一个「注册三只简报工具」的函数。
 *
 * 服务实例由调用方决定来源：
 *   · 顶层（applyServices）已经在 ctx 上 provide 过 `jianbao`，直接复用；
 *   · 预设内（tools.js）不 provide，本地 new 一个当实现 —— 避免
 *     「泄漏到根 realm → mountPreset 抛」与「isolate → 网关发现不了」的死结。
 *
 * **门控**：三只工具登记时都带 `when`（dsh-tools/lib/index.js:552 的
 * `registration.when(context)`）。它决定的是「这一步能不能**看到**这只工具」，
 * 而不只是「调了会不会报错」—— 返回 false 的工具不会被收进 toolSet
 * （同文件 :558），PTC 的 run_code SDK 声明里也就不会出现（dsh-tool-executor-ptc
 * 用 `tools.schemas(agent, toolSet)` 生成声明）。所以非简报预设的会话里，
 * 这三只工具的 schema 与提示词一起消失，而不是留着一只调不通的工具。
 *
 * @param {object} ctx cordis 上下文
 * @returns {() => void} 注册动作（幂等：重复调用会重复注册工具，只在 apply 里调一次）
 */
export function createToolRegistrar(ctx) {
  const provided = ctx.get(SERVICE_KEY)
  const service = provided !== undefined && provided !== null ? provided : new JianbaoService(ctx)

  /**
   * 三只工具共用的激活判据。
   *
   * 只在这个 agent 挂的就是简报预设时才准入。判据与提示段同一份（decideAgent），
   * 保证「提示词里有这段」与「工具面里有这三只」永远同进同出。
   *
   * @param {object} context {agent, signal, modelSelection, toolSet}
   * @returns {boolean}
   */
  // decideAgent 契约上永不抛错（解析链每一环失败都只降级，末环还兜了一层 try）。
  // 这条契约是硬要求：when 抛出去会变成 ToolActivationError、打断整步工具解析
  // （dsh-tools/lib/index.js:553-556），判据失败只该让工具「不出现」。
  // test/preset.test.mjs 用畸形上下文钉着这个契约，别在这里再抄一遍 try/catch。
  const activation = (context) => decideAgent(context?.agent).allowed

  return () => {
    ctx.tools.register(
      defineTool({
        name: 'jianbao_state',
        description: '读取当前工作区的简报工程状态：简报数据（brief.json）、基本信息表单、LaTeX 环境探测结果、已生成的产物清单，以及版式规范。改稿前先调用它。',
        parameters: {},
        output: STATE_OUTPUT,
        async execute(_args, exec) {
          const workspace = workspaceOfExec(ctx, exec)
          const sid = sessionIdFor(ctx, exec)
          const [brief, form, envReport, outputs] = await Promise.all([
            loadBrief(workspace, sid),
            loadForm(workspace, sid),
            service.env(sessionIdFor(ctx, exec), false),
            listOutputs(workspace, sid),
          ])
          return {
            workspace,
            hasBrief: brief !== null,
            brief: brief ?? {},
            form: form ?? {},
            env: { latex: envReport.latex, fonts: { complete: envReport.fonts.complete, roles: envReport.fonts.roles, fangzheng: envReport.fonts.fangzheng } },
            outputs,
            spec: SPEC,
          }
        },
        presentCall: () => ({ card: 'generic', title: '读取简报状态', kind: 'read' }),
      }),
      { when: activation },
    )

    ctx.tools.register(
      defineTool({
        name: 'jianbao_save',
        description: '把完整的简报数据写回 <workspace>/.jianbao/brief.json，并可立即编译出 PDF。blocks 是正文块数组（p 自然段 / h1 h2 h3 小标题 / image imagePair 插图）。改稿必须提交完整 blocks，不是增量。',
        parameters: {
          brief: { ...BRIEF_SCHEMA, required: true },
          compile: { type: 'boolean', description: '写完是否立即编译 PDF，默认 true' },
        },
        output: RENDER_OUTPUT,
        async execute(args, exec) {
          const workspace = workspaceOfExec(ctx, exec)
          const sid = sessionIdFor(ctx, exec)
          const draft = args.brief ?? {}
          const normalized = normalizeBlocks(draft.blocks)
          const type = BRIEF_TYPES[String(draft.briefType ?? 'activity')] ?? BRIEF_TYPES.activity
          const doc = {
            title: normalizeTitle(draft.title, type, draft.topic),
            // 报头首行是「2026年　第12期」，年份一律四位阿拉伯数字
            // （63/63 样本如此）。这里就规范掉，存进 brief.json 的也是干净值 ——
            // 否则模型把「二零二六年」写进来，渲染器虽然也会兜底，
            // 但工作台与 jianbao_state 读回来的仍是脏数据，反复误导下一轮。
            year: normalizeYear(draft.year),
            issue: String(draft.issue ?? '第XX期').trim(),
            author: String(draft.author ?? '').trim(),
            auditor: String(draft.auditor ?? '').trim(),
            phone: String(draft.phone ?? '').trim(),
            org: String(draft.org ?? '西藏大学理学院').trim(),
            cc: Array.isArray(draft.cc) && draft.cc.length > 0 ? draft.cc.map((s) => String(s)) : ['校领导、院领导', '党委（校长）办公室、党委宣传部'],
            withPageNumber: draft.withPageNumber !== false,
            briefType: type.id,
            topic: String(draft.topic ?? '').trim(),
            // 活动地点：reviewBrief 用它检查「第 1 段有没有把地点写进去」。
            activityPlace: String(draft.activityPlace ?? '').trim(),
            blocks: normalized.blocks,
            fonts: draft.fonts ?? {},
            fontDir: draft.fontDir,
          }
          await saveBrief(workspace, doc, sid)
          return renderAndCompile(ctx, workspace, doc, args.compile !== false, sid)
        },
        presentCall: (args) => ({ card: 'generic', title: '保存简报并编译', kind: 'other', rawInput: String(args?.brief?.title ?? '') }),
      }),
      { when: activation },
    )

    ctx.tools.register(
      defineTool({
        name: 'jianbao_render',
        description: '用工程里现有的 brief.json 重新生成 .tex 并编译 PDF，返回 PDF 路径、页数、字数与版式提醒。没有 LaTeX 环境时只写 .tex。',
        parameters: {},
        output: RENDER_OUTPUT,
        async execute(_args, exec) {
          const workspace = workspaceOfExec(ctx, exec)
          const sid = sessionIdFor(ctx, exec)
          const brief = await loadBrief(workspace, sid)
          if (brief === null) return { ok: false, pdf: '', tex: '', pages: 0, chars: 0, error: '工作区里还没有简报数据（.jianbao/brief.json）', logTail: '', warnings: [] }
          return renderAndCompile(ctx, workspace, brief, true, sid)
        },
        presentCall: () => ({ card: 'generic', title: '编译简报 PDF', kind: 'other' }),
      }),
      { when: activation },
    )
  }
}

/** 版式规范对外导出（浏览器半与文档引用同一份）。 */
export { SPEC as SPEC_TABLE }