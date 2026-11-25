/**
 * 工作台门控 —— 让「简报」标签只在简报预设的会话里出现。
 *
 * 为什么需要它：conversation.view 槽位是**全局注册**的，一旦注册，所有会话的
 * 标签栏都会多出「简报」（官方 tab 栏就是遍历 slots.entries("conversation.view") 生成的）。
 * 客户端拿不到"本会话用哪个预设"的同步读接口 —— 会话头部只有一个只读标签，
 * preset 在 projectionValues.agentPreset 里，是异步加载的。
 *
 * 所以门控放在**宿主侧**：这里读会话的 agentPreset 投影，把结论写进一个
 * 进程级快照，浏览器半通过 remote.jianbao.gate(sessionId) 问它。
 *
 * 观测到的事实（
 *   · ctx.sessionProjections.stateOf(session, 'agentPreset') 给出当前预设 id；
 *   · 该投影随 'agent-preset/selected' 事件更新，空白会话切预设后立刻变；
 *   · 宿主侧拿不到浏览器侧的"当前活跃会话"，只能按 sessionId 逐个回答。
 *
 * @module @zws/dsh-jianbao/gate
 */

/** 允许看到工作台的预设 id。 */
export const ALLOWED = new Set(['jianbao'])

/**
 * 读一个会话当前的预设 id。
 * @param {object} ctx 宿主上下文
 * @param {object} session Session 对象
 * @returns {string|undefined}
 */
export function presetOf(ctx, session) {
  try {
    const projections = ctx.get('sessionProjections')
    if (projections === undefined || projections === null) return undefined
    if (typeof projections.stateOf !== 'function') return undefined
    const value = projections.stateOf(session, 'agentPreset')
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * 判定一个会话是否允许看到「简报」工作台。
 *
 * 留一个后门：环境变量 DSH_JIANBAO_GATE=0 时对**所有**会话放行 ——
 * 调试工作台本身时不必先切预设。
 *
 * @param {object} ctx 宿主上下文
 * @param {object|undefined} session Session 对象（拿不到时按预设判定）
 * @returns {{allowed:boolean, preset:string|undefined, reason:string}}
 */
export function decide(ctx, session) {
  if (process.env.DSH_JIANBAO_GATE === '0') {
    return { allowed: true, preset: undefined, reason: 'gate disabled by env' }
  }
  if (session === undefined || session === null) {
    return { allowed: false, preset: undefined, reason: 'no session' }
  }
  const preset = presetOf(ctx, session)
  if (preset === undefined) return { allowed: false, preset: undefined, reason: 'no agentPreset projection' }
  if (ALLOWED.has(preset)) return { allowed: true, preset, reason: 'preset allowed' }
  return { allowed: false, preset, reason: 'preset "' + preset + '" is not allowed' }
}
