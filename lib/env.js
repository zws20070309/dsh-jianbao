/**
 * 环境探测：LaTeX 工具链 + 中文字体。
 *
 * 工作台进入时先跑这个（对应需求里的「进入工作台需要检测电脑环境」）：
 * 没有 LaTeX 就只能写代码（生成 .tex 源），无法编译出 PDF，界面必须明说这一点，
 * 而不是等到点「开始工作」才失败。
 *
 * 探测口径（全部实测，不猜）：
 *   · xelatex 先在 PATH 里找，再扫 MiKTeX / TeX Live / MacTeX 的常见安装位置；
 *   · 宏包按「实际能否编译」判定，不看目录是否存在 —— 用一个最小文档真跑一次 xelatex，
 *     缺宏包时 MiKTeX 会尝试自动安装，装不上就直接报错，这就是最可信的答案；
 *   · 字体只扫已知字体目录（Windows 走 windir\Fonts 与用户字体目录）。
 *
 * @module @zws/dsh-jianbao/env
 */

import { existsSync, readdirSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { delimiter, join } from 'node:path'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

/** 常见 xelatex 安装位置（在 PATH 之外也认）。 */
const XELATEX_HINTS = [
  'C:/Users/USER/AppData/Local/Programs/MiKTeX/miktex/bin/x64',
  'C:/Program Files/MiKTeX/miktex/bin/x64',
  'C:/Program Files (x86)/MiKTeX/miktex/bin',
  'C:/texlive/2024/bin/windows',
  'C:/texlive/2025/bin/windows',
  '/usr/local/texlive/2024/bin/x86_64-linux',
  '/usr/local/texlive/2025/bin/x86_64-linux',
  '/Library/TeX/texbin',
  '/usr/texbin',
]

/**
 * 中文字体候选（角色 → 文件名列表，命中哪个报哪个）。
 *
 * 方正字库的文件名有两种形态：
 *   · 英文字体名：方正小标宋简体.ttf
 *   · 中文字体名：方正小标宋简体.ttf / 仿宋_GB2312.ttf
 * 后者在 Windows 上很常见（用户直接双击安装的中文名字体），
 * 所以要**两种都列**，否则装了也探测不到。
 *
 * 大标题在参考 PDF 里是方正小标宋，单独给一个 xiaoBiaoSong 角色，
 * 不能和 songti（宋体）混在一起 —— 混在一起会导致装了方正小标宋
 * 也仍然回落到 SimSun（实测踩过）。
 */
const FONT_PROBE = {
  // ⚠️ 方正字体必须排在系统字体**前面**。
  //    candidates 按顺序取第一个命中的，而系统自带 simfang/simhei/simkai 一定存在，
  //    把方正放后面等于永远用不上（实测踩过：装了方正仿宋仍回落 FangSong）。
  //
  // 参考 PDF 要求的四个字体，本机现状：
  //   正文      方正仿宋_GBK    ✅ 已装（方正仿宋_GBK.TTF，内部名 FZFangSong-Z02）
  //   大标题    方正小标宋      ✅ 已装（方正小标宋简体.ttf）
  //   抄送      仿宋_GB2312     ✅ 已装（仿宋_GB2312.ttf）
  //   一级标题  方正黑体简体    ❌ 未装 —— 需 方正黑体简体.ttf / 方正黑体_GBK.ttf
  //   二级标题  方正楷体_GBK    ❌ 未装 —— 需 方正楷体简体.ttf / 方正楷体_GBK.ttf
  //
  // 缺的两个会自动回落到系统黑体/楷体，不影响出 PDF；
  // 装到 %LOCALAPPDATA%\Microsoft\Windows\Fonts 后重启 DSH 即自动生效，无需改代码。
  fangsong: [
    // 方正仿宋_GBK（12.4MB，内部名 FZFangSong-Z02）。
    // 注意扩展名大小写：用户拿到的是 .TTF，复制后会保留原名。
    '方正仿宋_GBK.TTF',
    '方正仿宋_GBK.ttf',
    'FZFangSong-Z02.ttf',
    'FZFangSong-Z02S.ttf',
    '方正仿宋简体.ttf',
    '仿宋_GB2312.ttf',
    'simfang.ttf',
  ],
  heiti: [
    // 【待补】方正黑体简体 —— 一级标题用（19.93bp）
    '方正黑体简体.ttf',
    '方正黑体_GBK.TTF',
    '方正黑体_GBK.ttf',
    'FZHei-B01.ttf',
    'FZHei-B01S.ttf',
    'simhei.ttf',
  ],
  kaiti: [
    // 【待补】方正楷体_GBK —— 二级标题用（15.96bp 加粗）
    '方正楷体简体.ttf',
    '方正楷体_GBK.TTF',
    '方正楷体_GBK.ttf',
    'FZKai-Z03.ttf',
    'FZKai-Z03S.ttf',
    'simkai.ttf',
  ],
  songti: ['simsun.ttc', 'simsun.ttf'],
  xiaoBiaoSong: [
    '方正小标宋简体.ttf',
    '方正小标宋_GBK.TTF',
    '方正小标宋_GBK.ttf',
    'FZXiaoBiaoSong-B05S.ttf',
    'FZXiaoBiaoSong-B05.ttf',
    'FZXBSJW.TTF',
  ],
  /**
   * 抄送区专用字体。
   *
   * 参考 PDF 第 4 页实测：抄送两行是 **FangSong_GB2312@15.00**，
   * 与正文不是同一个字体。不能拿 fangsong 顶替，否则字形会略窄。
   */
  cc: ['仿宋_GB2312.ttf', 'FangSong_GB2312.ttf', 'FZFangSong-Z02S.ttf', 'simfang.ttf'],
  zhongSong: ['STZHONGS.TTF'],
}

/** 探测用最小文档：把简报真正用到的宏包全部加载一遍。 */
const PROBE_TEX = [
  '\\documentclass[UTF8,fontset=none,a4paper]{ctexart}',
  '\\usepackage[a4paper]{geometry}',
  '\\usepackage{graphicx}',
  '\\usepackage{xcolor}',
  '\\usepackage{fancyhdr}',
  '\\usepackage{calc}',
  '\\begin{document}',
  '环境探测 probe',
  '\\end{document}',
  '',
].join('\n')

/** 运行一个可执行文件并把 stdout+stderr 收成一条字符串。 */
function run(file, args, options = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { timeout: options.timeoutMs ?? 20000, windowsHide: true, maxBuffer: 8 * 1024 * 1024, cwd: options.cwd, env: options.env ?? process.env },
      (error, stdout, stderr) => {
        resolve({
          ok: error === null || error === undefined,
          code: error?.code ?? 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          message: error?.message ?? '',
        })
      },
    )
    child.on('error', () => {})
  })
}

