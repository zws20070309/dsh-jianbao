/**
 * 真机注册验证：用 DSH 自己的 AgentPresetRegistry 把预设真正注册一遍。
 *
 * 这一条是整个插件最容易「单测全绿但真机挂」的地方，因为它跨了四层：
 *   1. buildDefinition() 产出的结构必须是 registry 认识的；
 *   2. 里面所有 !!js 表达式必须能被 cordis 的求值器跑通（new Function + with(ctx)）；
 *   3. registry 构造时必须能拿到 sessionProjections 服务；
 *   4. register() 之后的 record.broken 必须是 null。
 *
 * 前两轮 bug（import.meta 语法错误、补丁重复插入）都不在这一层的覆盖里，
 * 所以这条测试是补上的。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

const DSH_PKG = 'C:/Users/USER/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/package.json'
const hasDsh = existsSync(DSH_PKG)

/** cordis 求值 !!js 的方式，原样照抄（cordis-plugin-loader）。 */
function cordisEvaluate(ctx, expr) {
  const fn = new Function('ctx', 'expr', 'with (ctx) { return eval(expr) }')
  return fn(ctx, expr)
}

/** 宿主给的 !!js 作用域（只放真实可用的东西）。 */
function loaderScope(dshHome) {
  return {
    process,
    dshHomePath: (p) => dshHome + '/' + p,
  }
}

test('预设能注册进真实 AgentPresetRegistry 且 broken 为 null', async (t) => {
  if (!hasDsh) {
    t.skip('未找到 dsh 安装，跳过真机注册验证')
    return
  }
  const req = createRequire(DSH_PKG)

  const { Context } = await import('file:///' + req.resolve('@deepseek-ai/cordis').replace(/\\/g, '/'))
  const regMod = await import('file:///' + req.resolve('@deepseek-ai/dsh-agent-preset-registry').replace(/\\/g, '/'))
  const presetMod = await import('file:///D:/Desktop/插件/dsh-jianbao/preset/index.js')

  const root = new Context()
  const projections = []
  root.provide('sessionProjections', {
    register: (def) => { projections.push(def.key); return () => {} },
    stateOf: () => undefined,
    onChanged: () => () => {},
  })

  const registry = new regMod.AgentPresetRegistry(root, { default: 'ptc' })
  assert.deepEqual(projections, ['agentPreset'], '注册表应注册 agentPreset 投影')

  // 随包技能要能被落到 dshHomePath 指向的位置，否则 customSkillDirs 指向空目录
  const synced = presetMod.syncBundledSkills()
  assert.ok(existsSync(synced.dir), 'syncBundledSkills 应产出目录: ' + synced.dir)
  assert.ok(synced.copied >= 1 || existsSync(synced.dir + '/jianbao-format.md'), '技能文件应存在')

  const scope = loaderScope('C:/Users/USER/.dsh')
  function evalAll(value) {
    if (value === null || typeof value !== 'object') return value
    if ('__jsExpr' in value) return cordisEvaluate(scope, value.__jsExpr)
    if (Array.isArray(value)) return value.map(evalAll)
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = evalAll(v)
    return out
  }

  const def = evalAll(presetMod.buildDefinition())
  def.id = 'jianbao'
  await registry.register(def)

  const list = await registry.list()
  const row = list.find((r) => r.id === 'jianbao')
  assert.ok(row !== undefined, 'registry.list() 里应有 jianbao')
  assert.equal(row.broken ?? null, null, 'broken 必须为 null（有值就是 UI 上的「加载失败」）')
  assert.equal(row.name, '简报模式')
})

test('buildDefinition 的每一行 name 都是可解析字符串', async (t) => {
  if (!hasDsh) {
    t.skip('未找到 dsh 安装')
    return
  }
  const presetMod = await import('file:///D:/Desktop/插件/dsh-jianbao/preset/index.js')
  const def = presetMod.buildDefinition()
  const plugins = def.plugins ?? def.entries ?? []
  assert.ok(Array.isArray(plugins) && plugins.length > 0, '预设应有插件行')
  for (const row of plugins) {
    assert.equal(typeof row.name, 'string', 'row.name 必须是字符串: ' + JSON.stringify(row))
    assert.ok(row.name.length > 0, 'row.name 不能为空')
  }
})
