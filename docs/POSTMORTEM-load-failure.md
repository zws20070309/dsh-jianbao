# 两个真机 Bug 的复盘

这两个 bug 有同一个特征：**61 项单测全绿，但 DSH 里预设显示「加载失败」**。
根因不在业务逻辑，而在「交给运行时的东西格式对不对」——而我的测试当时只验内容，
没验「运行时能不能吃下去」。

## Bug 1：`!!js` 里不能用 `import.meta`

### 现象

重启 DSH 后，预设卡片红标「加载失败」，`broken` 有值但 UI 只显示四个字。

### 定位

cordis 求值 YAML 里的 `!!js` 表达式用的是（`cordis-plugin-loader/lib/index.js`）：

```js
const evaluate = new Function('ctx', 'expr', `
  with (ctx) {
    return eval(expr)
  }
`)
```

`new Function` 造出来的函数**不是模块**，所以 `import.meta` 在那里是**语法错误**。
我写的这一行：

```yaml
- !!js new URL('./skills', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
```

真求值的结果：

```
THROW 旧写法（import.meta） => SyntaxError: Cannot use 'import.meta' outside a module
OK    新写法（dshHomePath） => C:/Users/USER/.dsh/jianbao/skills
```

这个 SyntaxError 被 `AgentPresetRegistry.activate()` 捕获，写进 `record.broken`：

```js
catch (error) {
  record.broken = error.message
  this.owner.logger.warn(`agent preset ${record.config.id}: ${record.broken}`)
  await scope.dispose()
}
```

于是整份预设作废 —— 连 persona.prefix 里的提示词、工具行、门控全都没挂上。

### 修法

随包技能改成先**落到固定路径**，YAML 用宿主提供的 `dshHomePath` 指过去
（与逆向预设 `dshHomePath('redteam/skills')` 同一套做法）：

```yaml
customSkillDirs:
  - !!js dshHomePath('jianbao/skills')
```

`preset/index.js` 新增 `syncBundledSkills()`，在 `apply()` 启动时把
`preset/skills/*.md` 幂等同步到 `$DSH_HOME/jianbao/skills`。

### 可用于 `!!js` 的作用域

只有 `ctx` 上的属性（`with (ctx)` 决定的）。实测可用：

- `process`（平台判定）
- `dshHomePath('...')`（DSH_HOME 下的路径）
- `baseUrl`（声明方 Loader 的基准）

**不可用**：`import.meta`、`require`、`__dirname`、任何 ESM 语法。

## Bug 2：补丁不带 `insert` 就是「覆盖」，目标不存在则静默跳过

### 现象

预设能看到了（说明 preset 行生效），但「简报」标签始终不出现 —— 工作台宿主半没加载。

### 定位

`dsh-app-boot` 的 `applyEntryPatches`（`lib/index.js:61-110`）：

```js
for (const patch of patches) {
  const { id, insert, name, ...overrides } = patch
  if (insert) {
    if (id) { /* 插进指定 group */ }
    else data.push(...insert)      // ← 追加新行
    continue
  }
  if (!id) { warn('patch: id is required'); continue }
  const target = entryMap.get(id)
  if (!target) {
    warn('patch: entry %C not found')   // ← 只 warn 一句
    continue                            // ← 然后跳过
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'id') continue
    target[key] = value                 // ← 覆盖已有行
  }
}
```

我把第一个插件行写成了裸的 `- id: jianbao`：它不是 insert，所以走「覆盖」分支，
而这是**新建行**、entryMap 里没有，于是 `warn` 一句就丢掉了。

所以真正生效的只有 `- insert: [{ id: jianbao-preset, ... }]` 那一行。

### 修法

整块写在 `- insert:` 里：

```yaml
- insert:
    - id: jianbao
      name: '@zws/dsh-jianbao'
      inject: [tools, systemPrompt]
      config:
        presetId: jianbao
    - id: jianbao-preset
      name: '@zws/dsh-jianbao/preset'
```

同时**删掉 profile 补丁里手抄的那一份** —— bundle patch 已经 insert 过，
profile 再 insert 一次就是重复行（`entryMap.set` 后同 id 会互相遮蔽）。

## Bug 3（P0）：bundle 层与 profile 层双重插入

### 现象

修完 Bug 1、2 之后又测了一遍真实加载链，发现 `jianbao` 和 `jianbao-preset`
**各被插入了两次**。

### 定位

profile 的 `package.json` 里：

```json
"dsh": { "profile": { "bundles": ["@zws/dsh-jianbao", "@deepseek-ai/dsh-base", ...] } }
```

而 `@zws/dsh-jianbao` 自己的 `package.json` 声明了：

```json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

`loadProfileDirectory` 的组合顺序是：

1. 按 `dsh.profile.bundles` 顺序应用**每个 bundle 的 patch 文件**；
2. 再应用 **profile 自己的 `cordis.patch.yml`**；
3. 再应用启动器层（`--patch`、flag 派生）。

也就是说 **bundle 层已经把我们那两行插进去了**。我又往 profile 层
追加了一份手抄的块，于是同一 id 出现两次。

实测（真实 `loadProfile`）：

```
=== 所有 jianbao 相关的 patch 行 ===
  jianbao
  jianbao-preset
  profile:jianbao        ← 重复
  profile:jianbao-preset ← 重复
DUPLICATE 有重复插入
```

### 修法

删掉 profile 层那一整块，**只留 bundle 层的 `cordis.patch.yml`**。
删后再跑真实 `loadProfile` + `composeEntries`：

```
总 patch 数: 86
最终 entry 数: 213
  jianbao          x1  name=@zws/dsh-jianbao  inject=["tools","systemPrompt"]  config={"presetId":"jianbao"}
  jianbao-preset   x1  name=@zws/dsh-jianbao/preset
FINAL ENTRIES PASS
```

### 为什么这条特别危险

重复 entry 不会报错，只会让插件挂载两次（两个 fiber、两套工具、两个 Remote 服务）。
症状会是「工具重复注册」「Remote 方法冲突」这类看起来无关的报错，
比「加载失败」更难查。

## 补上的三道防线

### `test/preset-live.test.mjs`

用 cordis 原样照抄的求值器（`new Function('ctx','expr','with(ctx){return eval(expr)}')`）
把 YAML 里**每一个** `!!js` 表达式真跑一遍，并断言生效行里不出现 `import.meta`。
注释里出现字样不算（YAML 不解析注释，那行注释正是用来提醒后人的）。

### `test/patch.test.mjs`

三条断言：

1. `cordis.patch.yml` 的**每一个顶层补丁都是 `- insert:` 形式** —— 裸 `- id:` 判失败；
2. insert 里同时含插件行与预设行，且带 `inject` 与 `presetId`；
3. **profile 补丁里不出现 `jianbao`** —— bundle 层已经插过，profile 再插就是重复 entry。

## 教训

单测锁的是「我算得对不对」，锁不住「运行时吃不吃」。
凡是交给外部运行时的声明（YAML、补丁、`!!js`、Remote 描述符、bundle 形态），
测试里都要用**那个运行时自己的规则**去验一遍，而不是自己复述一遍规则。
