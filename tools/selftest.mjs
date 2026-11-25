#!/usr/bin/env node
/**
 * 端到端自测：不启动 DSH，用真实的宿主半代码走完整链路。
 *
 *   1. 用本包自带的 XeLaTeX 渲染器写出 .tex；
 *   2. 真调 xelatex 编译出 PDF；
 *   3. 从**产出的 PDF** 里读回 span 级基线，逐项断言它等于 lib/brief.js 的 METRICS。
 *
 * 为什么第 3 步不是"和参考 PDF 比"：
 *   参考样本（74 号）第 1 页有图，Word 的图片绕排把正文挤到右侧、还把一行切成
 *   两段 span。拿它做逐行几何比对，我们的**无图**产物必然大量 MISS —— 那是
 *   比较对象不同（有没有图），不是版式错。所以这里断言的是"我们自己产出的
 *   PDF 有没有落在实测标定的坐标上"，参考 PDF 的比对留给
 *   tools/geometry-diff.mjs 做人工验收（它输出逐行偏差表）。
 *
 * 用法：
 *   node tools/selftest.mjs
 *
 * 退出码：0 = 全部命中；1 = 有偏差或编译失败；2 = 环境缺件。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { METRICS } from '../lib/brief.js'
import { renderTex } from '../lib/render-tex.js'
import { detectEnvironment } from '../lib/env.js'
import { compileTex } from '../lib/compile.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0
const say = (line) => console.log(line)
const fail = (line) => { failed += 1; console.error('FAIL ' + line) }

// 与参考样本一字不差的正文：只有文本相同，断行位置才可比。
const DOC = {
  title: '西藏大学理学院召开2026级新生见面会暨入学教育动员大会',
  issue: '第74期',
  year: '2026',
  org: '西藏大学理学院',
  author: '冯某某',
  auditor: '李某某',
  phone: '13800000002',
  cc: ['校领导、院领导', '党委（校长）办公室、党委宣传部'],
  blocks: [
    { type: 'p', text: '为给师生搭建沟通交流平台，帮助新生认识学院管理服务团队，消除初入校园的陌生感，引导新生尽快适应高原校园环境，做好大学阶段的学习生活规划。8月29日，西藏大学理学院于图书馆二楼学术报告厅举行2026级新生见面会暨入学教育动员大会。会议由学院党委副书记、纪委书记张某某同志主持，学院领导班子、各系科中心、职能科室管理团队及全体2026级新生参会。' },
    { type: 'p', text: '大会在庄严的国歌声中拉开序幕。理学院党委副书记、院长刘某某致欢迎辞，对新同学奔赴雪域求学表示热烈欢迎。他介绍学院办学条件与师资科研平台，结合藏大精神，勉励新生厚植家国情怀，传承高原精神；笃学求真，夯实理学专业基础；友善包容，共建温暖集体；严守纪律，筑牢安全防线。同时表示学院全体教职工将全力做好学生成长后盾。' },
    { type: 'p', text: '随后，主持人逐一介绍学院领导、各科室及系科中心负责人，帮助新生熟悉管理服务队伍，消除入校陌生感。学生科科长陈某某作入学教育动员，阐明入学教育对适应高原校园生活的重要意义，引导同学们感悟藏大精神，树立“扎根雪域、服务地方”的理想信念，尽快完成角色转变。' },
    { type: 'p', text: '本次大会搭建起师生沟通桥梁，帮助新生了解学院、明晰大学学习生活要求，激励同学们立足高原，勤学奋进，开启理学院青春奋斗新征程。' },
  ],
}

say('jianbao selftest')
say('  root: ' + root)

const env = await detectEnvironment()
say('  xelatex: ' + (env.latex.xelatex || '(not found)'))
if (env.latex.canCompilePdf !== true) {
  say('SKIP 本机没有可用的 XeLaTeX：无法做像素级验收')
  process.exit(2)
}
const missing = ['fangsong', 'heiti', 'kaiti', 'songti'].filter((role) => !(env.fonts.roles?.[role]?.file))
say('  fonts: ' + (missing.length === 0 ? '方正/系统字体齐备' : '缺 ' + missing.join('、')))

const work = join(root, '_selftest')
await rm(work, { recursive: true, force: true })
await mkdir(work, { recursive: true })

// 1) 出 .tex（用渲染器自己的字体候选链 —— 与参考样本同一套）
const tex = renderTex(DOC, {
  fontDir: env.fonts?.dirs?.[0] ?? 'C:/Windows/Fonts',
  localFontDir: env.fonts?.dirs?.[1] ?? 'C:/Windows/Fonts',
})
const texFile = join(work, 'brief.tex')
await writeFile(texFile, tex, 'utf8')
say('  tex: ' + texFile + ' (' + tex.length + ' bytes)')
if (!tex.includes('paperwidth=595.32bp')) fail('.tex 里没有实测页面尺寸')

// 2) 编译
const out = await compileTex({ xelatex: env.latex.xelatex, workDir: work, jobName: 'brief' })
if (out.ok !== true) {
  fail('xelatex 编译失败：' + (out.logTail || out.log || '').slice(-1200))
  say('SELFTEST FAIL')
  process.exit(1)
}

// 3) 从产出的 PDF 读回几何，与 METRICS 对账
const probe = join(work, 'probe.py')
await writeFile(probe, [
  'import pymupdf, json, sys',
  'sys.stdout.reconfigure(encoding="utf-8")',
  'd = pymupdf.open(sys.argv[1])',
  'rows = []',
  'for pno in range(d.page_count):',
  '    for b in d[pno].get_text("rawdict")["blocks"]:',
  '        if b["type"] != 0: continue',
  '        for ln in b["lines"]:',
  '            t = "".join(c["c"] for sp in ln["spans"] for c in sp["chars"]).strip()',
  '            if not t: continue',
  '            rows.append({"page": pno + 1, "y": round(ln["spans"][0]["origin"][1], 3),',
  '                         "x0": round(ln["bbox"][0], 2), "x1": round(ln["bbox"][2], 2),',
  '                         "size": round(ln["spans"][0]["size"], 2), "text": t})',
  'pages = d.page_count',
  'w, h = d[0].rect.width, d[0].rect.height',
  'print(json.dumps({"pages": pages, "w": round(w, 2), "h": round(h, 2), "rows": rows}, ensure_ascii=False))',
].join('\n'), 'utf8')

const run = spawnSync('python', [probe, out.pdf], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
if (run.status !== 0) {
  fail('读 PDF 几何失败（需要 python + PyMuPDF）：' + String(run.stderr || '').slice(0, 400))
  say('SELFTEST FAIL')
  process.exit(1)
}
const geo = JSON.parse(run.stdout)
say('  pdf: ' + out.pdf + ' (' + geo.pages + ' pages, ' + geo.w + '×' + geo.h + ')')

const near = (a, b, tol) => Math.abs(a - b) <= tol
const check = (label, actual, expected, tol = 0.6) => {
  if (near(actual, expected, tol)) say('  OK   ' + label + ' = ' + actual + '（期望 ' + expected + '）')
  else fail(label + ' = ' + actual + '，期望 ' + expected + '（容差 ' + tol + '）')
}

check('页面宽', geo.w, METRICS.pageW, 0.05)
check('页面高', geo.h, METRICS.pageH, 0.05)

const page1 = geo.rows.filter((row) => row.page === 1)
const find = (prefix) => page1.find((row) => row.text.startsWith(prefix))

const issue = find('2026年') || find('2026 年')
if (issue === undefined) fail('首页找不到期号行')
else check('期号基线', issue.y, METRICS.issueBaseline)

const mast = find('西藏大学理学院') 
if (mast === undefined) fail('首页找不到报头第一行')
else check('报头一基线', mast.y, METRICS.masthead1)

const audit = find('审签人')
if (audit === undefined) fail('首页找不到报头第二行')
else check('报头二基线', audit.y, METRICS.masthead2)

const title = find('西藏大学理学院召开')
if (title === undefined) fail('首页找不到大标题')
else {
  check('大标题首行基线', title.y, METRICS.title1)
  check('大标题左边距', title.x0, METRICS.marginLeft, 0.5)
}

const body1 = find('为给师生')
if (body1 === undefined) fail('首页找不到正文首行')
else {
  check('正文首行基线', body1.y, METRICS.body1)
  check('正文左边距（不缩进）', body1.x0, METRICS.marginLeft, 0.5)
}

const page2 = geo.rows.filter((row) => row.page === 2)
if (page2.length === 0) fail('只有 1 页，参考是 2 页以上（正文被截断？）')
else check('第 2 页首行基线', page2[0].y, METRICS.page2Baseline)

const footer = geo.rows.find((row) => /^—\s*\d+\s*—$/u.test(row.text))
if (footer === undefined) fail('找不到页脚页码')
else {
  check('页脚基线', footer.y, METRICS.footerBaseline)
  check('页脚右端', footer.x1, 506.01, 0.5)
  check('页脚字号', footer.size, METRICS.pagePt, 0.05)
}

const cc1 = geo.rows.find((row) => row.text.startsWith('抄送'))
if (cc1 === undefined) fail('找不到抄送首行')
else check('抄送首行基线', cc1.y, METRICS.ccBaseline1)

const cc2 = geo.rows.find((row) => row.text.startsWith('党委（校长）办公室'))
if (cc2 === undefined) fail('找不到抄送次行')
else check('抄送次行基线', cc2.y, METRICS.ccBaseline2)

say('')
if (failed > 0) {
  say('SELFTEST FAIL（' + failed + ' 项偏差）')
  process.exit(1)
}
say('SELFTEST PASS')
say('  产出 PDF 的页面尺寸、首页各块基线、正文左边距、页脚、抄送区全部落在实测坐标上')
