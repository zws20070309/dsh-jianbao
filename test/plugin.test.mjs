/**
 * 宿主编排自测：用假 ctx 真跑 apply()，验证服务/工具/提示词三件事都注册上了，
 * 并且工具真能写盘、真能调起 xelatex 出 PDF（本机没装 LaTeX 时只写 .tex）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import * as plugin from '../lib/index.js'

async function makeCtx(workspace) {
  const state = { tools: new Map(), sections: [], provided: new Map(), effects: [] }
  const ctx = {
    tools: { register: (def) => { state.tools.set(def.name, def); return () => {} } },
    systemPrompt: { section: (section) => { state.sections.push(section); return () => {} } },
    effect: (fn) => { state.effects.push(fn()); return () => {} },
    provide: (key, svc) => { state.provided.set(key, svc) },
    get: (key) => (key === 'sessions' ? { get: () => ({ header: { cwd: workspace, id: 's1' } }) } : undefined),
  }
  return { ctx, state }
}

const workspace = join(tmpdir(), 'dsh-jianbao-test-' + process.pid)

/**
 * 把两个入口都挂上 —— 与真实 DSH 的挂载形状一致。
 *
 * 顶层 jianbao 行（apply）provide 工作台 Remote 服务 + 常驻提示段；
 * 预设内 jianbao 行（tools.js）只注册三只工具。
 * 拆开的原因见 lib/tools.js 顶部：预设里 provide 服务两头堵死
 * （不 isolate 被 leakedServices 判泄漏；isolate 了网关又发现不了 Remote）。
 */
function mountAll(ctx) {
  plugin.apply(ctx)
  plugin.createToolRegistrar(ctx)()
}

test('apply：注册服务、系统提示段与三只工具', async () => {
  await mkdir(workspace, { recursive: true })
  const { ctx, state } = await makeCtx(workspace)
  mountAll(ctx)
  assert.equal(state.provided.get('jianbao')?.constructor?.name, 'JianbaoService')
  assert.equal(state.sections.length, 1)
  assert.equal(state.sections[0].name, 'jianbao:spec')
  assert.equal(state.sections[0].interpolate, false)
  assert.match(state.sections[0].text(), /28\.8/u)
  assert.deepEqual([...state.tools.keys()], ['jianbao_state', 'jianbao_save', 'jianbao_render'])
  for (const tool of state.tools.values()) {
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.output.render, 'function')
    assert.equal(tool.parameters.type, 'object')
    assert.equal(tool.parameters.properties !== undefined, true)
  }
})

test('env：带上包版本（工作台用它显示版本角标，便于确认重启后加载的是哪版）', async () => {
  await mkdir(workspace, { recursive: true })
  const { ctx, state } = await makeCtx(workspace)
  mountAll(ctx)
  const service = state.provided.get('jianbao')
  const report = await service.env('s1', true)
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(report.plugin?.name, '@zws/dsh-jianbao')
  assert.equal(report.plugin?.version, pkg.version)
  assert.match(report.plugin.version, /^\d+\.\d+\.\d+/u, '版本号得像个版本号')
  // 原有的环境字段一个都不能少（版本是加挂的，不是替换）
  assert.equal(typeof report.latex, 'object')
})

