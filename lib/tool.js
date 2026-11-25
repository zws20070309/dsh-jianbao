/**
 * 极简工具定义适配器。
 *
 * 为什么不用官方的 @deepseek-ai/dsh-tools 的 defineTool：
 * 那个包只存在于 profile 的 node_modules 里，本插件经 junction 挂载后按 realpath 解析模块，
 * 静态 import 会 ERR_MODULE_NOT_FOUND，整根 fiber 就建不起来（插件连工作台一起消失）。
 * 官方 register() 只要求 definition 是「name/description/parameters/output」的形状，
 * 参数与输出都是裸 JSON Schema —— 所以这里自己做一次「作者 DSL → 裸 schema」的编译，
 * 规则与官方 compilePropertyMap 一致：属性上的 required:true 收进对象的 required 数组，
 * 输出 schema 不允许 required（官方 valueSchemaSpecToJsonSchema 的 allowRequired=false）。
 *
 * @module @zws/dsh-tuiwen/tool
 */

/** 只允许出现在 schema 节点上的注解键。 */
const ANNOTATION = ['description', 'title', 'default', 'examples']

/**
 * 编译一个值 schema 节点。
 * @param {object} spec 作者 DSL 节点
 * @param {boolean} allowRequired 是否允许 required:true（对象属性位允许，值位不允许）
 * @returns {object} 裸 JSON Schema
 */
function compileNode(spec, allowRequired) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('schema node must be an object')
  const node = {}
  for (const key of ANNOTATION) if (Object.hasOwn(spec, key)) node[key] = spec[key]
  if (Object.hasOwn(spec, 'required')) {
    if (allowRequired !== true) throw new Error('value schema cannot declare required')
    if (spec.required !== true) throw new Error('required must be true when present')
  }
  if (Object.hasOwn(spec, 'enum')) node.enum = Array.from(spec.enum)
  if (Object.hasOwn(spec, 'const')) node.const = spec.const
  const type = Object.hasOwn(spec, 'type') ? spec.type : undefined
  if (type === 'object') {
    node.type = 'object'
    node.properties = {}
    const required = []
    for (const [key, child] of Object.entries(spec.properties ?? {})) {
      node.properties[key] = compileNode(child, true)
      if (child?.required === true) required.push(key)
    }
    if (required.length > 0) node.required = required
    node.additionalProperties = spec.additionalProperties === true
    return node
  }
  if (type === 'array') {
    node.type = 'array'
    if (Object.hasOwn(spec, 'items')) node.items = compileNode(spec.items, false)
    return node
  }
  if (type === undefined) return node
  node.type = type
  return node
}

/**
 * 把「属性表」编译成裸对象 schema（工具的 parameters）。
 * @param {object} spec 属性表：{参数名: 值 schema}
 */
export function compileParameters(spec) {
  const properties = {}
  const required = []
  for (const [key, child] of Object.entries(spec ?? {})) {
    properties[key] = compileNode(child, true)
    if (child?.required === true) required.push(key)
  }
  const schema = { type: 'object', properties }
  if (required.length > 0) schema.required = required
  return schema
}

/**
 * 定义一只工具（形状与官方 defineTool 的返回一致）。
 * @param {object} options {name, description, parameters, output, execute, presentCall, presentResult}
 */
export function defineTool(options) {
  const parameters = compileParameters(options.parameters ?? {})
  // 输出 schema 已经是裸形式（valueSchema 不许 required），这里只做深拷贝防止调用方复用被改写
  const outputSchema = JSON.parse(JSON.stringify(options.output.schema))
  const tool = {
    name: options.name,
    description: options.description,
    parameters,
    output: {
      schema: outputSchema,
      render: (args, value) => options.output.render(args, value),
    },
    execute: (args, exec) => options.execute(args ?? {}, exec),
  }
  if (typeof options.presentCall === 'function') tool.presentCall = (args) => options.presentCall(args)
  if (typeof options.presentResult === 'function') tool.presentResult = (args, result) => options.presentResult(args, result)
  return tool
}
