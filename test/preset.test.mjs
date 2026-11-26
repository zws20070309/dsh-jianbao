/**
 * 预设自测：验插件行的形状与门控逻辑，不启动 DSH。
 *
 * 注意：预设已经不在这里构建了。它由 cordis.patch.yml 里的
 * @deepseek-ai/dsh-agent-preset 声明行承载（官方形状），
 * 所以形状断言在 test/preset-declaration.test.mjs，真机挂载在 test/preset-realplane.test.mjs。
 * 这个文件只保留门控逻辑（它属于工作台，不属于预设声明）。
 *
 * 门控有三份用途，共用同一个 ALLOWED 与同一个调试后门：
 *   · decide()       工作台标签（要 sessionId 去问会话存储）
 *   · decideAgent()  提示段 + 三只工具的准入（手上只有 live Agent / 装配上下文）
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { ALLOWED, decide, decideAgent, presetOf, presetOfAgent } from '../lib/gate.js'

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
  assert.equal(decide(ctx('minimal'), session).allowed, false)
})

test('门控：DSH_JIANBAO_GATE=0 时对全部会话放行（调试用）', () => {
  const before = process.env.DSH_JIANBAO_GATE
  process.env.DSH_JIANBAO_GATE = '0'
  try {
    const ctx = () => ({ get: () => ({ stateOf: () => 'ptc' }) })
    const verdict = decide(ctx(), {})
    assert.equal(verdict.allowed, true)
    assert.match(verdict.reason, /gate disabled/u)
    // 提示段/工具面走的是另一条判据，后门必须同样放行，否则调试工作台时提示词是空的
    assert.equal(decideAgent({ session: { header: { agentPreset: 'ptc' } } }).allowed, true)
  } finally {
    if (before === undefined) delete process.env.DSH_JIANBAO_GATE
    else process.env.DSH_JIANBAO_GATE = before
  }
})

test('门控：拿不到 sessionProjections 时按拒绝处理（不误放行）', () => {
  const ctx = { get: () => undefined }
  assert.equal(decide(ctx, {}).allowed, false)
  assert.equal(decide(ctx, undefined).allowed, false)
  assert.equal(presetOf(ctx, {}), undefined)
})

test('门控：投影给出 null / 非字符串时按拒绝处理', () => {
  const ctx = (value) => ({ get: () => ({ stateOf: () => value }) })
  assert.equal(decide(ctx(null), {}).allowed, false)
  assert.equal(decide(ctx(42), {}).allowed, false)
  assert.equal(decide(ctx(undefined), {}).allowed, false)
})

test('提示段/工具面门控：解析链按 composedPreset → 会话投影 → header 逐级回落', () => {
  // 1) 注册表在场时以本轮真正挂上的预设为准
  const mounted = {
    ctx: {
      get: (key) =>
        key === 'agentPresets'
          ? { composedPreset: () => 'jianbao' }
          : key === 'sessionProjections'
            ? { stateOf: () => 'ptc' }
            : undefined,
    },
    session: { header: { agentPreset: 'ptc' } },
  }
  assert.equal(presetOfAgent(mounted), 'jianbao', 'composedPreset 优先级最高')

  // 2) 注册表缺席 → 会话投影
  const projected = {
    ctx: { get: (key) => (key === 'sessionProjections' ? { stateOf: () => 'jianbao' } : undefined) },
    session: { header: { agentPreset: 'ptc' } },
  }
  assert.equal(presetOfAgent(projected), 'jianbao', '投影优先于 header')

  // 3) 都缺席 → header 兜底（冷启动阶段投影还没建好）
  const bare = { session: { header: { agentPreset: 'jianbao' } } }
  assert.equal(presetOfAgent(bare), 'jianbao')

  // 4) 什么都拿不到 → 拒绝，绝不误放行
  assert.equal(decideAgent(undefined).allowed, false)
  assert.equal(decideAgent({}).allowed, false)
  assert.equal(decideAgent({ session: { header: {} } }).allowed, false)
})

test('提示段/工具面门控：解析链某环抛错只降级，不把整步撑崩', () => {
  // 服务缺席时 ctx.get 会抛（cordis 对未 inject 的服务属性直接抛错）。
  // 这时只能往下回落，不能把异常抛给系统提示词装配或工具解析 —— 那会把整步打断。
  const exploding = {
    ctx: {
      get: () => {
        throw new Error('no service')
      },
    },
    session: { header: { agentPreset: 'jianbao' } },
  }
  // 前两环都炸 → 回落到 header（会话创建时记录的预设），据此放行
  assert.equal(decideAgent(exploding).allowed, true)
  // 但 header 说的是别的预设 → 照样拒绝
  assert.equal(decideAgent({ ...exploding, session: { header: { agentPreset: 'ptc' } } }).allowed, false)
  // header 也没有 → 拒绝
  assert.equal(decideAgent({ ctx: exploding.ctx, session: { header: {} } }).allowed, false)
})
