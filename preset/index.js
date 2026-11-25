/**
 * 简报预设（jianbao）—— 宿主侧。
 *
 * 这个包只做一件事：把「简报模式」注册进 agent-presets 注册表。
 * 组合声明写在本包的 preset/agent.cordis.yml，提示词写 preset/prompt.md，
 * 注册前把 {{PROMPT}} 占位符换成正文 —— 正文改动不用改 YAML，也不会因为
 * 正文里的缩进/冒号把 YAML 撑坏。
 *
 * 不注册全局 prompt section、不挂 agent-loop 钩子、不改任何宿主文件：
 * 所以它对其它预设零影响，AGENTS.md 基线也不会被抢。
 *
 * @module @zws/dsh-jianbao-preset
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readPresetDefinitionFromText } from './preset-composition.js'

/** Cordis 插件名。 */
export const name = '@zws/dsh-jianbao-preset'

/** 注册表就绪与否软取，避免激活次序造成整份失败。 */
export const inject = []

/** 预设 id（目录名 / registry id）。 */
export const PRESET_ID = 'jianbao'

/** 本包内预设资源路径。 */
export function packagePaths() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  return {
    root,
    presetDir: join(root, 'preset'),
    prompt: join(root, 'preset', 'prompt.md'),
    skills: join(root, 'preset', 'skills'),
  }
}

/**
 * 把随包技能同步到 $DSH_HOME/jianbao/skills。
 *
 * 为什么不是直接指向包内目录：预设 YAML 里的 skill 根必须用一个**能求值的表达式**
 * 给出，而 cordis 的求值器用 new Function 构造，那里没有 import.meta，也拿不到本包路径。
 * 所以先把文件落到一个固定路径，YAML 用 dshHomePath 指过去
 * （与逆向预设 dshHomePath('redteam/skills') 同一套做法）。
 *
 * 幂等：内容没变就不重写（避免每次启动都碰 mtime 触发技能目录重扫）。
 *
 * @returns {{dir:string, copied:number, action:'synced'|'up-to-date'|'missing'}}
 */
export function syncBundledSkills() {
  const source = packagePaths().skills
  const target = join(dshHome(), 'jianbao', 'skills')
  if (!existsSync(source)) return { dir: target, copied: 0, action: 'missing' }
  let names = []
  try {
    names = readdirSync(source).filter((n) => n.endsWith('.md'))
  } catch {
    return { dir: target, copied: 0, action: 'missing' }
  }
  let copied = 0
  mkdirSync(target, { recursive: true })
  for (const name of names) {
    const from = join(source, name)
    const to = join(target, name)
    let same = false
    try {
      same = readFileSync(from, 'utf8') === readFileSync(to, 'utf8')
    } catch {
      same = false
    }
    if (same) continue
    cpSync(from, to)
    copied += 1
  }
  return { dir: target, copied, action: copied === 0 ? 'up-to-date' : 'synced' }
}

/** $DSH_HOME。 */
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * 把提示词正文拼进预设的 persona.prefix。
 *
 * 预设 YAML 里只留占位符 {{PROMPT}}，落地时替换成真实正文：
 *   · 正文改动不用改 YAML；
 *   · 正文缺失时替换成空串，预设仍能挂载（不因缺资产整份 broken）。
 *
 * @param {string} ymlText 预设模板正文
 * @param {string} promptText 提示词正文
 * @returns {string} 替换后的正文
 */
export function renderPrompt(ymlText, promptText) {
  const key = '{{PROMPT}}'
  const text = String(ymlText || '')
  const at = text.indexOf(key)
  if (at < 0) return ymlText

  // 占位符所在行的缩进 = 块标量正文的缩进层级（模板里是 6 个空格）。
  const lineStart = text.lastIndexOf('\n', at) + 1
  const indent = text.slice(lineStart, at)
  const blockIndent = /^ *$/.test(indent) ? indent : '      '

  const body = String(promptText || '').replace(/\r\n/g, '\n').replace(/\s+$/, '')
  const indented = body
    .split('\n')
    .map((line) => (line === '' ? '' : blockIndent + line))
    .join('\n')

  return text.slice(0, lineStart) + indented + text.slice(at + key.length)
}

/** 读包内预设模板 + 提示词，返回替换后的 YAML 正文。 */
function readPresetText() {
  const paths = packagePaths()
  const file = join(paths.presetDir, 'agent.cordis.yml')
  if (!existsSync(file)) throw new Error('jianbao preset template missing: ' + file)
  const text = readFileSync(file, 'utf8')
  let prompt = ''
  try {
    prompt = readFileSync(paths.prompt, 'utf8')
  } catch {
    prompt = ''
  }
  return renderPrompt(text, prompt)
}

/**
 * 尽量把一行的 name 改写成绝对 file:// URL；**解析不到就原样交还**。
 *
 * 为什么需要这一步：registry 挂载预设时，裸包名由它自己所在 Loader 的 base 解析，
 * 而不是本包的 base。官方 dsh-web-app 的 presets/*.patch.yml 里那些行用的都是
 * '@deepseek-ai/dsh-*'，在它的平面里全都存在，所以从来不用处理这件事。
 * 我们的预设是 JS 注册的，base 与声明平面不一致，于是：
 *   · '@zws/dsh-jianbao' 只在 profile 平面 —— 运行时 base 解析不到，**必然 broken**；
 *   · 相对名 './xxx' 相对谁更是说不清。
 *
 * 这两类先解析成绝对 URL 就稳了。其余裸包名交给运行时：
 * 桌面版 DSH 本身是 Electron，它的 base 在 app.asar 内，**asar 里的模块
 * 用普通 Node 的 createRequire 是解析不到的**（实测），
 * 所以这里判失败不代表运行时失败 —— 绝不能因为探不到就把行丢掉。
 *
 * @param {string} spec 行 name 原值
 * @param {string} fromDir 解析基准目录（本包根）
 * @returns {string} file:// URL，或原值
 */
