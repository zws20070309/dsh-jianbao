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

test('补丁是单条 insert，两行都在里面', () => {
  const patches = loadPatch()
  assert.equal(patches.length, 1)
  assert.ok(Array.isArray(patches[0].insert), '必须是 - insert: 形式')
  const ids = patches[0].insert.map((r) => r.id)
  assert.deepEqual(ids, ['jianbao', 'preset-jianbao'])
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
  assert.equal(plugins.length, 15, '插件行数量变了要同步改这条断言')
  const ids = plugins.map((r) => r.id)
  for (const need of ['persona', 'tool-pwsh', 'tool-fs', 'tool-executor-ptc', 'jianbao', 'compaction']) {
    assert.ok(ids.includes(need), '缺行: ' + need)
  }
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

test('本包那一行在 patch 里用包名（声明式路径能解析，不需要 file:// 改写）', () => {
  const preset = loadPatch()[0].insert.find((r) => r.id === 'preset-jianbao')
  const self = preset.config.plugins.find((r) => r.id === 'jianbao')
  assert.equal(self.name, '@zws/dsh-jianbao')
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
