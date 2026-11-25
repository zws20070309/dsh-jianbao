# dsh-tuiwen · 简报工作台

给 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)（DSH）加一个**简报工作台**：在界面里填基本信息 → 模型按版式规范写稿 → **XeLaTeX 编译出 PDF**。

原来的同类工具（参考文件里的 \`学院简报生成器.exe\`，v3.0.9）输出的是 Word，靠 python-docx 逐缇调版式。这个插件把同一套版式规范搬到 LaTeX 上，输出 PDF；没有 LaTeX 的机器上自动降级为「只出 .tex」，并在工作台顶部直说，而不是等到最后一步才失败。

---

## 版式（你给定的规范，一字不差）

| 项目 | 值 |
|------|-----|
| 纸张 | A4（210mm × 297mm） |
| 页边距 | 上 3.7cm　下 3.5cm　左 2.8cm　右 2.6cm |
| 行距 | **固定值 28.8 磅**（标题与全文一致） |
| 正文标题 | 2 号（22pt）方正小标宋 |
| 正文 | 3 号（16pt）方正仿宋_GBK，首行缩进 2 字符 |
| 一级标题 | 方正黑体简体 20pt |
| 二级标题 | 方正楷体_GBK 三号（16pt）加粗 |
| 三级标题 | 方正仿宋_GBK 三号（16pt）加粗 |
| 抄送区 | 仿宋 15pt，两条通栏横线，压在**最后一页**底部 |
| 页脚 | \`— N —\`，14pt，右对齐 |

这套常量集中在 [\`lib/brief.js\`](lib/brief.js) 的 \`LAYOUT\`，测试 [\`test/brief.test.mjs\`](test/brief.test.mjs) 逐条断言，改版式只改一处。

---

## 工作台在哪

会话主视图的**「简报」标签页**（和「对话 / 轨迹 / 上下文 / 统计」排在一起）。

为什么放这里而不是左侧栏：它服务的是一份**当前会话产出物**（\`.tuiwen/\`），与「对话/轨迹」是同一层概念——都在看这个会话里发生了什么；左栏是「我在哪台机器、哪个工作区」的导航，混进去会让导航和产出物混淆。

## 进入工作台后发生什么

1. **环境检测**（自动跑一次，可点「重新检测」）
   - 找 \`xelatex\`：先看 PATH，再扫 MiKTeX / TeX Live / MacTeX 的常见安装位置；
   - **真编译一次探针文档**判宏包齐不齐（不是看目录在不在）；
   - 扫中文字体，报告命中情况与是否装了方正字库。
   - 没有 LaTeX → 顶部红条直说「只能写简报并导出 .tex，无法编译 PDF」，其余功能照常。
2. **填基本信息**：简报类型（会议/活动/竞赛/讲座）、期号、主题名称、活动时间、出席领导、参加人群、活动流程、撰稿人/审签人/联系电话、抄送单位。
   - 每改一个字段就落盘（\`.tuiwen/form.json\`），刷新不丢。
3. **插图**（可选）：拖文件进来 → base64 → 宿主写进 \`.tuiwen/out/assets/\`；大图独占、小图成对并排。
4. **点「开始工作」**：把「基本信息 + 写作要求」作为一条消息发进当前会话，模型据此调用工具写稿。
5. **改稿走对话**：初稿出来后，直接在对话里说「第 2 段换个说法」「标题再短一点」，模型改 \`brief.json\` 并重新编译；工作台的「重新编译 PDF」只重跑 LaTeX，不重新写稿。

---

## 模型侧工具

| 工具 | 作用 |
|------|------|
| \`tuiwen_state\` | 读当前简报、表单、环境与产物清单（改稿前先读） |
| \`tuiwen_save\` | 提交**完整** \`blocks\` 写回 \`.tuiwen/brief.json\`，可选立即编译 |
| \`tuiwen_render\` | 用现有 \`brief.json\` 重新生成 .tex 并编译 PDF |

\`blocks\` 的类型：\`p\` 自然段 / \`h1\` \`h2\` \`h3\` 一二三级小标题 / \`image\` 单图 / \`imagePair\` 成对并排图。

工具会顺手做**结构体检**并回传 \`warnings\`（不是硬拦）：自然段应为 4 段、正文 400–600 字、标题 ≤ 60 字、正文里出现破折号或 AI 高频词。

## 写作纪律（已常驻会话提示词）

- 4 个自然段，400–600 字（不含标点）；
- 第 1 段 = 目的句 +「，X月X日，」插入语（不拆行）+ 主句 + 出席领导 + 参加人群；
- 用词跟类型走：会议/活动/竞赛/讲座；讲座用「主讲」不用「主持」；竞赛主题名含「大赛」全文用大赛；
- 领导：首次写「完整职务+姓名+同志」，再次只写「姓名+同志」，不许用「等领导」省略；没提供就一个都不写，改以组织单位作主语；
- 禁 AI 高频词（与此同时、值得注意的是、毋庸置疑、显而易见、总而言之、综上所述、标志着、至关重要…）、禁三项并列、破折号不作句内停顿；
- 不编造数据、获奖名单、领导原话。

---

## 安装

\`\`\`powershell
git clone https://github.com/zws20070309/dsh-tuiwen.git
cd dsh-tuiwen
powershell -ExecutionPolicy Bypass -File .\tools\install-link.ps1
\`\`\`

然后**完全退出并重启 DSH**（DSH 的 HMR 不监听插件目录，必须重启）。

<details>
<summary>脚本做了什么 / 卸载</summary>

三件事，改 profile 前先备份：

| # | 动作 | 落点 |
|---|------|------|
| 1 | 建目录联接指向源码目录 | \`<DSH_HOME>\plugins\dsh-tuiwen\` |
| 2 | \`dependencies\` 加 \`link:\` 依赖、\`dsh.profile.bundles\` 加一项 | \`<DSH_HOME>\profiles\desktop\package.json\` |
| 3 | 建 node_modules 联接 | \`<DSH_HOME>\profiles\desktop\node_modules\@zws\dsh-tuiwen\` |

\`\`\`powershell
.\tools\install-link.ps1 -Uninstall                     # 卸载（保留源码）
.\tools\install-link.ps1 -DshHome D:\dsh -ProfileName web
\`\`\`

</details>

## LaTeX 环境

需要 **XeLaTeX**（MiKTeX / TeX Live / MacTeX 任一）与这几个宏包：\`ctex\`、\`geometry\`、\`graphicx\`、\`xcolor\`、\`fancyhdr\`、\`calc\`。

MiKTeX 首次编译会自动装缺失宏包；装不上时工作台会把**缺哪个宏包**列出来，并附编译日志尾部。

字体：优先用方正字库（方正小标宋_GBK / 方正仿宋_GBK / 方正黑体简体 / 方正楷体_GBK）；没装方正时回落到系统自带的仿宋/黑体/楷体/宋体——版式与字号不变，字形略有差异。二/三级标题在系统字体上用伪粗（\`AutoFakeBold\`），保证「加粗」真的看得出来。

---

## 目录结构

\`\`\`
lib/index.js        宿主半：Remote 服务 tuiwen + 三只工具 + 系统提示段
lib/brief.js        版式常量、类型定义、日期/人名/字数/标题规则（纯函数）
lib/render-tex.js   BriefDoc → XeLaTeX 源（字体回落、转义、图注、抄送、页脚）
lib/env.js          LaTeX 与字体探测（真跑一次探针编译）
lib/compile.js      xelatex 两遍编译，失败回传日志
lib/store.js        .tuiwen/ 读写（原子写、图片入库、产物清单）
lib/tool.js         工具定义适配器（不复用官方 defineTool，见下）
lib/client.js       浏览器半：工作台面板 + Remote 描述符挂载
test/*.test.mjs     node --test，不依赖 DSH 也不依赖 LaTeX
\`\`\`

### 两个技术决定（都踩过坑）

**1. 为什么不 import \`@deepseek-ai/dsh-tools\` 的 \`defineTool\`**
本包经 junction 挂载，Node 按 realpath 解析模块入口，从仓库目录出发到不了 profile 的 \`node_modules/@deepseek-ai/\`；静态 import 会 \`ERR_MODULE_NOT_FOUND\`，整根 cordis fiber 建不起来——插件连工作台一起消失。所以 \`lib/tool.js\` 自己做了一遍「作者 DSL → 裸 JSON Schema」的编译（规则与官方 \`compilePropertyMap\` 一致：属性上的 \`required:true\` 收进 \`required\` 数组，输出 schema 不写 \`required\`），产物就是官方 \`register()\` 要的形状。

**2. 为什么图片走 base64 而不是 HTTP 上传路由**
DSH 的精确 Fetch 路由默认拒绝非 owner Peer（每条路由要自带 access rule）；简报插图通常只有几 MB，走 Remote 的 JSON 参数更简单、也少一层宿主内部契约。单张上限 12MB（解码后），超了明确报错让用户先压缩。

---

## 开发

\`\`\`powershell
node --test test/*.test.mjs     # 全部单测：不需要 DSH、不需要 LaTeX
node tools/selftest.mjs         # 端到端：建临时工作区 → 写稿 → 真编译（有 LaTeX 时）
\`\`\`

## 许可

MIT