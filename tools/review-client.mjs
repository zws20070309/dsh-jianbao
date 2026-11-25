#!/usr/bin/env node
/**
 * 客户端 bundle 契约检查（不需要 DSH 运行）。
 *
 * DSH 会把**所有插件的客户端代码拼成一个脚本**执行（官方 bundle 与第三方混在一起）。
 * 所以两件事必须成立，否则整个应用起不来：
 *   1. 顶层零绑定 —— 顶层出现 const/let/var/function/class 且撞名，拼合脚本直接语法级冲突；
 *   2. 必须是一条 window.__ModuleLoader__.load({...}) 语句 —— 注册机制只认这个入口。
 *
 * 另外检查 dsh.client 声明的 exports 真的存在、cordis.patch.yml 形状与官方一致。
 *
 * 用法： node tools/review-client.mjs
 */

import { readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fail = []
const ok = (label) => console.log('  OK   ' + label)
const bad = (label) => { fail.push(label); console.log('  FAIL ' + label) }

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
console.log('package: ' + pkg.name)

console.log('')
console.log('[1] 包声明')
if (pkg.type === 'module') ok('type: module')
else bad('type 必须是 module')
if (pkg.exports['.'] === './lib/index.js') ok('exports["."] 指向宿主入口')
else bad('exports["."] 不对：' + String(pkg.exports['.']))
if (pkg.exports['./client'] === './lib/client.js') ok('exports["./client"] 指向浏览器半')
else bad('exports["./client"] 不对：' + String(pkg.exports['./client']))
if (pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch === './cordis.patch.yml') ok('dsh.bundle.patch 已声明')
else bad('dsh.bundle.patch 未声明')
if (pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web') ok('dsh.client.platform = web')
else bad('dsh.client.platform 缺失')

console.log('')
console.log('[2] cordis.patch.yml')
const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
if (/^- insert:/mu.test(patch)) ok('使用 - insert: 新建行（不覆盖官方行）')
else bad('cordis.patch.yml 缺少 - insert:')
if (patch.includes(pkg.name)) ok('patch 里的包名与 package.json 一致')
else bad('patch 里的包名对不上：' + pkg.name)
if (patch.includes('id: tuiwen')) ok('插件行 id 存在')
else bad('插件行 id 缺失')

console.log('')
console.log('[3] 客户端 bundle 形态')
const clientPath = join(root, 'lib', 'client.js')
const source = await readFile(clientPath, 'utf8')
if (source.startsWith('window.__ModuleLoader__.load({')) ok('首行就是 window.__ModuleLoader__.load({')
else bad('首行不是 ModuleLoader.load（前面有顶层语句？）')
if (/factory:\s*\(require\)\s*=>/u.test(source)) ok('factory(require) 形态正确')
else bad('factory 形态不对')

// 顶层绑定扫描：按花括号/圆括号/方括号深度统计，深度 0 时不应出现声明
let depth = 0
const topLevel = []
for (const line of source.split('\n')) {
  const trimmed = line.trim()
  if (depth === 0 && /^(const|let|var|function|class)\s/u.test(trimmed)) topLevel.push(trimmed.slice(0, 60))
  for (const ch of line) {
    if (ch === '{' || ch === '(' || ch === '[') depth += 1
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1
  }
}
if (topLevel.length === 0) ok('顶层零绑定（可安全与其他 bundle 拼合）')
else bad('顶层有绑定，会与官方 bundle 撞名：' + topLevel.join(' / '))

console.log('')
console.log('[4] Remote 描述符')
const methods = ['snapshot', 'env', 'saveForm', 'uploadImage', 'save', 'compile', 'log', 'pdf']
let found = 0
for (const name of methods) {
  const pattern = new RegExp("method: '" + name + "'", 'u')
  if (pattern.test(source)) { found += 1; ok('描述符：' + name) }
  else bad('缺少描述符：' + name)
}
if (found === methods.length) ok('8 个 Remote 方法全部登记')
if (source.includes('$mount(CONTRIBUTION)')) ok('apply 里真的调用了 remote.$mount')
else bad('apply 没有挂载 Remote 描述符')

console.log('')
console.log('[5] 与官方 bundle 拼合（真做一次）')
const officialRoot = process.env.DSH_PROFILE_NODE_MODULES
  || join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'node_modules', '@deepseek-ai')
const bundles = []
if (existsSync(officialRoot)) {
  // 注意：profile 的 node_modules 里这些包是**目录联接**，
  // readdir withFileTypes 会把它们报成符号链接（isDirectory() 为 false），
  // 所以这里只按「目标文件在不在」判断，不看 dirent 类型。
  for (const entry of await readdir(officialRoot, { withFileTypes: true })) {
    const candidate = join(officialRoot, entry.name, 'lib', 'client.js')
    if (existsSync(candidate)) bundles.push(candidate)
  }
}
if (bundles.length === 0) {
  console.log('  跳过  找不到官方客户端 bundle（这台机器没装 DSH？）')
} else {
  const parts = []
  for (const file of bundles) parts.push(await readFile(file, 'utf8'))
  parts.push(source)
  const dir = await mkdtemp(join(tmpdir(), 'dsh-tuiwen-merge-'))
  const file = join(dir, 'merged.js')
  await writeFile(file, parts.join('\n;\n'), 'utf8')
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status === 0) ok('与 ' + bundles.length + ' 个官方 bundle 拼合后仍是合法脚本')
  else bad('拼合后语法错误：' + String(result.stderr || '').split('\n').slice(0, 3).join(' '))
  await rm(dir, { recursive: true, force: true })
}

console.log('')
if (fail.length === 0) {
  console.log('CLIENT REVIEW PASS')
  process.exit(0)
}
console.log('CLIENT REVIEW FAIL: ' + fail.length + ' 项')
for (const item of fail) console.log('  - ' + item)
process.exit(1)
