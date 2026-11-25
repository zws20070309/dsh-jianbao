window.__ModuleLoader__.load({
  id: '@zws/dsh-tuiwen',
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
    //   全部走 remote.tuiwen（宿主半的 TuiwenService）：
    //     snapshot / saveForm / uploadImage / save / compile / log / pdf
    //   面板自己不读文件、不跑 LaTeX —— 浏览器没有那个权限，也不该有。

    const PACKAGE = '@zws/dsh-tuiwen'
    const NS = 'tuiwen'
    const PANEL_ID = 'tuiwen-workbench'

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
      'tip.time': '支持「2026年8月31日」「8.31」「8/31」；带 14:30 会一并写入',
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
      'status.nolatexDone': '简报源文件已生成（.tuiwen/out/brief.tex），但本机没有 LaTeX，编译不出 PDF。装好 TeX 后点「重新编译 PDF」即可。',
      'status.saved': '已保存',
      'status.sending': '已把写作任务交给模型',
      'error.remote': '浏览器端读不到简报服务（remote.tuiwen 未就绪），请重启 DSH 后再试。',
      'error.noSession': '请先进入一个会话',
      'error.nothing': '请至少填写主题名称与活动流程',
      'log.title': '编译日志（尾部）',
      'spec.title': '版式规范',
      'preview.title': '成稿预览',
      'preview.empty': '编译出 PDF 后这里会内嵌预览。',
      'clear': '清空表单',
      'openFolder': '产物目录：{dir}',
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
      'tip.time': '2026-08-31, 8.31 or 8/31; "14:30" is kept',
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
      'status.nolatexDone': 'Source written to .tuiwen/out/brief.tex, but no LaTeX here, so no PDF. Install TeX and press Recompile.',
      'status.saved': 'Saved',
      'status.sending': 'Writing task queued',
      'error.remote': 'remote.tuiwen is not ready; restart DSH and retry.',
      'error.noSession': 'Open a session first',
      'error.nothing': 'Topic and agenda are required',
      'log.title': 'Compile log (tail)',
      'spec.title': 'Layout spec',
      'preview.title': 'Preview',
      'preview.empty': 'The compiled PDF is previewed here.',
      'clear': 'Clear form',
      'openFolder': 'Outputs: {dir}',
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

.dsh-tw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px 14px}
.dsh-tw-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.dsh-tw-field.wide{grid-column:1/-1}
.dsh-tw-field label{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dsh-tw-field input,.dsh-tw-field textarea,.dsh-tw-field select{width:100%;padding:6px 8px;
border-radius:6px;border:1px solid var(--dsw-alias-border-default,#d7dbe0);
background:var(--dsw-alias-bg-surface,#fff);color:inherit;font:inherit;line-height:1.55;outline:none}
.dsh-tw-field textarea{resize:vertical;min-height:64px}
.dsh-tw-field input:focus,.dsh-tw-field textarea:focus,.dsh-tw-field select:focus{
border-color:var(--dsw-alias-brand-primary,#2563eb);
box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 22%,transparent)}
.dsh-tw-tip{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b949e)}

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

.dsh-tw-log{margin-top:10px;max-height:260px;overflow:auto;padding:10px 12px;border-radius:8px;
background:#0f1115;color:#d6dbe3;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
font-size:11.5px;line-height:1.55;white-space:pre-wrap;word-break:break-all}

.dsh-tw-preview{margin-top:18px;border-top:1px solid var(--dsw-alias-border-default,#e3e6ea);
padding-top:14px}
.dsh-tw-preview iframe{width:100%;height:520px;border:1px solid var(--dsw-alias-border-default,#e3e6ea);
border-radius:8px;background:#fff}
.dsh-tw-preview-empty{color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px}

.dsh-tw-spec{margin-top:14px;font-size:12px;line-height:1.8;
color:var(--dsw-alias-label-secondary,#6b7280)}
.dsh-tw-spec code{font-family:ui-monospace,Consolas,monospace;font-size:11.5px}
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
          id: PACKAGE + '#tuiwen/snapshot',
          service: 'tuiwen',
          namespace: 'tuiwen',
          method: 'snapshot',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec }],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#tuiwen/env',
          service: 'tuiwen',
          namespace: 'tuiwen',
          method: 'env',
          invocation: { kind: 'direct' },
          parameters: [
            { name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec },
            { name: 'force', wire: 'force', source: 'json', codec: boolCodec },
          ],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#tuiwen/saveForm',
          service: 'tuiwen',
          namespace: 'tuiwen',
          method: 'saveForm',
          invocation: { kind: 'direct' },
          parameters: [
            { name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec },
            { name: 'form', wire: 'form', source: 'json', codec: jsonCodec },
          ],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#tuiwen/uploadImage',
          service: 'tuiwen',
          namespace: 'tuiwen',
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
          id: PACKAGE + '#tuiwen/save',
          service: 'tuiwen',
          namespace: 'tuiwen',
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
          id: PACKAGE + '#tuiwen/compile',
          service: 'tuiwen',
          namespace: 'tuiwen',
          method: 'compile',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec }],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#tuiwen/log',
          service: 'tuiwen',
          namespace: 'tuiwen',
          method: 'log',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec }],
          result: jsonCodec,
        },
        {
          id: PACKAGE + '#tuiwen/pdf',
          service: 'tuiwen',
          namespace: 'tuiwen',
          method: 'pdf',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: sessionIdCodec }],
          result: jsonCodec,
        },
      ],
    }

    /** 只插一次样式表。 */
    function installStyles() {
      if (typeof document === 'undefined') return
      const tagId = PACKAGE + '/tuiwen.css'
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

    /** 取简报 Remote 命名空间（惰性：apply 时它可能还没挂上）。 */
    function apiOf(ctx) {
      return () => {
        const direct = typeof ctx.get === 'function' ? ctx.get('remote.tuiwen') : undefined
        if (direct !== undefined && direct !== null) return direct
        const remote = typeof ctx.get === 'function' ? ctx.get('remote') : undefined
        const namespace = remote === undefined || remote === null ? undefined : remote.tuiwen
        if (namespace === undefined || namespace === null) throw new Error('remote.tuiwen is not mounted')
        return namespace
      }
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
    /** 把表单变成交给模型的任务书。字段缺什么就明说缺，不让模型猜。 */
    function buildTask(form, images) {
      const lines = []
      lines.push('请为西藏大学理学院写一篇简报，并按工作台的版式编译成 PDF。')
      lines.push('')
      lines.push('【基本信息】')
      lines.push('- 简报类型：' + (TYPES.find((x) => x.id === form.briefType) || TYPES[1]).label)
      lines.push('- 期号：' + (form.issue || '第XX期'))
      if (form.topic) lines.push('- 主题名称：' + form.topic)
      if (form.activityTime) lines.push('- 活动时间：' + form.activityTime)
      if (form.leaderName) lines.push('- 出席领导：' + form.leaderName)
      if (form.audience) lines.push('- 参加人群：' + form.audience)
      if (form.activityFlow) lines.push('- 活动流程：' + form.activityFlow.replace(/\n+/gu, '；'))
      if (form.author) lines.push('- 撰稿人：' + form.author)
      if (form.auditor) lines.push('- 审签人：' + form.auditor)
      if (form.phone) lines.push('- 联系方式：' + form.phone)
      if (images.length > 0) lines.push('- 插图：' + images.length + ' 张（已在 .tuiwen/out/ 下：' + images.join('、') + '）')
      lines.push('')
      lines.push('【要求】')
      lines.push('1. 正文 4 个自然段、400–600 字（不含标点），按会话里的「简报写作」规范。')
      lines.push('2. 调用 tuiwen_state 先读工程，再调用 tuiwen_save 提交**完整** blocks 并编译。')
      lines.push('3. 有插图时用 image / imagePair 块把它们插到对应段落之后。')
      lines.push('4. 编译失败就按日志修，不要说「环境问题」了事；没有 LaTeX 就如实说明只能出 .tex。')
      lines.push('5. 完成后一句话汇报：PDF 路径、页数、字数、还有什么要用户确认的。')
      return lines.join('\n')
    }

    /**
     * 发一条消息进当前会话。
     *
     * 为什么这么绕：conversation 是**作用域寻址**的服务 —— 它读发送方 ctx 上的
     * session tag（dsh-client-ui-conversation/lib/client.js:3265-3271「property access
     * through ctx.conversation rebinds this.ctx to the caller's context, so methods read
     * the session tag with scopeOf」）。在根 ctx 上直接调会抛「requires a session scope」。
     * 所以要拿到那个会话的 Agent 作用域，三条路依次试（前一条不可用是正常情况）：
     *   1. sessions.scope(id)        —— 会话已被别处 retain 时直接可用
     *   2. sessions.binding(id).ctx  —— 同上，另一种暴露方式
     *   3. sessions.retain(...)      —— 都没 retain 时自己借一个引用，发完就放
     */
    async function sendPrompt(ctx, sessionId, text) {
      const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
      if (sessions === undefined || sessions === null) throw new Error('sessions 服务不可用')

      const conversationOf = (scoped) => {
        if (scoped === undefined || scoped === null) return undefined
        try {
          const conversation = scoped.conversation
          if (conversation !== undefined && conversation !== null && typeof conversation.send === 'function') return conversation
        } catch {
          /* 作用域失效就换下一条路 */
        }
        return undefined
      }

      const direct = conversationOf(typeof sessions.scope === 'function' ? sessions.scope(sessionId) : undefined)
      if (direct !== undefined) {
        await direct.send(text)
        return
      }

      const viaBinding = conversationOf(typeof sessions.binding === 'function' ? sessions.binding(sessionId)?.ctx : undefined)
      if (viaBinding !== undefined) {
        await viaBinding.send(text)
        return
      }

      if (typeof sessions.retain !== 'function') throw new Error('会话作用域不可用：sessions.retain 缺失')
      const reference = sessions.retain(sessionId, { source: 'mainView' })
      try {
        await reference.ready
        const scoped = conversationOf(reference.binding?.ctx)
        if (scoped === undefined) throw new Error('会话作用域不可用：拿不到 conversation 服务')
        await scoped.send(text)
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
    /** 工作台面板。 */
    function Workbench(props) {
      const { sessionId, t: translate } = props
      const t = React.useMemo(() => makeT(translate), [translate])
      const ctx = props.ctx
      const api = React.useMemo(() => apiOf(ctx), [ctx])
      const id = typeof sessionId === 'string' ? sessionId : ''

      const [form, setForm] = React.useState(emptyForm)
      const [env, setEnv] = React.useState(null)
      const [envBusy, setEnvBusy] = React.useState(true)
      const [busy, setBusy] = React.useState('')          // '' | 'env' | 'save' | 'compile' | 'send'
      const [status, setStatus] = React.useState({ kind: 'idle', text: '' })
      const [log, setLog] = React.useState('')
      const [showLog, setShowLog] = React.useState(false)
      const [pdfUrl, setPdfUrl] = React.useState('')
      const [meta, setMeta] = React.useState(null)
      const [outputs, setOutputs] = React.useState([])
      const [workspace, setWorkspace] = React.useState('')
      const [loaded, setLoaded] = React.useState(false)
      /** 本地预览：src → objectURL。**不落盘**，form.json 里只有路径。 */
      const [previews, setPreviews] = React.useState({})

      const alive = React.useRef(true)
      React.useEffect(() => () => { alive.current = false }, [])

      /** 取首屏：环境 + 表单 + 产物。 */
      const load = React.useCallback(async (forceEnv) => {
        if (id === '') { setEnvBusy(false); return }
        setEnvBusy(true)
        try {
          const snapshot = unwrap(await api().snapshot(id))
          if (!alive.current) return
          setEnv(snapshot.env)
          setWorkspace(snapshot.workspace || '')
          setOutputs(snapshot.outputs || [])
          setMeta(snapshot.meta || null)
          setForm((current) => {
            const incoming = snapshot.form
            if (incoming === null || typeof incoming !== 'object') return current
            return {
              ...emptyForm(),
              ...incoming,
              cc: typeof incoming.cc === 'string' ? incoming.cc : Array.isArray(incoming.cc) ? incoming.cc.join('\n') : current.cc,
              images: Array.isArray(incoming.images) ? incoming.images : [],
            }
          })
          setLoaded(true)
          if (forceEnv === true) setEnvBusy(false)
        } catch (error) {
          if (!alive.current) return
          setStatus({ kind: 'bad', text: String(error && error.message ? error.message : error) })
        } finally {
          if (alive.current) setEnvBusy(false)
        }
      }, [api, id])

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
          if (alive.current) setStatus({ kind: 'bad', text: String(error && error.message ? error.message : error) })
        } finally {
          if (alive.current) setEnvBusy(false)
        }
      }, [api, id])

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
            setStatus({ kind: 'bad', text: t('img.failed', { msg: String(error && error.message ? error.message : error) }) })
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

      /** 刷新 PDF 预览。 */
      const refreshPdf = React.useCallback(async () => {
        if (id === '') return
        try {
          const result = unwrap(await api().pdf(id))
          if (!alive.current) return
          if (result && result.ok === true && result.data) {
            const url = base64ToBlobUrl(result.data, 'application/pdf')
            setPdfUrl((old) => {
              if (old !== '') URL.revokeObjectURL(old)
              return url
            })
          }
        } catch {
          /* 没有 PDF 就不预览 */
        }
      }, [api, id])

      React.useEffect(() => {
        if ((outputs || []).includes('brief.pdf')) refreshPdf()
      }, [outputs, refreshPdf])

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
          // 先把表单与骨架落盘：模型一上来 tuiwen_state 就能读到
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
          await sendPrompt(ctx, id, buildTask(form, images))
          if (!alive.current) return
          setStatus({ kind: 'warn', text: t('status.working') })
        } catch (error) {
          if (!alive.current) return
          setStatus({ kind: 'bad', text: t('status.failed', { msg: String(error && error.message ? error.message : error) }) })
        } finally {
          if (alive.current) setBusy('')
        }
      }, [api, ctx, form, id, t])

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
            await refreshPdf()
            try {
              const snap = unwrap(await api().snapshot(id))
              if (alive.current) setMeta(snap.meta || null)
            } catch { /* 元数据拿不到不影响主流程 */ }
          } else {
            const raw = await api().log(id).then(unwrap).catch(() => ({ log: '' }))
            if (alive.current) setLog(raw.log || result.logTail || '')
            setStatus({ kind: 'bad', text: t('status.failed', { msg: result.error || '' }) })
          }
        } catch (error) {
          if (!alive.current) return
          setStatus({ kind: 'bad', text: t('status.failed', { msg: String(error && error.message ? error.message : error) }) })
        } finally {
          if (alive.current) setBusy('')
        }
      }, [api, id, refreshPdf, t])

      const openPdf = React.useCallback(() => {
        if (pdfUrl === '') return
        window.open(pdfUrl, '_blank', 'noopener')
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
            h('span', null, t('panel.subtitle'))),

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
            field('activityTime', t('field.time'), { tip: t('tip.time'), placeholder: '2026年4月27日 14:30' }),
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

          status.text !== ''
            ? h('div', { className: 'dsh-tw-status', 'data-kind': status.kind }, status.text)
            : (loaded ? h('div', { className: 'dsh-tw-status', 'data-kind': 'idle' }, t('status.idle')) : null),

          showLog && log !== ''
            ? h('div', { className: 'dsh-tw-log' }, log)
            : null,

          workspace !== '' ? h('div', { className: 'dsh-tw-tip', style: { marginTop: '8px' } }, t('openFolder', { dir: workspace + '/.tuiwen/out' })) : null,

          // 预览
          h('div', { className: 'dsh-tw-preview' },
            h('h3', null, t('preview.title')),
            pdfUrl === ''
              ? h('div', { className: 'dsh-tw-preview-empty' }, t('preview.empty'))
              : h('iframe', { src: pdfUrl, title: 'PDF' })),

          // 版式规范
          h('div', { className: 'dsh-tw-spec' },
            h('h3', null, t('spec.title')),
            h('div', null, '纸张：A4（210mm × 297mm）　页边距：上 3.7cm　下 3.5cm　左 2.8cm　右 2.6cm'),
            h('div', null, '行距：固定值 28.8 磅（标题与全文一致）'),
            h('div', null, '正文标题：2 号（22pt）方正小标宋　正文：3 号（16pt）方正仿宋_GBK，首行缩进 2 字符'),
            h('div', null, '一级标题：方正黑体简体 20pt　二级标题：方正楷体_GBK 三号加粗　三级标题：方正仿宋_GBK 三号加粗'),
            h('div', null, '抄送区：仿宋 15pt，两条通栏横线，压在最后一页底部　页脚：— N —，14pt 右对齐'))),
      )
    }
    /** 注册 Remote 命名空间 + 面板。 */
    async function apply(ctx) {
      installStyles()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'tuiwen:dictionaries')
      const t = ctx.locale.bind(NS)

      // 先挂 Remote，再挂 UI：面板首屏就调 snapshot，命名空间没就绪会立刻报
      // 「remote.tuiwen is not mounted」。挂载失败不阻断 UI —— 面板会显示这条错误，
      // 比整块 tab 消失更容易诊断。
      try {
        const remote = ctx.get('remote')
        if (remote !== undefined && remote !== null && typeof remote.$mount === 'function') {
          await remote.$mount(CONTRIBUTION)
        } else {
          console.warn('[tuiwen] remote 服务不可用，工作台将无法与宿主通信')
        }
      } catch (error) {
        console.warn('[tuiwen] $mount failed: ' + (error && error.message ? error.message : error))
      }
      const ban = (fn, label, fallback) => {
        try {
          return fn()
        } catch (error) {
          try {
            console.warn('[tuiwen] ' + label + ': ' + (error && error.message ? error.message : error))
          } catch {
            /* 日志通道坏了不该影响主流程 */
          }
          return fallback
        }
      }
      ban(
        () =>
          ctx.effect(
            () =>
              ctx.slots.inject('conversation.view', () =>
                ctx.slots.register(
                  {
                    name: 'conversation.view',
                    id: PANEL_ID,
                    // order 120：排在官方 chat / trajectory / stats（≤100）之后
                    order: 120,
                    label: () => t('nav'),
                    locale: NS,
                    registrant: PACKAGE,
                  },
                  (props) => React.createElement(Workbench, { ...props, ctx, t }),
                ),
              ),
            'tuiwen:slot',
          ),
        'register conversation.view',
        undefined,
      )
    }

    exports.name = '@zws/dsh-tuiwen-client'
    exports.inject = ['slots', 'locale', 'sessions', 'remote']
    exports.apply = apply
    return module.exports
  },
})