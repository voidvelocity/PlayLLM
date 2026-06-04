import { Node, TensorSpec, ValidationError, Shape } from '../types'
import { inferEinSumShape } from '../utils/shape'

export const createEinSumNode = (
  id: string,
  position: { x: number; y: number },
  expression: string = '',
  inputShapes: Shape[] = [['B', 'N', 'H'], ['H', 'K']]
): Node => {
  const inputs = inputShapes.map((shape: Shape, i: number) => ({
    id: `in_${i}`, name: `in_${i}`, type: 'input' as const,
    tensor: { shape: [...shape], dtype: 'float32' } as TensorSpec
  }))
  const outputShape = expression ? inferEinSumShape(expression, inputShapes) : null
  const outputs = [{ id: 'out', name: 'out', type: 'output' as const, tensor: { shape: outputShape || ['?'], dtype: 'float32' } as TensorSpec }]

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'EinSum',
      nodeType: 'EinSum',
      inputs,
      outputs,
      params: { expression }
    },
    runtime: {
      infer: (inputs: TensorSpec[], params: Record<string, any>) => {
        if (inputs.length === 0) return [{ shape: ['?'], dtype: 'float32' }]
        const expr = params.expression || ''
        if (!expr) {
          return [{ shape: ['?'], dtype: inputs[0].dtype }]
        }
        const shapes = inputs.map(i => i.shape)
        const outputShape = inferEinSumShape(expr, shapes)
        return [{ shape: outputShape || ['?'], dtype: inputs[0].dtype }]
      },
      validate: (inputs: TensorSpec[], params: Record<string, any>) => {
        const errors: ValidationError[] = []
        if (inputs.length < 2) {
          errors.push({ level: 'error', message: 'EinSum requires at least 2 inputs' })
        } else {
          const expr = params.expression || ''
          if (!expr) {
            errors.push({ level: 'warning', message: 'EinSum expression is empty' })
          } else {
            const shapes = inputs.map(i => i.shape)
            if (!inferEinSumShape(expr, shapes)) {
              errors.push({ level: 'error', message: 'EinSum: could not infer output shape from expression' })
            }
          }
        }
        return errors
      }
    }
  }
}
