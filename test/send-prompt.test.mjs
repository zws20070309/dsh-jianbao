/**
 * 任务书投递路径的动态契约测试。
 *
 * 背景：右栏工作台挂在 root scope 上，而 conversation.send 只认作用域
 * （dsh-client-ui-conversation @130894 scopeId 抛
 *  「requires a session scope — address one via ctx.sessions.scope(id).conversation」）。
 * 用户实测报过「会话作用域不可用：拿不到 conversation 服务」。
 *
 * 这里把 lib/client.js 里的 sendPrompt 源码原样抽出来，配一套复刻真实语义的
 * mock，真跑一遍看它到底送不送得出去：
 *   · binding(id)          —— 只偷看，不延长生命周期（官方 send 就是这么做的）
 *   · using(id, opts, op)  ≡ retain → await ready → op(ref) → release
 *   · reference.binding    的 getter 在 release 之前才可读
 *   · session.prompt(content, mode) 返回 Result，失败不抛异常
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 从 client.js 里拽出 sendPrompt 的源码。 */
async function extractSendPrompt() {
  const source = await readFile(join(root, 'lib', 'client.js'), 'utf8')
  const start = source.indexOf('async function sendPrompt(')
  assert.notEqual(start, -1, 'client.js 里找不到 sendPrompt')
  // 从 start 往后找配对的收尾（四空格缩进的右花括号）
  const end = source.indexOf('\n    }', start)
  assert.notEqual(end, -1, 'sendPrompt 收尾没找到')
  return source.slice(start, end + '\n    }'.length)
}

/** 用真实语义拼一个 sessions 服务。 */
function makeSessions(options = {}) {
  const { supportsUsing = true, promptOk = false, retained = false } = options
  const calls = { retain: 0, release: 0, prompt: 0, peek: 0, sent: [] }

  const makeSession = () => ({
    getSnapshot: () => ({ openState: 'cold', openError: null }),
    prompt: async (content, mode) => {
      calls.prompt += 1
      calls.sent.push({ content, mode })
      if (promptOk) return { ok: false, error: { code: 'busy', message: 'session is busy' } }
      return { ok: true, value: { accepted: true } }
    },
  })

  const makeReference = (id) => {
    let released = false
    const record = { live: true, binding: { sessionId: id, session: makeSession() } }
    const reference = {
      sessionId: id,
      ready: Promise.resolve(),
      get binding() {
        if (released || !record.live) throw new Error('Session reference "' + id + '" is released')
        return record.binding
      },
      release() {
        if (released) return
        released = true
        calls.release += 1
      },
    }
    return { reference, record }
  }

  const live = makeReference('default')
  const sessions = {
    get calls() { return calls },
    // root scope 下恒为 undefined —— 正是线上情形
    scope: () => undefined,
    binding: (id) => {
      calls.peek += 1
      if (!retained) return undefined
      return { sessionId: id, session: live.record.binding.session }
    },
  }
  if (supportsUsing) {
    sessions.using = async (id, opts, op) => {
      assert.equal(typeof opts.source, 'string', 'using 必须带 source')
      assert.notEqual(opts.source, '', 'source 不能是空串')
      const fresh = makeReference(id)
      calls.retain += 1
      try {
        await fresh.reference.ready
        return await op(fresh.reference)
      } finally {
        fresh.reference.release()
      }
    }
  }
  sessions.retain = (id) => {
    calls.retain += 1
    return makeReference(id).reference
  }
  return sessions
}

const ctxOf = (sessions) => ({ get: (key) => (key === 'sessions' ? sessions : undefined) })

async function loadSendPrompt() {
  const body = await extractSendPrompt()
  // eslint-disable-next-line no-new-func
  return new Function('return (' + body + ')')()
}

test('sendPrompt：会话已被视图 retain 时直接读 binding，不增引用计数', async () => {
  const sendPrompt = await loadSendPrompt()
  const sessions = makeSessions({ retained: true })
  await sendPrompt(ctxOf(sessions), 'sess-1', '写一份简报')
  assert.equal(sessions.calls.prompt, 1, 'prompt 应当被调用一次')
  assert.equal(sessions.calls.retain, 0, '已有 binding 就不该再 retain（照官方 send 的做法）')
  assert.deepEqual(sessions.calls.sent[0], {
    content: [{ type: 'text', text: '写一份简报' }],
    mode: 'queue',
  })
})

test('sendPrompt：没人 retain 时借引用并用 sessions.using', async () => {
  const sendPrompt = await loadSendPrompt()
  const sessions = makeSessions()
  await sendPrompt(ctxOf(sessions), 'sess-2', '写一份简报')
  assert.equal(sessions.calls.prompt, 1)
  assert.equal(sessions.calls.retain, 1, '应当借一次引用')
  assert.equal(sessions.calls.release, 1, '借了就必须还')
})

test('sendPrompt：老版本没有 using 时，兜底 retain + await ready 也能送达', async () => {
  const sendPrompt = await loadSendPrompt()
  const sessions = makeSessions({ supportsUsing: false })
  await sendPrompt(ctxOf(sessions), 'sess-3', '兜底路径')
  assert.equal(sessions.calls.prompt, 1)
  assert.equal(sessions.calls.release, 1)
})

test('sendPrompt：兜底路径先 await ready 再读 binding（否则 getter 抛 released）', async () => {
  const sendPrompt = await loadSendPrompt()
  const sessions = makeSessions({ supportsUsing: false })
  const originalRetain = sessions.retain
  sessions.retain = (id) => {
    const reference = originalRetain(id)
    let resolveNow
    reference.ready = new Promise((resolve) => { resolveNow = resolve })
    setTimeout(resolveNow, 5)
    return reference
  }
  await sendPrompt(ctxOf(sessions), 'sess-4', '延迟就绪')
  assert.equal(sessions.calls.prompt, 1)
})

test('sendPrompt：prompt 返回 ok:false 要抛错，不静默失败', async () => {
  const sendPrompt = await loadSendPrompt()
  const sessions = makeSessions({ promptOk: true })
  await assert.rejects(
    () => sendPrompt(ctxOf(sessions), 'sess-5', 'x'),
    /发送失败（busy: session is busy）/u,
  )
  assert.equal(sessions.calls.release, 1, '抛错时也要释放引用')
})

test('sendPrompt：历史没加载完也能发（不拿 openState 设卡）', async () => {
  const sendPrompt = await loadSendPrompt()
  // makeSessions 里的 openState 恒为 'cold'，正是「全新会话没加载历史」
  const sessions = makeSessions()
  await sendPrompt(ctxOf(sessions), 'sess-6', 'x')
  assert.equal(sessions.calls.prompt, 1, 'openState=cold 不该阻止发送')
})

test('sendPrompt：sessions 服务缺失直接报错', async () => {
  const sendPrompt = await loadSendPrompt()
  await assert.rejects(() => sendPrompt({ get: () => undefined }, 'sess-7', 'x'), /sessions 服务不可用/u)
})
