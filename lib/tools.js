/**
 * 简报工具的**预设内**入口。
 *
 * ## 为什么和 lib/index.js 分成两个模块
 *
 * 一个 apply() 同时 provide Remote 服务 + register 工具，放进预设会两头堵死：
 *
 * · 不 isolate —— cordis 的 provide 写的是
 *     this.ctx.root[symbols.isolate][name] ??= Symbol(name)   (cordis/lib/index.js:805)
 *   mountPreset 收尾的 leakedServices() 会命中，抛
 *     Preset services require isolate realms: jianbao
 *   （官方 compaction / planning / delegation 这些 provides 的行因此都带 isolate。）
 *
 * · 加 isolate —— 服务被隔离进预设子 scope，而网关的 collectSrcClaims() 遍历的是
 *   网关自己的 ctx.reflect.props，再用 this.ctx.get(serviceKey) 取实例。
 *   实测 isolate 后 root.get('jianbao') === false —— 网关发现不了，浏览器侧
 *   remote.jianbao 永远「未挂载」。
 *
 * 两条路都不通，说明「提供 Remote 服务」不属于预设内部 —— 官方所有 preset 的插件行
 * 都只注册工具。所以：
 *
 *   顶层 jianbao 行（lib/index.js applyServices）→ provide Remote 服务 + 提示段
 *   预设内 jianbao 行（本文件 applyTools）      → 只注册三只工具，服务实例本地 new，不 provide
 *
 * 两边共用 lib/index.js 里的实现（JianbaoService、defineTool、输出 schema），
 * 不重复写一份，避免漂移。
 *
 * @module @zws/dsh-jianbao/tools
 */

export const name = '@zws/dsh-jianbao/tools'

/** 工具行需要工具注册表；提示段与服务在顶层那一行，这里不要。 */
export const inject = ['tools']

import { createToolRegistrar } from './index.js'

/**
 * 注册三只简报工具。
 * @param {object} ctx cordis 上下文
 */
export function apply(ctx) {
  // 本实例只作为工具实现的后端，**不 provide**：
  // provide 在预设里要么泄漏到根 realm（挂载失败），要么被 isolate（网关发现不了）。
  createToolRegistrar(ctx)()
}

export default { name, inject, apply }
