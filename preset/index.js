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
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  return readPresetDefinitionFromText(PRESET_ID, readPresetText(), paths.root, meta)
}

/**
 * 注册预设。
 * @param {object} ctx Cordis 插件上下文
 */
export function apply(ctx) {
  let releaseDeclared
  let closed = false

  // 随包技能启动即同步（写盘失败只记日志，不阻塞预设注册）。
  try {
    const synced = syncBundledSkills()
    ctx.logger?.info?.('jianbao-preset: bundled skills %s (%d changed) at %s', synced.action, synced.copied, synced.dir)
  } catch (error) {
    ctx.logger?.warn?.('jianbao-preset: skill sync failed: %s', error?.message || String(error))
  }

  const softRegistry = () => {
    try {
      if (ctx.agentPresets && typeof ctx.agentPresets.register === 'function') return ctx.agentPresets
    } catch {
      /* 没有 inject 时点属性会抛 */
    }
    try {
      const reg = ctx.get('agentPresets')
      if (reg && typeof reg.register === 'function') return reg
    } catch {
      /* 服务缺席 */
    }
    return null
  }

  const undeclare = async () => {
    const dispose = releaseDeclared
    releaseDeclared = undefined
    if (!dispose) return
    try {
      await dispose()
    } catch {
      /* 卸载期报错只记日志 */
    }
  }

  const registerOnce = (registry) => {
    let definition
    try {
      definition = buildDefinition()
    } catch (error) {
      ctx.logger?.warn?.('jianbao-preset: read preset failed: %s', error?.message || String(error))
      return
    }
    Promise.resolve()
      .then(async () => {
        await undeclare()
        releaseDeclared = await registry.register(definition)
        // 不能调 registry.list()：它内部会 await owner.loader.await()，
        // 而本插件正在该 Loader 的激活过程中 —— 会自锁。
        ctx.logger?.info?.('jianbao-preset: declared for mode dropdown: %s', definition.name || PRESET_ID)
      })
      .catch((error) => {
        ctx.logger?.warn?.('jianbao-preset: register failed: %s', error?.message || String(error))
      })
  }

  ctx.effect(() => {
    let tries = 0
    const tick = () => {
      if (closed) return true
      tries += 1
      const registry = softRegistry()
      if (!registry) return false
      registerOnce(registry)
      return true
    }
    let timer
    let stop
    if (!tick()) {
      timer = setInterval(() => {
        if (tick()) {
          clearInterval(timer)
          timer = undefined
          if (stop) clearTimeout(stop)
        }
      }, 400)
      if (typeof timer.unref === 'function') timer.unref()
      stop = setTimeout(() => {
        if (timer) {
          clearInterval(timer)
          timer = undefined
          ctx.logger?.warn?.('jianbao-preset: agentPresets never appeared (%d tries)', tries)
        }
      }, 45000)
      try {
        stop.unref?.()
      } catch {
        /* ignore */
      }
    }
    return () => {
      closed = true
      if (timer) clearInterval(timer)
      if (stop) clearTimeout(stop)
      void undeclare()
    }
  }, 'dsh-jianbao-preset: declare agent preset')

  ctx.logger?.info?.('jianbao-preset: ready (home=%s)', dshHome())
}

export default { name, inject, apply }
