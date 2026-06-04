import { Node, TensorSpec, Shape } from '../types'

export const createTensorNode = (
  id: string,
  position: { x: number; y: number },
  shape: Shape = ['B', 'N', 'H'],
  label: string = 'Tensor'
): Node => {
  const tensor: TensorSpec = { shape: [...shape], dtype: 'float32' }

  return {
    id,
    type: 'custom',
    position,
    data: {
      label,
      nodeType: label,
      inputs: [{ id: 'in', name: 'in', type: 'input' }],
      outputs: [{ id: 'out', name: 'out', type: 'output', tensor }],
      params: {},
      style: {}
    },
    runtime: {
      infer: (_inputs: TensorSpec[], _params: Record<string, any>) => {
        return [tensor]
      },
      validate: (_inputs: TensorSpec[], _params: Record<string, any>) => {
        return []
      }
    }
  }
}
