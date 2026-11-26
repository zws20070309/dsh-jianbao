// 门控真机探针 —— 由 test/gating-live.test.mjs 用 ELECTRON_RUN_AS_NODE 拉起。
// 在 asar 平面起一个真 cordis Context，按 agent-loop 的真实链路取提示词与工具面：
//   tools.resolve({agent, signal})  →  systemPrompt.assemble({...agent, toolSet})
const nm = process.env.ASAR_NM
const pkgRoot = process.env.JIANBAO_PATH

const { Context } = require(nm + '/@deepseek-ai/cordis/lib/index.js')
const spMod = require(nm + '/@deepseek-ai/dsh-system-prompt/lib/index.js')
const toolsMod = require(nm + '/@deepseek-ai/dsh-tools/lib/index.js')
const nativeExec = require(nm + '/@deepseek-ai/dsh-tool-executor-native/lib/index.js')

const out = {}
;(async () => {
  try {
    const app = new Context({})
    await app.plugin(spMod.default ?? spMod)
    await app.plugin(toolsMod.default ?? toolsMod)
    await app.plugin(nativeExec.default ?? nativeExec)

    const jianbao = await import('file:///' + pkgRoot.replace(/\\/g, '/') + '/lib/index.js')
    jianbao.apply(app)

    // 假 agent：只有 ctx 与 session.header.agentPreset。
    // 解析链第一环 agentPresets 故意缺席 —— 走的是 header 兜底，与冷启动同形。
    const makeAgent = (preset) => ({ ctx: app, session: { header: { id: 's-' + preset, agentPreset: preset } } })
    const signal = { aborted: false, throwIfAborted() {}, addEventListener() {}, removeEventListener() {} }

    const probe = async (preset) => {
      const agent = makeAgent(preset)
      const toolSet = await app.tools.resolve({ agent, signal })
      const assembly = await app.systemPrompt.assemble({ agent, scope: agent, toolSet })
      const text = spMod.renderPrompt(assembly)
      const visible = app.tools.schemas(agent, toolSet)
      return {
        hasSection: text.includes('## 简报写作（DSH 简报工作台）'),
        textLen: text.length,
        jianbaoTools: visible.filter((s) => s.name.startsWith('jianbao_')).map((s) => s.name),
      }
    }

    out.ptc = await probe('ptc')
    out.jianbao = await probe('jianbao')
    console.log('GATING_PROBE ' + JSON.stringify(out))
  } catch (error) {
    console.log('GATING_ERR ' + JSON.stringify({ message: String(error && error.message), stack: String(error && error.stack).split('\n').slice(0, 8) }))
  }
})()
