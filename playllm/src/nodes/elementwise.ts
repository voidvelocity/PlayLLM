import { Node, TensorSpec, ValidationError, Shape } from '../types'
import { inferElementWiseShape, inferBroadcastShape } from '../utils/shape'

export const createElementWiseNode = (
  id: string,
  position: { x: number; y: number },
  operation: 'Add' | 'Mul' | 'Sub' | 'Div' = 'Add',
  inputShapes: Shape[] = [['B', 'N', 'H'], ['B', 'N', 'H']]
): Node => {
  const inputs = inputShapes.map((shape, i) => ({
    id: `in_${i}`, name: `in_${i}`, type: 'input' as const,
    tensor: { shape: [...shape], dtype: 'float32' } as TensorSpec
  }))
  const outputShape = inferElementWiseShape(inputShapes) || inputShapes[0]
  const outputs = [{ id: 'out', name: 'out', type: 'output' as const, tensor: { shape: outputShape, dtype: 'float32' } as TensorSpec }]

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: `ElementWise ${operation}`,
      nodeType: 'ElementWise',
      inputs,
      outputs,
      params: { operation }
    },
    runtime: {
      infer: (inputs: TensorSpec[], _params: Record<string, any>) => {
        if (inputs.length === 0) return []
        const shapes = inputs.map(i => i.shape)
        const outputShape = inferElementWiseShape(shapes)
        return [{ shape: outputShape || shapes[0], dtype: inputs[0].dtype }]
      },
      validate: (inputs: TensorSpec[], _params: Record<string, any>) => {
        const errors: ValidationError[] = []
        if (inputs.length < 2) {
          errors.push({ level: 'error', message: `${operation} requires at least 2 inputs` })
        } else {
          const shapes = inputs.map(i => i.shape)
          if (!inferBroadcastShape(shapes)) {
            errors.push({ level: 'error', message: 'Element-wise operation: shapes are not broadcastable' })
          }
        }
        return errors
      }
    }
  }
}
