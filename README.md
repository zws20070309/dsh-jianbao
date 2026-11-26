# dsh-jianbao · 简报工作台

在 DSH 里写学院《信息》简报：填个工作台表单 → 模型按 63 篇真实简报蒸馏出的
结构与用词写稿 → XeLaTeX 编译成与参考 PDF **像素级一致**的 A4 成品。

```
┌─ 简报工作台（会话主视图的「简报」标签，只在简报预设下出现）
│  类型 / 期号 / 主题 / 时间 / 领导 / 人群 / 流程 / 撰稿人 / 审签人 / 电话 / 抄送 / 图片
│  ↓ 开始工作
│  模型读表单 → 写 4 段 → jianbao_save → .tex → xelatex → brief.pdf
│  ↓
└─ 面板内嵌预览 / 打开 / 下载
```

## 快速开始

```powershell
# 1. 装到 DSH profile（建目录联接，不复制文件）
./tools/install-link.ps1

# 2. 重启 DSH（插件目录不热重载）

# 3. 新建会话时选「简报模式」预设，「简报」标签就会出现
```

没有 LaTeX 也能用：工作台顶部会明确说只能导出 `.tex`，不会假装编译成功。

## 预设：简报模式

基于官方 PTC 派生（`run_code` 是唯一直接工具入口），三处与官方不同：

1. **不注入 `~/.dsh/AGENTS.md`** —— 组合里没有 `agent-instructions` 行，
   全局记忆进不来，这个预设只管写简报。
2. **随包提示词**（`preset/prompt.md`）写了 63 篇样本里蒸馏出的硬纪律：
   4 段结构、字数区间、标题动词、人名「职务+姓名+同志」、禁用词表。
3. **工具面收窄**：去掉 mcp / skill 用户根 / blender / terminal / subagent，
   只留读、写、编译、联网、出图。

## 「简报」标签的门控

`conversation.view` 是全局槽位 —— 注册一次，**所有**会话的标签栏都会多一项。
所以不能无条件注册。实现方式：

- 宿主侧 `lib/gate.js` 读会话的 `agentPreset` 投影，判定是否放行；
- 浏览器侧在注册槽位**之前**先调 `remote.jianbao.gate(sessionId)`，
  只在放行时注册，切走时注销；
- 调试后门：`DSH_JIANBAO_GATE=0` 对全部会话放行。

改预设后需要**重启 DSH** 并新建会话 —— 已开始的会话保留它启动时的组合。

## 三只工具

| 工具 | 输入 | 输出 |
|---|---|---|
| `jianbao_state` | — | 工作区、表单、简报骨架、产物清单、环境检测 |
| `jianbao_save` | 完整 `blocks` + 可选 `compile` | `.tex` + `.pdf`、页数、字数、结构告警 |
| `jianbao_render` | — | 只重跑 LaTeX，读回已有简报 |

`blocks` 支持 `p` / `h1` / `h2` / `h3` / `image` / `imagePair`。
`jianbao_save` 每次要传**完整** blocks（不是增量），并做非阻塞结构审查
（段数、400–700 字、标题 ≤60 字、正文无破折号、无 AI 套话），结果在 `warnings`。

## 版式

全部常量来自参考 PDF 的实测（见 [docs/FORMAT-SPEC.md](docs/FORMAT-SPEC.md)）：

```
A4 595.32×841.92bp    上 104.90 / 下 99.25 / 左 79.40 / 右 73.70
行距 28.80bp（全文）  正文 15.96bp 方正仿宋，首行缩进 2 字符
大标题 21.96bp 方正小标宋，居中自然折行，行距 28.92
一级 19.93 黑体 / 二级 15.96 楷体粗 / 三级 15.96 仿宋粗
抄送 15.00bp 仿宋_GB2312 + 两条 1bp 通栏线，压末页底
页脚「— N —」14.04bp，基线 752.856，右端 506.01
```

字体降级链：方正 → 仿宋_GB2312 / 方正小标宋简体（用户字体目录）→
simfang / simhei / simkai / simsun。缺方正字库也能出 PDF，二级/三级标题用
`AutoFakeBold=2.5` 伪粗。

## 验收

```powershell
node --test "test/*.test.mjs"     # 53 项单测
node tools/selftest.mjs           # 真编译 + 从产出 PDF 读回几何对账
node tools/review-client.mjs      # 客户端 bundle 契约（能与其他 bundle 拼合）
node tools/geometry-diff.mjs ours.pdf ref.pdf --tol 0.5   # 与参考 PDF 逐行偏差表
```

`selftest` 的输出：

```
OK   期号基线 = 252.38        OK   正文首行基线 = 454.39
OK   报头一基线 = 277.49      OK   页脚基线 = 752.856
OK   大标题首行基线 = 367.73  OK   页脚右端 = 506.01
OK   第 2 页首行基线 = 127.94 OK   抄送首行基线 = 705.02
SELFTEST PASS
```

## 目录

```
lib/index.js        宿主半：Remote 服务 + 三只工具 + 提示段
lib/client.js       浏览器半：工作台面板 + 标签门控
lib/brief.js        数据模型与 **METRICS**（全部实测版式常量）
lib/render-tex.js   XeLaTeX 源生成
lib/env.js          LaTeX / 字体环境探测（真编译一次最小文档）
lib/compile.js      两遍 xelatex
lib/store.js        .jianbao/ 目录读写
lib/gate.js         预设门控
lib/style-corpus.js 63 篇蒸馏出的用词与结构规则 + reviewStyle()
preset/             「简报模式」预设（组合 YAML + 提示词 + 注册器）
tools/              安装、自测、几何对比、bundle 契约检查
docs/               FORMAT-SPEC.md（实测版式）、STYLE-GUIDE.md（文字风格）
```

## 许可

MIT
