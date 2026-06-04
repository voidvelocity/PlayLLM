import { Node, TensorSpec, Shape } from '../types'
import { parseShape } from '../utils/shape'

export const createReshapeNode = (
  id: string,
  position: { x: number; y: number },
  inputShape: Shape = ['B', 'N', 'H'],
  outputShape: Shape = ['B', 'N * D']
): Node => {
  const inputTensor: TensorSpec = { shape: [...inputShape], dtype: 'float32' }
  const outputTensor: TensorSpec = { shape: [...outputShape], dtype: 'float32' }

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'Reshape',
      nodeType: 'Reshape',
      inputs: [{ id: 'in', name: 'in', type: 'input', tensor: inputTensor }],
      outputs: [{ id: 'out', name: 'out', type: 'output', tensor: outputTensor }],
      params: { target_shape: outputShape.map(s => String(s)).join(', ') },
      style: {}
    },
    runtime: {
      infer: (inputs: TensorSpec[], params: Record<string, any>) => {
        const targetShapeStr = params.target_shape || 'B, N * D'
        const targetShape = parseShape(targetShapeStr)
        if (inputs.length > 0) {
          return [{ shape: targetShape, dtype: inputs[0].dtype }]
        }
        return [{ shape: targetShape, dtype: 'float32' }]
      },
      validate: () => []
    }
  }
}
