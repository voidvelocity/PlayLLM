import { Node, TensorSpec, ValidationError, Shape } from '../types'
import { inferConcatShape } from '../utils/shape'

export const createConcatNode = (
  id: string,
  position: { x: number; y: number },
  inputShapes: Shape[] = [['B', 'N', 'H'], ['B', 'N', 'D']],
  dim: number = -1
): Node => {
  const inputs = inputShapes.map((shape, i) => ({
    id: `in_${i}`, name: `in_${i}`, type: 'input' as const,
    tensor: { shape: [...shape], dtype: 'float32' } as TensorSpec
  }))
  const outputShape = inferConcatShape(inputShapes, dim)
  const outputs = [{ id: 'out', name: 'out', type: 'output' as const, tensor: { shape: outputShape || inputShapes[0], dtype: 'float32' } as TensorSpec }]

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'Concat',
      nodeType: 'Concat',
      inputs,
      outputs,
      params: { dim }
    },
    runtime: {
      infer: (inputs: TensorSpec[], params: Record<string, any>) => {
        if (inputs.length === 0) return []
        const shapes = inputs.map(i => i.shape)
        const d = params.dim ?? -1
        const outputShape = inferConcatShape(shapes, d)
        return [{ shape: outputShape || shapes[0], dtype: inputs[0].dtype }]
      },
      validate: (inputs: TensorSpec[], params: Record<string, any>) => {
        const errors: ValidationError[] = []
        if (inputs.length < 2) {
          errors.push({ level: 'error', message: 'Concat requires at least 2 inputs' })
        } else {
          const shapes = inputs.map(i => i.shape)
          const d = params.dim ?? -1
          if (!inferConcatShape(shapes, d)) {
            errors.push({ level: 'error', message: 'Concat: incompatible shapes for concatenation' })
          }
        }
        return errors
      }
    }
  }
}
