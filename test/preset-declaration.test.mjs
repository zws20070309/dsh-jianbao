/**
 * 预设声明测试 —— 直接验 cordis.patch.yml，不再验 buildDefinition()。
 *
 * 为什么改：预设原先由 preset/index.js 在代码里 ctx.agentPresets.register() 注册，
 * 那条路径下 registry 用**它自己**所在 Loader 的 baseUrl 解析子行裸包名
 * （dsh-agent-preset-registry/lib/index.js:534），桌面版 base 在 app.asar 内，
 * 而 @zws/dsh-jianbao 只在 profile 平面 → never started → broken → 「加载失败」。
 *
 * 现在改成官方声明式：patch 里一条 `@deepseek-ai/dsh-agent-preset` 行，
 * 插件行进它的 config.plugins。所以测试对象也换成这个文件。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const PATCH = 'D:/Desktop/插件/dsh-jianbao/cordis.patch.yml'
const YAML = 'C:/Users/USER/.dsh/profiles/node_modules/js-yaml/index.js'

function loadPatch() {
  const yaml = createRequire(YAML)(YAML)
  const text = readFileSync(PATCH, 'utf8').replace(/!!js\s+/gu, '__JS__ ').replace(/('__JS__ [^']*')/gu, 'JSX')
  return yaml.load(text)
}

test('补丁是单条 insert，含顶层服务行与预设声明行', () => {
  const patches = loadPatch()
  assert.equal(patches.length, 1)
  assert.ok(Array.isArray(patches[0].insert), '必须是 - insert: 形式')
  const ids = patches[0].insert.map((r) => r.id)
  assert.deepEqual(ids, ['jianbao', 'preset-jianbao'])
  // 两条行职责不同，缺一不可：
  //   顶层 jianbao        → provide 工作台 Remote 服务 + 常驻提示段（必须在预设外）
  //   preset-jianbao      → 声明「简报模式」，其 config.plugins 里再挂一份 tools 行
  const top = patches[0].insert.find((r) => r.id === 'jianbao')
  assert.equal(top.name, '@zws/dsh-jianbao')
})

test('预设行用 @deepseek-ai/dsh-agent-preset 声明（官方形状）', () => {
  const preset = loadPatch()[0].insert.find((r) => r.id === 'preset-jianbao')
  assert.equal(
    preset.name,
    '@deepseek-ai/dsh-agent-preset',
    '预设必须由 dsh-agent-preset 作为 Loader 行承载：它声明了 EntryGroup.key，' +
      'Loader 才会把 config.plugins 挂成与声明行同平面的子行',
  )
  assert.equal(preset.config.id, 'jianbao')
  assert.equal(preset.config.name, '简报模式')
  assert.ok(typeof preset.config.order === 'number')
})

test('插件行齐全：15 行，且不含 agent-instructions', () => {
  const preset = loadPatch()[0].insert.find((r) => r.id === 'preset-jianbao')
  const plugins = preset.config.plugins
  assert.equal(plugins.length, 14, '插件行数量变了要同步改这条断言')
  const ids = plugins.map((r) => r.id)
  for (const need of ['persona', 'tool-pwsh', 'tool-fs', 'tool-executor-ptc', 'compaction']) {
    assert.ok(ids.includes(need), '缺行: ' + need)
  }
  // 预设里**不该**有 jianbao 行：三只工具由顶层 apply() 一起注册。
  // 原因见 preset/agent.cordis.yml 里 compaction 上方的注释（模块解析平面不可靠）。
  assert.equal(ids.includes('jianbao'), false, '预设里不许有 @zws 行')
  assert.equal(ids.includes('agent-instructions'), false, '不许注入 AGENTS.md')
  assert.equal(ids.includes('tool-bash'), true, '两个 shell 行都在，靠 disabled 二选一')
})

test('提示词已内联进 persona.prefix（不留占位符）', () => {
  const preset = loadPatch()[0].insert.find((r) => r.id === 'preset-jianbao')
  const persona = preset.config.plugins.find((r) => r.id === 'persona')
  const prefix = persona.config.prefix
  assert.equal(prefix.includes('{{PROMPT}}'), false, '占位符会原样进提示词，必须在补丁里展开')
  assert.ok(prefix.length > 800, '提示词正文太短，疑似没注入: ' + prefix.length)
  assert.match(prefix, /简报/u)
})

test('三只工具由顶层 apply() 注册，预设里不放 @zws 行', () => {
  const rows = loadPatch()[0].insert
  // 顶层行存在：它 provide Remote 服务 + 提示段，并一起注册三只工具。
  const top = rows.find((r) => r.id === 'jianbao')
  assert.ok(top !== undefined, '顶层 jianbao 行必须在')
  assert.equal(top.name, '@zws/dsh-jianbao')
  // 预设里不许有 @zws 行 —— 预设子行的模块名由 registry 自己的 baseUrl 解析
  // （cordis-plugin-loader/lib/index.js:214-227），桌面版那一片指向 asar 内，
  // 实测解析不到 @zws/*；指向 profile 时又解析不到 @deepseek-ai/*。
  // 让 @zws 彻底离开 config.plugins，这个变量就不存在。
  const preset = rows.find((r) => r.id === 'preset-jianbao')
  const zwsRows = preset.config.plugins.filter((r) => String(r.name).startsWith('@zws/'))
  assert.deepEqual(zwsRows, [], '预设里出现了 @zws 行: ' + zwsRows.map((r) => r.name).join(','))
})

test('compaction 组也必须 isolate（它 provides compaction 服务，同一个坑）', () => {
  const preset = loadPatch()[0].insert.find((r) => r.id === 'preset-jianbao')
  const comp = preset.config.plugins.find((r) => r.id === 'compaction');
  assert.ok(comp.isolate !== undefined, 'compaction 组必须有 isolate')
  assert.equal(comp.isolate.compaction, true, 'isolate 里必须标 compaction')
})

test('声明行本身用官方包名（它必须能被 registry 平面解析）', () => {
  const rows = loadPatch()[0].insert
  const preset = rows.find((r) => r.id === 'preset-jianbao')
  assert.equal(preset.name, '@deepseek-ai/dsh-agent-preset')
})

test('代码注册路径已彻底删除（preset/index.js 不复存在）', () => {
  // 这个文件曾经在 apply() 里调 ctx.agentPresets.register(def)，
  // 而 registry 用它自己所在 Loader 的 baseUrl 解析子行裸包名（asar 平面），
  // @zws/dsh-jianbao 只在 profile 平面 —— 解析不到 → 整份预设 broken。
  // 留着这个文件就有人可能给它加回补丁行，所以直接删掉。
  const retired = 'D:/Desktop/插件/dsh-jianbao/preset/index.js'
  assert.equal(existsSync(retired), false, 'preset/index.js 必须已删除，否则会重新引入代码注册路径')
  // package.json 也不许再导出它。
  const pkg = JSON.parse(readFileSync('D:/Desktop/插件/dsh-jianbao/package.json', 'utf8'))
  assert.equal(
    Object.keys(pkg.exports).includes('./preset'),
    false,
    'package.json 不许再导出 ./preset',
  )
})
