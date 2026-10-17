import type { CustomOperatorDef } from '../types'

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'operator'

const readPortNames = (value: unknown, prefix: 'in' | 'out'): string[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const names = value.map((port, index) => {
    if (typeof port === 'string' && port.trim()) return port.trim()
    if (isRecord(port) && typeof port.name === 'string' && port.name.trim()) return port.name.trim()
    return `${prefix}_${index}`
  })
  return names.length > 0 ? names : undefined
}

const readCount = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 32) return fallback
  return parsed
}

const normalizeOperator = (value: unknown, index: number): CustomOperatorDef => {
  if (!isRecord(value)) throw new Error(`Operator ${index + 1} must be an object`)
  const label = typeof value.label === 'string' ? value.label.trim() : ''
  if (!label) throw new Error(`Operator ${index + 1} requires a label`)

  const inputNames = readPortNames(value.inputs, 'in')
  const outputNames = readPortNames(value.outputs, 'out')
  const inputCount = inputNames?.length || readCount(value.inputCount, 1)
  const outputCount = outputNames?.length || readCount(value.outputCount, 1)
  const requestedId = typeof value.id === 'string' ? slugify(value.id) : slugify(label)
  const color = typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : undefined

  return {
    id: `op_${requestedId}_${Date.now().toString(36)}_${index}`,
    label,
    inputCount,
    outputCount,
    inputNames,
    outputNames,
    color
  }
}

export const parseOperatorDefinitions = (text: string): CustomOperatorDef[] => {
  const parsed = JSON.parse(text) as unknown
  let values: unknown[]

  if (Array.isArray(parsed)) {
    values = parsed
  } else if (isRecord(parsed) && parsed.format === 'playllm-operators' && parsed.version === 1 && Array.isArray(parsed.operators)) {
    values = parsed.operators
  } else if (isRecord(parsed) && parsed.format === 'playllm-operator' && parsed.version === 1) {
    values = [parsed]
  } else {
    throw new Error('Unsupported operator JSON. Expected playllm-operator v1.')
  }

  if (values.length === 0) throw new Error('The operator file is empty')
  return values.map(normalizeOperator)
}
