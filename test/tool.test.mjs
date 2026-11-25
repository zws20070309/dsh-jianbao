/**
 * 工具定义适配器自测：作者 DSL → 裸 JSON Schema 的编译规则。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { compileParameters, defineTool } from '../lib/tool.js'

test('属性上的 required:true 收进对象的 required 数组', () => {
  const schema = compileParameters({
    a: { type: 'string', required: true },
    b: { type: 'number' },
  })
  assert.deepEqual(schema, {
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'number' } },
    required: ['a'],
  })
})

test('没有必填项时不写 required 键', () => {
  const schema = compileParameters({ a: { type: 'string', description: 'x' } })
  assert.equal(Object.hasOwn(schema, 'required'), false)
  assert.equal(schema.properties.a.description, 'x')
})

test('嵌套对象/数组递归编译，additionalProperties 显式落值', () => {
  const schema = compileParameters({
    brief: {
      type: 'object',
      additionalProperties: true,
      properties: {
        blocks: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: true,
            properties: { type: { type: 'string', required: true, enum: ['p', 'h1'] } },
          },
        },
      },
    },
  })
  const block = schema.properties.brief.properties.blocks
  assert.equal(block.type, 'array')
  assert.equal(schema.properties.brief.required[0], 'blocks')
  assert.deepEqual(block.items.properties.type.enum, ['p', 'h1'])
  assert.deepEqual(block.items.required, ['type'])
  assert.equal(block.items.additionalProperties, true)
  assert.equal(schema.properties.brief.additionalProperties, true)
})

test('值位（items）不允许 required —— 与官方 allowRequired=false 一致', () => {
  assert.throws(
    () => compileParameters({ list: { type: 'array', items: { type: 'object', required: true, additionalProperties: true } } }),
    /value schema cannot declare required/u,
  )
})

test('defineTool：形状与官方一致（name/description/parameters/output/execute）', () => {
  const tool = defineTool({
    name: 'demo',
    description: '说明',
    parameters: { x: { type: 'string', required: true } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } } }, render: () => [{ type: 'text', text: 'ok' }] },
    execute: () => ({ ok: true }),
    presentCall: () => ({ card: 'generic', title: 'demo' }),
  })
  assert.equal(tool.name, 'demo')
  assert.deepEqual(tool.parameters.required, ['x'])
  assert.equal(typeof tool.output.render, 'function')
  assert.equal(typeof tool.execute, 'function')
  assert.equal(tool.presentCall().title, 'demo')
  // output schema 是深拷贝，调用方后续改原对象不影响工具
  assert.equal(Object.hasOwn(tool.output.schema, 'required'), false)
})

test('defineTool：execute 缺参时给空对象（不让工具因 undefined 崩）', () => {
  let seen
  const tool = defineTool({
    name: 'demo2',
    description: '',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: true }, render: () => [] },
    execute: (args) => { seen = args; return null },
  })
  tool.execute(undefined, {})
  assert.deepEqual(seen, {})
})
