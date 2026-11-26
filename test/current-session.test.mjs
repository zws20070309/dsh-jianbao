/**
 * 当前会话定位的动态测试。
 *
 * 右栏面板挂在 root scope 上，props 里没有 sessionId，所以工作台必须自己
 * 判断"当前是哪个会话"。官方 ui-sidebar-right 用的是
 *   ctx.uiSession.adapter.current.getSnapshot().key
 * 其值来自 dsh-client-ui-session materialize() 的 { key: binding.sessionId }，
 * 未挂载任何会话时是 materializeAbsent() 的 { key: void 0 }。
 *
 * 这里把 currentSessionId 原样抽出来，配复刻真实形状的 mock 真跑一遍。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function loadCurrentSessionId() {
  const source = await readFile(join(root, 'lib', 'client.js'), 'utf8')
  const start = source.indexOf('function currentSessionId(')
  assert.notEqual(start, -1, 'client.js 里找不到 currentSessionId')
  const end = source.indexOf('\n    }', start)
  assert.notEqual(end, -1, 'currentSessionId 收尾没找到')
  const body = source.slice(start, end + '\n    }'.length)
  // eslint-disable-next-line no-new-func
  return new Function('return (' + body + ')')()
}

/** 拼一个 ctx：uiSession 与 sessions 都可按需缺省。 */
function ctxWith({ key, byId } = {}) {
  const ctx = { get: () => undefined }
  if (key !== '__absent__') {
    ctx.uiSession = {
      adapter: {
        current: {
          // 复刻 createBindingSource：getSnapshot 返回 { key, hooks, ... }
          getSnapshot: () => ({ key, hooks: {}, keyedHooks: {}, props: {} }),
          subscribe: () => () => {},
        },
      },
    }
  }
  ctx.sessions = {
    list: { getSnapshot: () => ({ ids: Object.keys(byId ?? {}), byId: byId ?? {}, phase: 'ready' }) },
  }
  return ctx
}

test('优先用 uiSession.adapter.current 的 key', async () => {
  const currentSessionId = await loadCurrentSessionId()
  const ctx = ctxWith({
    key: 'from-ui-session',
    byId: { 'from-list': { id: 'from-list', retainedBy: { mainView: 3 } } },
  })
  assert.equal(currentSessionId(ctx), 'from-ui-session', '有权威来源时不该退回遍历列表')
})

test('uiSession key 为空（materializeAbsent）时退回 retainedBy.mainView', async () => {
  const currentSessionId = await loadCurrentSessionId()
  const ctx = ctxWith({
    key: undefined,
    byId: {
      a: { id: 'a', retainedBy: { aiChat: 2 } },
      b: { id: 'b', retainedBy: { mainView: 1 } },
    },
  })
  assert.equal(currentSessionId(ctx), 'b', '应当挑被主视图 retain 的那个')
})

test('uiSession 整个服务缺失时也能退回列表（不抛）', async () => {
  const currentSessionId = await loadCurrentSessionId()
  const ctx = ctxWith({
    key: '__absent__',
    byId: { c: { id: 'c', retainedBy: { mainView: 1 } } },
  })
  assert.equal(currentSessionId(ctx), 'c')
})

test('uiSession 存在但 adapter 残缺时不炸', async () => {
  const currentSessionId = await loadCurrentSessionId()
  const ctx = ctxWith({ byId: { d: { id: 'd', retainedBy: { mainView: 1 } } } })
  ctx.uiSession = {}            // 没有 adapter
  assert.equal(currentSessionId(ctx), 'd')
  ctx.uiSession = { adapter: {} }  // 没有 current
  assert.equal(currentSessionId(ctx), 'd')
})

test('uiSession 的 getter 抛错时被吞掉并退回列表', async () => {
  const currentSessionId = await loadCurrentSessionId()
  const ctx = ctxWith({ byId: { e: { id: 'e', retainedBy: { mainView: 1 } } } })
  Object.defineProperty(ctx, 'uiSession', {
    get() { throw new Error('cannot get property "uiSession" without inject') },
  })
  assert.equal(currentSessionId(ctx), 'e', 'cordis 代理抛错不该冒到渲染层')
})

test('两边都拿不到时返回空串（调用方据此提示先开会话）', async () => {
  const currentSessionId = await loadCurrentSessionId()
  assert.equal(currentSessionId(ctxWith({ key: undefined, byId: {} })), '')
  assert.equal(currentSessionId(ctxWith({ key: '' })), '')
})