function resolveRowName(spec, fromDir) {
  if (typeof spec !== 'string' || spec.length === 0) return spec
  // 内建伪插件（cordis:group / cordis:include）不是模块，原样交给 Loader。
  if (spec.startsWith('cordis:') || spec.startsWith('file://')) return spec
  // 相对名：按本包根解析（模板里写 ./xxx 就是相对包根）。
  if (spec.startsWith('./') || spec.startsWith('../')) {
    const abs = resolve(fromDir, spec)
    if (existsSync(abs)) return pathToFileURL(abs).href
    if (existsSync(join(abs, 'package.json'))) return pathToFileURL(abs).href
    return spec
  }
  // 裸包名：能在本平面解析就写死成绝对 URL（绕开运行时的 base 差异）。
  const anchors = [fromDir, join(fromDir, 'node_modules'), dshHome(), join(dshHome(), 'profiles', 'desktop')]
  for (const anchor of anchors) {
    try {
      const req = createRequire(join(anchor, 'package.json'))
      return pathToFileURL(req.resolve(spec)).href
    } catch {
      /* 换下一个锚点 */
    }
  }
  // 解析不到：交给运行时（asar 平面），不丢行。
  return spec
}

/**
 * 逐行改写 name；递归处理 group 的内层。
 *
 * 注意**不丢弃任何行**：早期版本把解析不到的行剔掉，结果 time-context/tool-fs/
 * tool-pwsh/compaction 这些全被当成"解析失败"删了 —— 预设直接变成空壳。
 * 解析不到只代表「我这个 Node 进程看不到 asar」，不代表运行时看不到。
 *
 * @param {Array<object>} rows 插件行
 * @param {string} fromDir 解析基准
 * @param {string[]} rewritten 收集改写成绝对 URL 的行（便于日志）
 * @returns {Array<object>}
 */
function resolveRowNames(rows, fromDir, rewritten) {
  const out = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const original = row.name
    const name = resolveRowName(original, fromDir)
    if (name !== original) rewritten.push(String(row.id ?? '?') + ': ' + String(original) + ' -> file://')
    const next = { ...row, name }
    if (row.group === true && Array.isArray(row.config)) {
      next.config = resolveRowNames(row.config, fromDir, rewritten)
    }
    out.push(next)
  }
  return out
}

/** 最近一次 buildDefinition 改写了哪些行（测试与日志用）。 */
let lastRewritten = []

/** 读回上一次构建被改写成绝对 URL 的行。 */
export function rewrittenRows() {
  return [...lastRewritten]
}

/** 从磁盘模板读 declaration。 */
export function buildDefinition() {
  const paths = packagePaths()
  let meta = ''
  try {
    meta = readFileSync(join(paths.presetDir, 'preset.yml'), 'utf8')
  } catch {
    meta = ''
  }
  // baseDir 用**包根**：模板里若有 ./ 相对名（如 ./gate.js），那是相对包根。
  const def = readPresetDefinitionFromText(PRESET_ID, readPresetText(), paths.root, meta)
  const rewritten = []
  const plugins = resolveRowNames(def.plugins, paths.root, rewritten)
  lastRewritten = rewritten
  return { ...def, plugins }
}

/**
 * 注册预设。
 * @param {object} ctx Cordis 插件上下文
 */
export function apply(ctx) {

  // 随包技能启动即同步（写盘失败只记日志，不阻塞预设注册）。
  try {
    const synced = syncBundledSkills()
    ctx.logger?.info?.('jianbao-preset: bundled skills %s (%d changed) at %s', synced.action, synced.copied, synced.dir)
  } catch (error) {
    ctx.logger?.warn?.('jianbao-preset: skill sync failed: %s', error?.message || String(error))
  }

  // 预设本体**不在这里注册**。
  //
  // 「加载失败」的根因就是这一条曾经存在：在代码里调 ctx.agentPresets.register()，
  // registry 会用**它自己**所在 Loader 的 baseUrl 解析子行的裸包名
  // （dsh-agent-preset-registry/lib/index.js:534），桌面版那个 base 在 app.asar 内，
  // 而 @zws/dsh-jianbao 只存在于 profile 平面 —— 解析不到，行 never started，
  // mountPreset 抛错，record.broken 被填上，UI 只显示四个字。
  //
  // 正确做法（官方 ptc/standard/minimal 全都这样）：
  // 在 bundle patch 里写一条 name 为 @deepseek-ai/dsh-agent-preset 的 Loader 行，
  // 插件行放进它的 config.plugins。AgentPreset 声明了 static [EntryGroup.key] = true，
  // Loader 会把 plugins 挂成**真正的子行**，与声明行同平面解析，本包可见。
  //
  // 这个模块现在就只负责一件启动期的事：把随包技能落到 $DSH_HOME/jianbao/skills
  // （补丁里的 customSkillDirs 用 dshHomePath 指那个路径）。
  ctx.logger?.info?.('jianbao-preset: ready (home=%s, preset declared in bundle patch)', dshHome())
}

export default { name, inject, apply }
