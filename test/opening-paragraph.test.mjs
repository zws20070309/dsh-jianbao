/**
 * 第 1 段六要素回归（用户对照参考 74 号后指出的问题）。
 *
 * 74 号原文开头段把时间、地点、主体、事件、主持、参会**一段说全**：
 *   「…做好大学阶段的学习生活规划。8月29日，西藏大学理学院于图书馆二楼
 *    学术报告厅举行2026级新生见面会暨入学教育动员大会。会议由…主持，…参会。」
 *
 * 我们原来的稿子会漏掉地点 —— 因为表单根本没有这个字段，模型只能自己编或干脆不写。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { reviewBrief } from '../lib/index.js'

const base = {
  title: '西藏大学理学院召开2026级新生见面会暨入学教育动员大会',
  issue: '第74期',
  year: '2026',
  author: '冯某某',
  auditor: '李某某',
  phone: '13800000002',
  org: '西藏大学理学院',
  activityPlace: '图书馆二楼学术报告厅',
  cc: ['校领导、院领导'],
  blocks: [
    { type: 'p', text: '为给师生搭建沟通交流平台，8月29日，西藏大学理学院于图书馆二楼学术报告厅举行2026级新生见面会暨入学教育动员大会。会议由学院党委副书记张某某同志主持，学院领导班子及全体2026级新生参会。' },
    { type: 'p', text: '大会在庄严的国歌声中拉开序幕。理学院党委副书记、院长刘某某致欢迎辞，对新同学奔赴雪域求学表示热烈欢迎，介绍学院办学条件与师资科研平台。' },
    { type: 'p', text: '随后，主持人逐一介绍学院领导、各科室及系科中心负责人，帮助新生熟悉学院管理服务队伍，消除入校陌生感。' },
    { type: 'p', text: '本次大会搭建起师生沟通桥梁，帮助新生了解学院、明晰大学学习生活要求，激励同学们立足高原，勤学奋进，开启理学院青春奋斗新征程。' },
  ],
}

const flagged = (warnings, word) => warnings.filter((w) => w.includes(word))

test('第 1 段写全六要素时没有地点/日期告警', () => {
  const r = reviewBrief(base)
  assert.deepEqual(flagged(r.warnings, '地点'), [])
  assert.deepEqual(flagged(r.warnings, '日期'), [])
})

test('表单填了地点但第 1 段没写 → 告警', () => {
  const doc = {
    ...base,
    blocks: base.blocks.map((b, i) =>
      i === 0 ? { type: 'p', text: b.text.replace('于图书馆二楼学术报告厅', '') } : b),
  }
  const hits = flagged(reviewBrief(doc).warnings, '地点')
  assert.equal(hits.length, 1)
  assert.match(hits[0], /图书馆二楼学术报告厅/u)
})

test('第 1 段缺日期 → 告警（87% 的样本第 1 段就写日期）', () => {
  const doc = {
    ...base,
    blocks: base.blocks.map((b, i) =>
      i === 0 ? { type: 'p', text: b.text.replace('8月29日，', '') } : b),
  }
  assert.equal(flagged(reviewBrief(doc).warnings, '日期').length, 1)
})

test('用户没填地点时不要求写地点（63 篇里 33 篇本来就不写）', () => {
  const doc = {
    ...base,
    activityPlace: '',
    blocks: base.blocks.map((b, i) =>
      i === 0 ? { type: 'p', text: b.text.replace('于图书馆二楼学术报告厅', '') } : b),
  }
  assert.deepEqual(flagged(reviewBrief(doc).warnings, '地点'), [])
})