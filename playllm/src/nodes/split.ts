import { Node, TensorSpec, ValidationError, Shape } from '../types'

const normalizeAxis = (axis: number, rank: number): number => {
  return axis < 0 ? rank + axis : axis
}

export const createSplitNode = (
  id: string,
  position: { x: number; y: number },
  inputShape: Shape = ['B', 'N', 'H'],
  sizes: number[] = [256, 256],
  axis: number = -1
): Node => {
  const inputTensor: TensorSpec = { shape: [...inputShape], dtype: 'float32' }
  const normAxis = normalizeAxis(axis, inputShape.length)
  const outputShapes = sizes.map((size: number | string) => {
    const shape = [...inputShape]
    shape[normAxis] = size
    return shape
  })
  const inputs = [{ id: 'in', name: 'in', type: 'input' as const, tensor: inputTensor }]
  const outputs = outputShapes.map((shape: Shape, i: number) => ({
    id: `out_${i}`, name: `out_${i}`, type: 'output' as const,
    tensor: { shape, dtype: 'float32' } as TensorSpec
  }))

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'Split',
      nodeType: 'Split',
      inputs,
      outputs,
      params: { sizes, axis }
    },
    runtime: {
      infer: (inputs: TensorSpec[], params: Record<string, any>) => {
        if (inputs.length === 0) return []
        const inputShape = inputs[0].shape
        const currentSizes = params.sizes || [256, 256]
        const currentAxis = params.axis ?? -1
        const normAxis = normalizeAxis(currentAxis, inputShape.length)
        
        const outputShapes = currentSizes.map((size: number | string) => {
          const shape = [...inputShape]
          shape[normAxis] = size
          return shape
        })
        
        return outputShapes.map((shape: Shape) => ({
          shape,
          dtype: inputs[0].dtype
        }))
      },
      validate: (inputs: TensorSpec[], _params: Record<string, any>) => {
        const errors: ValidationError[] = []
        if (inputs.length === 0) {
          errors.push({ level: 'error', message: 'Split requires at least one input' })
        }
        return errors
      }
    }
  }
}
