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
/**
 * 从 live Agent 上读它当前挂的预设 id。
 *
 * 提示词装配（`{ agent, scope, signal, modelSelection, toolSet }`，见
 * dsh-agent/lib/index.js:408 assembleContextFor）与工具执行（`exec.agent`）
 * 手上都只有 agent，所以两边共用这一条链。
 *
 * 解析链按可靠性排序，任何一环拿不到就往下走 —— 这条链**必须**能在两种入口里都跑通，
 * 否则「提示词门控」与「工具门控」就会给出不一致的答案：
 *
 *   1. `agentPresets.composedPreset(agent.ctx)` —— 本轮真正挂上的预设，最准；
 *   2. 会话投影 `agentPreset` —— 与工作台 gate 用的是同一份来源；
 *   3. session.header.agentPreset —— 冷启动阶段投影还没建好时的兜底。
 *
 * @param {object} agent live Agent（带 ctx / session）
 * @returns {string|undefined}
 */
export function presetOfAgent(agent) {
  const ctx = agent?.ctx
  if (ctx !== undefined && ctx !== null && typeof ctx.get === 'function') {
    try {
      const presets = ctx.get('agentPresets')
      if (presets !== undefined && presets !== null && typeof presets.composedPreset === 'function') {
        const mounted = presets.composedPreset(agent.ctx)
        const id = typeof mounted === 'string' ? mounted : mounted?.id || mounted?.name
        if (typeof id === 'string' && id !== '') return id
      }
    } catch {
      /* 注册表缺席就往下走 */
    }
    const fromProjection = presetOf(ctx, agent?.session)
    if (fromProjection !== undefined) return fromProjection
  }
  const header = agent?.session?.header
  const raw = header?.agentPreset
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

/**
 * 判定一段提示词/一组工具在当前 agent 上是否应当生效。
 *
 * 与 decide() 的区别：decide() 判的是「工作台标签能不能显示」（要 sessionId 去问会话存储），
 * 这里判的是「模型这一侧看不看得到简报的东西」（手上只有装配上下文/live Agent）。
 * 两者共用同一份 ALLOWED 与同一个调试后门，结论必须一致。
 *
 * @param {object|undefined} agent live Agent（来自 context.agent 或 exec.agent）
 * @returns {{allowed:boolean, preset:string|undefined, reason:string}}
 */
export function decideAgent(agent) {
  if (process.env.DSH_JIANBAO_GATE === '0') {
    return { allowed: true, preset: undefined, reason: 'gate disabled by env' }
  }
  if (agent === undefined || agent === null) {
    return { allowed: false, preset: undefined, reason: 'no agent' }
  }
  let preset
  try {
    preset = presetOfAgent(agent)
  } catch {
    // 解析链上任何一环抛错都按「不准入」处理：宁可少注入，不可误注入。
    return { allowed: false, preset: undefined, reason: 'preset resolution threw' }
  }
  if (preset === undefined) return { allowed: false, preset: undefined, reason: 'no preset resolved' }
  if (ALLOWED.has(preset)) return { allowed: true, preset, reason: 'preset allowed' }
  return { allowed: false, preset, reason: 'preset "' + preset + '" is not allowed' }
}
