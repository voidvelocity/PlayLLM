import { Node, TensorSpec, ValidationError, Shape } from '../types'
import { inferLinearShape } from '../utils/shape'
import { DEFAULT_FFN_DIM, DEFAULT_LINEAR_IN } from '../utils/shapeSymbols'

export const createLinearNode = (
  id: string,
  position: { x: number; y: number },
  outFeatures: number | string = DEFAULT_FFN_DIM,
  inputShape: Shape = [...DEFAULT_LINEAR_IN]
): Node => {
  const inputTensor: TensorSpec = { shape: [...inputShape], dtype: 'float32' }
  const outputShape = inferLinearShape(inputShape, outFeatures)
  const outputTensor: TensorSpec = { shape: outputShape, dtype: 'float32' }

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'Linear',
      nodeType: 'Linear',
      inputs: [{ id: 'in', name: 'in', type: 'input', tensor: inputTensor }],
      outputs: [{ id: 'out', name: 'out', type: 'output', tensor: outputTensor }],
      params: { out_features: outFeatures }
    },
    runtime: {
      infer: (inputs: TensorSpec[], params: Record<string, any>) => {
        if (inputs.length === 0) return []
        return [{
          shape: inferLinearShape(inputs[0].shape, params.out_features ?? outFeatures),
          dtype: inputs[0].dtype
        }]
      },
      validate: (inputs: TensorSpec[], _params: Record<string, any>) => {
        const errors: ValidationError[] = []
        if (inputs.length === 0) {
          errors.push({ level: 'error', message: 'Linear requires at least one input' })
        } else if (inputs[0].shape.length < 2) {
          errors.push({ level: 'error', message: `Linear input must have at least 2 dimensions, got ${inputs[0].shape.length}` })
        }
        return errors
      }
    }
  }
}
