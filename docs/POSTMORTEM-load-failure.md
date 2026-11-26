# 「加载失败」四层根因复盘

预设卡片显示「加载失败」四个字，前前后后查出**四个独立原因**，每一层单独存在都足以让挂载失败。
这一篇按发现顺序记录，重点是每层的**证据**与**为什么之前没查出来**。

## 总览

| # | 根因 | 触发点 | 前面为什么漏掉 |
|---|---|---|---|
| 1 | `!!js` 里写 `import.meta` | `new Function` 求值时语法错误 | 单测不跑 cordis 求值器 |
| 2 | 补丁写成裸 `- id:` | applyEntryPatches 当作「覆盖」并静默跳过 | 没人检查补丁形状 |
| 3 | bundle 层与 profile 层重复插入 | 插件被挂两次 | 没跑真实 loadProfile |
| 4 | **注册方式错了 + 预设里 provide 服务** | 后面详述 | 测试用 mock loader，假绿 |

前三条是外围问题。**第四条才是真正的病根**，而且它分成两个互斥的死结。

## 第四层 A：注册方式 —— 声明式行 vs 代码 register

官方 ptc / standard / minimal 全是**一条 Loader 行**：

```yaml
- id: preset-ptc
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: ptc
    plugins: [...]
```

`AgentPreset` 声明了 `static [EntryGroup.key] = true`（`dsh-agent-preset/lib/index.js`），
所以 Loader 会把 `config.plugins` 挂成**真正的子行**，与声明行同平面解析。

我原先是在代码里 `ctx.agentPresets.register(def)`。那条路径下，registry 用它**自己**
所在 Loader 的 baseUrl 解析子行裸包名：

```js
// dsh-agent-preset-registry/lib/index.js:534
mountPreset(scope.ctx.extend({ baseUrl: record.context.baseUrl }), ...)
```

桌面版 DSH 是 Electron，模块全在 `resources/app.asar/dsh/node_modules` 内；
`@zws/dsh-jianbao` 只存在于 profile 平面 → 解析不到 → 该行 never started → broken。

## 第四层 B：预设里不能 provide 服务（两个死结）

改声明式之后仍挂不上。原因是 `lib/index.js` 的 `apply()` 里有
`ctx.provide('jianbao', service)` 发布工作台 Remote 服务。

### 死结一：不 isolate → 判「泄漏到根 realm」

```js
// cordis/lib/index.js:805
this.ctx.root[symbols.isolate][name] ??= Symbol(name)

// dsh-agent-preset-registry/lib/index.js（mountPreset 收尾）
const leaked = leakedServices(ctx, ctx.fiber)
if (leaked.length > 0) throw new Error(`Preset services require isolate realms: ${leaked}`)
```

官方 `compaction` / `planning` / `delegation` 这些 provides 的行因此都带 `isolate`。

### 死结二：加 isolate → 网关发现不了 Remote

```js
// dsh-api-gateway/lib/index.js collectSrcClaims()
for (const [serviceKey, definition] of Object.entries(this.ctx.reflect.props)) {
  const receiver = this.ctx.get(serviceKey)   // ← 从网关自己的 ctx 取
  ...
}
```

服务被隔离进预设子 scope 后，网关的 ctx 取不到它。

### 实测（Electron + 真 cordis）

```
不 isolate → root.get('svcA') === true,  rootIsolate.svcA 存在   → 判泄漏
isolate    → root.get('svcB') === false                         → 网关发现不了
```

两条路都不通。**官方所有 preset 的插件行都只注册工具、不 provide 服务**——这就是原因。

## 修法：拆成两个入口

```
lib/index.js   apply()             → provide Remote 服务 + 常驻提示段（顶层行，不在预设里）
               createToolRegistrar → 造「注册三只工具」的函数
lib/tools.js   apply()             → 只调 createToolRegistrar，不 provide
```

> **后续修正（2026-11-26）**：顶层行意味着提示段与三只工具对**所有预设**的会话可见 ——
> 实测 ptc 会话的系统提示词末尾挂着「## 简报写作」那 1679 字符、工具面里也有三只 jianbao 工具。
> 现在两者都按会话实际挂的预设门控（`lib/gate.js` 的 `decideAgent` + 工具的 `{ when }`），
> 见 README 的「门控」一节。本条不改变上面的拆法结论，只补上漏掉的门控。

```yaml
- insert:
    - id: jianbao                  # 顶层：服务 + 提示段
      name: '@zws/dsh-jianbao'

    - id: preset-jianbao           # 预设声明
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        plugins:
          - id: jianbao            # 内层：只注册工具
            name: '@zws/dsh-jianbao/tools'
```

## 为什么前面几轮都没查对

**测试用 mock loader，是假绿。**

`root.provide('loader', { await: async () => {} })` 之后，`mountPreset` 建不出子行
（`PresetTree` 构造函数读 `ctx.fiber.entry`，裸 Context 的 root fiber 没有 entry），
`tree.entries()` 恒为 0，`auditRows` 什么都不报，`broken` 就恒为 null。
断言「`broken === null`」通过，但它在真机里必然失败。

现在的测试只断言**真能验的**：补丁合成结果、15 行齐全、
`@deepseek-ai/dsh-agent-preset` 可加载且 `EntryGroup.key = true`。
`broken` 是否为 null 不再假装知道。

## 通用教训

1. **单测锁的是「我算得对不对」，锁不住「运行时吃不吃」。**
   凡交给外部运行时的声明（YAML、补丁、`!!js`、Remote 描述符、bundle 形态），
   测试要用**那个运行时自己的规则**去验，不是自己复述一遍规则。
2. **mock 掉依赖 = 关掉了要验的那部分。** 用 mock loader 验挂载，等于没验。
   验不到就明说验不到，别写断言充数。
3. **看官方怎么做的。** 四个根因里有三个，官方示例都给出了正确形状；
   我是自己发明了 `register()` 路径，才踩进 base 平面与 realm 两个坑。
