import { Node, TensorSpec, ValidationError, Shape } from '../types'

/** Token/id input → embedded vectors; output last dim is embedding size (symbolic **H** by default). */
export const createEmbeddingNode = (
  id: string,
  position: { x: number; y: number },
  embeddingDim: number | string = 'H',
  inputShape: Shape = ['B', 'N']
): Node => {
  const inTensor: TensorSpec = { shape: [...inputShape], dtype: 'int64' }
  const outShape = [...inputShape, embeddingDim] as Shape
  const outTensor: TensorSpec = { shape: outShape, dtype: 'float32' }

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'Embedding',
      nodeType: 'Embedding',
      inputs: [{ id: 'in', name: 'indices', type: 'input', tensor: inTensor }],
      outputs: [{ id: 'out', name: 'out', type: 'output', tensor: outTensor }],
      params: { embedding_dim: embeddingDim }
    },
    runtime: {
      infer: (inputs: TensorSpec[], params: Record<string, any>) => {
        const dim = params.embedding_dim ?? embeddingDim
        const base = inputs.length > 0 ? [...inputs[0].shape] : [...inputShape]
        return [{ shape: [...base, dim], dtype: 'float32' }]
      },
      validate: (inputs: TensorSpec[]) => {
        const errors: ValidationError[] = []
        if (inputs.length === 0) {
          errors.push({ level: 'error', message: 'Embedding requires an input for index shape' })
        }
        return errors
      }
    }
  }
}
