/**
 * 简报工作台 —— 宿主半
 *
 * 这里只做三件事：
 *   1. 一个 Remote 服务 `tuiwen`：工作台（浏览器半）读状态、存表单、收图片、编译 PDF；
 *   2. 三个模型工具：tuiwen_state / tuiwen_save / tuiwen_render，让模型真的能写稿并出 PDF；
 *   3. 一段系统提示词：把「版式规范 + 写作纪律」常驻会话（逆向自参考实现的提示词与实测规则）。
 *
 * 版式数据在 brief.js，LaTeX 生成在 render-tex.js，环境探测在 env.js，编译在 compile.js ——
 * 本文件只做编排，不重复实现任何规则。
 *
 * 为什么图片走 base64 而不是 HTTP 上传路由：
 *   DSH 的精确 Fetch 路由默认拒绝非 owner Peer（需要每条路由自带 access rule），
 *   简报插图通常 < 3MB，走 Remote 的 JSON 参数最简单、也最少依赖宿主内部契约。
 *
 * @module @zws/dsh-tuiwen
 */

import { isAbsolute, resolve, sep } from 'node:path'
import { defineTool } from './tool.js'
import { readFile, writeFile } from 'node:fs/promises'

import { BRIEF_TYPES, HEADING_STYLES, LAYOUT, countBodyChars, normalizeBlocks, normalizeTitle } from './brief.js'
import { renderTex } from './render-tex.js'
import { detectEnvironment } from './env.js'
import { compileTex } from './compile.js'
import {
  assetDir,
  importImage,
  listOutputs,
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
export const name = '@zws/dsh-tuiwen'

/** 宿主依赖：工具注册表与系统提示词。sessions 走 ctx.get 惰性读，不强依赖。 */
export const inject = ['tools', 'systemPrompt']

/** typert 协议里读 Remote 标记的稳定属性名（跨安装副本共享同一字符串）。 */
const REMOTE_METHODS = '@deepseek-ai/dsh-typert-protocol/remote-methods'
/** Cordis 服务键，同时也是 Remote 命名空间名（浏览器侧是 remote.tuiwen）。 */
const SERVICE_KEY = 'tuiwen'
/** 系统提示词段落身份与位置（任务背景段，排在工具说明之前）。 */
const SECTION_NAME = 'tuiwen:spec'
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
    src: { type: 'string', description: 'image：相对 .tuiwen/out/ 的路径，如 assets/fig.png' },
    srcs: { type: 'array', items: { type: 'string' }, description: 'imagePair：两张图路径' },
    caption: { type: 'string', description: 'image 的图注（可空）' },
    captions: { type: 'array', items: { type: 'string' }, description: 'imagePair 的图注' },
    widthCm: { type: 'number', description: '覆盖默认宽度（cm）' },
  },
}

/** 简报数据的参数 schema（tuiwen_save 的 brief 形参）。 */
const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    title: { type: 'string', description: '主副题式大标题；留空按「西藏大学理学院+动词+主题名」自动生成' },
    issue: { type: 'string', description: '期号，如「第12期」' },
    author: { type: 'string', description: '撰稿人' },
    auditor: { type: 'string', description: '审签人（可空）' },
    phone: { type: 'string', description: '联系方式' },
    org: { type: 'string', description: '报头单位名，默认「西藏大学理学院」' },
    briefType: { type: 'string', description: '简报类型：meeting / activity / contest / lecture' },
    topic: { type: 'string', description: '主题名称，用于自动补标题' },
    cc: { type: 'array', items: { type: 'string' }, description: '抄送单位，通常两项' },
    withPageNumber: { type: 'boolean', description: '是否显示页脚「— N —」页码，默认 true' },
    blocks: { type: 'array', required: true, items: BLOCK_PARAM, description: '正文块数组（完整提交，不是增量）' },
  },
}

/** 版式规范（工作台右侧说明与工具输出共用一份）。 */
export const SPEC = {
  paper: 'A4（210mm × 297mm）',
  margin: '上 3.7cm　下 3.5cm　左 2.8cm　右 2.6cm',
  linePt: LAYOUT.linePt,
  title: '正文标题：2 号（22pt）方正小标宋',
  body: '正文：3 号（16pt）方正仿宋_GBK，首行缩进 2 字符',
  headings: HEADING_STYLES,
  cc: '抄送区：仿宋 15pt，两条通栏横线，压在最后一页底部',
  pageNumber: '页脚「— N —」，14pt，右对齐',
  types: Object.values(BRIEF_TYPES),
}


