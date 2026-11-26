/**
 * 简报工作区状态（宿主半）
 *
 * 每个**工作区目录**一份：<workspace>/.jianbao/brief.json
 * 工作台（浏览器半）与工具（宿主半）读同一份，模型改稿也落这一份 —— 只有一处真相。
 *
 * 目录约定：
 *   .jianbao/brief.json     简报数据模型（BriefDoc，见 brief.js）
 *   .jianbao/form.json      工作台表单（主题/时间/领导/人群/流程/撰稿人…）
 *   .jianbao/env.json       最近一次环境探测结果（带时间戳，可手动刷新）
 *   .jianbao/out/*.tex      LaTeX 源
 *   .jianbao/out/*.pdf      编译产物
 *   .jianbao/out/assets/    插图（从上传目录拷入，.tex 用相对路径引用）
 *   .jianbao/out/*.log      编译日志（失败时工作台直接展示尾部）
 *
 * 写盘策略：临时文件 + rename（读者永远看不到半个文件）。
 *
 * @module @zws/dsh-jianbao/store
 */

import { mkdir, readFile, rename, unlink, writeFile, copyFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'

/** 状态目录名。 */
export const STATE_DIR = '.jianbao'

/**
 * 会话隔离目录名（`.jianbao/sessions/<id>/`）。
 *
 * ## 为什么必须按会话隔离
 *
 * 原来所有会话共用 `<cwd>/.jianbao/`，于是同一个目录下新建会话时，
 * 上一次填的表单、上一次的 brief.json、上一次的 out/brief.pdf 全都还在
 * —— 用户新建会话打开右栏，看到的是上一次的内容（用户实测反馈过）。
 *
 * 工作区本身不能改（用户就是要往这个目录写产物），所以把状态按会话拆开：
 *   <cwd>/.jianbao/sessions/<sessionId>/{form.json,brief.json,out/}
 *
 * 这样既保住「产物落在当前工作目录」的直觉，又不会串会话。
 */
export const SESSIONS_DIR = 'sessions'

/** 会话 id 清洗：只留安全字符，避免路径穿越或非法文件名。 */
export function safeSessionId(sessionId) {
  const raw = String(sessionId ?? "").trim()
  if (raw === '') return ''
  return raw.replace(/[^A-Za-z0-9._-]+/gu, '_').slice(0, 120)
}

/**
 * 解析某个工作区的状态根。
 * @param {string} workspace 工作区根（= 会话 cwd）
 * @param {string} [sessionId] 会话 id；给了就落到 sessions/<id>/ 下
 */
export function stateRoot(workspace, sessionId) {
  const base = join(resolve(workspace), STATE_DIR)
  const id = safeSessionId(sessionId)
  return id === '' ? base : join(base, SESSIONS_DIR, id)
}

/** 输出目录（sessionId 给了就落到该会话的独立目录）。 */
export function outDir(workspace, sessionId) {
  return join(stateRoot(workspace, sessionId), 'out')
}

/** 图片资产目录。 */
export function assetDir(workspace, sessionId) {
  return join(outDir(workspace, sessionId), 'assets')
}

/**
 * 原子写一个 UTF-8 文本文件。
 * @param {string} file 目标路径
 * @param {string} text 内容
 */
export async function writeAtomic(file, text) {
  await mkdir(dirname(file), { recursive: true })
  const temp = file + '.' + process.pid.toString(36) + '-' + Date.now().toString(36) + '.tmp'
  await writeFile(temp, text, 'utf8')
  try {
    await rename(temp, file)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
}

/** 读 JSON；不存在或坏文件返回 fallback（不抛）。 */
export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

/** 读简报；没有就返回 null。 */
export async function loadBrief(workspace, sessionId) {
  return readJson(join(stateRoot(workspace, sessionId), 'brief.json'), null)
}

/** 存简报。 */
export async function saveBrief(workspace, brief, sessionId) {
  const file = join(stateRoot(workspace, sessionId), 'brief.json')
  await writeAtomic(file, JSON.stringify(brief, null, 2) + '\n')
  return file
}

/** 读表单。 */
export async function loadForm(workspace, sessionId) {
  return readJson(join(stateRoot(workspace, sessionId), 'form.json'), null)
}

/** 存表单。 */
export async function saveForm(workspace, form, sessionId) {
  const file = join(stateRoot(workspace, sessionId), 'form.json')
  await writeAtomic(file, JSON.stringify(form, null, 2) + '\n')
  return file
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'])

/**
 * 把一张图复制进 .jianbao/out/assets/，返回相对 out/ 的 Posix 路径（渲染器直接引用）。
 * 同名不同源时自动加序号，避免覆盖用户的第二张同名图。
 * @param {string} workspace 工作区
 * @param {string} source 源文件绝对路径
 * @returns {Promise<string>} 如 assets/fig-1.png
 */
export async function importImage(workspace, source, sessionId) {
  const dir = assetDir(workspace, sessionId)
  await mkdir(dir, { recursive: true })
  const ext = extname(source).toLowerCase()
  if (!IMAGE_EXT.has(ext)) throw new Error('不支持的图片格式：' + ext + '（支持 png/jpg/jpeg/webp/bmp/gif）')
  const stem = basename(source, extname(source)).replace(/[^\w\u4e00-\u9fa5-]+/gu, '_').slice(0, 40) || 'fig'
  let name = stem + ext
  let index = 1
  while (existsSync(join(dir, name))) {
    name = stem + '-' + index + ext
    index += 1
  }
  await copyFile(source, join(dir, name))
  return 'assets/' + name
}

/** 列 out/ 下的产物（供工作台刷新列表）。 */
export async function listOutputs(workspace, sessionId) {
  const dir = outDir(workspace, sessionId)
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isFile()).map((e) => e.name)
  } catch {
    return []
  }
}

/**
 * 产物的修改时间（工作台判断"这一轮走到哪一步"用）。
 *
 * 光有文件名分不出新旧：out/ 会跨任务保留上一次的 brief.tex / brief.pdf，
 * 工作台据名字判定就会在新任务第一帧直接显示"PDF 已生成"。
 * 所以把 mtime 一起给出去，前端拿它跟开工时的基线比。
 *
 * @param {string} workspace 工作区
 * @returns {Promise<Record<string, number>>} 文件名 → mtime（毫秒）
 */
export async function outputTimes(workspace, sessionId) {
  const dir = outDir(workspace, sessionId)
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const out = {}
    for (const entry of entries) {
      if (!entry.isFile()) continue
      try {
        out[entry.name] = (await stat(join(dir, entry.name))).mtimeMs
      } catch {
        /* 文件刚被删/换掉就跳过，不影响别的 */
      }
    }
    return out
  } catch {
    return {}
  }
}

/** 读编译日志尾部（编译失败时给用户看真正的原因）。 */
export async function readLogTail(workspace, sessionId, name, maxChars = 4000) {
  try {
    const raw = await readFile(join(outDir(workspace, sessionId), name), 'utf8')
    return raw.slice(-maxChars)
  } catch {
    return ''
  }
}
