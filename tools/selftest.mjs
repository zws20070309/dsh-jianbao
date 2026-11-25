#!/usr/bin/env node
/**
 * 端到端自检：不需要 DSH，直接调宿主半的 apply()。
 *
 * 做四件事：
 *   1. 在系统临时目录建一个工作区；
 *   2. 用假 ctx 注册插件（真实 tools.register / systemPrompt.section）；
 *   3. 调 tuiwen_save 真写 .tex、真跑 xelatex（本机有 LaTeX 时出 PDF）；
 *   4. 校验产物、打印结论，退出码反映结果。
 *
 * 用法： node tools/selftest.mjs   （可选 --keep 保留临时目录）
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import * as plugin from '../lib/index.js'

const keep = process.argv.includes('--keep')
const workspace = join(tmpdir(), 'dsh-tuiwen-selftest-' + process.pid)

const fail = []
const ok = (label) => console.log('  OK   ' + label)
const bad = (label) => { fail.push(label); console.log('  FAIL ' + label) }

console.log('workspace: ' + workspace)
await mkdir(workspace, { recursive: true })

const tools = new Map()
const provided = new Map()
const sections = []
const ctx = {
  tools: { register: (def) => { tools.set(def.name, def); return () => {} } },
  systemPrompt: { section: (s) => { sections.push(s); return () => {} } },
  effect: (fn) => { fn(); return () => {} },
  provide: (key, svc) => { provided.set(key, svc) },
  get: (key) => (key === 'sessions' ? { get: () => ({ header: { cwd: workspace, id: 'selftest' } }) } : undefined),
}

console.log('\n[1] apply()')
plugin.apply(ctx)
if (tools.size === 3) ok('三只工具注册成功：' + [...tools.keys()].join(', '))
else bad('工具数量不对：' + tools.size)
if (provided.get('tuiwen') !== undefined) ok('Remote 服务 tuiwen 已提供')
else bad('Remote 服务缺失')
if (sections.length === 1 && /28\.8/u.test(sections[0].text())) ok('系统提示段已注册（含 28.8 磅行距规范）')
else bad('系统提示段缺失或内容不对')

const exec = { agent: { session: { header: { cwd: workspace, id: 'selftest' } } } }

console.log('\n[2] tuiwen_save（写稿 + 编译）')
const blocks = [
  { type: 'p', text: '为了深入贯彻落实立德树人根本任务、引导学生科学规划大学生涯，4月27日14:00，理学院举办第三届心理健康知识竞赛，院党委副书记、纪委书记张某某同志出席本次竞赛，2026级全体学生参加。' },
  { type: 'h1', text: '一、赛前准备' },
  { type: 'p', text: '竞赛启动以来，学院精心组织、周密部署，围绕心理健康知识普及设置初赛环节，各班积极响应、认真备赛，为决赛打下扎实基础。' },
  { type: 'h2', text: '（一）赛制安排' },
  { type: 'p', text: '决赛设置必答题、抢答题和情景分析三个环节，参赛选手沉着应对、从容作答，充分展现了扎实的知识储备和昂扬向上的精神面貌。' },
  { type: 'p', text: '经过多轮激烈角逐，竞赛评选出表现突出的个人与班集体。张某某同志为获奖同学颁奖并作总结讲话，勉励同学们以阳光心态面对成长中的挑战。此次竞赛内容丰富、针对性强，有效普及了心理健康知识，推动各民族交往交流交融走深走实。' },
]
const saved = await tools.get('tuiwen_save').execute({
  brief: { issue: '第12期', author: '孙某某', auditor: '张某某', phone: '13800000000', briefType: 'contest', topic: '第三届心理健康知识竞赛', blocks },
  compile: true,
}, exec)
if (existsSync(saved.tex)) ok('.tex 已生成：' + saved.tex)
else bad('.tex 没生成')
if (saved.chars > 200) ok('字数统计：' + saved.chars)
else bad('字数统计异常：' + saved.chars)
if (saved.warnings.length > 0) console.log('  提醒  ' + saved.warnings.join('；'))
const tex = await readFile(saved.tex, 'utf8')
const checks = [
  ['A4 纸张', /a4paper/u],
  ['页边距 3.7/3.5/2.8/2.6', /top=3\.7cm,bottom=3\.5cm,left=2\.8cm,right=2\.6cm/u],
  ['固定行距 28.8pt', /\{28\.8pt\}/u],
  ['大标题 22pt', /\{22pt\}/u],
  ['一级标题 20pt', /\{20pt\}/u],
  ['首行缩进 2 字符', /\\hspace\*\{2em\}/u],
  ['抄送两条横线', /\\rule\{\\textwidth\}/u],
  ['页脚页码', /\\textemdash/u],
]
for (const [label, pattern] of checks) {
  if (pattern.test(tex)) ok('版式：' + label)
  else bad('版式缺失：' + label)
}

console.log('\n[3] 编译结果')
if (saved.ok) {
  if (existsSync(saved.pdf)) ok('PDF 已生成：' + saved.pdf + '（' + saved.pages + ' 页）')
  else bad('声称成功但没有 PDF')
} else {
  console.log('  跳过  本机没有可用的 LaTeX：' + saved.error)
  console.log('        这属于预期降级（只出 .tex），不算失败。')
}

console.log('\n[4] 状态读回')
const snap = await tools.get('tuiwen_state').execute({}, exec)
if (snap.hasBrief === true && snap.brief.blocks.length === blocks.length) ok('简报数据可读回（' + snap.brief.blocks.length + ' 块）')
else bad('简报数据读回异常')
if (snap.env.latex.canCompilePdf === true) ok('环境探测：可编译 PDF（' + snap.env.latex.xelatex + '）')
else console.log('  环境  不可编译 PDF：' + snap.env.latex.error)

if (!keep) await rm(workspace, { recursive: true, force: true })

console.log('')
if (fail.length === 0) {
  console.log('SELFTEST PASS')
  process.exit(0)
}
console.log('SELFTEST FAIL: ' + fail.length + ' 项')
for (const item of fail) console.log('  - ' + item)
process.exit(1)
