/**
 * bundle patch 语义自测。
 *
 * dsh-app-boot 的 applyEntryPatches（lib/index.js:61-110）语义：
 *   · 带 `insert` 的补丁 → 追加新行；
 *   · 不带 insert、只写 `- id: xxx` 的补丁 → **覆盖已存在的同名行**，
 *     目标不存在时 `warn('patch: entry %C not found')` 后**跳过**。
 *
 * 我们这两行是新建的，所以必须全部写在 `- insert:` 里。
 * 第一版把第一行写成了裸的 `- id: jianbao`，结果整份补丁里只有预设那行生效，
 * 工作台宿主半根本没被加载 —— 而单测当时全绿（没人检查补丁形状）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const path = 'D:/Desktop/插件/dsh-jianbao/cordis.patch.yml'
const text = readFileSync(path, 'utf8')

/** 极简 YAML 顶层解析：只认 `- insert:` 与 `- id:` 两种补丁开头。 */
function topLevelPatches(source) {
  const out = []
  let current = null
  for (const raw of source.split('\n')) {
    if (/^\s*#/u.test(raw) || raw.trim() === '') continue
    if (/^-\s/u.test(raw)) {
      current = { head: raw.trim(), rows: [] }
      out.push(current)
      continue
    }
    if (current !== null) current.rows.push(raw)
  }
  return out
}

test('所有补丁都是 insert 形式（否则会静默变成覆盖并跳过）', () => {
  const patches = topLevelPatches(text)
  assert.equal(patches.length >= 1, true)
  for (const patch of patches) {
    assert.match(
      patch.head,
      /^-\s*insert:/u,
      '顶层补丁必须写成 `- insert:`（新建行）；裸 `- id:` 会被当成覆盖已存在的行而静默跳过',
    )
  }
})

test('insert 里同时含插件行与预设行', () => {
  assert.match(text, /- id: jianbao$/mu)
  assert.match(text, /name: '@zws\/dsh-jianbao'$/mu)
  assert.match(text, /- id: jianbao-preset$/mu)
  assert.match(text, /name: '@zws\/dsh-jianbao\/preset'$/mu)
})

test('插件行带 inject 与 presetId（门控要靠 presetId 判定）', () => {
  assert.match(text, /inject: \[tools, systemPrompt\]/u)
  assert.match(text, /presetId: jianbao/u)
})

test('不覆盖任何官方行：文件里没有裸的官方 id', () => {
  const patches = topLevelPatches(text)
  for (const patch of patches) {
    assert.equal(/^-\s*id:/u.test(patch.head), false, '出现裸 id 补丁：' + patch.head)
  }
})
