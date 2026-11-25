/**
 * 预设的「能不能真的被 cordis 装上」自测。
 *
 * 前一组（定义、提示词、门控）验的是内容；这一组验的是**能被运行时接受**：
 * 组合里每一个 JS 表达式都要用 cordis 自己的求值器真跑一遍。
 *
 * 为什么必须这么测：cordis 求值表达式是
 *     new Function('ctx', 'expr', 'with (ctx) { return eval(expr) }')
 * 在 new Function 里 `import.meta` 是**语法错误**。第一版预设里写了
 *     - !!js new URL('./skills', import.meta.url)...
 * 单元测试全绿（没跑求值），但真机上整份预设显示「加载失败」。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDefinition, packagePaths, syncBundledSkills } from '../preset/index.js'

/** cordis 的求值器（cordis-plugin-loader/lib/index.js 原样照抄）。 */
function cordisEvaluate(ctx, expr) {
  const fn = new Function('ctx', 'expr', 'with (ctx) { return eval(expr) }')
  return fn(ctx, expr)
}

/** 从渲染后的 YAML 里捞出所有 JS 表达式节点的源码。 */
function findJsExpressions(yamlText) {
  const out = []
  const lines = yamlText.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\s*(?:-\s*)?(?:[\w-]+:\s*)?!!js\s+(.+)$/u.exec(lines[i])
    if (m !== null) out.push({ line: i + 1, expr: m[1].trim() })
  }
  return out
}

/** 渲染后的预设 YAML（含提示词正文）。 */
function rendered() {
  const paths = packagePaths()
  const yml = readFileSync(paths.presetDir + '/agent.cordis.yml', 'utf8')
  const prompt = readFileSync(paths.prompt, 'utf8')
  // buildDefinition 内部就是 renderPrompt，这里用它的产物反推不方便；直接复算一次
  return { yml, prompt }
}

test('每一个 JS 表达式都能被 cordis 求值器求值（不含 import.meta 之类）', () => {
  const { yml, prompt } = rendered()
  const paths = packagePaths()
  const merged = yml.includes('{{PROMPT}}') ? yml : yml + prompt
  const exprs = findJsExpressions(merged)
  assert.equal(exprs.length > 0, true, '预设里应该至少有平台判定表达式')
  // cordis 求值时的作用域：process 与 dshHomePath 是宿主提供的
  const ctx = {
    process,
    dshHomePath: (p) => join(dshHome(), p),
  }
  for (const item of exprs) {
    assert.equal(
      /import\.meta/u.test(item.expr),
      false,
      '第 ' + item.line + ' 行的表达式用了 import.meta，cordis 求值时会 SyntaxError：' + item.expr,
    )
    try {
      cordisEvaluate(ctx, item.expr)
    } catch (error) {
      assert.fail('第 ' + item.line + ' 行求值失败（' + error.message + '）：' + item.expr)
    }
  }
})

test('skill-filesystem 的技能根指向 dshHomePath，不是包内相对路径', () => {
  const { yml } = rendered()
  // 只看**生效行**：注释里出现 import.meta 无害（YAML 不解析注释），
  // 而且这一行注释正是用来提醒后人「别写 import.meta」的。
  const effective = yml
    .split('\n')
    .filter((line) => !/^\s*#/u.test(line))
    .join('\n')
  assert.equal(/import\.meta/u.test(effective), false, 'agent.cordis.yml 的生效行里不能出现 import.meta')
  assert.match(effective, /dshHomePath\('jianbao\/skills'\)/u)
})

test('随包技能会被同步到 dshHomePath 指向的位置', () => {
  const synced = syncBundledSkills()
  assert.equal(synced.action === 'missing', false, '随包技能目录必须存在')
  assert.equal(synced.dir, join(dshHome(), 'jianbao', 'skills'))
  // 至少要有一个 .md，且内容非空
  const first = join(synced.dir, 'jianbao-format.md')
  const body = readFileSync(first, 'utf8')
  assert.match(body, /^---/u)
  assert.match(body, /name: jianbao-format/u)
})

test('声明里每个行名都是字符串，没有未求值的表达式对象', () => {
  const def = buildDefinition()
  for (const row of def.plugins) {
    assert.equal(typeof row.name, 'string', '行 ' + row.id + ' 的 name 不是字符串')
  }
})

import { join } from 'node:path'
import { homedir } from 'node:os'
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}
