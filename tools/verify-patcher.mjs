/**
 * 用 dsh-app-boot 自己的加载器验证补丁在真实 profile 里落成什么样。
 *
 * ## 为什么不能自己写 require 去验模块能否解析
 *
 * dsh-app-boot/lib/index.js:477-481 写明是**两锚点**解析：
 *   a bundle name resolves first from the dsh installation (the launcher's own
 *   package), then from the profile directory.
 *
 * 它靠 installRuntimeInterception（同文件 :1641）**劫持 Node 默认的 ESM 与
 * CommonJS 解析器**来实现。裸 createRequire 绕开那层劫持只看得到一个锚点，
 * 所以「这个包解析不到」用它验必然失真 —— 我踩过：拿裸 Node 得出
 * 「@deepseek-ai/* 在 profile 平面全解析不到」，回头一看全是假象。
 *
 * 这个工具只做它真能做的：真实 loadProfile 拿 patch 层，真实 composeEntries
 * 拿最终 entry 列表，断言两行的存在性、唯一性与契约字段。模块能否 import 由
 * DSH 启动时那套双锚点解析负责，测不了就不假装测。
 *
 * 用法：node tools/verify-patcher.mjs [profileName]
 * 退出码：0 正常 / 1 有问题
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const profileName = process.argv[2] ?? 'desktop'
const ROW_IDS = ['jianbao', 'preset-jianbao']

function findDshPackage() {
  // 从运行环境解析安装位置 —— 不写死任何用户目录（那既是泄漏点，也会让
  // 换一台机器就跑不起来）。APPDATA / LOCALAPPDATA 是 Windows 标准环境变量。
  const roaming = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const candidates = [
    join(roaming, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    join(local, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar', 'dsh', 'package.json'),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error('找不到 dsh 安装位置，请传 DSH_PKG 环境变量')
}

const dshPkg = process.env.DSH_PKG ?? findDshPackage()
const req = createRequire(dshPkg)
const boot = await import('file:///' + req.resolve('@deepseek-ai/dsh-app-boot').replace(/\\/g, '/'))
const installAnchor = req.resolve('@deepseek-ai/dsh/package.json')
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')

console.log('jianbao verify-patcher')
console.log('  dsh        : ' + dshPkg)
console.log('  profile    : ' + profileName)

const profile = boot.loadProfile('dsh', profileName, installAnchor, home)
console.log('  bundle 层数: ' + profile.layers.length)

const sources = new Map()
for (const layer of profile.layers) {
  for (const patch of layer.patches) {
    const rows = patch.insert ?? (patch.id ? [{ id: patch.id }] : [])
    for (const row of rows) {
      if (!row.id || !ROW_IDS.includes(row.id)) continue
      sources.set(row.id, [...(sources.get(row.id) ?? []), 'bundle:' + layer.packageName])
    }
  }
}
for (const patch of profile.patches ?? []) {
  const rows = patch.insert ?? (patch.id ? [{ id: patch.id }] : [])
  for (const row of rows) {
    if (!row.id || !ROW_IDS.includes(row.id)) continue
    sources.set(row.id, [...(sources.get(row.id) ?? []), 'profile'])
  }
}

let bad = 0
console.log('')
console.log('=== patch 行来源 ===')
for (const id of ROW_IDS) {
  const from = sources.get(id) ?? []
  const tag = from.length === 0 ? 'MISSING' : from.length === 1 ? 'OK' : 'DUPLICATE'
  if (tag !== 'OK') bad += 1
  console.log('  ' + id.padEnd(16) + tag + '  ' + (from.join(' + ') || '(无)'))
}

const all = [...profile.layers.flatMap((l) => l.patches), ...(profile.patches ?? [])]
const rows = boot.composeEntries(all)
const ids = rows.map((r) => r.id)
console.log('')
console.log('=== 最终 entry（共 ' + rows.length + '）===')
for (const id of ROW_IDS) {
  const n = ids.filter((x) => x === id).length
  const row = rows.find((r) => r.id === id)
  const tag = n === 1 ? 'OK' : n === 0 ? 'MISSING' : 'DUPLICATE x' + n
  if (n !== 1) bad += 1
  const extra = row === undefined ? '' : '  name=' + row.name
  console.log('  ' + id.padEnd(16) + tag + extra)
}

const pluginRow = rows.find((r) => r.id === 'jianbao')
if (pluginRow !== undefined) {
  const injectOk = Array.isArray(pluginRow.inject) && pluginRow.inject.includes('tools') && pluginRow.inject.includes('systemPrompt')
  // 顶层行**不该**再带 config.presetId：那个键没有任何代码读，是死配置，
  // 门控已改成按会话实际挂的预设判（lib/gate.js 的 decideAgent）。
  const noDeadConfig = pluginRow.config === undefined
  console.log('')
  console.log('=== 插件行契约 ===')
  console.log('  inject      : ' + (injectOk ? 'OK' : 'FAIL') + ' ' + JSON.stringify(pluginRow.inject))
  console.log('  无死配置    : ' + (noDeadConfig ? 'OK（门控按会话实际预设判）' : 'FAIL 仍有 config: ' + JSON.stringify(pluginRow.config)))
  if (!injectOk || !noDeadConfig) bad += 1
}

const presetRow = rows.find((r) => r.id === 'preset-jianbao')
if (presetRow !== undefined) {
  const plugins = presetRow.config?.plugins ?? []
  const zws = plugins.filter((r) => String(r.name).startsWith('@zws/'))
  console.log('')
  console.log('=== 预设声明 ===')
  console.log('  id      : ' + JSON.stringify(presetRow.config?.id))
  console.log('  name    : ' + JSON.stringify(presetRow.config?.name))
  console.log('  plugins : ' + plugins.length)
  console.log('  @zws 行 : ' + zws.length + (zws.length === 0 ? ' (OK)' : ' (FAIL)'))
  if (plugins.length === 0) bad += 1
}

console.log('')
if (bad === 0) {
  console.log('VERIFY PATCHER PASS')
  process.exit(0)
}
console.log('VERIFY PATCHER FAIL (' + bad + ' 项)')
process.exit(1)
