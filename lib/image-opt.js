/**
 * 插图降采样（宿主半）
 *
 * ## 为什么必须做
 *
 * 用户上传的是手机/相机原图：实测一张 5712×4284 的 JPEG 有 6.0MB。
 * 插进 PDF 时它只占 211bp 宽（≈ 7.4cm），相当于 **1943 dpi** ——
 * 参考样本是 220 dpi（872×581 px）。结果一份 4 页简报 **14.1MB**。
 *
 * 后果全在用户那边可见：
 *   · 工作台内嵌预览（Chrome 内置 PDF 阅读器）滚动卡顿、页面闪烁；
 *   · 每次工作台刷新 PDF 都要走一遍 base64 → Remote → blob，
 *     14MB 的 PDF 就是 19MB 的字符串，主线程直接卡死；
 *   · 报送、微信发送都嫌大。
 *
 * 参考 PDF 的 0.47MB 说明官方就是按 ~220dpi 出图的。
 *
 * ## 策略
 *
 * 按**实际排版宽度**算目标像素（350 dpi 上限，留出放大查看的余量），
 * 重编码成 JPEG q=88，落到 assets/_opt/，.tex 引用新文件。
 * 原图不动（用户可能还要换宽度重排）。
 *
 * sharp 是**软依赖**：拿不到就原样返回，只是 PDF 大一点，不能因此编译失败。
 * DSH 自身与插件目录都带 sharp（0.35.x），实测可用。
 *
 * @module @zws/dsh-jianbao/image-opt
 */

import { mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

import { LAYOUT } from './brief.js'

/** 目标分辨率上限（dpi）。参考样本 220，给到 350 留放大余量。 */
const TARGET_DPI = 350
/** 小于这个像素宽度的图不再降采样（再压就糊了）。 */
const MIN_WIDTH_PX = 320
/** 单张图的 JPEG 质量。88 在 350dpi 下肉眼看不出差别。 */
const JPEG_QUALITY = 88
/** 原图小于这个字节数就跳过（已经足够小）。 */
const SKIP_BYTES = 400 * 1024

/** 输出子目录名（相对 out/assets）。 */
export const OPT_DIR = '_opt'

let sharpModule
let sharpTried = false

/**
 * 惰性加载 sharp。拿不到返回 null（调用方原样放行）。
 * @returns {Promise<any|null>}
 */
async function loadSharp() {
  if (sharpTried) return sharpModule ?? null
  sharpTried = true
  try {
    const mod = await import('sharp')
    sharpModule = mod?.default ?? mod
  } catch {
    sharpModule = null
  }
  return sharpModule ?? null
}

/** cm → bp（1cm = 72/2.54 bp）。 */
function cmToBp(cm) {
  return (Number(cm) || 0) * (72 / 2.54)
}

/**
 * 某个图片块排版后的实际宽度（bp）。
 *
 * 必须与 render-tex 的 imageLines 用**同一套**规则，
 * 否则按 7.5cm 降采样、实际按 8.3cm 排版，就会欠采样变糊。
 *
 * @param {object} block 图片块
 * @returns {number} 宽度（bp）
 */
function renderedWidthBp(block) {
  if (block.type === 'imagePair') {
    const width = Number(block.widthCm) || LAYOUT.smallImageWidthCm
    const maxEach = (LAYOUT.textWidthCm - LAYOUT.pairGapCm) / 2
    return cmToBp(Math.min(width, maxEach))
  }
  return cmToBp(Number(block.widthCm) || LAYOUT.largeImageWidthCm)
}

/** 文件名做成安全的 stem。 */
function safeStem(name) {
  return String(name).replace(/[^\w\u4e00-\u9fa5-]+/gu, '_').slice(0, 40) || 'fig'
}

/**
 * 降采样一张图。失败返回 false（调用方保留原图）。
 *
 * @param {any} sharp sharp 模块
 * @param {string} srcAbs 源文件绝对路径
 * @param {string} destAbs 目标文件绝对路径
 * @param {number} targetPx 目标像素宽度
 * @returns {Promise<boolean>} 是否真的写了
 */
async function shrink(sharp, srcAbs, destAbs, targetPx) {
  const probe = sharp(srcAbs, { failOn: 'none' })
  const meta = await probe.metadata()
  const width = Number(meta.width) || 0
  if (width === 0) return false
  // 已经比目标小：不放大，直接复用（避免无谓的重编码损失）
  const want = Math.min(targetPx, width)
  const pipeline = sharp(srcAbs, { failOn: 'none' })
    .rotate()                                   // 按 EXIF 摆正，否则手机竖拍会躺倒
    .flatten({ background: '#ffffff' })         // PNG 透明底 → 白底（PDF 页面是白的）
  if (want < width) pipeline.resize({ width: want, withoutEnlargement: true })
  await pipeline
    .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(destAbs)
  return true
}

/**
 * 把 blocks 里的图片指向降采样后的副本。
 *
 * 返回**新的** blocks（不改入参）；任何一步失败都退回原 src。
 *
 * @param {object} options
 * @param {string} options.outDir 该会话的 out 目录
 * @param {Array} options.blocks 原始块
 * @returns {Promise<Array>} 处理后的块
 */
export async function optimizeImages({ outDir, blocks }) {
  const list = Array.isArray(blocks) ? blocks : []
  const needsWork = list.some((b) => b?.type === 'image' || b?.type === 'imagePair')
  if (!needsWork) return list
  const sharp = await loadSharp()
  if (sharp === null) return list

  const destDir = resolve(outDir, 'assets', OPT_DIR)
  try {
    await mkdir(destDir, { recursive: true })
  } catch {
    return list
  }

  /** src|宽度 → 新 src（同一张图可能被引用多次，只压一遍） */
  const cache = new Map()

  const one = async (src, widthBp) => {
    const key = src + '|' + Math.round(widthBp)
    if (cache.has(key)) return cache.get(key)
    const srcAbs = resolve(outDir, src)
    const fallback = src
    try {
      if (!existsSync(srcAbs)) {
        cache.set(key, fallback)
        return fallback
      }
      const info = await stat(srcAbs)
      if (info.size <= SKIP_BYTES) {
        cache.set(key, fallback)
        return fallback
      }
      // 目标像素：按排版宽度算出 350dpi 下的像素数
      const targetPx = Math.max(MIN_WIDTH_PX, Math.round((widthBp / 72) * TARGET_DPI))
      const stem = safeStem(basename(src, extname(src)))
      // 文件名带上源图的 size+mtime 指纹：用户替换同名图片后，
      // 旧缓存不会因为「比原图新」而被误用（原来的判断只看 mtime 先后，
      // 新图 mtime 更新时才会重压，但同名不同图的边缘情况会串）。
      const stamp = info.size.toString(36) + '-' + Math.round(info.mtimeMs).toString(36)
      const name = stem + '-' + targetPx + 'px-' + stamp + '.jpg'
      const destAbs = join(destDir, name)
      // 已经压过且比原图新：直接复用
      if (existsSync(destAbs)) {
        const made = await stat(destAbs)
        if (made.mtimeMs >= info.mtimeMs) {
          const hit = 'assets/' + OPT_DIR + '/' + name
          cache.set(key, hit)
          return hit
        }
      }
      const wrote = await shrink(sharp, srcAbs, destAbs, targetPx)
      const out = wrote ? 'assets/' + OPT_DIR + '/' + name : fallback
      cache.set(key, out)
      return out
    } catch {
      cache.set(key, fallback)
      return fallback
    }
  }

  const used = new Set()
  const out = []
  for (const block of list) {
    if (block?.type === 'image') {
      const mapped = await one(String(block.src ?? ''), renderedWidthBp(block))
      used.add(mapped)
      out.push({ ...block, src: mapped })
      continue
    }
    if (block?.type === 'imagePair') {
      const srcs = Array.isArray(block.srcs) ? block.srcs : []
      const widthBp = renderedWidthBp(block)
      const mapped = []
      for (const s of srcs) {
        const hit = await one(String(s ?? ''), widthBp)
        used.add(hit)
        mapped.push(hit)
      }
      out.push({ ...block, srcs: mapped })
      continue
    }
    out.push(block)
  }
  // 清掉不再被引用的旧缓存：换图 / 改宽度 / 重传同名图都会留下孤儿文件，
  // 以前只增不删，跑十几次就堆几百 MB。这里保留本次用到的，其余删掉。
  try {
    const { readdir, unlink } = await import('node:fs/promises')
    const entries = await readdir(destDir)
    for (const name of entries) {
      const rel = 'assets/' + OPT_DIR + '/' + name
      if (used.has(rel)) continue
      await unlink(join(destDir, name)).catch(() => {})
    }
  } catch {
    /* 清理失败不影响编译 */
  }
  return out
}
