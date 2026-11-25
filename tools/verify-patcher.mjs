/**
 * 用 dsh-app-boot 自己的加载器验证补丁在真实 profile 里落成什么样。
 *
 * 为什么需要它：`- insert:` vs 裸 `- id:`、bundle 层 vs profile 层，
 * 这两组语义只有真实加载器说了算。自己复述规则不算验证。
 *
 * 用法：node tools/verify-patcher.mjs [profileName]
 * 退出码：0 正常 / 1 有问题
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

const profileName = process.argv[2] ?? 'desktop'
const ROW_IDS = ['jianbao', 'jianbao-preset']

function findDshPackage() {
  const candidates = [
    'C:/Users/USER/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/package.json',
    'C:/Users/USER/AppData/Local/Programs/DeepSeek Harness/resources/app.asar/dsh/package.json',
  ]
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error('找不到 dsh 安装位置，请传 DSH_PKG 环境变量')
}

const dshPkg = process.env.DSH_PKG ?? findDshPackage()
const req = createRequire(dshPkg)
const boot = await import('file:///' + req.resolve('@deepseek-ai/dsh-app-boot').replace(/\\/g, '/'))
const installAnchor = req.resolve('@deepseek-ai/dsh/package.json')
const home = process.env.DSH_HOME ?? 'C:/Users/USER/.dsh'

console.log('jianbao verify-patcher')
console.log('  dsh        : ' + dshPkg)
console.log('  profile    : ' + profileName)

const profile = boot.loadProfile('dsh', profileName, installAnchor, home)
console.log('  bundle 层数: ' + profile.layers.length)

// 1) patch 行来源
const sources = new Map()
for (const layer of profile.layers) {
  for (const patch of layer.patches) {
    const rows = patch.insert ?? (patch.id ? [{ id: patch.id }] : [])
    for (const row of rows) {
      if (!row.id || !ROW_IDS.includes(row.id)) continue
      const key = row.id
      sources.set(key, [...(sources.get(key) ?? []), 'bundle:' + layer.packageName])
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

// 2) 最终 entry 列表
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

// 3) 插件行必须带 inject 与 presetId
const pluginRow = rows.find((r) => r.id === 'jianbao')
if (pluginRow !== undefined) {
  const injectOk = Array.isArray(pluginRow.inject) && pluginRow.inject.includes('tools') && pluginRow.inject.includes('systemPrompt')
  const presetOk = pluginRow.config?.presetId === 'jianbao'
  console.log('')
  console.log('=== 插件行契约 ===')
  console.log('  inject  : ' + (injectOk ? 'OK' : 'FAIL') + ' ' + JSON.stringify(pluginRow.inject))
  console.log('  presetId: ' + (presetOk ? 'OK' : 'FAIL') + ' ' + JSON.stringify(pluginRow.config?.presetId))
  if (!injectOk || !presetOk) bad += 1
}

console.log('')
if (bad === 0) {
  console.log('VERIFY PATCHER PASS')
  process.exit(0)
}
console.log('VERIFY PATCHER FAIL (' + bad + ' 项)')
process.exit(1)
