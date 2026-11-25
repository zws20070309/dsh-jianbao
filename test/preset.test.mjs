/**
 * 预设自测：不启动 DSH，只验四件事。
 *   1. agent.cordis.yml 能被本包自带的 YAML 子集解析器读成 declaration；
 *   2. {{PROMPT}} 被换成 prompt.md 正文，且缩进逐行补齐（YAML 块标量规则）；
 *   3. 声明里没有 AGENTS.md 相关的行（不注入 ~/.dsh/AGENTS.md）；
 *   4. 门控逻辑：只有 jianbao 预设放行。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDefinition, packagePaths, PRESET_ID, renderPrompt } from '../preset/index.js'
import { ALLOWED, decide, presetOf } from '../lib/gate.js'

test('预设定义可构建，id/name/order 正确', () => {
  const def = buildDefinition()
  assert.equal(def.id, 'jianbao')
  assert.equal(def.name, '简报模式')
  assert.equal(typeof def.description, 'string')
  assert.equal(def.order, 8)
  assert.equal(def.plugins.length > 8, true)
})

test('不注入 AGENTS.md：声明里没有 agent-instructions 行', () => {
  const def = buildDefinition()
  const ids = def.plugins.map((row) => row.id)
  assert.equal(ids.includes('agent-instructions'), false)
  const names = def.plugins.map((row) => String(row.name ?? ''))
  assert.equal(names.some((name) => name.includes('agent-instructions')), false)
})

test('提示词占位符被替换，且每行都补齐了块标量缩进', () => {
  const paths = packagePaths()
  const yml = readFileSync(paths.presetDir + '/agent.cordis.yml', 'utf8')
  const prompt = readFileSync(paths.prompt, 'utf8')
  const out = renderPrompt(yml, prompt)
  assert.equal(out.includes('{{PROMPT}}'), false)
  // 正文首行必须出现在 YAML 里，并且带着 6 空格缩进
  const firstLine = prompt.split('\n')[0]
  assert.equal(out.includes('      ' + firstLine), true)
  // 注释里不能残留占位符字面量，否则 indexOf 会命中注释行
  assert.equal(yml.indexOf('{{PROMPT}}'), yml.lastIndexOf('{{PROMPT}}'))
})

test('persona.prefix 真的拿到了提示词正文', () => {
  const def = buildDefinition()
  const persona = def.plugins.find((row) => row.id === 'persona')
  assert.ok(persona, 'persona 行必须在')
  const prefix = String(persona.config?.prefix ?? '')
  assert.equal(prefix.length > 500, true)
  assert.match(prefix, /简报/u)
  assert.match(prefix, /400–700 字/u)
  // 关键纪律必须在提示词里（否则模型不知道要照参考样本写）
  assert.match(prefix, /方正仿宋/u)
  assert.match(prefix, /28\.8/u)
})

test('工具面：PTC 在、mcp/skill 的宿主工具行不在', () => {
  const def = buildDefinition()
  const names = def.plugins.map((row) => String(row.name ?? ''))
  assert.equal(names.includes('@deepseek-ai/dsh-tool-executor-ptc'), true)
  assert.equal(names.includes('@zws/dsh-jianbao'), true)
  // 不挂 mcp-client / terminal / blender / subagent
  assert.equal(names.some((name) => name.includes('mcp-client')), false)
  assert.equal(names.some((name) => name.includes('terminal')), false)
  assert.equal(names.some((name) => name.includes('blender')), false)
  assert.equal(names.some((name) => name.includes('tool-subagent')), false)
})

test('门控：只有 jianbao 预设放行', () => {
  assert.deepEqual([...ALLOWED], ['jianbao'])
  const ctx = (preset) => ({
    get: (key) =>
      key === 'sessionProjections'
        ? { stateOf: () => preset }
        : undefined,
  })
  const session = {}
  assert.equal(decide(ctx('jianbao'), session).allowed, true)
  assert.equal(decide(ctx('ptc'), session).allowed, false)
  assert.equal(decide(ctx('standard'), session).allowed, false)
  assert.equal(decide(ctx(null), session).allowed, false)
  assert.equal(decide(ctx('jianbao'), undefined).allowed, false)
})

test('门控：DSH_JIANBAO_GATE=0 时对全部会话放行（调试用）', () => {
  const prev = process.env.DSH_JIANBAO_GATE
  process.env.DSH_JIANBAO_GATE = '0'
  try {
    const ctx = () => ({ get: () => undefined })
    assert.equal(decide(ctx(), undefined).allowed, true)
  } finally {
    if (prev === undefined) delete process.env.DSH_JIANBAO_GATE
    else process.env.DSH_JIANBAO_GATE = prev
  }
})

test('门控：拿不到 sessionProjections 时按拒绝处理（不误放行）', () => {
  const ctx = { get: () => undefined }
  assert.equal(presetOf(ctx, {}), undefined)
  assert.equal(decide(ctx, {}).allowed, false)
})

test('PRESET_ID 与注册表 id 一致', () => {
  assert.equal(PRESET_ID, 'jianbao')
})
