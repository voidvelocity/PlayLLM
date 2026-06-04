import { Node, TensorSpec, ValidationError, Shape } from '../types'

export const createSoftmaxNode = (
  id: string,
  position: { x: number; y: number },
  inputShape: Shape = ['B', 'N', 'H'],
  axis: number = -1
): Node => {
  const inputTensor: TensorSpec = { shape: [...inputShape], dtype: 'float32' }
  const outputTensor: TensorSpec = { shape: [...inputShape], dtype: 'float32' }

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'Softmax',
      nodeType: 'Softmax',
      inputs: [{ id: 'in', name: 'in', type: 'input', tensor: inputTensor }],
      outputs: [{ id: 'out', name: 'out', type: 'output', tensor: outputTensor }],
      params: { axis }
    },
    runtime: {
      infer: (inputs: TensorSpec[], _params: Record<string, any>) => {
        if (inputs.length === 0) return [{ shape: ['?'], dtype: 'float32' }]
        return [{ shape: [...inputs[0].shape], dtype: inputs[0].dtype }]
      },
      validate: (inputs: TensorSpec[], params: Record<string, any>) => {
        const errors: ValidationError[] = []
        if (inputs.length === 0) {
          errors.push({ level: 'error', message: 'Softmax requires at least one input' })
        } else {
          const axis = params.axis ?? -1
          const rank = inputs[0].shape.length
          const normAxis = axis < 0 ? rank + axis : axis
          if (normAxis < 0 || normAxis >= rank) {
            errors.push({ level: 'error', message: `Invalid axis ${axis} for input rank ${rank}` })
          }
        }
        return errors
      }
    }
  }
}
