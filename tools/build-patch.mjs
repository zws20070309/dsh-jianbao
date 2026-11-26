/**
 * 从 preset/ 目录生成根目录的 cordis.patch.yml —— 单一数据源。
 *
 * 唯一可编辑的文件：
 *   preset/agent.cordis.yml  插件行（模板里写 PROMPT 占位符）
 *   preset/prompt.md        提示词正文
 *   preset/preset.yml       显示名/描述/order
 * 根 cordis.patch.yml 由本脚本生成，不要手改（verify-all 会校验一致性）。
 *
 * 用法：
 *   node tools/build-patch.mjs          生成并写入
 *   node tools/build-patch.mjs --check  只校验，不一致 exit 1
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'cordis.patch.yml')
const PROMPT_TOKEN = ['{', '{', 'PROMPT', '}', '}'].join('')

function readMeta(text) {
  const out = {}
  for (const line of text.split('\n')) {
    const m = /^([a-z]+):\s*(.*)$/u.exec(line)
    if (m === null) continue
    const key = m[1]
    const raw = m[2]
    if (key !== 'name' && key !== 'description' && key !== 'order') continue
    out[key] = key === 'order' ? Number(raw.trim()) : raw.trim()
  }
  return out
}

function blockScalar(body, indent) {
  const pad = ' '.repeat(indent)
  return body
    .replace(/\r\n/gu, '\n')
    .replace(/\s+$/u, '')
    .split('\n')
    .map((line) => (line === '' ? '' : pad + line))
    .join('\n')
}

const HEADER = [
  '# 简报工作台 —— bundle patch（宿主平面）',
  '#',
  '# 本文件由 node tools/build-patch.mjs 生成，不要手改。',
  '# 改插件行 -> preset/agent.cordis.yml；改提示词 -> preset/prompt.md。',
  '#',
  '# 两条 insert 行：',
  '#   jianbao        工作台宿主半（Remote 服务 + 三只工具 + 提示段 + 标签门控）',
  '#   preset-jianbao 简报模式预设声明',
  '#',
  '# 两条都必须写在 - insert: 里。dsh-app-boot 的 applyEntryPatches 语义：',
  '# 带 insert = 追加新行；不带 insert 的裸 - id: = 覆盖已存在的同名行，',
  '# 目标不存在时只 warn 一句就跳过（第一版就被这样静默丢过）。',
  '#',
  '# 预设为什么写成 @deepseek-ai/dsh-agent-preset 而不是自己调 register()：',
  '# AgentPreset 声明了 static [EntryGroup.key] = true，',
  '# Loader 会把 config.plugins 挂成真正的子行，与声明行同平面解析。',
  '# 而在代码里 ctx.agentPresets.register() 时，registry 用它自己所在 Loader 的',
  '# baseUrl 解析子行裸包名（dsh-agent-preset-registry/lib/index.js:534）；',
  '# 桌面版那个 base 在 app.asar 内，@zws/dsh-jianbao 只在 profile 平面 ——',
  '# 解析不到 -> never started -> mountPreset 抛错 -> broken -> UI 加载失败。',
  '#',
  '# 提示词不能留占位符：补丁里的字符串不会被任何代码展开，',
  '# 占位符会原样进模型提示词。所以这里内联正文。',
].join('\n')

export function buildPatchText() {
  const template = readFileSync(join(ROOT, 'preset', 'agent.cordis.yml'), 'utf8')
  const prompt = readFileSync(join(ROOT, 'preset', 'prompt.md'), 'utf8')
  const meta = readMeta(readFileSync(join(ROOT, 'preset', 'preset.yml'), 'utf8'))

  const indented = template
    .replace(/\r\n/gu, '\n')
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : '          ' + line))
    .join('\n')

  // 模板里的形状是块标量：
  //     prefix: |-
  //       {{PROMPT}}
  // 整段（含占位符那一行）替换成真正的正文块标量。
  const marker = new RegExp(
    '^( +)prefix: \\|-\\n +' + PROMPT_TOKEN.replace(/[{}]/g, '\\$&') + '[ \\t]*$',
    'mu',
  )
  if (!marker.test(indented)) {
    throw new Error('preset/agent.cordis.yml 里没找到 prefix 块标量 + 占位符行')
  }
  const withPrompt = indented.replace(
    marker,
    (all, lead) => lead + 'prefix: |-\n' + blockScalar(prompt, lead.length + 2),
  )

  const body = [
    '    - id: preset-jianbao',
    '      name: \'@deepseek-ai/dsh-agent-preset\'',
    '      config:',
    '        id: jianbao',
    '        name: ' + JSON.stringify(meta.name),
    '        description: ' + JSON.stringify(meta.description),
    '        order: ' + meta.order,
    '        plugins:',
    withPrompt.replace(/\s+$/u, ''),
  ].join('\n')

  // **只插 preset-jianbao 一行，不额外插顶层 jianbao 行。**
  //
  // 这是重启后仍然「加载失败」的直接原因。本包在预设的 config.plugins 里已经有一行
  // （内层 jianbao），负责注册三只工具 jianbao_state / jianbao_save / jianbao_render。
  // 如果顶层再插一行同名插件，两行都会调 ctx.tools.register()，而
  //   dsh-tools/lib/index.js 的 NamedEntries 冲突消息是：
  //     tool "<name>" is already registered
  // —— 同层重复注册直接抛错，整份预设 mountPreset 失败，UI 只显示「加载失败」。
  //
  // 预设子行继承声明行的平面，能解析到 profile 平面里的 @zws/dsh-jianbao，
  // 所以顶层那一行不但多余，还有害。
  // 这一行**没有 config**：预设 id 不从这里传。
  //
  // 曾经写过 `config: { presetId: jianbao }`，但 lib/ 里没有任何代码读这个键
  // （grep presetId：只有补丁、本脚本、verify-patcher 三处提到它）——
  // 它是个死配置，还让后来的人误以为「提示段已经按预设门控了」。
  // 门控现在按**会话实际挂的预设**判（lib/gate.js 的 decideAgent），
  // 不依赖任何人手填的字符串，所以这个键删掉。
  const head = [
    '- insert:',
    '    # 顶层服务行：provide 工作台 Remote 服务 + 常驻提示段 + 三只工具。',
    '    #',
    '    # **必须在预设外面。** 预设里 provide 服务是死路：',
    '    #   · 不 isolate → cordis 把服务写进根 isolate 表（cordis:805），',
    '    #     mountPreset 收尾 leakedServices() 命中后抛',
    '    #     「Preset services require isolate realms: jianbao」，整份预设挂不上；',
    '    #   · 加 isolate → 服务隔离进预设子 scope，网关 collectSrcClaims() 遍历的是',
    '    #     网关自己的 ctx.reflect.props + this.ctx.get(serviceKey)，',
    '    #     实测 root.get(jianbao) === false，网关发现不了，',
    '    #     浏览器侧 remote.jianbao 永远「未挂载」。',
    '    #',
    '    # 官方所有 preset 的插件行都只注册工具、不 provide 服务，就是这个原因。',
    '    #',
    '    # 提示段与三只工具都**按会话实际挂的预设**门控（lib/gate.js 的 decideAgent）：',
    '    # 不是简报预设的会话，提示段返回空串（整段消失），三只工具的 when 判 false',
    '    # （不进 toolSet，连 schema 都不会出现在 run_code 的声明里）。',
    '    - id: jianbao',
    "      name: '@zws/dsh-jianbao'",
    '      inject: [tools, systemPrompt]',
    '',
  ].join('\n')

  return HEADER + '\n' + head + body + '\n'
}

const check = process.argv.includes('--check')
const generated = buildPatchText()

if (check) {
  let existing = ''
  try {
    existing = readFileSync(OUT, 'utf8')
  } catch {
    existing = ''
  }
  if (existing !== generated) {
    console.error('cordis.patch.yml 与 preset/ 下的源不一致');
    console.error('跑 node tools/build-patch.mjs 重新生成');
    process.exit(1)
  }
  console.log('PATCH IN SYNC')
} else {
  writeFileSync(OUT, generated, 'utf8')
  console.log('wrote cordis.patch.yml (' + generated.length + ' bytes)')
}
