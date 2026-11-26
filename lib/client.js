window.__ModuleLoader__.load({
  id: '@zws/dsh-jianbao',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const h = React.createElement

    // ── 这个文件长什么样，为什么 ────────────────────────────────────────────
    //  1. 所有 client bundle 会被拼成**一个脚本**执行，顶层 const 撞名会让整个拼合
    //     脚本（含官方 bundle）起不来。所以文件顶层零绑定，注册内联成一条
    //     window.__ModuleLoader__.load({...})。
    //  2. 没有构建步骤：require 只解析 react，不 import 任何 DSH 包。
    //  3. 每个槽位注册都包 try/catch：register 抛错会连带炸掉整个 apply()。
    //
    // ── 挂载面 ────────────────────────────────────────────────────────────
    //   conversation.view  kind:list  id=tab key  label=tab 文字
    //   官方 tab 栏就是遍历这个槽位的注册项生成的（dsh-client-ui-conversation
    //   apply.ts:210-222），所以注册一项就多一个「简报」标签。
    //
    // ── 数据从哪来 ────────────────────────────────────────────────────────
    //   全部走 remote.jianbao（宿主半的 JianbaoService）：
    //     snapshot / saveForm / uploadImage / save / compile / log / pdf
    //   面板自己不读文件、不跑 LaTeX —— 浏览器没有那个权限，也不该有。

    const PACKAGE = '@zws/dsh-jianbao'
    const NS = 'jianbao'
    const PANEL_ID = 'jianbao-workbench'

    const zh = {
      'meta.title': '简报',
      'nav': '简报',
      'panel.title': '简报工作台',
      'panel.subtitle': '填写基本信息 → 开始工作 → 出一份符合版式规范的 PDF',
      'env.checking': '正在检测本机环境…',
      'env.ok': 'LaTeX 环境就绪，可以编译 PDF',
      'env.ok.with': 'LaTeX 环境就绪（xelatex：{path}）',
      'env.nolatex': '未检测到 LaTeX 环境：只能写简报并导出 .tex 源码，无法编译 PDF',
      'env.nopkg': 'LaTeX 环境不完整，缺少宏包：{list}',
      'env.fonts': '中文字体：{roles}',
      'env.fontsMissing': '缺少中文字体：{list}（会回落到可用字体）',
      'env.fangzheng': '方正字库：{list}',
      'env.retry': '重新检测',
      'section.base': '一、基本信息',
      'section.images': '二、插图（可选）',
      'section.go': '三、开始工作',
      'field.type': '简报类型',
      'field.issue': '期号',
      'field.topic': '主题名称',
      'field.time': '活动时间',
      'field.leader': '出席领导',
      'field.audience': '参加人群',
      'field.flow': '活动流程要点',
      'field.author': '撰稿人',
      'field.auditor': '审签人',
      'field.phone': '联系电话',
      'field.cc': '抄送单位',
      'field.org': '报头单位',
      'tip.topic': '如「第三届心理健康知识竞赛」；竞赛类不写「大赛」会自动补',
      'ph.time': '2026年4月27日 14:30',
      'ph.timeStart': '2026年4月20日',
      'ph.timeEnd': '4月24日',
      'time.single': '单日',
      'time.range': '时间段',
      'tip.time': '单日就填一个日期；跨几天就切到「时间段」填起止（跨月也行）。「4月20日、22日」表示分几天办。',
      'tip.leader': '顿号分隔多位；不填则正文不出现领导',
      'tip.audience': '下拉选或直接输入',
      'tip.flow': '顿号、分号或换行分隔各环节，模型据此展开正文',
      'tip.phone': '写入报头「联系方式」',
      'tip.cc': '每行一个，通常两行',
      'img.add': '添加图片',
      'img.empty': '还没有图片。图片会按顺序插到正文对应段落，大图独占、小图成对并排。',
      'img.remove': '移除',
      'img.uploading': '正在上传 {name}…',
      'img.failed': '上传失败：{msg}',
      'btn.start': '开始工作',
      'btn.starting': '正在交给模型写作…',
      'btn.recompile': '重新编译 PDF',
      'btn.compiling': '编译中…',
      'btn.pdf': '打开 PDF',
      'btn.download': '下载 PDF',
      'btn.showLog': '查看编译日志',
      'btn.hideLog': '收起日志',
      'status.idle': '还没有开始。填完上面的信息后点「开始工作」。',
      'status.working': '模型正在写稿，写完后会自动编译 PDF；也可以在对话里让它接着改。',
      'status.ready': 'PDF 已生成：{pages} 页，正文 {chars} 字。',
      'status.warn': '版式提醒：{list}',
      'status.failed': '编译失败：{msg}',
      'status.nolatexDone': '简报源文件已生成（.jianbao/out/brief.tex），但本机没有 LaTeX，编译不出 PDF。装好 TeX 后点「重新编译 PDF」即可。',
      'status.saved': '已保存',
      'status.sending': '已把写作任务交给模型',
      'phase.writing': '模型正在按素材拟稿',
      'phase.draft': '草稿已落盘，正在补全版式字段',
      'phase.tex': 'LaTeX 源文件已生成，正在编译',
      'phase.pdf': 'PDF 已生成',
      'phase.idle': '待开始',
      'preview.size.s': '紧凑',
      'preview.size.m': '常规',
      'preview.size.l': '展开',
      'error.remote': '浏览器端读不到简报服务（remote.jianbao 未就绪），请重启 DSH 后再试。',
      'error.noSession': '当前还没有会话。先在左侧新建一个任务（选「简报模式」），再回到这里填表。',
      'error.nothing': '请至少填写主题名称与活动流程',
      'log.title': '编译日志（尾部）',
      'spec.title': '版式规范',
      'preview.title': '成稿预览',
      'preview.empty': '编译出 PDF 后这里会内嵌预览。',
      'clear': '清空表单',
      'openFolder': '产物目录：{dir}',
      'fallback.hint': '自动发送没成功（会话作用域不可用）。下面这段就是完整的写作任务书，复制到输入框发出去效果一样：',
    }

    const en = {
      'meta.title': 'Briefing',
      'nav': 'Briefing',
      'panel.title': 'Briefing workbench',
      'panel.subtitle': 'Fill in the basics → start → get a formatted PDF',
      'env.checking': 'Checking local environment…',
      'env.ok': 'LaTeX is ready; PDF output available',
      'env.ok.with': 'LaTeX is ready (xelatex: {path})',
      'env.nolatex': 'No LaTeX found: you can still write the brief and export .tex, but no PDF can be compiled',
      'env.nopkg': 'LaTeX is incomplete; missing packages: {list}',
      'env.fonts': 'CJK fonts: {roles}',
      'env.fontsMissing': 'Missing CJK fonts: {list} (falling back)',
      'env.fangzheng': 'Fangzheng fonts: {list}',
      'env.retry': 'Re-check',
      'section.base': '1. Basics',
      'section.images': '2. Images (optional)',
      'section.go': '3. Start',
      'field.type': 'Type',
      'field.issue': 'Issue',
      'field.topic': 'Topic',
      'field.time': 'Date',
      'field.leader': 'Leaders',
      'field.audience': 'Audience',
      'field.flow': 'Agenda',
      'field.author': 'Author',
      'field.auditor': 'Approver',
      'field.phone': 'Phone',
      'field.cc': 'CC',
      'field.org': 'Organisation',
      'tip.topic': 'e.g. the 3rd mental-health quiz',
      'ph.time': '2026-04-27 14:30',
      'ph.timeStart': '2026-04-20',
      'ph.timeEnd': 'Apr 24',
      'time.single': 'Single day',
      'time.range': 'Date range',
      'tip.time': 'One date for a single day; switch to Date range for a span (months may differ). A comma list means separate days.',
      'tip.leader': 'Separate with 、; leave empty to omit leaders',
      'tip.audience': 'Pick or type',
      'tip.flow': 'Separate agenda items with 、 ; or newlines',
      'tip.phone': 'Printed in the masthead',
      'tip.cc': 'One per line, usually two',
      'img.add': 'Add images',
      'img.empty': 'No images yet. They are inserted next to the matching paragraph; large ones stand alone, small ones pair up.',
      'img.remove': 'Remove',
      'img.uploading': 'Uploading {name}…',
      'img.failed': 'Upload failed: {msg}',
      'btn.start': 'Start',
      'btn.starting': 'Handing to the model…',
      'btn.recompile': 'Recompile PDF',
      'btn.compiling': 'Compiling…',
      'btn.pdf': 'Open PDF',
      'btn.download': 'Download PDF',
      'btn.showLog': 'Show compile log',
      'btn.hideLog': 'Hide log',
      'status.idle': 'Not started. Fill the form and press Start.',
      'status.working': 'The model is writing; the PDF is compiled automatically. You can keep refining in the chat.',
      'status.ready': 'PDF ready: {pages} page(s), {chars} characters.',
      'status.warn': 'Layout notes: {list}',
      'status.failed': 'Compile failed: {msg}',
      'status.nolatexDone': 'Source written to .jianbao/out/brief.tex, but no LaTeX here, so no PDF. Install TeX and press Recompile.',
      'status.saved': 'Saved',
      'status.sending': 'Writing task queued',
      'phase.writing': 'Drafting from your material',
      'phase.draft': 'Draft saved, filling layout fields',
      'phase.tex': 'LaTeX written, compiling',
      'phase.pdf': 'PDF ready',
      'phase.idle': 'Not started',
      'preview.size.s': 'Compact',
      'preview.size.m': 'Normal',
      'preview.size.l': 'Large',
      'error.remote': 'remote.jianbao is not ready; restart DSH and retry.',
      'error.noSession': 'No session yet. Start a task on the left (pick the Briefing preset), then come back here.',
      'error.nothing': 'Topic and agenda are required',
      'log.title': 'Compile log (tail)',
      'spec.title': 'Layout spec',
      'preview.title': 'Preview',
      'preview.empty': 'The compiled PDF is previewed here.',
      'clear': 'Clear form',
      'openFolder': 'Outputs: {dir}',
      'fallback.hint': 'Automatic send failed (session scope unavailable). Copy this task into the composer:',
    }

    const DICT = { zh, en }
    // ── 样式 ────────────────────────────────────────────────────────────────
    // 全部挂在 .dsh-tw 前缀下，不与官方样式打架；颜色用 DSH 主题变量并带兜底值，
    // 这样深色主题下也读得清（参考实现的老版深色主题踩过这个坑）。
    const CSS = String.raw`
.dsh-tw{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;
color:var(--dsw-alias-label-primary,#1f2328);font-family:inherit}
.dsh-tw *{box-sizing:border-box}
.dsh-tw-scroll{flex:1;min-height:0;overflow:auto;padding:16px 20px 28px}
.dsh-tw-head{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}
.dsh-tw-head h2{margin:0;font-size:15px;font-weight:600}
.dsh-tw-head span{color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px}
/* 版本角标：靠右、低调，只用来核对"加载的是哪一版"，不抢视觉。 */
.dsh-tw-head .dsh-tw-ver{margin-left:auto;flex:none;font-size:11px;line-height:1;
padding:3px 6px;border-radius:5px;color:var(--dsw-alias-label-secondary,#6b7280);
background:var(--dsw-alias-bg-l2,rgba(127,127,127,.1));cursor:default;user-select:none}

.dsh-tw-env{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-radius:8px;
border:1px solid var(--dsw-alias-border-default,#e3e6ea);margin-bottom:14px;line-height:1.6}
.dsh-tw-env[data-state="ok"]{border-color:color-mix(in srgb,#2ea043 40%,transparent);
background:color-mix(in srgb,#2ea043 8%,transparent)}
.dsh-tw-env[data-state="warn"]{border-color:color-mix(in srgb,#d29922 45%,transparent);
background:color-mix(in srgb,#d29922 9%,transparent)}
.dsh-tw-env[data-state="bad"]{border-color:color-mix(in srgb,#e5484d 45%,transparent);
background:color-mix(in srgb,#e5484d 8%,transparent)}
.dsh-tw-env-body{flex:1;min-width:0}
.dsh-tw-env-title{font-weight:600}
.dsh-tw-env-sub{color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;margin-top:2px;
word-break:break-all}
.dsh-tw-env button{flex:none}

.dsh-tw h3{margin:18px 0 10px;font-size:13px;font-weight:600;
color:var(--dsw-alias-label-primary,#1f2328)}
.dsh-tw h3:first-of-type{margin-top:0}

/* ── 表单栅格 ─────────────────────────────────────────────────────
   原参数：gap 10/14、field gap 4、input padding 6/8。右边栏本来就窄，
   这些值挤在一起显得局促；放宽一档，同时把标签与输入框的区分度做出来。 */
/* box-sizing 必须显式写：面板里 .dsh-tw-field input 是 width:100% + padding，
   不设 border-box 就会溢出容器右边被裁掉（已在 headless 渲染里复现）。 */
/* box-sizing 必须显式写：.dsh-tw-field input 是 width:100% + padding，
   不设 border-box 就会溢出容器右边被裁掉（headless 渲染里复现过两次）。 */
.dsh-tw,.dsh-tw *,.dsh-tw *::before,.dsh-tw *::after{box-sizing:border-box}

/* 栅格：**默认单列**。
   实测过 auto-fit + minmax 的三种下限（220px / min(100%,200px) / 160px），
   在 390px 宽的右侧栏里全部强行分两列、右边被裁 —— 因为 minmax 的下限
   只是"理想最小"，auto-fit 仍会塞两列。
   右侧栏本来就只有 300–420px，两列每列不到 200px，输入框根本不够用。
   所以：窄容器一律单列；只有容器真的够宽（≥520px，比如把右栏拉宽）才两列。 */
.dsh-tw-grid{display:grid;grid-template-columns:minmax(0,1fr);
  gap:14px 16px;align-items:start;min-width:0}
/* 面板根也要防撑破：任何子元素固有宽度过大时，容器必须能约束住它 */
.dsh-tw{min-width:0;overflow-x:hidden}
@media (min-width: 520px) {
  .dsh-tw-grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
}
.dsh-tw-field{display:flex;flex-direction:column;gap:6px;min-width:0;max-width:100%}
/* 时间字段永远独占整行（它自带两个输入框 + 分段控件） */
.dsh-tw-field--time{grid-column:1/-1}
.dsh-tw-field.wide{grid-column:1/-1}
.dsh-tw-field label{font-size:12px;font-weight:500;letter-spacing:.01em;
  color:var(--dsw-alias-label-secondary,#6b7280)}
.dsh-tw-field input,.dsh-tw-field textarea,.dsh-tw-field select{width:100%;padding:8px 10px;
  border-radius:8px;border:1px solid var(--dsw-alias-border-default,#d7dbe0);
  background:var(--dsw-alias-bg-surface,#fff);color:inherit;font:inherit;line-height:1.5;
  outline:none;transition:border-color .14s,box-shadow .14s}
.dsh-tw-field input::placeholder,.dsh-tw-field textarea::placeholder{color:var(--dsw-alias-label-tertiary,#9aa4b2)}
.dsh-tw-field textarea{resize:vertical;min-height:72px}
.dsh-tw-field input:focus,.dsh-tw-field textarea:focus,.dsh-tw-field select:focus{
  border-color:var(--dsw-alias-brand-primary,#2563eb);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 16%,transparent)}
.dsh-tw-tip{font-size:11px;line-height:1.55;color:var(--dsw-alias-label-tertiary,#8b949e)}

.dsh-tw-imgs{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}
.dsh-tw-thumb{position:relative;width:112px;border-radius:8px;overflow:hidden;
border:1px solid var(--dsw-alias-border-default,#e3e6ea);background:#0b0d10}
.dsh-tw-thumb img{display:block;width:100%;height:80px;object-fit:cover}
.dsh-tw-thumb button{position:absolute;top:4px;right:4px;padding:1px 6px;font-size:11px;
border-radius:5px;border:0;background:rgba(0,0,0,.62);color:#fff;cursor:pointer}
.dsh-tw-thumb-name{padding:3px 6px;font-size:10px;color:var(--dsw-alias-label-secondary,#9aa4b2);
white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-tw-drop{display:flex;align-items:center;gap:10px;margin-top:6px}

.dsh-tw-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}
.dsh-tw button{cursor:pointer;font:inherit;border-radius:7px;padding:6px 14px;
border:1px solid var(--dsw-alias-border-default,#d7dbe0);
background:var(--dsw-alias-bg-surface,#fff);color:inherit;transition:background .12s,border-color .12s}
.dsh-tw button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))}
.dsh-tw button:disabled{opacity:.55;cursor:default}
.dsh-tw button.primary{background:var(--dsw-alias-brand-primary,#2563eb);border-color:transparent;
color:#fff;font-weight:600}
.dsh-tw button.primary:hover:not(:disabled){filter:brightness(1.06)}
.dsh-tw button.link{border:0;background:transparent;padding:2px 4px;color:var(--dsw-alias-brand-primary,#2563eb)}

.dsh-tw-status{margin-top:12px;padding:9px 12px;border-radius:8px;line-height:1.65;
border:1px solid var(--dsw-alias-border-default,#e3e6ea);
background:color-mix(in srgb,currentColor 4%,transparent)}
.dsh-tw-status[data-kind="ok"]{border-color:color-mix(in srgb,#2ea043 40%,transparent)}
.dsh-tw-status[data-kind="bad"]{border-color:color-mix(in srgb,#e5484d 45%,transparent)}
.dsh-tw-status[data-kind="warn"]{border-color:color-mix(in srgb,#d29922 45%,transparent)}

/* ── 时间字段：标签与分段控件同行，输入框整行 ─────────────────── */
.dsh-tw-field-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:18px}
.dsh-tw-field-head label{margin:0}

/* 分段控件（segmented control）。
   刻意不用 .dsh-tw button 的样式：那个规则 padding:6px 14px 会把两个小按钮
   撑成大方块，一行顶掉整个表单的节奏。这里自己定尺寸，并且 specificity
   压过 .dsh-tw button（加 .dsh-tw 前缀）。 */
.dsh-tw .dsh-tw-seg{display:inline-flex;flex:0 0 auto;padding:2px;gap:2px;
  border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-secondary,#6b7280) 10%,transparent)}
.dsh-tw .dsh-tw-seg-item{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);
  cursor:pointer;font:inherit;font-size:11.5px;line-height:1;padding:5px 10px;border-radius:6px;
  transition:background .14s,color .14s,box-shadow .14s}
.dsh-tw .dsh-tw-seg-item:hover:not([data-on="1"]){background:color-mix(in srgb,currentColor 8%,transparent)}
.dsh-tw .dsh-tw-seg-item[data-on="1"]{background:var(--dsw-alias-bg-surface,#fff);color:inherit;font-weight:600;
  box-shadow:0 1px 2px rgba(0,0,0,.12)}
/* 两个输入框平分宽度。
   flex:1 1 0 看着对，但 input 的**固有宽度**（default size≈20 字符）会让
   min-width:auto 撑住它 —— 实测两个框各 223px、加起来 446px，
   把整个 grid 撑到 472px 顶出容器。
   所以必须写 width:0 + min-width:0 两头夹住，让它真能被压缩。 */
.dsh-tw-timerange{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-tw-timerange input{flex:1 1 0%;width:0;min-width:0}
.dsh-tw-timerange-sep{flex:0 0 auto;font-size:12px;opacity:.4;user-select:none}
.dsh-tw-progress{margin-top:12px;padding:11px 13px;border-radius:9px;
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-secondary,#6b7280) 22%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 60%,transparent)}
.dsh-tw-progress-head{display:flex;justify-content:space-between;align-items:baseline;
  font-size:12.5px;margin-bottom:7px;color:var(--dsw-alias-label-primary,#111)}
.dsh-tw-progress-pct{font-variant-numeric:tabular-nums;opacity:.62;font-size:11.5px}
.dsh-tw-progress-track{height:5px;border-radius:999px;overflow:hidden;
  background:color-mix(in srgb,var(--dsw-alias-label-secondary,#6b7280) 16%,transparent)}
.dsh-tw-progress-bar{height:100%;border-radius:999px;transition:width .45s ease;
  background:linear-gradient(90deg,#4f8cff,#7b6cff)}
.dsh-tw-progress-steps{display:flex;gap:10px;margin-top:8px;flex-wrap:wrap}
.dsh-tw-progress-step{font-size:11px;opacity:.42}
.dsh-tw-progress-step[data-on="1"]{opacity:.9}
.dsh-tw-progress[data-phase="pdf"] .dsh-tw-progress-bar{background:linear-gradient(90deg,#2ea043,#3fb950)}


.dsh-tw-fallback{width:100%;margin-top:6px;padding:8px 10px;border-radius:8px;
border:1px solid var(--dsw-alias-border-default,#d7dbe0);background:var(--dsw-alias-bg-surface,#fff);
color:inherit;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;line-height:1.6;resize:vertical}
.dsh-tw-log{margin-top:10px;max-height:260px;overflow:auto;padding:10px 12px;border-radius:8px;
background:#0f1115;color:#d6dbe3;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
font-size:11.5px;line-height:1.55;white-space:pre-wrap;word-break:break-all}

.dsh-tw-preview{margin-top:18px;border-top:1px solid var(--dsw-alias-border-default,#e3e6ea);
padding-top:14px}
/* 标题行：左边「成稿预览」，右边工具组（三档高度 + 打开 PDF）。
   这两个类之前**从来没定义过** —— 所以 a[] 那几个按钮是裸 <button>，
   .dsh-tw button 的 padding 会把它撑成大方块，点击也无反馈。 */
.dsh-tw-preview h3{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  margin:0 0 10px;font-size:13px;font-weight:600}
.dsh-tw-preview-tools{display:inline-flex;align-items:center;gap:4px;margin-left:auto;flex-wrap:wrap}
.dsh-tw .dsh-tw-preview-tools button{font:inherit;font-size:11.5px;line-height:1;
  /* font:inherit 会把 h3 的 600 一起继承下来，导致「未选中」也看着是粗体，
     选中态就失去对比。显式压回 400。 */
  font-weight:400;
  padding:5px 9px;border-radius:6px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-default,#d7dbe0);
  background:var(--dsw-alias-bg-surface,#fff);color:inherit;
  transition:background .14s,border-color .14s,font-weight .14s}
.dsh-tw .dsh-tw-preview-tools button:hover:not(:disabled){background:color-mix(in srgb,currentColor 8%,transparent)}
.dsh-tw .dsh-tw-preview-size[data-on="1"]{font-weight:600;
  border-color:color-mix(in srgb,#4f8cff 55%,transparent);
  background:color-mix(in srgb,#4f8cff 12%,transparent)}
.dsh-tw-preview-empty{color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px}
/* 预览框：三档高度都**明显**比原来的 200px 高，窄栏里也够看半页。
   iframe 用绝对定位撑满，避免 height:100% 在 flex 容器里算不出来。 */
.dsh-tw-preview-frame{position:relative;width:100%;border-radius:9px;overflow:hidden;
  border:1px solid var(--dsw-alias-border-default,#d7dbe0);
  background:var(--dsw-alias-bg-surface,#fff);
  transition:height .18s ease}
.dsh-tw-preview-frame[data-size="s"]{height:340px}
.dsh-tw-preview-frame[data-size="m"]{height:520px}
.dsh-tw-preview-frame[data-size="l"]{height:78vh;min-height:620px}
.dsh-tw-preview-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}

.dsh-tw-spec{margin-top:14px;font-size:12px;line-height:1.8;
color:var(--dsw-alias-label-secondary,#6b7280)}
.dsh-tw-spec code{font-family:ui-monospace,Consolas,monospace;font-size:11.5px}
.dsh-tw-spec-note{margin-top:6px;opacity:.75;font-size:11.5px}
@media (max-width:720px){.dsh-tw-thumb{width:calc(50% - 5px)}}
`
    // ── Remote 描述符 ──────────────────────────────────────────────────────
    // 浏览器要给宿主发调用，必须先把「这个方法叫什么、参数怎么走线」登记进 api-gateway。
    // 依据：dsh-api-gateway/lib/client.js:1636 的 $mount(contribution)；它会
    // validateContribution → 建 remote.<namespace> 服务 → 安装每个方法。
    // 三条硬约束（同文件 :2067-2075、:2049-2066）：
    //   · 每个参数必须有 strict codec，否则直接拒绝挂载；
    //   · 命名空间不能和已有服务撞名；
    //   · 参数按数组顺序位置传值，参数名只是说明。
    const codec = (name, parse) => ({
      mode: 'strict',
      typeSymbol: PACKAGE + '#' + name,
      create: () => ({ parse: parse ?? ((value) => value) }),
    })
    const sessionIdCodec = codec('SessionId', (value) => {
      if (typeof value !== 'string' || value.length === 0) throw new Error('expected a non-empty session id')
      return value
    })
    const jsonCodec = codec('Json')
    const boolCodec = codec('Boolean', (value) => value === true)
    const stringCodec = codec('String', (value) => (typeof value === 'string' ? value : String(value ?? '')))

    const CONTRIBUTION = {
      package: PACKAGE,
      descriptors: [
        {
          id: PACKAGE + '#jianbao/snapshot',
          service: 'jianbao',
          namespace: 'jianbao',
          method: 'snapshot',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec }],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#jianbao/env',
          service: 'jianbao',
          namespace: 'jianbao',
          method: 'env',
          invocation: { kind: 'direct' },
          parameters: [
            { name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec },
            { name: 'force', wire: 'force', source: 'json', codec: boolCodec },
          ],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#jianbao/saveForm',
          service: 'jianbao',
          namespace: 'jianbao',
          method: 'saveForm',
          invocation: { kind: 'direct' },
          parameters: [
            { name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec },
            { name: 'form', wire: 'form', source: 'json', codec: jsonCodec },
          ],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#jianbao/uploadImage',
          service: 'jianbao',
          namespace: 'jianbao',
          method: 'uploadImage',
          invocation: { kind: 'direct' },
          parameters: [
            { name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec },
            { name: 'name', wire: 'name', source: 'json', codec: stringCodec },
            { name: 'dataBase64', wire: 'dataBase64', source: 'json', codec: stringCodec },
          ],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#jianbao/save',
          service: 'jianbao',
          namespace: 'jianbao',
          method: 'save',
          invocation: { kind: 'direct' },
          parameters: [
            { name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec },
            { name: 'brief', wire: 'brief', source: 'json', codec: jsonCodec },
            { name: 'compile', wire: 'compile', source: 'json', codec: boolCodec },
          ],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#jianbao/compile',
          service: 'jianbao',
          namespace: 'jianbao',
          method: 'compile',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec }],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#jianbao/log',
          service: 'jianbao',
          namespace: 'jianbao',
          method: 'log',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec }],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#jianbao/pdf',
          service: 'jianbao',
          namespace: 'jianbao',
          method: 'pdf',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec }],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#jianbao/gate',
          service: 'jianbao',
          namespace: 'jianbao',
          method: 'gate',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec }],
          result: jsonCodec,
        },
      ],
    }

    /** 只插一次样式表。 */
    function installStyles() {
      if (typeof document === 'undefined') return
      const tagId = PACKAGE + '/jianbao.css'
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = PACKAGE
      tag.dataset.pluginCss = tagId
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /** 文案：优先用注册时绑定的 t，缺 key 就回落到内置字典，再缺就显示 key。 */
    function makeT(t) {
      return (key, vars) => {
        let text
        if (typeof t === 'function') {
          try {
            text = t(key, vars)
          } catch {
            text = undefined
          }
        }
        if (typeof text !== 'string' || text === key) {
          const dict = DICT.zh
          text = dict[key] ?? key
        }
        if (vars !== undefined && vars !== null) {
          for (const [k, v] of Object.entries(vars)) text = text.split('{' + k + '}').join(String(v))
        }
        return text
      }
    }

    /** Remote 结果统一是 { ok, value } | { ok, error } 判别联合。 */
    function unwrap(result) {
      if (result !== null && typeof result === 'object') {
        if (result.ok === true) return result.value
        if (result.ok === false) throw new Error(result.error && result.error.message ? result.error.message : 'remote call failed')
      }
      throw new Error('remote returned a non-Result shape')
    }

    /**
     * 把内部错误翻成人话。
     * 「remote.jianbao is not mounted」这种句子不该直接怼到中文界面上 ——
     * 用户唯一能做的事是重启 DSH，那就把这句话说出来。
     */
    function describeError(error, t) {
      const message = String(error && error.message ? error.message : error)
      if (/remote\.jianbao|not mounted/iu.test(message)) return t('error.remote')
      return message
    }

    /** 取简报 Remote 命名空间（惰性：apply 时它可能还没挂上）。 */
    function apiOf(ctx) {
      return () => {
        const direct = typeof ctx.get === 'function' ? ctx.get('remote.jianbao') : undefined
        if (direct !== undefined && direct !== null) return direct
        const remote = typeof ctx.get === 'function' ? ctx.get('remote') : undefined
        const namespace = remote === undefined || remote === null ? undefined : remote.jianbao
        if (namespace === undefined || namespace === null) throw new Error('remote.jianbao is not mounted')
        return namespace
      }
    }


    /** 判断表单里的时间是不是区间写法（用于决定显示一个框还是两个）。 */
    function isRangeTime(text) {
      return /(?:日至|号至|至\s*\d|—|–|~|～)/u.test(String(text ?? ''))
    }

    /** 把「4月20日至24日」拆回 [起点, 终点]，供两个输入框回填。 */
    function splitRange(text) {
      const raw = String(text ?? '').trim()
      const m = /^(.*?)\s*(?:至|到|—|–|~|～|-)\s*(.+)$/u.exec(raw)
      if (m === null) return { start: raw, end: '' }
      return { start: m[1].trim(), end: m[2].trim() }
    }

    /** 两个输入框拼回一个时间字符串。终点为空就只留起点。 */
    function joinRange(start, end) {
      const a = String(start ?? '').trim()
      const b = String(end ?? '').trim()
      if (a === '') return b
      if (b === '') return a
      return a + ' 至 ' + b
    }

    /** 表单默认值。 */
    function emptyForm() {
      return {
        briefType: 'activity',
        issue: '第' + (new Date().getMonth() + 1) + '期',
        topic: '',
        activityTime: '',
        leaderName: '',
        audience: '',
        activityFlow: '',
        author: '',
        auditor: '',
        phone: '',
        cc: '校领导、院领导\n党委（校长）办公室、党委宣传部',
        org: '西藏大学理学院',
        images: [],
      }
    }

    const TYPES = [
      { id: 'meeting', label: '会议简报' },
      { id: 'activity', label: '活动简报' },
      { id: 'contest', label: '竞赛简报' },
      { id: 'lecture', label: '讲座简报' },
    ]

    const AUDIENCES = [
      '2026级新生', '全体学生', '全体班主任', '班主任及学生代表',
      '入党积极分子', '各班团支书', '参赛选手及学生代表', '学生会全体成员',
      '2026级应用物理班全体学生', '2026级物理班师生',
    ]
    /**
     * 把表单变成交给模型的任务书。
     *
     * 两条原则：
     *   1. 字段缺什么就明说“未提供”，让模型知道该留白还是该问 —— 不让它编；
     *   2. 类型决定动词与写法要点，别让模型自己猜这是会议还是活动。
     *
     * @param {object} form 工作台表单
     * @param {string[]} images 已上传图片的相对路径
     * @returns {string} 任务书正文
     */
    function buildTask(form, images) {
      // 动词/名词按类型定，与宿主 SPEC.types 一致；TYPES 本身只有 id+label。
      const VERB = { meeting: '召开', activity: '开展', contest: '举办', lecture: '开展' }
      const NOUN = { meeting: '会议', activity: '活动', contest: '竞赛', lecture: '讲座' }
      const type = TYPES.find((x) => x.id === form.briefType) || TYPES[1]
      type.verb = VERB[type.id] ?? '开展'
      type.noun = NOUN[type.id] ?? '活动'
      const need = (value, label) => {
        const text = String(value ?? '').trim()
        return text === '' ? '- ' + label + '：**用户未提供**' : '- ' + label + '：' + text
      }

      const lines = []
      lines.push('请为西藏大学理学院写一篇《信息》简报，并按工作台的版式编译成 PDF。')
      lines.push('')
      lines.push('【基本信息】')
      lines.push('- 简报类型：' + type.label + '（动词用「' + type.verb + '」，名词用「' + type.noun + '」）')
      lines.push(need(form.issue, '期号'))
      lines.push(need(form.topic, '主题名称'))
      // 时间可能是单个时刻，也可能是区间（4月20日至24日）。任务书里明确标出
      // 是哪一种，模型才不会把「20日至24日」写成「20日下午」。
      const rawTime = String(form.activityTime ?? '').trim()
      if (rawTime === '') {
        lines.push('- 时间：**用户未提供**')
      } else if (/(?:日至|号至|至\d|、\d{1,2}日)/u.test(rawTime)) {
        lines.push('- 时间：' + rawTime + '（**这是时间段，不是一个时刻**；正文写「X月X日至X日」或「X月X日、X日」，不要写成某天某时）')
      } else {
        lines.push('- 时间：' + rawTime)
      }
      lines.push(need(form.leaderName, '出席领导'))
      lines.push(need(form.audience, '参加人员'))
      if (String(form.activityFlow ?? '').trim() !== '') {
        lines.push('- 过程与讲话要点：')
        for (const line of String(form.activityFlow).split(/\n+/u).map((s) => s.trim()).filter((s) => s !== '')) {
          lines.push('  · ' + line)
        }
      } else {
        lines.push('- 过程与讲话要点：**用户未提供**（缺这个就别硬编过程，先问用户）')
      }
      lines.push(need(form.author, '撰稿人'))
      lines.push(need(form.auditor, '审签人'))
      lines.push(need(form.phone, '联系方式'))
      if (images.length > 0) {
        lines.push('- 插图：' + images.length + ' 张，已在 .jianbao/out/ 下：' + images.join('、'))
      }
      lines.push('')
      lines.push('【写法要点】（这些是 63 篇真实简报蒸馏出来的，违反就是不合格）')
      if (type.id === 'meeting') {
        lines.push('- 第 1 段写「为…，X月X日，学院' + type.verb + type.noun + '」，点明议题；中段按"谁讲话、讲了什么"组织，不写「会议强调」流水账。')
      } else if (type.id === 'contest') {
        lines.push('- 主题名里含「大赛」全文用「大赛」，含「比赛」用「比赛」，不要混用；中段写赛制与选手表现，末段前加「经过多轮激烈角逐」。')
      } else if (type.id === 'lecture') {
        lines.push('- 统一用「讲座」，用「主讲」不用「主持」；中段写主讲内容的分点，不写成会议纪要。')
      } else {
        lines.push('- 中段按环节顺序写，每个环节一句，不堆形容词；有互动就写互动。')
      }
      lines.push('- 3–5 个自然段（4 段最常见），正文 400–700 字（样本中位 618）；末段以「此次」或「本次」开头。')
      lines.push('- 领导首次出场写「职务+姓名+同志」，再次出场只写「姓名+同志」。')
      lines.push('')
      lines.push('【执行】')
      lines.push('1. 先调 jianbao_state 读工程与环境；canCompilePdf 为 false 时只交 .tex 并说明缺什么。')
      lines.push('2. 按上面的要点写稿，调 jianbao_save 提交**完整** blocks 并编译；有 warnings 就改到没有。')
      lines.push('3. 有插图时用 image / imagePair 块插到对应段落之后，图注写「图片1 …」。')
      lines.push('4. 编译失败按日志修，不要说「环境问题」了事。')
      lines.push('5. 完成后一句话汇报：PDF 路径、页数、字数、还有什么需要用户确认。')
      return lines.join('\n')
    }

    /**
     * 发一条消息进指定会话。
     *
     * ## 为什么不走 conversation.send
     *
     * `conversation` 是**作用域寻址**的服务，它不认识 sessionId，只认发送方
     * ctx 上的 scope 标记：
     *
     *   // dsh-client-ui-conversation/lib/client.js @130894
     *   scopeId(op) {
     *     const id = this.requireSessions().scopeOf(this.ctx);
     *     if (id === void 0) throw new Error(
     *       `conversation.${op} requires a session scope — address one via ctx.sessions.scope(id).conversation`)
     *     return id
     *   }
     *
     * 右栏工作台挂在 root scope 上，scopeOf 拿到 undefined，所以必然抛错。
     * 要绕就得先 materialize 那个会话的作用域，而 `sessions.scope(id)` 在
     * retain 之前恒为 undefined（materializeScope 只在 retainScope 里调），
     * 绕完还要赌 cordis 的 traceable 代理把 this.ctx 重绑到作用域上。
     *
     * ## 直接用它自己用的那条原语
     *
     * conversation.send 的实体只有三行，转手给 binding.session：
     *
     *   // dsh-client-ui-conversation @130894
     *   async send(text) {
     *     const result = await this.scopedSession('send').prompt([{type:'text',text}], 'queue')
     *     if (!result.ok) throw new Error(`conversation.send failed: …`)
     *   }
     *   scopedSession(op) { return this.requireSessions().binding(id).session }
     *
     * 也就是 binding.session.prompt(content, mode)；签名见
     * dsh-api-session-controller @45408 `async prompt(content, mode, signal, requestId)`，
     * 返回 `{ok:true,value}` / `{ok:false,error}` 的 Result，失败不抛异常。
     * 这条路不读作用域，只读 binding，效果与官方等价。
     *
     * ## 先偷看、偷不到才借（顺序照抄官方）
     *
     * 官方 send **从不 retain**，只读已有 binding——主对话视图本身就占着引用。
     * 所以这里也先 `sessions.binding(id)`：拿到就直接发，不打扰引用计数。
     * 拿不到（会话没被任何视图 retain）才借：
     *
     *   sessions.using(id, opts, op) ≡ retain → await ready → op(ref) → release
     *    （dsh-api-session-controller @84624 async using 的实现原文）
     *
     * `ready` 由 attachOpening 在 session.open() 完成后 resolve。手写 retain
     * 就必须补 await ready，否则 binding 的 getter 会抛
     * 「Session reference "…" is released」——上一版正是漏了这步。
     *
     * 注意 prompt() 不检查 openState（它直接走 remote.session.prompt），
     * 所以这里不拿 openState 设卡：历史没加载完也能发消息。openError 只在
     * 真的失败时作为补充线索带出来。
     *
     * @param {object} ctx 浏览器上下文
     * @param {string} sessionId 目标会话
     * @param {string} text 消息正文
     */
    async function sendPrompt(ctx, sessionId, text) {
      const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
      if (sessions === undefined || sessions === null) throw new Error('sessions 服务不可用')

      /** 已拿到 binding 就投递；binding 是 { sessionId, session, eventSource, ctx }。 */
      const deliver = async (binding) => {
        const session = binding?.session
        if (session === undefined || session === null || typeof session.prompt !== 'function') {
          throw new Error('会话未绑定，拿不到 session')
        }
        const result = await session.prompt([{ type: 'text', text }], 'queue')
        if (result !== undefined && result !== null && result.ok === false) {
          const error = result.error
          const code = error?.code === undefined ? '' : String(error.code) + ': '
          const message = error?.message === undefined ? '未知错误' : String(error.message)
          // 打开历史失败不算发送失败，但把它带出来便于定位。
          const state = typeof session.getSnapshot === 'function' ? session.getSnapshot() : undefined
          const hint = state?.openError === null || state?.openError === undefined
            ? ''
            : '（会话打开历史时另有错误：' + String(state.openError?.message ?? state.openError) + '）'
          throw new Error('发送失败（' + code + message + '）' + hint)
        }
      }

      // ① 已有引用（用户正开着这个会话）：直接读 binding，不增不减引用计数。
      if (typeof sessions.binding === 'function') {
        const existing = sessions.binding(sessionId)
        if (existing !== undefined && existing !== null) {
          await deliver(existing)
          return
        }
      }

      // ② 没人占着：借一个引用（官方 using 内部已 await ready）。
      if (typeof sessions.using === 'function') {
        let binding
        await sessions.using(sessionId, { source: 'jianbaoWorkbench' }, async (reference) => {
          binding = reference.binding
          await deliver(binding)
        })
        return
      }

      // ③ 老版本没有 using，自己按同样次序借。
      if (typeof sessions.retain !== 'function') {
        throw new Error('sessions.using / sessions.retain 都不存在，无法发送')
      }
      const reference = sessions.retain(sessionId, { source: 'jianbaoWorkbench' })
      try {
        if (typeof reference.ready?.then === 'function') await reference.ready
        await deliver(reference.binding)
      } finally {
        try {
          reference.release()
        } catch {
          /* 释放失败不掩盖发送结果 */
        }
      }
    }
    /** 读文件成 base64（去掉 data: 前缀交给宿主自己处理也行，这里统一保留裸 base64）。 */
    function readAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('读取文件失败'))
        reader.onload = () => {
          const result = String(reader.result || '')
          const comma = result.indexOf(',')
          resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        reader.readAsDataURL(file)
      })
    }

    /** base64 → Blob URL（PDF 预览用）。 */
    function base64ToBlobUrl(base64, mime) {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      return URL.createObjectURL(new Blob([bytes], { type: mime }))
    }
    /**
     * 右侧栏图标 —— 一份印着横线的纸（简报）。
     *
     * 形状照抄官方 sidebar.panellist 的 item：slots.register 的渲染函数收到的是
     * 面板自己的 props（含 active / onClick），直接透传即可，颜色用 currentColor
     * 跟着主题走，不写死。
     */
    function PanelIcon(props) {
      return React.createElement(
        'span',
        {
          onClick: props && typeof props.onClick === 'function' ? props.onClick : undefined,
          title: props && typeof props.label === 'string' ? props.label : undefined,
          style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
        },
        React.createElement(
          'svg',
          { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
          React.createElement('path', { d: 'M6 3h9l4 4v14H6z' }),
          React.createElement('path', { d: 'M15 3v4h4' }),
          React.createElement('path', { d: 'M9 12h7' }),
          React.createElement('path', { d: 'M9 16h5' }),
        ),
      )
    }

    /**
     * 取 snapshot 里 brief.pdf 的版本号（mtime 字符串）。没有就返回空串。
     *
     * 预览去重全靠它：同一个 mtime = 同一份 PDF = 不重建 blob、不换 iframe src。
     *
     * @param {object} snap snapshot 返回值
     * @returns {string}
     */
    function stampOf(snap) {
      const times = snap?.outputTimes && typeof snap.outputTimes === 'object' ? snap.outputTimes : {}
      const value = times['brief.pdf']
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
    }
    /**
     * 从一次 snapshot 推断"这一轮走到哪个阶段"。
     *
     * ## 为什么不能只看文件名
     *
     * .jianbao/out/ 是跨任务保留的：上一轮编译出的 brief.tex / brief.pdf 还在，
     * 新任务刚开工时 snapshot.outputs 里就已经有它们。于是阶段判定在第一帧
     * 直接落到 'pdf'，进度条顶到 75%（用户实测截图就是这个）。
     *
     * 所以要求「产物的 mtime 晚于开工基线」才算本轮的进度。
     * 基线为 null（没点过开始、只是盯着一个在跑的会话）时退化为看有无文件。
     *
     * @param {object} snap snapshot 返回值
     * @param {Record<string, number>|null} baseline 开工瞬间的 文件名→mtime
     * @returns {'writing'|'draft'|'tex'|'pdf'}
     */
    function phaseKeyOf(snap, baseline) {
      const outs = Array.isArray(snap?.outputs) ? snap.outputs : []
      const times = snap?.outputTimes && typeof snap.outputTimes === 'object' ? snap.outputTimes : {}
      const blocks = Array.isArray(snap?.brief?.blocks) ? snap.brief.blocks : []
      const baseTimes = baseline && typeof baseline === 'object' && baseline.times ? baseline.times : null
      const baseBrief = baseline && typeof baseline === 'object' && typeof baseline.brief === 'string' ? baseline.brief : null

      /** 这个产物是不是这一轮新出的？ */
      const fresh = (name) => {
        if (!outs.includes(name)) return false
        if (baseTimes === null) return true          // 没有基线（旁观一个在跑的会话）就看有无文件
        const now = times[name]
        if (typeof now !== 'number') return false
        const was = baseTimes[name]
        // 之前没有 = 这一轮新建的；之前有 = 必须比基线新
        return typeof was === 'number' ? now > was : true
      }

      if (fresh('brief.pdf')) return 'pdf'
      if (fresh('brief.tex')) return 'tex'
      // 草稿：内容必须与开工时不同 —— 上一轮的旧稿留在盘上，
      // 只看 blocks.length > 0 会让新任务第一帧就显示"草稿已落盘"。
      if (blocks.length > 0) {
        if (baseBrief === null) return 'draft'
        if (JSON.stringify(blocks) !== baseBrief) return 'draft'
      }
      return 'writing'
    }

    /**
     * 当前主会话 id —— 在右侧栏面板里自己找，不依赖 props.sessionId。
     *
     * 右侧栏的 main 槽位是 root scope（官方 ui-schedule / ui-plugin-manager
     * 都是这个形状），props 里没有 sessionId。而工作台的一切操作都要落在
     * 某个会话的工作区上。
     *
     * ## 优先问 uiSession，问不到再自己挑
     *
     * 官方 ui-sidebar-right 判断"当前会话"用的就是这个：
     *   ctx.effect(() => { const current = ctx.uiSession.adapter.current; … })
     * adapter.current 是个 store，值是 materialize() 的产物
     * （dsh-client-ui-session @22130）：
     *   return { key: binding.sessionId, ctx: binding.ctx, hooks, keyedHooks, props }
     * 没有挂载任何会话时是 materializeAbsent() 的 { key: void 0, … }。
     * 所以 getSnapshot().key 就是权威的当前会话 id，比自己遍历列表准。
     *
     * 兜底照官方 publishMain 的条件挑：retainedBy.mainView > 0
     * （ui-session / ui-cordis / ui-layout / ui-agent-preset 都这么写）。
     *
     * @param {object} ctx
     * @returns {string} 会话 id，找不到时返回空串
     */
    function currentSessionId(ctx) {
      // ① 权威来源：uiSession.adapter.current
      try {
        const key = ctx.uiSession?.adapter?.current?.getSnapshot?.()?.key
        if (typeof key === 'string' && key !== '') return key
      } catch {
        /* uiSession 没就绪（或没有这个服务）就往下走 */
      }
      // ② 兜底：从会话列表里找被主视图 retain 的那个
      try {
        const byId = ctx.sessions.list.getSnapshot()?.byId ?? {}
        for (const row of Object.values(byId)) {
          if (row !== null && typeof row === 'object' && (row.retainedBy?.mainView ?? 0) > 0) {
            return typeof row.id === 'string' ? row.id : ''
          }
        }
      } catch {
        /* 列表还没就绪 */
      }
      return ''
    }

    /**
     * 右侧栏 tab 的标签文字。
     *
     * 右栏的 tab strip 只显示短标题，所以这里给「简报」+ 主题（有的话），
     * 让用户同时开几个会话时能分清哪个 tab 是哪份简报。
     */
    function TabTitle(props) {
      const ctx = props && props.ctx
      const t = (key) => {
        const dict = DICT.zh
        return dict[key] ?? key
      }
      const topic = props && typeof props.topic === 'string' ? props.topic : ''
      const label = t('nav')
      return React.createElement(
        'span',
        { className: 'dsh-tw-tabtitle', title: topic !== '' ? label + '：' + topic : label },
        label,
      )
    }

    /** 工作台面板。 */
    function Workbench(props) {
      const { t: translate } = props
      const t = React.useMemo(() => makeT(translate), [translate])
      const ctx = props.ctx
      const api = React.useMemo(() => apiOf(ctx), [ctx])

      // 会话 id：优先 props（对话内嵌时会有），否则自己从 sessions.list 找。
      // 用 state 存是为了跟着列表变化重算 —— 切会话时工作台要跟着换工作区。
      const [id, setId] = React.useState(() => {
        const fromProps = typeof props.sessionId === 'string' ? props.sessionId : ''
        return fromProps !== '' ? fromProps : currentSessionId(ctx)
      })
      React.useEffect(() => {
        const fromProps = typeof props.sessionId === 'string' ? props.sessionId : ''
        if (fromProps !== '') { setId(fromProps); return undefined }
        const recompute = () => setId(currentSessionId(ctx))
        recompute()
        try {
          return ctx.sessions.list.subscribe(recompute)
        } catch {
          return undefined
        }
      }, [ctx, props.sessionId])

      const [form, setForm] = React.useState(emptyForm)
      const [env, setEnv] = React.useState(null)
      const [envBusy, setEnvBusy] = React.useState(true)
      const [busy, setBusy] = React.useState('')          // '' | 'env' | 'save' | 'compile' | 'send'
      const [status, setStatus] = React.useState({ kind: 'idle', text: '' })
      const [log, setLog] = React.useState('')
      const [showLog, setShowLog] = React.useState(false)
      const [pdfUrl, setPdfUrl] = React.useState('')
      /** 当前预览对应的 PDF 版本（brief.pdf 的 mtime 字符串）。变了才重建 blob。 */
      const [pdfStamp, setPdfStamp] = React.useState('')
      /** PDF 预览高度档位：s=紧凑 m=常规 l=展开。 */
      const [pdfHeight, setPdfHeight] = React.useState('m')
      /** 时间的两个输入框（单日模式只用 start）。 */
      const [timeParts, setTimeParts] = React.useState({ start: '', end: '', mode: 'single' })
      const [meta, setMeta] = React.useState(null)
      const [outputs, setOutputs] = React.useState([])
      /** 产物目录（.jianbao/sessions/<id>/out）。宿主在 snapshot 里给绝对路径。 */
      const [outFolder, setOutFolder] = React.useState('')
      const [loaded, setLoaded] = React.useState(false)
      /** 本地预览：src → objectURL。**不落盘**，form.json 里只有路径。 */
      const [previews, setPreviews] = React.useState({})
      /** 发送失败时把任务书原样留在界面上，用户可手动复制到输入框（不静默吞掉）。 */
      const [fallbackTask, setFallbackTask] = React.useState('')

      const alive = React.useRef(true)
      React.useEffect(() => () => { alive.current = false }, [])

      /** 取首屏：环境 + 表单 + 产物。 */
      const load = React.useCallback(async (forceEnv) => {
        if (id === '') { setEnvBusy(false); return }
        setEnvBusy(true)
        try {
          // Remote 命名空间与面板的挂载顺序不保证：$mount 是异步的，面板可能先渲染。
          // 这里对「还没挂上」做两次短重试，避免用户一进来就看到红条。
          let snapshot
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              snapshot = unwrap(await api().snapshot(id))
              break
            } catch (error) {
              if (attempt === 2) throw error
              await new Promise((resolve) => setTimeout(resolve, 220))
            }
          }
          if (!alive.current) return
          setEnv(snapshot.env)
          setOutFolder(snapshot.outDir || '')
          setOutputs(snapshot.outputs || [])
          setPdfStamp(stampOf(snapshot))
          setMeta(snapshot.meta || null)
          setForm((current) => {
            const incoming = snapshot.form
            if (incoming === null || typeof incoming !== 'object') return current
            const merged = {
              ...emptyForm(),
              ...incoming,
              cc: typeof incoming.cc === 'string' ? incoming.cc : Array.isArray(incoming.cc) ? incoming.cc.join('\n') : current.cc,
              images: Array.isArray(incoming.images) ? incoming.images : [],
            }
            // 时间段的界面模式要跟着已存的时间走，否则刷新后
            // 存的是「4月20日至24日」却显示成单日输入框。
            const savedTime = String(merged.activityTime ?? '')
            if (savedTime !== '' && isRangeTime(savedTime)) {
              setTimeParts({ ...splitRange(savedTime), mode: 'range' })
            } else if (savedTime !== '') {
              setTimeParts({ start: savedTime, end: '', mode: 'single' })
            }
            return merged
          })
          setLoaded(true)
          if (forceEnv === true) setEnvBusy(false)
        } catch (error) {
          if (!alive.current) return
          setStatus({ kind: 'bad', text: describeError(error, t) })
        } finally {
          if (alive.current) setEnvBusy(false)
        }
      }, [api, id, t])

      React.useEffect(() => { load(false) }, [load])

      /** 表单改动：本地立即生效，落盘节流 400ms。 */
      const saveTimer = React.useRef(null)
      const patch = React.useCallback((key, value) => {
        setForm((current) => {
          const next = { ...current, [key]: value }
          if (saveTimer.current !== null) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(() => {
            if (!alive.current || id === '') return
            try {
              Promise.resolve(api().saveForm(id, next)).catch(() => {})
            } catch {
              /* 落盘失败不打断输入 */
            }
          }, 400)
          return next
        })
      }, [api, id])

      /** 重新检测环境。 */
      const recheck = React.useCallback(async () => {
        setEnvBusy(true)
        try {
          const report = unwrap(await api().env(id, true))
          if (alive.current) setEnv(report)
        } catch (error) {
          if (alive.current) setStatus({ kind: 'bad', text: describeError(error, t) })
        } finally {
          if (alive.current) setEnvBusy(false)
        }
      }, [api, id, t])

      /** 上传图片：base64 → Remote → 拿相对路径。 */
      const addImages = React.useCallback(async (files) => {
        if (id === '') return
        const list = Array.from(files || [])
        for (const file of list) {
          if (!/^image\//u.test(file.type)) continue
          setStatus({ kind: 'idle', text: t('img.uploading', { name: file.name }) })
          try {
            const data = await readAsBase64(file)
            const result = unwrap(await api().uploadImage(id, file.name, data))
            if (!alive.current) return
            const objectUrl = URL.createObjectURL(file)
            setPreviews((current) => ({ ...current, [result.src]: objectUrl }))
            setForm((current) => {
              const next = { ...current, images: [...(current.images || []), { src: result.src, name: file.name }] }
              try {
                Promise.resolve(api().saveForm(id, next)).catch(() => {})
              } catch {
                /* 同上 */
              }
              return next
            })
            setStatus({ kind: 'ok', text: t('status.saved') })
          } catch (error) {
            if (!alive.current) return
            setStatus({ kind: 'bad', text: t('img.failed', { msg: describeError(error, t) }) })
          }
        }
      }, [api, id, t])

      const removeImage = React.useCallback((src) => {
        setPreviews((current) => {
          const url = current[src]
          if (typeof url === 'string') URL.revokeObjectURL(url)
          const next = { ...current }
          delete next[src]
          return next
        })
        setForm((current) => {
          const next = { ...current, images: (current.images || []).filter((img) => img.src !== src) }
          try {
            Promise.resolve(api().saveForm(id, next)).catch(() => {})
          } catch {
            /* 同上 */
          }
          return next
        })
      }, [api, id])

      /**
       * 当前预览的 PDF 版本（= brief.pdf 的 mtime）。
       *
       * ## 为什么必须有这层
       *
       * 预览是一个指向 blob: URL 的 <iframe>。**只要 src 变了，浏览器就整个
       * 重新加载 PDF 文档** —— 滚动位置丢失、页面白闪一次。而"变"的触发点
       * 原来多达三处都会在每一拍命中：
       *   · 轮询 step / beat 里 phaseKeyOf 判到 'pdf' 就 refreshPdf（每 2s）；
       *   · outputs 是个新数组 → 那条 [outputs, refreshPdf] 的 effect 每拍都跑；
       * 于是模型编译完、甚至编译完之后的一段时间里，PDF 每 2 秒重建一次
       * blob 并换 src —— 用户看到的就是"一闪一闪的，往下滑特别卡"。
       *
       * 修法：按 mtime 去重。同一个 PDF 版本只取一次、只建一个 blob。
       * mtime 来自 snapshot 的 outputTimes（宿主侧 stat 出来的毫秒时间戳），
       * 空串表示"还没算出来"，此时按"不知道"处理，不刷新。
       */
      const pdfVersionRef = React.useRef('')
      /** 正在取 PDF 时置真，避免两拍重叠各建一个 blob（也会闪）。 */
      const pdfLoadingRef = React.useRef(false)

      /**
       * 刷新 PDF 预览。
       * @param {number|string} [version] brief.pdf 的 mtime；与上次相同就跳过
       */
      const refreshPdf = React.useCallback(async (version) => {
        if (id === '') return
        const stamp = version === undefined || version === null || version === '' ? '' : String(version)
        // 有版本号且与当前一致 → 这一份已经在预览里了，什么都不做
        if (stamp !== '' && stamp === pdfVersionRef.current) return
        if (pdfLoadingRef.current) return
        pdfLoadingRef.current = true
        try {
          const result = unwrap(await api().pdf(id))
          if (!alive.current) return
          if (result && result.ok === true && result.data) {
            // 期间若已有更新的版本进来，丢弃这次结果，
            // 否则会用旧内容覆盖新预览（同样表现为闪一下回到旧页）。
            if (stamp !== '' && pdfVersionRef.current !== '' && Number(stamp) < Number(pdfVersionRef.current)) return
            const url = base64ToBlobUrl(result.data, 'application/pdf')
            if (stamp !== '') pdfVersionRef.current = stamp
            setPdfUrl((old) => {
              if (old !== '') URL.revokeObjectURL(old)
              return url
            })
          }
        } catch {
          /* 没有 PDF 就不预览 */
        } finally {
          pdfLoadingRef.current = false
        }
      }, [api, id])

      // ── 实时进度轮询 ────────────────────────────────────────────────
      //
      // 模型在对话里写稿时，工作台在右侧栏，用户要能**看着它走**，而不是盯着
      // 一句「模型正在写稿」发呆。做法：模型工作期间按 2s 轮询 snapshot，
      // 从 outputs / brief / meta 推断阶段，显示成一条进度条 + 阶段文字。
      //
      // 检出条件：session 正在跑（sessions.list 的 running 标记）或者上次
      // 我们自己刚点过「开始」。两个都停就停止轮询，别无谓地打 RPC。
      const [phase, setPhase] = React.useState({ key: 'idle', at: 0 })
      /**
       * 开工瞬间的产物基线（毫秒时间戳）。
       *
       * 阶段是从 .jianbao/out/ 里的产物反推的，但那个目录**跨任务保留**：
       * 上一次编译出的 brief.tex / brief.pdf 还在，新任务一开工就会被判成
       * "已生成 PDF"，进度条立刻顶到 75%（用户实测截图就是这个）。
       *
       * 所以开工时记一份各核心产物当时的修改时间，轮询时要求
       * 「产物的 mtime 比基线新」才算本轮的进度。没这层，进度只会在
       * 第一帧就对；有这层，它才真的跟着这一轮走。
       */
      const startBaselineRef = React.useRef(null)
      const [tick, setTick] = React.useState(0)
      const runningRef = React.useRef(false)
      const pollingRef = React.useRef(false)

      const isRunning = React.useCallback(() => {
        try {
          const byId = ctx.sessions.list.getSnapshot()?.byId ?? {}
          const row = byId[id]
          if (row === undefined) return false
          return row.running === true || row.retryAt !== undefined
        } catch {
          return false
        }
      }, [ctx, id])

      React.useEffect(() => {
        let stopped = false
        let timer

        const step = async () => {
          if (stopped) return
          const busyNow = runningRef.current || isRunning()
          if (!busyNow) {
            pollingRef.current = false
            return
          }
          pollingRef.current = true
          try {
            const snap = unwrap(await api().snapshot(id))
            if (stopped) return
            const key = phaseKeyOf(snap, startBaselineRef.current)
            setPhase({ key, at: Date.now() })
            setOutputs(Array.isArray(snap.outputs) ? snap.outputs : [])
            // 只在 PDF 版本（mtime）变化时重建预览：同一个版本每 2s 重建一次 blob
            // 会让 <iframe> 反复重载，滚动位置丢失 + 白闪（用户实测）。
            if (key === 'pdf') void refreshPdf(stampOf(snap))
            setTick((n) => n + 1)
          } catch {
            /* 轮询失败不打扰用户，下一拍再试 */
          }
          if (stopped) return
          if (runningRef.current || isRunning()) timer = setTimeout(step, 2000)
          else pollingRef.current = false
        }

        if (isRunning()) void step()
        return () => {
          stopped = true
          if (timer !== undefined) clearTimeout(timer)
        }
      }, [api, ctx, id, isRunning, refreshPdf])

      // 点「开始工作」之后立刻起轮询（宿主可能还没把 session 标成 running）
      const kickPolling = React.useCallback(() => {
        runningRef.current = true
        // 刚点「开始工作」时先落在 writing（0%），不要预置成 draft。
        // 配合 start() 里「基线取在骨架落盘之后」，第一帧就是真实的「拟稿中」。
        setPhase({ key: 'writing', at: Date.now() })
        setTick((n) => n + 1)
        const stopAt = Date.now() + 10 * 60 * 1000
        // 上一版这里每 2 秒无条件重算阶段，而阶段是从产物文件反推的：
        //   .jianbao/out/ 里还留着**上一次**编译的 brief.tex / brief.pdf
        //   → 新任务一开始就判成 'pdf'，进度条立刻顶到 75%。
        // 修法：记下开工瞬间的产物基线（开工前清空的核心产物），
        // 只有当产物**比基线新**才算本轮的阶段。
        const baseline = startBaselineRef.current
        const beat = async () => {
          if (Date.now() > stopAt) { runningRef.current = false; return }
          if (!runningRef.current && !isRunning()) { runningRef.current = false; return }
          try {
            const snap = unwrap(await api().snapshot(id))
            const key = phaseKeyOf(snap, baseline)
            setPhase({ key, at: Date.now() })
            setOutputs(Array.isArray(snap.outputs) ? snap.outputs : [])
            if (key === 'pdf') void refreshPdf(stampOf(snap))
          } catch {
            /* 忽略 */
          }
          if (runningRef.current || isRunning()) setTimeout(beat, 2000)
          else runningRef.current = false
        }
        void beat()
      }, [api, id, isRunning, refreshPdf])

      // outputs 每拍都是一个**新数组**，拿它当依赖等于每 2 秒刷新一次预览；
      // 真正决定"预览要不要重载"的是 PDF 的 mtime（pdfStamp）。
      React.useEffect(() => {
        if (pdfStamp !== '') void refreshPdf(pdfStamp)
      }, [pdfStamp, refreshPdf])

      React.useEffect(() => () => { if (pdfUrl !== '') URL.revokeObjectURL(pdfUrl) }, [pdfUrl])

      // 卸载时把剩下的预览 URL 一起回收（否则每张图泄一个 blob）
      const previewsRef = React.useRef(previews)
      previewsRef.current = previews
      React.useEffect(() => () => {
        for (const url of Object.values(previewsRef.current || {})) {
          if (typeof url === 'string') URL.revokeObjectURL(url)
        }
      }, [])

      /** 开始工作：存简报骨架 → 把任务书发给模型（模型再调工具写稿+编译）。 */
      const start = React.useCallback(async () => {
        if (id === '') { setStatus({ kind: 'bad', text: t('error.noSession') }); return }
        if (String(form.topic || '').trim() === '' && String(form.activityFlow || '').trim() === '') {
          setStatus({ kind: 'bad', text: t('error.nothing') })
          return
        }
        setBusy('send')
        setStatus({ kind: 'idle', text: t('btn.starting') })
        try {
          // 先把表单与骨架落盘：模型一上来 jianbao_state 就能读到
          await api().saveForm(id, form)
          const cc = String(form.cc || '').split('\n').map((s) => s.trim()).filter((s) => s !== '')
          const images = (form.images || []).map((img) => img.src)
          const blocks = []
          if (images.length > 0) {
            // 先给一个「图片收尾」占位：模型会重排到对应段落后
            blocks.push({ type: 'imagePair', srcs: images.slice(0, 2) })
          }
          const skeleton = {
            title: '',
            issue: form.issue || '第XX期',
            author: form.author || '',
            auditor: form.auditor || '',
            phone: form.phone || '',
            org: form.org || '西藏大学理学院',
            briefType: form.briefType || 'activity',
            topic: form.topic || '',
            cc: cc.length > 0 ? cc : ['校领导、院领导', '党委（校长）办公室、党委宣传部'],
            withPageNumber: true,
            blocks,
          }
          await api().save(id, skeleton, false)
          // ── 基线必须在**骨架落盘之后**取 ──────────────────────────────
          //
          // phaseKeyOf 判「草稿已落盘」的条件是 blocks 与基线不同。
          // 原来基线取在 save() 之前，于是刚写进去的骨架（含图片占位）
          // 一落盘就「与基线不同」→ 第一帧直接是 draft / 50%，
          // 用户看到的就是「刚开始就 50%」（实测截图）。
          // 把骨架算进基线，进度才会真的从「拟稿」起步。
          try {
            const before = unwrap(await api().snapshot(id))
            startBaselineRef.current = {
              times: before.outputTimes && typeof before.outputTimes === 'object' ? before.outputTimes : {},
              brief: JSON.stringify(Array.isArray(before.brief?.blocks) ? before.brief.blocks : []),
            }
          } catch {
            startBaselineRef.current = { times: {}, brief: JSON.stringify(skeleton.blocks) }
          }
          await sendPrompt(ctx, id, buildTask(form, images))
          if (!alive.current) return
          kickPolling()
          setStatus({ kind: 'warn', text: t('status.working') })
        } catch (error) {
          if (!alive.current) return
          setStatus({ kind: 'bad', text: t('status.failed', { msg: describeError(error, t) }) })
          setFallbackTask(buildTask(form, (form.images || []).map((img) => img.src)))
        } finally {
          if (alive.current) setBusy('')
        }
      }, [api, ctx, form, id, t, kickPolling])

      /** 重新编译：不重新写稿，只重跑 LaTeX。 */
      const recompile = React.useCallback(async () => {
        if (id === '') return
        setBusy('compile')
        setStatus({ kind: 'idle', text: t('btn.compiling') })
        try {
          const result = unwrap(await api().compile(id))
          if (!alive.current) return
          setOutputs((current) => (current.includes('brief.pdf') ? current : [...current, 'brief.pdf']))
          setLog(result.logTail || '')
          if (result.ok === true) {
            setStatus({
              kind: 'ok',
              text: t('status.ready', { pages: result.pages ?? 1, chars: result.chars ?? 0 })
                + ((result.warnings || []).length > 0 ? '\n' + t('status.warn', { list: (result.warnings || []).join('；') }) : ''),
            })
            // 重新编译出来了新的 PDF：先取一次 snapshot 拿到新 mtime，
            // 把 pdfStamp 推到新值 —— 预览 effect 会据此重建 blob。
            try {
              const snap = unwrap(await api().snapshot(id))
              if (alive.current) {
                setMeta(snap.meta || null)
                const stamp = stampOf(snap)
                if (stamp !== '') {
                  setPdfStamp(stamp)
                  await refreshPdf(stamp)
                }
              }
            } catch { /* 元数据拿不到不影响主流程 */ }
          } else {
            const raw = await api().log(id).then(unwrap).catch(() => ({ log: '' }))
            if (alive.current) setLog(raw.log || result.logTail || '')
            setStatus({ kind: 'bad', text: t('status.failed', { msg: result.error || '' }) })
          }
        } catch (error) {
          if (!alive.current) return
          setStatus({ kind: 'bad', text: t('status.failed', { msg: describeError(error, t) }) })
        } finally {
          if (alive.current) setBusy('')
        }
      }, [api, id, refreshPdf, t])

      /**
       * 新窗口打开 PDF。
       *
       * 不能只靠 window.open：DSH 桌面端是 Electron，默认拦截
       * window.open（返回 null），点了就「没反应」。这里退回到
       * 「造一个带 target=_blank 的 <a> 再 click」—— 它走的是同一套
       * 导航许可，且不需要 popup 白名单。
       */
      const openPdf = React.useCallback(() => {
        if (pdfUrl === '') return
        let opened = null
        try {
          opened = window.open(pdfUrl, '_blank', 'noopener')
        } catch {
          opened = null
        }
        if (opened !== null && opened !== undefined) {
          try { opened.opener = null } catch { /* 跨域时设不了，无妨 */ }
          return
        }
        const a = document.createElement('a')
        a.href = pdfUrl
        a.target = '_blank'
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
      }, [pdfUrl])

      const downloadPdf = React.useCallback(() => {
        if (pdfUrl === '') return
        const a = document.createElement('a')
        a.href = pdfUrl
        a.download = ((form.topic || '简报') + '.pdf').replace(/[\\/:*?"<>|]/gu, '_')
        document.body.appendChild(a)
        a.click()
        a.remove()
      }, [form.topic, pdfUrl])

      // ── 环境卡片 ───────────────────────────────────────────────────────
      const envState = envBusy ? 'idle'
        : env === null ? 'warn'
        : env.latex && env.latex.canCompilePdf === true ? 'ok'
        : env.latex && env.latex.found === true ? 'warn' : 'bad'
      const envTitle = envBusy ? t('env.checking')
        : env === null ? t('env.checking')
        : env.latex && env.latex.canCompilePdf === true ? t('env.ok')
        : env.latex && env.latex.found === true
          ? ((env.latex.missingPackages || []).length > 0
            ? t('env.nopkg', { list: (env.latex.missingPackages || []).join('、') })
            : t('env.nolatex'))
          : t('env.nolatex')
      const envSub = []
      if (env !== null && env.latex && env.latex.xelatex) envSub.push('xelatex: ' + env.latex.xelatex)
      if (env !== null && env.fonts) {
        const roles = env.fonts.roles || {}
        const got = Object.keys(roles).filter((k) => roles[k] && roles[k].file).map((k) => roles[k].file)
        const missing = ['fangsong', 'heiti', 'kaiti', 'songti'].filter((k) => !(roles[k] && roles[k].file))
        if (got.length > 0) envSub.push(t('env.fonts', { roles: got.join('、') }))
        if (missing.length > 0) envSub.push(t('env.fontsMissing', { list: missing.join('、') }))
        if ((env.fonts.fangzheng || []).length > 0) envSub.push(t('env.fangzheng', { list: env.fonts.fangzheng.slice(0, 6).join('、') }))
      }
      if (env !== null && env.latex && env.latex.error) envSub.push(env.latex.error)

      // ── 表单字段 ───────────────────────────────────────────────────────
      const field = (key, label, options) => {
        const opt = options || {}
        const common = {
          value: form[key] ?? '',
          onChange: (event) => patch(key, event.target.value),
          placeholder: opt.placeholder ?? '',
          disabled: opt.disabled === true,
        }
        return h('div', { className: 'dsh-tw-field' + (opt.wide ? ' wide' : ''), key },
          h('label', { htmlFor: 'dsh-tw-' + key }, label),
          opt.multiline === true
            ? h('textarea', { ...common, id: 'dsh-tw-' + key, rows: opt.rows ?? 3 })
            : opt.select !== undefined
              ? h('select', { ...common, id: 'dsh-tw-' + key },
                opt.select.map((item) => h('option', { key: item, value: item }, item)))
              : h('input', { ...common, id: 'dsh-tw-' + key, type: opt.type ?? 'text' }),
          opt.tip ? h('div', { className: 'dsh-tw-tip' }, opt.tip) : null,
        )
      }

      if (id === '') {
        return h('div', { className: 'dsh-tw' },
          h('div', { className: 'dsh-tw-scroll' },
            h('div', { className: 'dsh-tw-status', 'data-kind': 'bad' }, t('error.noSession'))))
      }

      return h('div', { className: 'dsh-tw' },
        h('div', { className: 'dsh-tw-scroll' },
          h('div', { className: 'dsh-tw-head' },
            h('h2', null, t('panel.title')),
            h('span', null, t('panel.subtitle')),
            // 版本角标：改了 client.js 却没整体重启 DSH 时，靠它分辨加载的是新旧代码。
            env !== null && env.plugin && typeof env.plugin.version === 'string' && env.plugin.version !== ''
              ? h('span', {
                className: 'dsh-tw-ver',
                title: '插件 ' + env.plugin.name + ' v' + env.plugin.version,
              }, 'v' + env.plugin.version)
              : null),

          // 环境检测
          h('div', { className: 'dsh-tw-env', 'data-state': envState },
            h('div', { className: 'dsh-tw-env-body' },
              h('div', { className: 'dsh-tw-env-title' }, envTitle),
              envSub.length > 0 ? h('div', { className: 'dsh-tw-env-sub' }, envSub.join('　')) : null),
            h('button', { type: 'button', onClick: recheck, disabled: envBusy }, t('env.retry'))),

          // 基本信息
          h('h3', null, t('section.base')),
          h('div', { className: 'dsh-tw-grid' },
            h('div', { className: 'dsh-tw-field' },
              h('label', { htmlFor: 'dsh-tw-type' }, t('field.type')),
              h('select', {
                id: 'dsh-tw-type',
                value: form.briefType || 'activity',
                onChange: (event) => patch('briefType', event.target.value),
              }, TYPES.map((item) => h('option', { key: item.id, value: item.id }, item.label)))),
            field('issue', t('field.issue'), { placeholder: '第12期' }),
            field('topic', t('field.topic'), { wide: true, tip: t('tip.topic'), placeholder: '第三届心理健康知识竞赛' }),
            // 时间：给「单日 / 时间段」两个模式，按模式换输入框。
            // 让用户自己拼「4月20日到24日」这种字符串太容易写错；
            // 拆成两个框之后，拼装在代码里做，用户只管填数字。
            (() => {
              // 模式以用户点选为准（timeParts.mode），不从文本反推 ——
              // 反推的话「切到时间段但还没填终点」会立刻弹回单日，切不过去。
              const range = timeParts.mode === 'range'
              const setStart = (value) => {
                const next = { ...timeParts, start: value }
                setTimeParts(next)
                patch('activityTime', range ? joinRange(next.start, next.end) : value)
              }
              const setEnd = (value) => {
                const next = { ...timeParts, end: value }
                setTimeParts(next)
                patch('activityTime', joinRange(next.start, next.end))
              }
              const inputs = range
                ? h('div', { className: 'dsh-tw-timerange' },
                  h('input', {
                    type: 'text',
                    value: timeParts.start,
                    placeholder: t('ph.timeStart'),
                    onChange: (event) => setStart(event.target.value),
                  }),
                  h('span', { className: 'dsh-tw-timerange-sep' }, '—'),
                  h('input', {
                    type: 'text',
                    value: timeParts.end,
                    placeholder: t('ph.timeEnd'),
                    onChange: (event) => setEnd(event.target.value),
                  }))
                : h('input', {
                  id: 'dsh-tw-time-mode',
                  type: 'text',
                  value: timeParts.start,
                  placeholder: t('ph.time'),
                  onChange: (event) => setStart(event.target.value),
                })
              // 标签与分段控件同一行（label 左、切换右），输入框独占下一行。
              // 原来三者各占一行，分段控件被全局 button padding 撑成大方块，很笨重。
              return h('div', { className: 'dsh-tw-field dsh-tw-field--time' },
                h('div', { className: 'dsh-tw-field-head' },
                  h('label', { htmlFor: 'dsh-tw-time-mode' }, t('field.time')),
                  h('div', { className: 'dsh-tw-seg', role: 'group' },
                    h('button', {
                      type: 'button',
                      className: 'dsh-tw-seg-item',
                      'data-on': range ? '0' : '1',
                      'aria-pressed': range ? 'false' : 'true',
                      onClick: () => {
                        const single = splitRange(form.activityTime).start
                        setTimeParts({ start: single, end: '', mode: 'single' })
                        patch('activityTime', single)
                      },
                    }, t('time.single')),
                    h('button', {
                      type: 'button',
                      className: 'dsh-tw-seg-item',
                      'data-on': range ? '1' : '0',
                      'aria-pressed': range ? 'true' : 'false',
                      onClick: () => {
                        const parts = splitRange(form.activityTime)
                        setTimeParts({ ...parts, mode: 'range' })
                        patch('activityTime', joinRange(parts.start, parts.end))
                      },
                    }, t('time.range')))),
                inputs,
                h('div', { className: 'dsh-tw-tip' }, t('tip.time')))
            })(),
            field('leaderName', t('field.leader'), { tip: t('tip.leader'), placeholder: '周某某、张某某' }),
            h('div', { className: 'dsh-tw-field' },
              h('label', { htmlFor: 'dsh-tw-audience' }, t('field.audience')),
              h('input', {
                id: 'dsh-tw-audience',
                list: 'dsh-tw-audience-list',
                value: form.audience || '',
                placeholder: '2026级新生',
                onChange: (event) => patch('audience', event.target.value),
              }),
              h('datalist', { id: 'dsh-tw-audience-list' },
                AUDIENCES.map((item) => h('option', { key: item, value: item }))),
              h('div', { className: 'dsh-tw-tip' }, t('tip.audience'))),
            field('activityFlow', t('field.flow'), { wide: true, multiline: true, rows: 4, tip: t('tip.flow'), placeholder: '介绍活动背景；开展知识竞答；领导总结讲话；颁奖' }),
            field('author', t('field.author'), { placeholder: '孙某某' }),
            field('auditor', t('field.auditor'), { placeholder: '（可空）' }),
            field('phone', t('field.phone'), { tip: t('tip.phone'), placeholder: '19600000000' }),
            field('org', t('field.org'), { placeholder: '西藏大学理学院' }),
            field('cc', t('field.cc'), { wide: true, multiline: true, rows: 2, tip: t('tip.cc') })),

          // 插图
          h('h3', null, t('section.images')),
          (form.images || []).length === 0
            ? h('div', { className: 'dsh-tw-tip' }, t('img.empty'))
            : h('div', { className: 'dsh-tw-imgs' },
              (form.images || []).map((img) => h('div', { className: 'dsh-tw-thumb', key: img.src },
                previews[img.src] !== undefined
                  ? h('img', { src: previews[img.src], alt: img.name || img.src })
                  : h('div', { className: 'dsh-tw-thumb-name', style: { height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '🖼'),
                h('button', { type: 'button', onClick: () => removeImage(img.src) }, t('img.remove')),
                h('div', { className: 'dsh-tw-thumb-name', title: img.src }, img.name || img.src)))),
          h('div', { className: 'dsh-tw-drop' },
            h('input', {
              type: 'file',
              accept: 'image/*',
              multiple: true,
              id: 'dsh-tw-file',
              style: { display: 'none' },
              onChange: (event) => { addImages(event.target.files); event.target.value = '' },
            }),
            h('button', {
              type: 'button',
              onClick: () => { const el = document.getElementById('dsh-tw-file'); if (el) el.click() },
              disabled: busy !== '',
            }, t('img.add'))),

          // 开始工作
          h('h3', null, t('section.go')),
          h('div', { className: 'dsh-tw-actions' },
            h('button', {
              type: 'button',
              className: 'primary',
              onClick: start,
              disabled: busy !== '' || id === '',
            }, busy === 'send' ? t('btn.starting') : t('btn.start')),
            h('button', {
              type: 'button',
              onClick: recompile,
              disabled: busy !== '' || id === '',
            }, busy === 'compile' ? t('btn.compiling') : t('btn.recompile')),
            h('button', { type: 'button', onClick: openPdf, disabled: pdfUrl === '' }, t('btn.pdf')),
            h('button', { type: 'button', onClick: downloadPdf, disabled: pdfUrl === '' }, t('btn.download')),
            h('button', {
              type: 'button',
              className: 'link',
              onClick: () => setShowLog((v) => !v),
            }, showLog ? t('btn.hideLog') : t('btn.showLog'))),

          // 阶段进度条：模型工作期间一直显示，四个阶段各自有宽度，
          // 让用户看得见「走到哪一步了」，而不是只看到一句「正在写稿」。
          (() => {
            if (phase.key === 'idle' && !pollingRef.current) return null
            const order = ['writing', 'draft', 'tex', 'pdf']
            const idx = Math.max(0, order.indexOf(phase.key))
            // 进度按「已完成几步」算，不是「正在第几步」。
            // 原来用 (idx+1)/4：刚开工还在写稿就已经 25%，一落盘立刻 50%，
            // 用户第一眼看到的就是「刚开始就 50%」。
            // 改成 idx/4：开工 0%，草稿 25%，tex 50%，出 PDF 100%。
            // 一直写稿的阶段停在 0% 会显得没动静，所以在 writing 时给一个
            // 「进行中」的 8% 底数，让进度条有存在感但不虚报。
            const pct = phase.key === 'writing' ? 8 : (idx / order.length) * 100
            return h('div', { className: 'dsh-tw-progress', 'data-phase': phase.key },
              h('div', { className: 'dsh-tw-progress-head' },
                h('span', null, t('phase.' + phase.key)),
                h('span', { className: 'dsh-tw-progress-pct' }, Math.round(pct) + '%')),
              h('div', { className: 'dsh-tw-progress-track' },
                h('div', { className: 'dsh-tw-progress-bar', style: { width: pct + '%' } })),
              h('div', { className: 'dsh-tw-progress-steps' },
                ...order.map((key, i) => h('span', {
                  key,
                  className: 'dsh-tw-progress-step',
                  'data-on': i <= idx ? '1' : '0',
                }, t('phase.' + key)))))
          })(),

          status.text !== ''
            ? h('div', { className: 'dsh-tw-status', 'data-kind': status.kind }, status.text)
            : (loaded ? h('div', { className: 'dsh-tw-status', 'data-kind': 'idle' }, t('status.idle')) : null),

          showLog && log !== ''
            ? h('div', { className: 'dsh-tw-log' }, log)
            : null,

          fallbackTask !== ''
            ? h('div', null,
              h('div', { className: 'dsh-tw-tip', style: { marginTop: '10px' } }, t('fallback.hint')),
              h('textarea', {
                className: 'dsh-tw-fallback',
                readOnly: true,
                value: fallbackTask,
                rows: 8,
                onFocus: (event) => event.target.select(),
              }))
            : null,

          // 产物目录：按会话隔离后真实路径是 .jianbao/sessions/<id>/out，
          // 原来固定拼 '.jianbao/out' 是隔离改造前的旧布局 —— 用户点开是空的。
          outFolder !== '' ? h('div', { className: 'dsh-tw-tip', style: { marginTop: '8px' } }, t('openFolder', { dir: outFolder })) : null,

          // 预览：右侧栏窄，所以给三档高度 + 「新窗口打开」，
          // 让用户能按内容自己挑：整页扫一眼 / 半屏细看 / 另开窗口逐页读。
          h('div', { className: 'dsh-tw-preview' },
            h('h3', null,
              t('preview.title'),
              pdfUrl !== ''
                ? h('span', { className: 'dsh-tw-preview-tools' },
                  ...['s', 'm', 'l'].map((size) => h('button', {
                    key: size,
                    type: 'button',
                    className: 'dsh-tw-preview-size',
                    'data-on': pdfHeight === size ? '1' : '0',
                    title: t('preview.size.' + size),
                    onClick: () => setPdfHeight(size),
                  }, t('preview.size.' + size))),
                  h('button', { type: 'button', onClick: openPdf, title: t('btn.pdf') }, t('btn.pdf')))
                : null),
            pdfUrl === ''
              ? h('div', { className: 'dsh-tw-preview-empty' }, t('preview.empty'))
              // key 带上 pdfUrl：换了一份 PDF 要重建 iframe，
              // 否则浏览器沿用旧文档，用户看到的是上一次的稿子。
              : h('div', { className: 'dsh-tw-preview-frame', 'data-size': pdfHeight },
                h('iframe', {
                  key: pdfUrl,
                  // 去掉内嵌阅读器自带的工具栏与**缩略图侧栏**：侧栏要把每一页
                  // 再渲染一遍缩略图（14MB 的图集 PDF 就是这里最卡），
                  // 而且面板本来就窄，侧栏直接吃掉一半宽度。
                  // 需要完整工具栏时点「打开 PDF」在新窗口看。
                  src: pdfUrl + '#toolbar=0&navpanes=0&statusbar=0&view=FitH',
                  title: 'PDF',
                }))),

          // 版式规范
          h('div', { className: 'dsh-tw-spec' },
            h('h3', null, t('spec.title')),
            h('div', null, '纸张：A4 595.32×841.92bp　页边距：左 79.40　右 73.70　上 104.90　下 99.25'),
            h('div', null, '行距：固定值 28.80bp（标题与全文一致）'),
            h('div', null, '大标题：21.96bp 方正小标宋、居中折行　正文：15.96bp 方正仿宋_GBK，首行缩进 2 字符'),
            // 语料实测：63 份真实简报、633 个段落里**没有一处**编号标题
            // （0 个「一、」、0 个「（一）」）。正文就是连续几个自然段。
            // 渲染器仍保留三级标题能力（用户明确要用时能用上），
            // 但这里不能对用户宣称"简报有三级标题"——那是与语料不符的引导。
            h('div', null, '正文：连续自然段，不分编号层级（63 份语料里 0 处编号标题）'),
            h('div', null, '抄送区：15.00bp 仿宋_GB2312，两条 1bp 通栏横线压末页底　页脚：— N —，14.04bp，右端 506.01'),
            h('div', { className: 'dsh-tw-spec-note' }, '版式常量实测自参考 PDF（74 号）；改这些数字前先跑 tools/selftest.mjs'))),
      )
    }
    /** 注册 Remote 命名空间 + 面板。 */
    async function apply(ctx) {
      installStyles()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'jianbao:dictionaries')
      const t = ctx.locale.bind(NS)

      // 先挂 Remote，再挂 UI：面板首屏就调 snapshot，命名空间没就绪会立刻报
      // 「remote.jianbao is not mounted」。挂载失败不阻断 UI —— 面板会显示这条错误，
      // 比整块 tab 消失更容易诊断。
      try {
        const remote = ctx.get('remote')
        if (remote !== undefined && remote !== null && typeof remote.$mount === 'function') {
          await remote.$mount(CONTRIBUTION)
        } else {
          console.warn('[jianbao] remote 服务不可用，工作台将无法与宿主通信')
        }
      } catch (error) {
        console.warn('[jianbao] $mount failed: ' + (error && error.message ? error.message : error))
      }
      const ban = (fn, label, fallback) => {
        try {
          return fn()
        } catch (error) {
          try {
            console.warn('[jianbao] ' + label + ': ' + (error && error.message ? error.message : error))
          } catch {
            /* 日志通道坏了不该影响主流程 */
          }
          return fallback
        }
      }
      // ── 门控：只有简报预设的会话才注册这个标签 ──────────────────────
      //
      // conversation.view 是全局槽位：注册一次，**所有**会话的标签栏都会多一项
      // （官方 tab 栏遍历 slots.entries("conversation.view") 生成）。
      // 所以不能无条件注册，也不能"注册了再隐藏"—— 必须按当前会话的预设
      // 动态注册/注销。客户端拿不到 preset 的同步读，只能问宿主 remote.jianbao.gate。
      //
      // 触发点：sessions.list 变化（切会话、空白会话切预设都会变）。
      let registeredFor = null
      let syncing = false

      const currentMainSessionId = () => {
        try {
          const list = ctx.sessions.list.getSnapshot()
          const byId = list && list.byId ? list.byId : {}
          for (const row of Object.values(byId)) {
            if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) return row.id
          }
        } catch {
          /* 列表还没就绪 */
        }
        return undefined
      }

      const unregister = () => {
        for (const [key, dispose] of [['type', disposeType], ['body', disposeBody], ['title', disposeTitle]]) {
          if (dispose === null) continue
          try {
            dispose()
          } catch {
            /* 注销失败不该阻断后续 */
          }
          if (key === 'type') disposeType = null
          else if (key === 'body') disposeBody = null
          else disposeTitle = null
        }
        registeredFor = null
      }

      // ── 右侧栏入口 ────────────────────────────────────────────────────
      //
      // 原来是 conversation.view（对话上方的标签）。那个位置有个硬伤：
      // 新会话里标签栏要等**第一条消息发出后**才渲染，所以用户必须先说一句话
      // 才能点开工作台 —— 顺序反了。
      //
      // 右侧内置浏览器（sidebar）不受这个限制：它跟着 shell 走，空会话也在。
      // 官方 ui-plugin-manager 就是这个形状（client.js:3712-3775）：
      //   1. slots.inject('main') + slots.register({ name:'main', key:PANEL_ID, … })
      //      —— 注册那个面板的**页面**；
      //   2. slots.inject('sidebar.panellist') + slots.register({ … }, Icon)
      //      —— 注册右侧栏那一列上的**图标按钮**。
      // 两个都用同一个 id（PANEL_ID），靠它配对。
      //
      // 面板切换走 ctx.layout.selectPanel(PANEL_ID)；也能用
      // ctx.layout.panelInfo 订阅「当前是不是我」。
      // ── 右侧栏 tab（不是对话内标签，也不是左栏图标）──────────────────
      //
      // 需求变更：入口要放在**右侧内置浏览器**那一栏。理由很实在 ——
      // conversation.view 那个标签要等第一条消息发出后标签栏才渲染，
      // 新会话里用户根本点不到工作台，顺序反了。
      //
      // 右栏的模型是「tab 类型」：先 ctx.sidebarRightTabs.register 登记一种
      // 页面类型，再用 sidebar.right.pane.tab / .title 注册它的内容与标题，
      // 最后 ctx.sidebarRight.openTab(kind) 打开。官方内置浏览器就是这么做的
      // （dsh-client-ui-sidebar-browser/lib/client.js:1601/1614/1635）。
      //
      // tab 定义里 multiple:false —— 工作台一个会话一个就够，不重复开。
      const TAB_KIND = 'jianbao-workbench'
      const TAB_ID = PACKAGE + '/workbench'
      let disposeType = null
      let disposeBody = null
      let disposeTitle = null

      const register = () => {
        disposeType = ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: TAB_ID,
              kind: TAB_KIND,
              multiple: false,
              priority: 'builtin',
              title: () => t('nav'),
              guide: [
                {
                  id: 'open',
                  order: 30,
                  title: () => t('nav'),
                  description: () => t('panel.subtitle'),
                  icon: PanelIcon,
                },
              ],
            }),
          'jianbao: right-tab type',
        )
        disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register(
            {
              name: 'sidebar.right.pane.tab',
              key: TAB_ID,
              locale: NS,
            },
            (props) => React.createElement(Workbench, { ...props, ctx, t }),
          ),
        )
        disposeTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () =>
          ctx.slots.register(
            {
              name: 'sidebar.right.pane.tab.title',
              key: TAB_ID,
              locale: NS,
            },
            (props) => React.createElement(TabTitle, { ...props, t }),
          ),
        )
      }

      /** 打开工作台：切到右侧栏并打开（或聚焦已有的）这个 tab。 */
      const openWorkbench = () => {
        try {
          ctx.sidebarRight.openTab(TAB_KIND, { replaceTab: false })
        } catch (error) {
          console.warn('[jianbao] openTab failed: ' + (error && error.message ? error.message : error))
        }
      }

      // 预设 id 的读法照抄官方 AgentPresetLabel（dsh-client-ui-agent-preset）：
      //   state.byId[sessionId].projectionValues.agentPreset
      // 这是**同步**读，sessions.list 一变就能拿到新值；比走 RPC 稳。
      // RPC 门控只在本地读不到时兜底（例如投影还没灌进浏览器 store）。
      const presetOfClient = (id) => {
        try {
          const byId = ctx.sessions.list.getSnapshot()?.byId ?? {}
          const value = byId[id]?.projectionValues?.agentPreset
          return typeof value === 'string' ? value : undefined
        } catch {
          return undefined
        }
      }

      const ALLOWED_PRESETS = ['jianbao']

      const sync = async () => {
        if (syncing) return
        syncing = true
        try {
          const id = currentMainSessionId()
          if (id === undefined) {
            unregister()
            return
          }
          // 先本地同步判：能判出来就不必等 RPC
          let allowed = undefined
          const local = presetOfClient(id)
          if (local !== undefined) allowed = ALLOWED_PRESETS.includes(local)

          // 同一会话不必重复处理（预设在一个会话里固定，见官方 AgentPresetLabel 注释）
          if (id === registeredFor && (disposeBody !== null) === (allowed === true)) return

          if (allowed === undefined) {
            let verdict
            try {
              verdict = unwrap(await api().gate(id))
            } catch {
              // 宿主侧还没挂上 / 会话刚建立：这一轮不动，等下一次 list 变化
              return
            }
            allowed = verdict !== undefined && verdict !== null && verdict.allowed === true
          }

          if (allowed === true) {
            if (disposeBody === null) register()
            registeredFor = id
          } else {
            unregister()
          }
        } finally {
          syncing = false
        }
      }

      ban(
        () =>
          ctx.effect(() => {
            const dispose = ctx.sessions.list.subscribe(() => {
              void sync()
            })
            void sync()
            return () => {
              dispose()
              unregister()
            }
          }, 'jianbao:gate'),
        'watch sessions for jianbao gate',
        undefined,
      )
    }

    exports.name = '@zws/dsh-jianbao-client'
    // sidebarRight / sidebarRightTabs 由 dsh-client-ui-sidebar-right 提供
    // （client.js 里 ctx.reflect.provide("sidebarRightTabs", tabs) / ("sidebarRight", controller)）。
    // 缺这两个服务时右侧栏 tab 注册不了，所以必须显式 inject。
    //
    // uiSession 由 dsh-client-ui-session 提供（web-app 的核心 bundle，
    // cordis.patch.yml:276 恒挂载）。拿它只为读 adapter.current —— 官方
    // ui-sidebar-right 判断"当前会话"用的就是这一条（见 currentSessionId）。
    // cordis 的 ctx 代理对未 inject 的属性会抛
    // 「cannot get property "…" without inject」，所以必须写进来。
    exports.inject = ['slots', 'locale', 'sessions', 'remote', 'uiSession', 'sidebarRightTabs', 'sidebarRight']
    exports.apply = apply
    return module.exports
  },
})