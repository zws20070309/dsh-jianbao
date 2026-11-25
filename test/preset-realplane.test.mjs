/**
 * 真机平面挂载验证 —— 只有这一条能证明预设真的能被 DSH 挂上。
 *
 * ## 为什么要用 Electron 跑
 * 桌面版 DSH 是 Electron 应用，全部模块打包在
 *   resources/app.asar/dsh/node_modules/
 * 里。普通 Node 进程 createRequire 读不到 asar 内的包（实测过，全部 MODULE_NOT_FOUND），
 * 所以拿 Node 跑的「解析失败」是假象，拿 Node 跑的「挂载成功」也是假绿。
 *
 * 用 ELECTRON_RUN_AS_NODE=1 让 Electron 以 Node 方式运行，它自带 asar 支持，
 * 这才是真机的模块平面。
 *
 * ## 这个测试验什么
 * 1. 补丁在真机平面里合成出的最终 entry 列表，两行各 1 份（不多不少）；
 * 2. 预设行的 config.plugins 有 15 行，id 正确；
 * 3. 真 registry.register() 之后 broken === null —— 即 UI 不会显示「加载失败」。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ELECTRON = 'C:/Users/USER/AppData/Local/Programs/DeepSeek Harness/DeepSeek Harness.exe'
const ASAR_NM = 'C:/Users/USER/AppData/Local/Programs/DeepSeek Harness/resources/app.asar/dsh/node_modules'
// 注意：不能用 existsSync(ASAR_NM) 判可用性 —— 普通 Node 看不见 asar 内部路径
// （这正是必须借 Electron 跑探针的原因）。只看 exe 在不在。
const hasElectron = existsSync(ELECTRON)

const PROBE = `
const nm = '${ASAR_NM}'
const boot = require(nm + '/@deepseek-ai/dsh-app-boot/lib/index.js')
const { Context } = require(nm + '/@deepseek-ai/cordis/lib/index.js')
const regMod = require(nm + '/@deepseek-ai/dsh-agent-preset-registry/lib/index.js')

const installAnchor = nm + '/@deepseek-ai/dsh/package.json'
const profile = boot.loadProfile('dsh', 'desktop', installAnchor, 'C:/Users/USER/.dsh')
const all = [...profile.layers.flatMap((l) => l.patches), ...(profile.patches ?? [])]
const rows = boot.composeEntries(all)
const out = { layers: profile.layers.length, entries: rows.length, rows: {} }
for (const id of ['jianbao', 'preset-jianbao']) {
  const hits = rows.filter((r) => r.id === id)
  out.rows[id] = {
    count: hits.length,
    name: hits[0]?.name ?? null,
    pluginCount: hits[0]?.config?.plugins?.length ?? null,
    presetId: hits[0]?.config?.id ?? null,
  }
}

const presetRow = rows.find((r) => r.id === 'preset-jianbao')
const baseUrl = 'file:///C:/Users/USER/.dsh/profiles/desktop/'
const root = new Context()
root.provide('loader', { await: async () => {}, baseUrl })
root.provide('sessionProjections', { register: () => () => {}, stateOf: () => undefined, onChanged: () => () => {} })
const registry = new regMod.AgentPresetRegistry(root, { default: 'ptc' })
registry
  .register(presetRow.config)
  .then(async () => {
    const list = await registry.list()
    out.broken = list.find((r) => r.id === 'jianbao')?.broken ?? null
    console.log('JIANBAO_PROBE ' + JSON.stringify(out))
  })
  .catch((error) => {
    out.broken = 'REGISTER THREW: ' + error.message
    console.log('JIANBAO_PROBE ' + JSON.stringify(out))
  })
`

/** 在真机平面里跑探针，返回结构化结果。 */
function probeRealPlane() {
  const dir = mkdtempSync(join(tmpdir(), 'jianbao-probe-'))
  const file = join(dir, 'probe.cjs')
  writeFileSync(file, PROBE, 'utf8')
  const run = spawnSync(ELECTRON, [file], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 180000,
  })
  const out = (run.stdout ?? '') + (run.stderr ?? '')
  const line = out.split('\n').find((l) => l.startsWith('JIANBAO_PROBE '))
  assert.ok(line !== undefined, '探针没有输出结果：\n' + out.slice(0, 1200))
  return JSON.parse(line.slice('JIANBAO_PROBE '.length))
}

test('真机 asar 平面：两行各合成 1 份，预设带 15 个插件行', async (t) => {
  if (!hasElectron) {
    t.skip('未找到桌面版安装')
    return
  }
  const r = probeRealPlane()
  assert.equal(r.rows.jianbao.count, 1, '插件行应恰好 1 份（多份会挂载两次）')
  assert.equal(r.rows['preset-jianbao'].count, 1, '预设行应恰好 1 份')
  assert.equal(r.rows.jianbao.name, '@zws/dsh-jianbao')
  assert.equal(r.rows['preset-jianbao'].name, '@deepseek-ai/dsh-agent-preset')
  assert.equal(r.rows['preset-jianbao'].pluginCount, 15)
  assert.equal(r.rows['preset-jianbao'].presetId, 'jianbao')
})

test('真机 asar 平面：registry.register() 之后 broken 必须是 null', async (t) => {
  if (!hasElectron) {
    t.skip('未找到桌面版安装')
    return
  }
  const r = probeRealPlane()
  assert.equal(
    r.broken,
    null,
    'broken 有值就是 UI 上的「加载失败」。实测值：\n' + String(r.broken),
  )
})
