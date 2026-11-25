/**
 * LaTeX 编译（XeLaTeX）。
 *
 * 只用一种方式：`xelatex -interaction=nonstopmode -halt-on-error`，跑两遍
 * （第一遍落 .aux，第二遍解析 \thepage 与任何前向引用；两遍都便宜，胜过出现页码错位）。
 * 不走 latexmk：多一层中间产物与配置，对单文件简报没有收益。
 *
 * 失败时把编译日志尾部原样交给调用方 —— 用户看到的必须是 TeX 的真实报错，
 * 不是「编译失败」四个字。
 *
 * @module @zws/dsh-jianbao/compile
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

/** 跑一次命令。 */
function run(file, args, options = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { timeout: options.timeoutMs ?? 240000, windowsHide: true, maxBuffer: 16 * 1024 * 1024, cwd: options.cwd, env: process.env },
      (error, stdout, stderr) => {
        resolve({ ok: error === null || error === undefined, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), message: error?.message ?? '' })
      },
    )
    child.on('error', () => {})
  })
}

/**
 * 编译一个 .tex 到 PDF。
 * @param {object} options
 * @param {string} options.xelatex xelatex 可执行文件绝对路径
 * @param {string} options.workDir 工作目录（.tex 与图片所在目录）
 * @param {string} options.jobName 不带扩展名的作业名
 * @returns {Promise<{ok:boolean, pdf:string|null, log:string, logPath:string, passes:number, error:string}>}
 */
export async function compileTex(options) {
  const { xelatex, workDir, jobName } = options
  await mkdir(workDir, { recursive: true })
  const texPath = join(workDir, jobName + '.tex')
  if (!existsSync(texPath)) {
    return { ok: false, pdf: null, log: '', logPath: '', passes: 0, error: '找不到源文件：' + texPath }
  }
  // **先删掉上一次的 PDF**：否则 xelatex 根本不存在时，目录里残留的旧 PDF 会让
  // 「存在性判断」把失败当成成功（实测踩过：换成不存在的可执行文件仍返回 ok=true）。
  await unlink(join(workDir, jobName + '.pdf')).catch(() => {})
  let lastLog = ''
  let passes = 0
  for (let pass = 1; pass <= 2; pass += 1) {
    const result = await run(xelatex, ['-interaction=nonstopmode', '-halt-on-error', jobName + '.tex'], { cwd: workDir })
    passes = pass
    lastLog = await readFile(join(workDir, jobName + '.log'), 'utf8').catch(() => '')
    if (!result.ok && !existsSync(join(workDir, jobName + '.pdf'))) {
      const audit = lastLog.slice(-6000)
      return {
        ok: false,
        pdf: null,
        log: audit !== '' ? audit : result.stdout + result.stderr,
        logPath: join(workDir, jobName + '.log'),
        passes,
        error: 'XeLaTeX 编译失败（第 ' + pass + ' 遍）',
      }
    }
  }
  const pdfPath = join(workDir, jobName + '.pdf')
  if (!existsSync(pdfPath)) {
    return { ok: false, pdf: null, log: lastLog.slice(-6000), logPath: join(workDir, jobName + '.log'), passes, error: '编译结束但没有产出 PDF' }
  }
  return { ok: true, pdf: pdfPath, log: lastLog, logPath: join(workDir, jobName + '.log'), passes, error: '' }
}