/**
 * 在 PATH 与常见安装目录里找可执行文件。
 * @param {string} name 如 xelatex（Windows 会自动补 .exe）
 */
export function findExecutable(name) {
  const exe = process.platform === 'win32' ? name + '.exe' : name
  const pathDirs = String(process.env.PATH ?? '').split(delimiter).filter((s) => s !== '')
  for (const dir of pathDirs) {
    const candidate = join(dir, exe)
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      /* 目录不可读就跳过 */
    }
  }
  for (const dir of XELATEX_HINTS) {
    const candidate = join(dir, exe)
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      /* 同上 */
    }
  }
  return undefined
}

/** 字体目录列表。 */
export function fontDirs() {
  const dirs = []
  if (process.platform === 'win32') {
    dirs.push(join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'))
    const local = process.env.LOCALAPPDATA
    if (typeof local === 'string' && local !== '') dirs.push(join(local, 'Microsoft', 'Windows', 'Fonts'))
  } else if (process.platform === 'darwin') {
    dirs.push('/System/Library/Fonts', '/Library/Fonts', join(process.env.HOME ?? '', 'Library/Fonts'))
  } else {
    dirs.push('/usr/share/fonts', '/usr/local/share/fonts', join(process.env.HOME ?? '', '.fonts'))
  }
  return dirs.filter((dir) => dir !== '')
}

/**
 * 扫字体：返回命中的角色与它的绝对路径，以及字体目录列表。
 *
 * 方正字库是**可选**的：版权字体装了就优先用，没装就回落到 Windows 自带
 * 仿宋/黑体/楷体/宋体（视觉不是 100% 一致，但 PDF 一定出得来）。
 */
export function scanFonts() {
  const dirs = fontDirs()
  const found = {}
  const allFiles = []
  for (const dir of dirs) {
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const lower = entry.name.toLowerCase()
      if (!(lower.endsWith('.ttf') || lower.endsWith('.ttc') || lower.endsWith('.otf'))) continue
      allFiles.push({ name: entry.name, dir })
    }
  }
  for (const [role, names] of Object.entries(FONT_PROBE)) {
    for (const want of names) {
      const hit = allFiles.find((f) => f.name.toLowerCase() === want.toLowerCase())
      if (hit !== undefined) {
        found[role] = { file: hit.name, path: join(hit.dir, hit.name), dir: hit.dir }
        break
      }
    }
  }
  const fangzheng = allFiles.filter((f) => /^fz/iu.test(f.name) || f.name.includes('方正')).map((f) => f.name)
  return { dirs, found, fangzheng, total: allFiles.length }
}

