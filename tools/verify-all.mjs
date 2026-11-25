/**
 * 一键验证：单测 → 端到端自测(渲染+编译+量几何) → 客户端契约 → 真实加载器。
 *
 * 这四步分别回答四个不同的问题：
 *   1. 逻辑算得对不对          (node --test)
 *   2. 产出的 PDF 像素对不对    (tools/selftest.mjs)
 *   3. 浏览器半的形态合不合规   (tools/review-client.mjs)
 *   4. DSH 真实加载器吃不吃     (tools/verify-patcher.mjs)
 *
 * 少任何一步都会漏掉一类 bug —— 前两轮就是这样漏掉了 !!js 求值失败和双重插入。
 *
 * 用法：node tools/verify-all.mjs [profileName]
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const profileName = process.argv[2] ?? 'desktop'
// import.meta.url 会把非 ASCII 路径编码成 %E6%8F%92...，必须用 fileURLToPath 解回来
const root = fileURLToPath(new URL('..', import.meta.url))

const testFiles = readdirSync(root + '/test')
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => 'test/' + f)

const steps = [
  { name: '单测', cmd: ['node', ['--test', ...testFiles]], pass: /^# fail 0$|fail 0/m },
  { name: '端到端自测', cmd: ['node', ['tools/selftest.mjs']], pass: /SELFTEST PASS/ },
  { name: '客户端契约', cmd: ['node', ['tools/review-client.mjs']], pass: /CLIENT REVIEW PASS/ },
  { name: '真实加载器', cmd: ['node', ['tools/verify-patcher.mjs', profileName]], pass: /VERIFY PATCHER PASS/ },
  // 最后一步必须做：前面几步都在普通 Node 里跑，看不到 asar 内的模块平面。
  // 桌面版 DSH 是 Electron，模块全在 app.asar 内，只有用 ELECTRON_RUN_AS_NODE
  // 起一个探针，才能验证「真机能不能挂上」——test/preset-realplane.test.mjs 就是干这个的。
  { name: '真机平面挂载', cmd: ['node', ['--test', 'test/preset-realplane.test.mjs']], pass: /fail 0/ },
]

let failed = []
for (const step of steps) {
  process.stdout.write('▶ ' + step.name + ' … ')
  const r = spawnSync(step.cmd[0], step.cmd[1], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  const ok = r.status === 0 && step.pass.test(out)
  console.log(ok ? 'PASS' : 'FAIL')
  if (!ok) {
    failed.push(step.name)
    console.log(out.split('\n').filter((l) => /✖|FAIL|Error|not ok|AssertionError/.test(l)).slice(0, 12).join('\n'))
  }
}

console.log('')
if (failed.length === 0) {
  console.log('VERIFY ALL PASS (' + steps.length + ' 步全绿)')
  process.exit(0)
}
console.log('VERIFY ALL FAIL: ' + failed.join(', '))
process.exit(1)