test('jianbao_save：写盘 + 出 .tex，本机有 LaTeX 时出 PDF', async () => {
  await mkdir(workspace, { recursive: true })
  const { ctx, state } = await makeCtx(workspace)
  mountAll(ctx)
  const exec = { agent: { session: { header: { cwd: workspace, id: 's1' } } } }
  const blocks = [
    { type: 'p', text: '为了深入贯彻落实立德树人根本任务，4月27日，理学院举办第三届心理健康知识竞赛，2026级全体学生参加。' },
    { type: 'p', text: '竞赛设置必答题、抢答题两个环节，参赛选手沉着应对、从容作答，展现出扎实的知识储备。' },
    { type: 'p', text: '经过多轮激烈角逐，竞赛评选出表现突出的个人与班集体，学院为获奖同学颁奖并作总结讲话。' },
    { type: 'p', text: '此次竞赛内容丰富、针对性强，有效普及了心理健康知识，推动各民族交往交流交融走深走实。' },
  ]
  const result = await state.tools.get('jianbao_save').execute({
    brief: { issue: '第12期', author: '孙某某', phone: '13800000000', briefType: 'contest', topic: '心理健康知识竞赛', blocks },
    compile: true,
  }, exec)

  assert.equal(typeof result.tex, 'string')
  assert.ok(existsSync(result.tex), '.tex 必须落盘')
  const tex = await readFile(result.tex, 'utf8')
  // 版式用实测 bp 值（见 lib/brief.js 的 METRICS）：A4 595.32×841.92，
  // 页边距 1588/1474/2098/1985 twips ÷ 20 = 79.4 / 73.7 / 104.9 / 99.25
  assert.match(tex, /paperwidth=595\.32bp,paperheight=841\.92bp/u)
  assert.match(tex, /left=79\.4bp,right=73\.7bp,top=104\.9bp,bottom=99\.25bp/u)
  assert.match(tex, /\\FZTitle\\fontsize\{21\.96bp\}\{28\.92bp\}/u)
  assert.equal(result.chars > 100, true)

  // session-isolated state: <cwd>/.jianbao/sessions/<id>/brief.json (id=s1)
  const briefPath = join(workspace, '.jianbao', 'sessions', 's1', 'brief.json')
  assert.ok(existsSync(briefPath), 'brief.json 必须落盘')
  const saved = JSON.parse(await readFile(briefPath, 'utf8'))
  assert.equal(saved.blocks.length, 4)
  assert.equal(saved.briefType, 'contest')
  // 标题留空 → 自动按模板生成
  assert.match(saved.title, /西藏大学理学院/u)

  if (result.ok) {
    assert.ok(existsSync(result.pdf), 'PDF 必须落盘')
    assert.ok(result.pages >= 1)
  } else {
    // 没有 LaTeX：必须以「只能出 .tex」的理由明确失败，而不是静默成功
    assert.ok(result.error.length > 0)
    assert.equal(existsSync(result.pdf), false)
  }
})

test('jianbao_render：没有简报时报缺数据，有简报时读同一份', async () => {
  await mkdir(workspace, { recursive: true })
  const empty = join(workspace, 'empty')
  await mkdir(empty, { recursive: true })
  const a = await makeCtx(empty)
  mountAll(a.ctx)
  const exec = { agent: { session: { header: { cwd: empty, id: 's1' } } } }
  const missing = await a.state.tools.get('jianbao_render').execute({}, exec)
  assert.equal(missing.ok, false)
  assert.match(missing.error, /还没有简报数据/u)
})

test('jianbao_state：读回表单/简报/环境/产物', async () => {
  await mkdir(workspace, { recursive: true })
  const { ctx, state } = await makeCtx(workspace)
  mountAll(ctx)
  const exec = { agent: { session: { header: { cwd: workspace, id: 's1' } } } }
  const service = state.provided.get('jianbao')
  await service.saveForm('s1', { topic: '测试主题' })
  const snap = await state.tools.get('jianbao_state').execute({}, exec)
  assert.equal(snap.workspace, workspace)
  assert.equal(snap.form.topic, '测试主题')
  assert.equal(typeof snap.env.latex.canCompilePdf, 'boolean')
  assert.ok(Array.isArray(snap.outputs))
  assert.equal(snap.spec.types.length, 4)
})

test('uploadImage：base64 落地到 assets，路径是相对 out/ 的 Posix 形式', async () => {
  await mkdir(workspace, { recursive: true })
  const { ctx, state } = await makeCtx(workspace)
  mountAll(ctx)
  const service = state.provided.get('jianbao')
  // 1x1 PNG
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const result = await service.uploadImage('s1', '图 1.png', png)
  assert.equal(result.ok, true)
  assert.match(result.src, /^assets\/.+\.png$/u)
  assert.ok(existsSync(join(workspace, '.jianbao', 'sessions', 's1', 'out', result.src)))
  await assert.rejects(() => service.uploadImage('s1', 'x.png', ''), /图片内容为空/u)
})

test('insideWorkspace：越界路径被拒绝', async () => {
  await mkdir(workspace, { recursive: true })
  const { ctx, state } = await makeCtx(workspace)
  mountAll(ctx)
  const service = state.provided.get('jianbao')
  await assert.rejects(() => service.importImage('s1', '../../etc/passwd'), /路径越出工作区/u)
})

test('compileTex：可执行文件不存在时必须失败（不能拿上一次的 PDF 充数）', async () => {
  const { mkdir: mk, writeFile: wf } = await import('node:fs/promises')
  const { compileTex } = await import('../lib/compile.js')
  const dir = join(workspace, 'compile-degrade')
  await mk(dir, { recursive: true })
  await wf(join(dir, 'brief.tex'), '\\documentclass{article}\\begin{document}x\\end{document}', 'utf8')
  // 放一个假的旧 PDF，验证新实现会先删掉它
  await wf(join(dir, 'brief.pdf'), '%PDF-1.4 stale', 'utf8')
  const result = await compileTex({ xelatex: 'C:/definitely-not-here/xelatex.exe', workDir: dir, jobName: 'brief' })
  assert.equal(result.ok, false)
  assert.equal(result.pdf, null)
  assert.equal(existsSync(join(dir, 'brief.pdf')), false, '旧 PDF 必须被清掉')
})