/**
 * 真编译一次探针文档：这是「宏包齐不齐、工具链能不能出 PDF」的唯一可信答案。
 * @param {string} xelatex xelatex 绝对路径
 */
export async function probeToolchain(xelatex) {
  const workDir = await mkdtemp(join(tmpdir(), 'dsh-jianbao-probe-'))
  try {
    await writeFile(join(workDir, 'probe.tex'), PROBE_TEX, 'utf8')
    const result = await run(
      xelatex,
      ['-interaction=nonstopmode', '-halt-on-error', 'probe.tex'],
      { cwd: workDir, timeoutMs: 180000 },
    )
    const log = result.stdout + result.stderr
    const pdfExists = existsSync(join(workDir, 'probe.pdf'))
    const missing = []
    for (const line of log.split('\n')) {
      const m = /File .([^\s']+\.sty). not found/u.exec(line)
      if (m !== null) missing.push(m[1])
    }
    return {
      ok: pdfExists,
      missingPackages: [...new Set(missing)],
      logTail: log.slice(-1500),
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * 完整环境报告。工作台与工具都读它。
 * @returns {Promise<object>}
 */
export async function detectEnvironment() {
  const xelatex = findExecutable('xelatex')
  const latexmk = findExecutable('latexmk')
  const fonts = scanFonts()
  const report = {
    detectedAt: new Date().toISOString(),
    platform: process.platform,
    latex: {
      found: xelatex !== undefined,
      xelatex: xelatex ?? null,
      latexmk: latexmk ?? null,
      /** 能否编译 PDF —— 这是工作台唯一用来决定「能不能出 PDF」的字段 */
      canCompilePdf: false,
      missingPackages: [],
      error: '',
      logTail: '',
    },
    fonts: {
      dirs: fonts.dirs,
      count: fonts.total,
      roles: fonts.found,
      fangzheng: fonts.fangzheng,
      /** 仿宋/黑体/楷体/宋体四个角色是否齐全（缺也不阻断，只是字体回落） */
      complete: ['fangsong', 'heiti', 'kaiti', 'songti'].every((role) => fonts.found[role] !== undefined),
    },
  }
  if (xelatex === undefined) {
    report.latex.error = '未找到 xelatex：可以继续写简报并导出 .tex 源码，但目前无法编译出 PDF。'
    return report
  }
  const probe = await probeToolchain(xelatex)
  report.latex.canCompilePdf = probe.ok
  report.latex.missingPackages = probe.missingPackages
  report.latex.logTail = probe.logTail
  if (!probe.ok) {
    report.latex.error =
      probe.missingPackages.length > 0
        ? '缺少宏包：' + probe.missingPackages.join('、') + '。请在 MiKTeX Console 或 tlmgr 里安装后重试。'
        : 'xelatex 存在但探针文档编译失败，详见日志尾部。'
  }
  return report
}
