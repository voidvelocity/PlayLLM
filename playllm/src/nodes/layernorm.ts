import { Node, TensorSpec, ValidationError, Shape } from '../types'
import { inferLayerNormShape } from '../utils/shape'
import { DEFAULT_LINEAR_IN } from '../utils/shapeSymbols'

export const createLayerNormNode = (
  id: string,
  position: { x: number; y: number },
  inputShape: Shape = [...DEFAULT_LINEAR_IN]
): Node => {
  const inputTensor: TensorSpec = { shape: [...inputShape], dtype: 'float32' }
  const outputShape = inferLayerNormShape(inputShape)
  const outputTensor: TensorSpec = { shape: outputShape, dtype: 'float32' }

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'Norm',
      nodeType: 'Norm',
      inputs: [{ id: 'in', name: 'in', type: 'input', tensor: inputTensor }],
      outputs: [{ id: 'out', name: 'out', type: 'output', tensor: outputTensor }],
      params: { normalized_shape: inputShape[inputShape.length - 1] }
    },
    runtime: {
      infer: (inputs: TensorSpec[], _params: Record<string, any>) => {
        if (inputs.length === 0) return []
        return [{ shape: inferLayerNormShape(inputs[0].shape), dtype: inputs[0].dtype }]
      },
      validate: (inputs: TensorSpec[], _params: Record<string, any>) => {
        const errors: ValidationError[] = []
        if (inputs.length === 0) {
          errors.push({ level: 'error', message: 'Norm requires at least one input' })
        }
        return errors
      }
    }
  }
}
