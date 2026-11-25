/**
 * 环境探测自测：无 LaTeX / 有 LaTeX 两种世界都要能给出**可执行**的结论。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { detectEnvironment, findExecutable, fontDirs, scanFonts } from '../lib/env.js'

test('findExecutable：xelatex 能找到就返回绝对路径，找不到返回 undefined', () => {
  const found = findExecutable('xelatex')
  if (found !== undefined) {
    assert.equal(typeof found, 'string')
    assert.match(found, /xelatex(\.exe)?$/u)
  }
  assert.equal(findExecutable('definitely-not-a-real-binary-xyz'), undefined)
})

test('fontDirs：Windows 一定包含系统字体目录', () => {
  const dirs = fontDirs()
  assert.ok(dirs.length > 0)
  if (process.platform === 'win32') {
    assert.ok(dirs.some((d) => /Fonts$/iu.test(d)))
  }
})

test('scanFonts：返回结构可消费（roles/fangzheng/total）', () => {
  const report = scanFonts()
  assert.equal(typeof report.total, 'number')
  assert.ok(Array.isArray(report.dirs))
  assert.ok(Array.isArray(report.fangzheng))
  assert.equal(typeof report.found, 'object')
})

test('detectEnvironment：无论有没有 LaTeX，报告结构都必须完整', async () => {
  const report = await detectEnvironment()
  assert.equal(typeof report.detectedAt, 'string')
  assert.equal(typeof report.latex, 'object')
  assert.equal(typeof report.latex.found, 'boolean')
  assert.equal(typeof report.latex.canCompilePdf, 'boolean')
  assert.ok(Array.isArray(report.latex.missingPackages))
  assert.equal(typeof report.fonts, 'object')
  assert.equal(typeof report.fonts.complete, 'boolean')
  // 关键契约：canCompilePdf 为 false 时必须有可展示的原因
  if (!report.latex.canCompilePdf) assert.ok(report.latex.error.length > 0, '未就绪时必须给出原因')
  // 有 xelatex 且能编译时不能同时报错
  if (report.latex.canCompilePdf) assert.equal(report.latex.error, '')
})