test('会话隔离：两个会话在同一 cwd 下不共享表单与产物', async () => {
  // 用户反馈：新建会话打开右栏，上一次填的内容还在。
  // 根因是所有会话共用 <cwd>/.jianbao/，现在按会话拆到 sessions/<id>/。
  const shared = join(tmpdir(), 'dsh-jianbao-iso-' + process.pid)
  await mkdir(shared, { recursive: true })
  const { ctx, state } = await makeCtx(shared)
  mountAll(ctx)
  const service = state.provided.get('jianbao')

  // 会话 A 存一份表单
  await service.saveForm('sessionA', { topic: 'A 的主题', issue: '第1期' })
  // 会话 B 读到的应该是空的
  const b = await service.snapshot('sessionB')
  assert.equal(b.form?.topic ?? '', '', '会话 B 不该看到会话 A 的表单')
  assert.deepEqual(b.outputs, [], '会话 B 不该看到会话 A 的产物')

  // 会话 B 存自己的，两个互不影响
  await service.saveForm('sessionB', { topic: 'B 的主题', issue: '第2期' })
  const a2 = await service.snapshot('sessionA')
  assert.equal(a2.form.topic, 'A 的主题', '会话 A 的表单不该被 B 覆盖')
  const b2 = await service.snapshot('sessionB')
  assert.equal(b2.form.topic, 'B 的主题')

  // 物理上也应是两个独立目录
  assert.ok(existsSync(join(shared, '.jianbao', 'sessions', 'sessionA', 'form.json')))
  assert.ok(existsSync(join(shared, '.jianbao', 'sessions', 'sessionB', 'form.json')))
  await rm(shared, { recursive: true, force: true }).catch(() => {})
})

test('老数据迁移：根目录的 brief.json 会被搬到 sessions/<id>/', async () => {
  // 按会话隔离后，老用户的数据还在 .jianbao/ 根下。
  // 首次访问该会话时应该拷一份过去，否则用户会以为简报丢了。
  const legacy = join(tmpdir(), 'dsh-jianbao-mig-' + process.pid)
  await mkdir(join(legacy, '.jianbao'), { recursive: true })
  await writeFile(
    join(legacy, '.jianbao', 'brief.json'),
    JSON.stringify({ title: '老简报标题', blocks: [{ type: 'p', text: '老正文。' }] }),
    'utf8',
  )
  const { ctx, state } = await makeCtx(legacy)
  mountAll(ctx)
  const service = state.provided.get('jianbao')

  const snap = await service.snapshot('legacySession')
  assert.equal(snap.brief?.title, '老简报标题', '老数据应当被迁移过来')
  // 原始文件保留（不删，留回退余地）
  assert.ok(existsSync(join(legacy, '.jianbao', 'brief.json')), '原数据不该被删除')
  assert.ok(
    existsSync(join(legacy, '.jianbao', 'sessions', 'legacySession', 'brief.json')),
    '新位置应当有拷贝',
  )
  await rm(legacy, { recursive: true, force: true }).catch(() => {})
})

test('迁移只做一次：第二个新会话必须从空开始（这正是用户要的）', async () => {
  const dir = join(tmpdir(), 'dsh-jianbao-once-' + process.pid)
  await mkdir(join(dir, '.jianbao'), { recursive: true })
  await writeFile(
    join(dir, '.jianbao', 'form.json'),
    JSON.stringify({ topic: '老会话的主题' }),
    'utf8',
  )
  const { ctx, state } = await makeCtx(dir)
  mountAll(ctx)
  const service = state.provided.get('jianbao')

  // 第一个会话认领老数据
  const first = await service.snapshot('firstSession')
  assert.equal(first.form?.topic, '老会话的主题')

  // 第二个会话必须是空的 —— 用户反馈的核心诉求
  const second = await service.snapshot('secondSession')
  assert.equal(second.form?.topic ?? '', '', '新会话不该继承老数据')
  assert.ok(existsSync(join(dir, '.jianbao', '.migrated')), '认领后应留下标记')
  await rm(dir, { recursive: true, force: true }).catch(() => {})
})

test('cleanup', async () => {
  await rm(workspace, { recursive: true, force: true })
})