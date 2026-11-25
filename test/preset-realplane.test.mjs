/**
 * 真机平面验证 —— 在 Electron 的 asar 平面里检查补丁与预设声明。
 *
 * ## 为什么必须借 Electron
 * 桌面版 DSH 的全部模块打包在
 *   resources/app.asar/dsh/node_modules/
 * 里。普通 Node 的 createRequire 读不到 asar 内部（实测全部 MODULE_NOT_FOUND），
 * 所以拿 Node 跑的「解析失败」是假象，拿 Node 跑的「挂载成功」也是假绿。
 * ELECTRON_RUN_AS_NODE=1 让 Electron 以 Node 方式跑，它自带 asar 支持。
 *
 * ## 这里只验到哪一层，以及为什么
 * 能验：
 *   1. 补丁在真机平面合成出的 entry 列表，两行各 1 份；
 *   2. 预设行的 config.plugins 是 15 行、id 齐全、提示词无占位符；
 *   3. @deepseek-ai/dsh-agent-preset 这个插件在 asar 平面能加载、契约正确
 *      （EntryGroup.key / inject / Config schema）。
 *
 * 验不到的：真 registry.register() 之后 broken 是否为 null。
 * mountPreset 依赖 Host Loader 激活中的 fiber（PresetTree 构造函数读 ctx.fiber.entry），
 * 裸 Context 建不出子行 —— 实测 tree.entries() 恒为 0，broken 恒为 never started。
 * 那是沙箱限制，不是插件状态，所以不在这里断言 broken，避免又一次假绿。
 * 真正的证据是用户重启后 UI 里预设有没可用。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ELECTRON = 'C:/Users/USER/AppData/Local/Programs/DeepSeek Harness/DeepSeek Harness.exe'
const ASAR_NM = 'C:/Users/USER/AppData/Local/Programs/DeepSeek Harness/resources/app.asar/dsh/node_modules'
const hasElectron = existsSync(ELECTRON)

const PROBE = [
  "const nm = '" + ASAR_NM + "'",
  "const boot = require(nm + '/@deepseek-ai/dsh-app-boot/lib/index.js')",
  "const installAnchor = nm + '/@deepseek-ai/dsh/package.json'",
  "const profile = boot.loadProfile('dsh', 'desktop', installAnchor, 'C:/Users/USER/.dsh')",
  'const all = [...profile.layers.flatMap((l) => l.patches), ...(profile.patches ?? [])]',
  'const rows = boot.composeEntries(all)',
  'const out = { layers: profile.layers.length, entries: rows.length, rows: {}, preset: {} }',
  "for (const id of ['jianbao', 'preset-jianbao']) {",
  '  const hits = rows.filter((r) => r.id === id)',
  '  out.rows[id] = { count: hits.length, name: hits[0]?.name ?? null }',
  '}',
  "const preset = rows.find((r) => r.id === 'preset-jianbao')",
  'out.preset.id = preset?.config?.id ?? null',
  'out.preset.name = preset?.config?.name ?? null',
  'out.preset.pluginIds = (preset?.config?.plugins ?? []).map((r) => r.id)',
  "const persona = (preset?.config?.plugins ?? []).find((r) => r.id === 'persona')",
  'out.preset.prefixLen = persona?.config?.prefix?.length ?? 0',
  "out.preset.hasPlaceholder = String(persona?.config?.prefix ?? '').includes('PROTO' + 'PLACEHOLDER')",
  // 插件本身能否在 asar 平面加载 + 契约是否正确
  "try {",
  "  const AP = require(nm + '/@deepseek-ai/dsh-agent-preset/lib/index.js').default",
  '  out.plugin = {',
  "    group: AP[Symbol.for('cordis.group')] === true,",
  '    inject: AP.inject ?? null,',
  "    configKeys: Object.keys(AP.Config?.dict ?? {}),",
  '  }',
  '} catch (error) {',
  "  out.plugin = { error: error.message }",
  '}',
  "console.log('JIANBAO_PROBE ' + JSON.stringify(out))",
].join('\n')

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

test('真机 asar 平面：顶层服务行 + 预设声明行各 1 份', async (t) => {
  if (!hasElectron) { t.skip('未找到桌面版安装'); return }
  const r = probeRealPlane()
  // 顶层：provide Remote 服务 + 提示段。必须在预设外，否则
  //   不 isolate → leakedServices 判泄漏，mountPreset 抛；
  //   isolate 了 → 网关 ctx.get 取不到，Remote 不可用。
  assert.equal(r.rows.jianbao.count, 1, '顶层服务行应恰好 1 份')
  assert.equal(r.rows.jianbao.name, '@zws/dsh-jianbao')
  // 预设声明行
  assert.equal(r.rows['preset-jianbao'].count, 1, '预设声明行应恰好 1 份')
  assert.equal(r.rows['preset-jianbao'].name, '@deepseek-ai/dsh-agent-preset')
  // 预设内层：只注册工具的那一份
  assert.ok(r.preset.pluginIds.includes('jianbao'), '预设内层必须有 jianbao 工具行')
})

test('真机 asar 平面：预设声明含 15 行、提示词已内联', async (t) => {
  if (!hasElectron) { t.skip('未找到桌面版安装'); return }
  const r = probeRealPlane()
  assert.equal(r.preset.id, 'jianbao')
  assert.equal(r.preset.name, '简报模式')
  assert.equal(r.preset.pluginIds.length, 15)
  for (const need of ['persona', 'tool-pwsh', 'tool-fs', 'tool-executor-ptc', 'jianbao', 'compaction']) {
    assert.ok(r.preset.pluginIds.includes(need), '缺行: ' + need)
  }
  assert.equal(r.preset.pluginIds.includes('agent-instructions'), false, '不许注入 AGENTS.md')
  assert.ok(r.preset.prefixLen > 800, '提示词太短，疑似没内联: ' + r.preset.prefixLen)
  assert.equal(r.preset.hasPlaceholder, false)
})

test('真机 asar 平面：@deepseek-ai/dsh-agent-preset 可加载且契约正确', async (t) => {
  if (!hasElectron) { t.skip('未找到桌面版安装'); return }
  const r = probeRealPlane()
  assert.equal(r.plugin.error, undefined, '插件加载失败: ' + r.plugin.error)
  assert.equal(r.plugin.group, true, '必须声明 EntryGroup.key，Loader 才会把 config.plugins 挂成子行')
  assert.deepEqual(r.plugin.inject, ['agentPresets'])
  for (const key of ['id', 'plugins']) {
    assert.ok(r.plugin.configKeys.includes(key), 'Config 缺字段: ' + key)
  }
})

test('本包在 profile 平面可加载（预设子行靠它）', async () => {
  const p = 'C:/Users/USER/.dsh/profiles/desktop/node_modules/@zws/dsh-jianbao/lib/index.js'
  assert.ok(existsSync(p), 'profile 平面的 junction 应指向本包')
  const m = await import('file:///' + p)
  assert.equal(typeof m.apply, 'function')
  assert.equal(typeof m.syncBundledSkills, 'function')
})