/** 情绪化的字数与结构校验：只报问题，不改内容（改稿是模型/作者的活）。 */
function reviewBrief(doc) {
  const warnings = []
  const normalized = normalizeBlocks(doc?.blocks)
  const paragraphs = normalized.blocks.filter((b) => b.type === 'p')
  const chars = countBodyChars(normalized.blocks)
  if (paragraphs.length === 0) warnings.push('正文还没有任何自然段')
  else if (paragraphs.length !== 4) warnings.push('自然段应为 4 段，现在是 ' + paragraphs.length + ' 段')
  if (chars > 0 && chars < 400) warnings.push('正文 ' + chars + ' 字，偏少（参考区间 400–600 字）')
  if (chars > 600) warnings.push('正文 ' + chars + ' 字，超过 600 字上限')
  const title = String(doc?.title ?? '').trim()
  if (title === '') warnings.push('还没有标题')
  else if (title.length > 60) warnings.push('标题 ' + title.length + ' 字，偏长（建议 ≤ 60 字）')
  for (const block of normalized.blocks) {
    if (block.type === 'image' || block.type === 'imagePair') continue
    if (block.text.includes('——') && block.type === 'p') warnings.push('正文段里出现破折号（参考规范只允许在标题/引出处使用）')
    for (const bad of ['与此同时', '值得注意的是', '毋庸置疑', '显而易见', '总而言之', '综上所述']) {
      if (block.text.includes(bad)) warnings.push('出现 AI 高频词「' + bad + '」')
    }
  }
  return { warnings: [...new Set(warnings)], chars, paragraphs: paragraphs.length }
}

/**
 * 编译一次：写 .tex → xelatex → 返回结果。工作台与工具共用。
 * @param {object} ctx cordis 上下文
 * @param {string} workspace 工作区根
 * @param {object} doc 简报数据
 * @param {boolean} withPdf 无 LaTeX 时只写 .tex
 */
