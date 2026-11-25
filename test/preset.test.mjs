/**
 * 预设自测：验插件行的形状与门控逻辑，不启动 DSH。
 *
 * 注意：预设已经不在这里构建了。它由 cordis.patch.yml 里的
 * @deepseek-ai/dsh-agent-preset 声明行承载（官方形状），
 * 所以形状断言在 test/preset-declaration.test.mjs，真机挂载在 test/preset-realplane.test.mjs。
 * 这个文件只保留门控逻辑（它属于工作台，不属于预设声明）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { ALLOWED, decide, presetOf } from '../lib/gate.js'

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
