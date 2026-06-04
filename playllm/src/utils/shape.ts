import { Shape, ValidationError } from '../types'

const evaluateArithmetic = (expr: string): number | string => {
  const trimmed = expr.trim()

  if (/^[\d\s+\-*/()]+$/.test(trimmed)) {
    try {
      const safeExpr = trimmed.replace(/\b0+(\d)/g, '$1')
      const result = new Function(`return (${safeExpr})`)()
      if (typeof result === 'number' && Number.isFinite(result) && Number.isInteger(result) && result >= 0) {
        return result
      }
    } catch { /* fall through */ }
  }

  return trimmed
}

export function parseShape(shapeStr: string): Shape {
  const cleaned = shapeStr.replace(/[()]/g, '').trim()
  if (!cleaned) return []

  return cleaned.split(',').map(part => {
    const trimmed = part.trim()
    if (!trimmed) return '?'

    const num = parseInt(trimmed, 10)
    if (!isNaN(num) && String(num) === trimmed) return num

    if (/[+\-*/]/.test(trimmed)) {
      return evaluateArithmetic(trimmed)
    }

    return trimmed
  })
}

export function formatShape(shape: Shape): string {
  return `(${shape.map(s => String(s)).join(', ')})`
}

export function inferBroadcastShape(shapes: Shape[]): Shape | null {
  if (shapes.length === 0) return null
  if (shapes.length === 1) return shapes[0]

  const maxDims = Math.max(...shapes.map(s => s.length))
  const result: Shape = []

  for (let i = 0; i < maxDims; i++) {
    const dimValues = shapes.map(s => {
      const idx = s.length - maxDims + i
      return idx >= 0 ? s[idx] : 1
    })

    const nonOneValues = dimValues.filter(v => v !== 1)
    const uniqueNonOne = new Set(nonOneValues.map(v => String(v)))

    if (uniqueNonOne.size > 1) {
      return null
    }

    if (nonOneValues.length > 0) {
      result.push(nonOneValues[0])
    } else {
      result.push(1)
    }
  }

  return result
}

export function validateBroadcastable(shapes: Shape[]): ValidationError[] {
  const errors: ValidationError[] = []

  if (shapes.length < 2) return errors

  const result = inferBroadcastShape(shapes)
  if (!result) {
    errors.push({
      level: 'error',
      message: `Shapes are not broadcastable: ${shapes.map(s => formatShape(s)).join(', ')}`
    })
  }

  return errors
}

export function shapesEqual(shape1: Shape, shape2: Shape): boolean {
  if (shape1.length !== shape2.length) return false

  for (let i = 0; i < shape1.length; i++) {
    const v1 = shape1[i]
    const v2 = shape2[i]

    if (typeof v1 === 'string' && typeof v2 === 'string') {
      if (v1 !== v2) return false
    } else if (typeof v1 === 'number' && typeof v2 === 'number') {
      if (v1 !== v2) return false
    } else {
      return false
    }
  }

  return true
}

export function validateSameShape(shapes: Shape[]): ValidationError[] {
  const errors: ValidationError[] = []

  if (shapes.length < 2) return errors

  const first = shapes[0]
  for (let i = 1; i < shapes.length; i++) {
    if (!shapesEqual(first, shapes[i])) {
      errors.push({
        level: 'error',
        message: `Shape mismatch: ${formatShape(first)} vs ${formatShape(shapes[i])}`
      })
    }
  }

  return errors
}

export function validateLastDimEqual(shapes: Shape[]): ValidationError[] {
  const errors: ValidationError[] = []

  if (shapes.length < 2) return errors

  const lastDims = shapes.map(s => s[s.length - 1])
  const uniqueLastDims = new Set(lastDims)

  if (uniqueLastDims.size > 1) {
    errors.push({
      level: 'error',
      message: `Last dimension mismatch: ${Array.from(uniqueLastDims).join(', ')}`
    })
  }

  return errors
}

export function inferLinearShape(inputShape: Shape, outFeatures: number | string): Shape {
  const outputShape = [...inputShape]
  outputShape[outputShape.length - 1] = outFeatures
  return outputShape
}

export function inferActivationShape(inputShape: Shape): Shape {
  return [...inputShape]
}

export function inferLayerNormShape(inputShape: Shape): Shape {
  return [...inputShape]
}

export function inferConcatShape(shapes: Shape[], dim: number): Shape | null {
  if (shapes.length === 0) return null

  const first = shapes[0]
  if (dim < 0) {
    dim += first.length
  }

  if (dim < 0 || dim >= first.length) {
    return null
  }

  const outputShape: Shape = [...first]
  const parts: string[] = []

  for (const shape of shapes) {
    if (shape.length !== first.length) {
      return null
    }

    for (let i = 0; i < first.length; i++) {
      if (i !== dim) {
        if (!shapesEqual([shape[i]], [first[i]])) {
          return null
        }
      }
    }

    parts.push(String(shape[dim]))
  }

  const allNumeric = parts.every(p => /^\d+$/.test(p))
  if (allNumeric) {
    outputShape[dim] = parts.reduce((sum, p) => sum + parseInt(p, 10), 0)
  } else {
    outputShape[dim] = parts.join(' + ')
  }

  return outputShape
}

export function inferSplitShape(inputShape: Shape, sizes: number[]): Shape[] {
  const outputShapes: Shape[] = []

  for (const size of sizes) {
    const shape = [...inputShape]
    shape[shape.length - 1] = size
    outputShapes.push(shape)
  }

  return outputShapes
}

export function inferElementWiseShape(shapes: Shape[]): Shape | null {
  return inferBroadcastShape(shapes)
}

export function inferMatMulBatchShape(aBatch: Shape, bBatch: Shape): Shape | null {
  if (aBatch.length === 0 && bBatch.length === 0) return []
  return inferBroadcastShape([aBatch, bBatch])
}

export function parseEinSumExpression(expr: string): {
  inputs: string[]
  output: string
} {
  const [inputParts, outputPart] = expr.split('->')
  const inputs = inputParts.split(',').map(s => s.trim())
  const output = outputPart ? outputPart.trim() : ''

  return { inputs, output }
}

export function inferEinSumShape(expr: string, inputShapes: Shape[]): Shape | null {
  if (!expr || !expr.includes('->')) return null

  const { inputs, output } = parseEinSumExpression(expr)

  if (inputs.length !== inputShapes.length) return null

  const labelToDim: Record<string, number | string> = {}

  for (let i = 0; i < inputs.length; i++) {
    const inputLabel = inputs[i]
    const shape = inputShapes[i]

    const labels = inputLabel.split('')

    for (let j = 0; j < labels.length && j < shape.length; j++) {
      const label = labels[j]
      if (!labelToDim[label]) {
        labelToDim[label] = shape[j]
      }
    }
  }

  const outputLabels = output.split('')
  const outputShape: Shape = []

  for (const label of outputLabels) {
    if (labelToDim[label] !== undefined) {
      outputShape.push(labelToDim[label])
    } else {
      outputShape.push(label)
    }
  }

  return outputShape
}
