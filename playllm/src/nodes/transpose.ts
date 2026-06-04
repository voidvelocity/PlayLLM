import { Node, TensorSpec, ValidationError, Shape } from '../types'

export const createTransposeNode = (
  id: string,
  position: { x: number; y: number },
  inputShape: Shape = ['B', 'N', 'H'],
  perm: number[] = [0, 2, 1]
): Node => {
  const inputTensor: TensorSpec = { shape: [...inputShape], dtype: 'float32' }
  const outputShape = perm.map(p => inputShape[p])
  const outputTensor: TensorSpec = { shape: outputShape, dtype: 'float32' }

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'Transpose',
      nodeType: 'Transpose',
      inputs: [{ id: 'in', name: 'in', type: 'input', tensor: inputTensor }],
      outputs: [{ id: 'out', name: 'out', type: 'output', tensor: outputTensor }],
      params: { perm }
    },
    runtime: {
      infer: (inputs: TensorSpec[], params: Record<string, any>) => {
        if (inputs.length === 0) return [{ shape: ['?'], dtype: 'float32' }]
        const inputShape = inputs[0].shape
        const currentPerm = params.perm || [0, 2, 1]
        
        const validPerm = currentPerm.every((p: number) => p >= 0 && p < inputShape.length)
        if (!validPerm) {
          return [{ shape: inputShape, dtype: inputs[0].dtype }]
        }
        
        const outputShape = currentPerm.map((p: number) => inputShape[p])
        return [{ shape: outputShape, dtype: inputs[0].dtype }]
      },
      validate: (inputs: TensorSpec[], params: Record<string, any>) => {
        const errors: ValidationError[] = []
        if (inputs.length === 0) {
          errors.push({ level: 'error', message: 'Transpose requires at least one input' })
        } else {
          const inputShape = inputs[0].shape
          const perm = params.perm || [0, 2, 1]
          
          if (!perm.every((p: number) => p >= 0 && p < inputShape.length)) {
            errors.push({ level: 'error', message: `Invalid permutation for input rank ${inputShape.length}` })
          }
          
          const sorted = [...perm].sort((a, b) => a - b)
          const expected = Array.from({ length: inputShape.length }, (_, i) => i)
          if (sorted.length !== expected.length || !sorted.every((v, i) => v === expected[i])) {
            errors.push({ level: 'error', message: 'Permutation must contain each axis exactly once' })
          }
        }
        return errors
      }
    }
  }
}