async function renderAndCompile(ctx, workspace, doc, withPdf) {
  const revision = Number.isFinite(doc?.revision) ? doc.revision : Date.now()
  const jobName = 'brief'
  const target = outDir(workspace)
  const fonts = doc?.fonts ?? {}
  const tex = renderTex(
    {
      ...doc,
      dateText: String(doc?.dateText ?? '').trim(),
    },
    {
      fontDir: doc?.fontDir ?? 'C:/Windows/Fonts',
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


/** tuiwen Remote 服务：工作台唯一的宿主侧入口。 */
class TuiwenService {
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
   * 环境检测（带缓存）。第二个参数 force=true 强制重探。
   * @param {string} sessionId 会话 id
   * @param {boolean} force 是否强制重探
   */
  async env(sessionId, force) {
    const workspace = this.workspace(sessionId)
    const cached = this.envCache.get(workspace)
    if (force !== true && cached !== undefined && Date.now() - cached.at < ENV_TTL) return cached.report
    const report = await detectEnvironment()
    this.envCache.set(workspace, { at: Date.now(), report })
    await writeAtomic(resolve(stateRoot(workspace), 'env.json'), JSON.stringify(report, null, 2) + '\n').catch(() => {})
    return report
  }

  /**
   * 工作台首屏：环境 + 表单 + 简报 + 产物清单，一次取全。
   * @param {string} sessionId 会话 id
   */
  async snapshot(sessionId) {
    const workspace = this.workspace(sessionId)
    const [envReport, form, brief, outputs] = await Promise.all([
      this.env(sessionId, false),
      loadForm(workspace),
      loadBrief(workspace),
      listOutputs(workspace),
    ])
    const meta = await readJson(resolve(outDir(workspace), 'brief.meta.json'), null)
    return {
      workspace,
      env: envReport,
      form,
      brief,
      outputs,
      meta,
      spec: SPEC,
      assetDir: assetDir(workspace),
    }
  }

  /**
   * 保存表单（工作台每改一个字段就落一次盘，刷新不丢）。
   * @param {string} sessionId 会话 id
   * @param {object} form 表单对象
   */
  async saveForm(sessionId, form) {
    const workspace = this.workspace(sessionId)
    await saveForm(workspace, form ?? {})
    return { ok: true, form }
  }

  /**
   * 收一张图片（base64），落进 .tuiwen/out/assets/，返回相对路径。
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
    const dir = assetDir(workspace)
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
    await saveBrief(workspace, brief ?? {})
    const result = await renderAndCompile(this.ctx, workspace, brief, compile !== false)
    return { ...result, workspace }
  }

  /**
   * 只编译（不重新存）：用户改了字体设置、或第一次进来点了「开始工作」。
   * @param {string} sessionId 会话 id
   */
  async compile(sessionId) {
    const workspace = this.workspace(sessionId)
    const brief = await loadBrief(workspace)
    if (brief === null) return { ok: false, tex: '', chars: 0, warnings: ['还没有简报数据，请先在工作台填写信息并开始工作'], pdf: '', pages: 0, error: '没有简报数据', logTail: '' }
    return renderAndCompile(this.ctx, workspace, brief, true)
  }

  /**
   * 读编译日志尾部（编译失败时给用户看真正原因）。
   * @param {string} sessionId 会话 id
   */
  async log(sessionId) {
    const workspace = this.workspace(sessionId)
    return { log: await readLogTail(workspace, 'brief.log', 8000) }
  }

  /**
   * 读产物（PDF 的 base64，供工作台内嵌预览）。
   * @param {string} sessionId 会话 id
   */
  async pdf(sessionId) {
    const workspace = this.workspace(sessionId)
    const file = resolve(outDir(workspace), 'brief.pdf')
    const { existsSync } = await import('node:fs')
    if (!existsSync(file)) return { ok: false, data: '', bytes: 0 }
    const bytes = await readFile(file)
    return { ok: true, data: bytes.toString('base64'), bytes: bytes.byteLength }
  }

  /**
   * 把一张已存在的本地图片拷进资产目录（工作台/工具都可用）。
   * @param {string} sessionId 会话 id
   * @param {string} path 本地路径（工作区内）
   */
  async importImage(sessionId, path) {
    const workspace = this.workspace(sessionId)
    const source = insideWorkspace(workspace, path)
    const src = await importImage(workspace, source)
    return { ok: true, src }
  }
}


/**
 * Gateway 在找不到生成式严格定义时会读这个原型标记（dsh-api-gateway/lib/index.js:1241
 * `remoteMethods(original).find(...)`），参数名从函数源码里解析（同文件 :1715 srcDescriptor）。
 * 所以下面这些方法**不能**用默认值/解构/剩余参数 —— 参数名就是线上字段名。
 */
Object.defineProperty(TuiwenService.prototype, REMOTE_METHODS, {
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
    '本会话里有一份简报工程：`<workspace>/.tuiwen/`（brief.json 是简报数据，form.json 是基本信息，out/ 是 LaTeX 源与 PDF）。',
    '工作台入口在界面里的「简报」标签页；用户在那边填写基本信息后点「开始工作」，你在对话里负责写稿、改稿、编译。',
    '',
    '### 版式（已固化在渲染器里，不要手改）',
    '- 纸张 A4；页边距 上3.7cm 下3.5cm 左2.8cm 右2.6cm；行距固定 28.8 磅（标题与全文一致）。',
    '- 正文标题 2 号（22pt）方正小标宋；正文 3 号（16pt）方正仿宋_GBK，首行缩进 2 字符。',
    '- 一级标题 方正黑体简体 20pt；二级标题 方正楷体_GBK 三号加粗；三级标题 方正仿宋_GBK 三号加粗。',
    '- 抄送区仿宋 15pt + 两条通栏横线，压在最后一页底部；页脚「— N —」14pt 右对齐。',
    '',
    '### 正文结构（固定 4 个自然段，400–600 字，不含标点）',
    '- 第 1 段：目的句（「为了……」或「在……之际，」）+「，X月X日，」插入语（完整放在本段，不拆行）+ 主句（西藏大学理学院召开/开展/举办/举行 + 主题名）+ 出席领导 + 参加人群。',
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
    '- `tuiwen_state`：读当前简报、表单、环境与产物清单。改稿前先读。',
    '- `tuiwen_save`：把完整简报写回工程（blocks 支持 p/h1/h2/h3/image/imagePair），可选同时编译。',
    '- `tuiwen_render`：重新编译现有工程出 PDF，返回路径与编译警告。',
    '- 没有 LaTeX 环境时，工具会明确告诉你「只能出 .tex，出不了 PDF」，如实转告用户，不要假装编译成功。',
  ].join('\n')
}

/**
 * 注册工具与服务。
 * @param {object} ctx cordis 上下文
 */
export function apply(ctx) {
  const service = new TuiwenService(ctx)
  ctx.provide(SERVICE_KEY, service)

  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        interpolate: false,
        text: () => guidance(),
      }),
    'tuiwen:prompt-section',
  )

  ctx.tools.register(
    defineTool({
      name: 'tuiwen_state',
      description: '读取当前工作区的简报工程状态：简报数据（brief.json）、基本信息表单、LaTeX 环境探测结果、已生成的产物清单，以及版式规范。改稿前先调用它。',
      parameters: {},
      output: STATE_OUTPUT,
      async execute(_args, exec) {
        const workspace = service.workspace(exec?.agent?.session?.header?.id)
        const [brief, form, envReport, outputs] = await Promise.all([
          loadBrief(workspace),
          loadForm(workspace),
          service.env(exec?.agent?.session?.header?.id, false),
          listOutputs(workspace),
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
  )

  ctx.tools.register(
    defineTool({
      name: 'tuiwen_save',
      description: '把完整的简报数据写回 <workspace>/.tuiwen/brief.json，并可立即编译出 PDF。blocks 是正文块数组（p 自然段 / h1 h2 h3 小标题 / image imagePair 插图）。改稿必须提交完整 blocks，不是增量。',
      parameters: {
        brief: { ...BRIEF_SCHEMA, required: true },
        compile: { type: 'boolean', description: '写完是否立即编译 PDF，默认 true' },
      },
      output: RENDER_OUTPUT,
      async execute(args, exec) {
        const sessionId = exec?.agent?.session?.header?.id
        const workspace = service.workspace(sessionId)
        const draft = args.brief ?? {}
        const normalized = normalizeBlocks(draft.blocks)
        const type = BRIEF_TYPES[String(draft.briefType ?? 'activity')] ?? BRIEF_TYPES.activity
        const doc = {
          title: normalizeTitle(draft.title, type, draft.topic),
          issue: String(draft.issue ?? '第XX期').trim(),
          author: String(draft.author ?? '').trim(),
          auditor: String(draft.auditor ?? '').trim(),
          phone: String(draft.phone ?? '').trim(),
          org: String(draft.org ?? '西藏大学理学院').trim(),
          cc: Array.isArray(draft.cc) && draft.cc.length > 0 ? draft.cc.map((s) => String(s)) : ['校领导、院领导', '党委（校长）办公室、党委宣传部'],
          withPageNumber: draft.withPageNumber !== false,
          briefType: type.id,
          topic: String(draft.topic ?? '').trim(),
          blocks: normalized.blocks,
          fonts: draft.fonts ?? {},
          fontDir: draft.fontDir,
        }
        await saveBrief(workspace, doc)
        return renderAndCompile(ctx, workspace, doc, args.compile !== false)
      },
      presentCall: (args) => ({ card: 'generic', title: '保存简报并编译', kind: 'other', rawInput: String(args?.brief?.title ?? '') }),
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'tuiwen_render',
      description: '用工程里现有的 brief.json 重新生成 .tex 并编译 PDF，返回 PDF 路径、页数、字数与版式提醒。没有 LaTeX 环境时只写 .tex。',
      parameters: {},
      output: RENDER_OUTPUT,
      async execute(_args, exec) {
        const sessionId = exec?.agent?.session?.header?.id
        const workspace = service.workspace(sessionId)
        const brief = await loadBrief(workspace)
        if (brief === null) return { ok: false, pdf: '', tex: '', pages: 0, chars: 0, error: '工作区里还没有简报数据（.tuiwen/brief.json）', logTail: '', warnings: [] }
        return renderAndCompile(ctx, workspace, brief, true)
      },
      presentCall: () => ({ card: 'generic', title: '编译简报 PDF', kind: 'other' }),
    }),
  )
}

/** 版式规范对外导出（浏览器半与文档引用同一份）。 */
export { SPEC as SPEC_TABLE }
