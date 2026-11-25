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

test('只有一条 preset-jianbao 声明行，且是官方 @deepseek-ai/dsh-agent-preset 形状', () => {
  assert.match(text, /- id: preset-jianbao$/mu)
  assert.match(text, /name: '@deepseek-ai\/dsh-agent-preset'$/mu)
  // **不许再插顶层 jianbao 行。**
  // 本包在预设的 config.plugins 里已经有一行（内层 jianbao），负责注册三只工具。
  // 顶层再来一行同名插件，两行都会调 ctx.tools.register()，而 dsh-tools 的
  // NamedEntries 冲突消息是 tool "<name>" is already registered —— 同层重复注册
  // 直接抛错，整份预设 mountPreset 失败，UI 只显示「加载失败」。
  const topLevel = text.split('\n').filter((l) => /^    - id: jianbao$/u.test(l))
  assert.equal(topLevel.length, 0, '不许有顶层 jianbao 行（会与预设内层重复注册工具）')
})

test('内层 jianbao 行带 presetId（门控要靠它判定）', () => {
  // inject 由插件自己声明（lib/index.js 的 export const inject），不写在补丁里。
  // 补丁里只需要 presetId —— 门控读它判断「这是不是简报预设的会话」。
  assert.match(text, /presetId: jianbao/u)
  const inner = text.split('\n').filter((l) => /^          - id: jianbao$/u.test(l))
  assert.equal(inner.length, 1, '预设内层必须有且只有一行 jianbao')
})

test('bundle 层与 profile 层不重复插入（bundle 已经 insert 过，profile 不能再 insert）', () => {
  const profilePatch = 'C:/Users/USER/.dsh/profiles/desktop/cordis.patch.yml'
  const text = readFileSync(profilePatch, 'utf8')
  const live = text
    .split('\n')
    .filter((line) => !/^\s*#/u.test(line))
    .join('\n')
  assert.equal(
    live.includes('jianbao'),
    false,
    'profile 补丁里出现 jianbao：bundle 层已经插入过这两行，profile 再插一次就是重复 entry',
  )
})

test('不覆盖任何官方行：文件里没有裸的官方 id', () => {
  const patches = topLevelPatches(text)
  for (const patch of patches) {
    assert.equal(/^-\s*id:/u.test(patch.head), false, '出现裸 id 补丁：' + patch.head)
  }
})
