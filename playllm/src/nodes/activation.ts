import { Node, TensorSpec, ValidationError, Shape } from '../types'
import { inferActivationShape } from '../utils/shape'
import { DEFAULT_LINEAR_IN } from '../utils/shapeSymbols'

export const createActivationNode = (
  id: string,
  position: { x: number; y: number },
  activationType: 'ReLU' | 'GELU' | 'SiLU' = 'ReLU',
  inputShape: Shape = [...DEFAULT_LINEAR_IN]
): Node => {
  const inputTensor: TensorSpec = { shape: [...inputShape], dtype: 'float32' }
  const outputShape = inferActivationShape(inputShape)
  const outputTensor: TensorSpec = { shape: outputShape, dtype: 'float32' }

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'Activation',
      nodeType: 'Activation',
      inputs: [{ id: 'in', name: 'in', type: 'input', tensor: inputTensor }],
      outputs: [{ id: 'out', name: 'out', type: 'output', tensor: outputTensor }],
      params: { activation: activationType }
    },
    runtime: {
      infer: (inputs: TensorSpec[], _params: Record<string, any>) => {
        if (inputs.length === 0) return []
        return [{ shape: inferActivationShape(inputs[0].shape), dtype: inputs[0].dtype }]
      },
      validate: (inputs: TensorSpec[], _params: Record<string, any>) => {
        const errors: ValidationError[] = []
        if (inputs.length === 0) {
          errors.push({ level: 'error', message: 'Activation requires at least one input' })
        }
        return errors
      }
    }
  }
}
