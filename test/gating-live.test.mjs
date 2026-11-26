/**
 * 门控真机验证 —— 在 asar 平面起一个**真 cordis Context**，走 agent-loop 的真实链路：
 *
 *   tools.resolve({agent, signal})  →  systemPrompt.assemble({...agent, toolSet})
 *
 * 为什么必须真机（不是假 ctx 断言）：门控有两半，假 ctx 只能验第二半。
 *   · 提示段：`text(context)` 返回空串 → 被 renderPrompt 的 filter 丢掉
 *   · 工具面：`when` 判 false → 工具不进 toolSet → **schema 根本不出现**
 * 第二半要跑真的 ToolsService.resolve()：它内部调 tools.view(agent) 与每个 when，
 * 用假对象永远测不出「schema 到底有没有进模型看得见的那份声明」。
 *
 * 钉住的是 2026-11-26 的实际缺陷：`jianbao:spec` 的 text 是零参函数、三只工具注册时不带 when，
 * 于是**每一个预设**的会话（实测 ptc）都拿到了「## 简报写作」那 1679 字符 + 三只简报工具的 schema。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ELECTRON = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'DeepSeek Harness', 'DeepSeek Harness.exe')
const ASAR_NM = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'DeepSeek Harness', 'resources', 'app.asar', 'dsh', 'node_modules')
const HAS_ELECTRON = existsSync(ELECTRON)
const PKG_ROOT = join(import.meta.dirname, '..')
const PROBE = join(import.meta.dirname, 'fixtures', 'gating-probe.cjs')

function runProbe() {
  const run = spawnSync(ELECTRON, [PROBE], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ASAR_NM, JIANBAO_PATH: PKG_ROOT },
    timeout: 180000,
  })
  const output = (run.stdout ?? '') + (run.stderr ?? '')
  const errLine = output.split('\n').find((l) => l.startsWith('GATING_ERR '))
  assert.equal(errLine, undefined, '探针抛错：' + output.slice(0, 1500))
  const line = output.split('\n').find((l) => l.startsWith('GATING_PROBE '))
  assert.ok(line !== undefined, '探针没有输出结果：' + output.slice(0, 1200))
  return JSON.parse(line.slice('GATING_PROBE '.length))
}

test('真机链路：非简报预设的会话里，提示段整段消失、三只工具 schema 不出现', async (t) => {
  if (!HAS_ELECTRON) { t.skip('未找到桌面版安装'); return }
  const r = runProbe()

  assert.equal(r.ptc.hasSection, false, 'ptc 会话里不许出现「## 简报写作」')
  assert.deepEqual(r.ptc.jianbaoTools, [], 'ptc 会话的工具面里不许出现 jianbao_*')

  assert.equal(r.jianbao.hasSection, true, '简报预设里提示段必须在')
  assert.deepEqual(
    [...r.jianbao.jianbaoTools].sort(),
    ['jianbao_render', 'jianbao_save', 'jianbao_state'],
    '简报预设里三只工具必须都在',
  )
  assert.ok(r.jianbao.textLen > r.ptc.textLen, '简报预设的提示词长度应明显更大')
})

test('真机链路：调试后门 DSH_JIANBAO_GATE=0 对提示段与工具面同时放行', async (t) => {
  if (!HAS_ELECTRON) { t.skip('未找到桌面版安装'); return }
  const before = process.env.DSH_JIANBAO_GATE
  process.env.DSH_JIANBAO_GATE = '0'
  try {
    const r = runProbe()
    assert.equal(r.ptc.hasSection, true, '后门打开时 ptc 会话也能看到提示段（调试工作台用）')
    assert.deepEqual(
      [...r.ptc.jianbaoTools].sort(),
      ['jianbao_render', 'jianbao_save', 'jianbao_state'],
      '后门打开时 ptc 会话也能看到三只工具（否则提示段说有工具、工具面里却没有）',
    )
  } finally {
    if (before === undefined) delete process.env.DSH_JIANBAO_GATE
    else process.env.DSH_JIANBAO_GATE = before
  }
})
