/**
 * 预设的 !!js 表达式与技能目录自测。
 *
 * cordis 求值 !!js 用的是 new Function('ctx','expr','with(ctx){return eval(expr)}')，
 * 那里没有 import.meta（会抛 SyntaxError），也没有本包路径。所以补丁里只能写
 * process / dshHomePath 这类宿主作用域里的东西。这条测试把规则焊死。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { syncBundledSkills } from '../lib/index.js'

const PATCH = 'D:/Desktop/插件/dsh-jianbao/cordis.patch.yml'

/** cordis 求值 !!js 的方式，原样照抄（cordis-plugin-loader）。 */
function cordisEvaluate(ctx, expr) {
  const fn = new Function('ctx', 'expr', 'with (ctx) { return eval(expr) }')
  return fn(ctx, expr)
}

/** 宿主给 !!js 的作用域。 */
function loaderScope() {
  return { process, dshHomePath: (p) => 'C:/Users/USER/.dsh/' + p }
}

/** 从补丁里抠出所有 !!js 表达式（补丁是生成的，形状稳定）。 */
function jsExpressions() {
  const text = readFileSync(PATCH, 'utf8')
  const out = []
  for (const line of text.split('\n')) {
    const i = line.indexOf('!!js ')
    if (i < 0) continue
    out.push(line.slice(i + 5).trim())
  }
  return out
}

test('补丁里每个 !!js 都能被 cordis 求值器求值', () => {
  const exprs = jsExpressions()
  assert.ok(exprs.length >= 3, '补丁里应有 disabled 与 customSkillDirs 表达式，实际: ' + exprs.length)
  const scope = loaderScope()
  for (const expr of exprs) {
    assert.equal(
      expr.includes('import.meta'),
      false,
      'new Function 里 import.meta 是语法错误，会让整份预设 broken: ' + expr,
    )
    assert.doesNotThrow(
      () => cordisEvaluate(scope, expr),
      'cordis 求值失败会让整份预设 broken: ' + expr,
    )
  }
})

test('platform 二选一表达式在当前平台选中正确的那一行', () => {
  const exprs = jsExpressions()
  const win = exprs.find((e) => e.includes("platform === 'win32'"))
  const posix = exprs.find((e) => e.includes("platform !== 'win32'"))
  assert.ok(win !== undefined && posix !== undefined, 'tool-bash / tool-pwsh 的 disabled 表达式都该在')
  const scope = loaderScope()
  // disabled: true 表示禁用。两者必须互斥。
  assert.notEqual(cordisEvaluate(scope, win), cordisEvaluate(scope, posix), '两条 shell 行不能同时启用或同时禁用')
})

test('技能根指向 dshHomePath，不是包内相对路径', () => {
  const text = readFileSync(PATCH, 'utf8')
  assert.match(text, /customSkillDirs:/u)
  assert.match(text, /dshHomePath\('jianbao\/skills'\)/u)
  const scope = loaderScope()
  const resolved = cordisEvaluate(scope, "dshHomePath('jianbao/skills')")
  assert.equal(resolved, 'C:/Users/USER/.dsh/jianbao/skills')
})

test('随包技能会被同步到 dshHomePath 指向的位置', () => {
  const synced = syncBundledSkills()
  assert.ok(existsSync(synced.dir), '技能目录应存在: ' + synced.dir)
  const files = readdirSync(synced.dir)
  assert.ok(
    files.includes('jianbao-format.md'),
    'jianbao-format.md 必须在（补丁里 skill-filesystem 指向这个目录）: ' + files.join(','),
  )
})

test('技能同步是幂等的（第二次不再复制）', () => {
  syncBundledSkills()
  const again = syncBundledSkills()
  assert.equal(again.action, 'up-to-date')
  assert.equal(again.copied, 0)
})
