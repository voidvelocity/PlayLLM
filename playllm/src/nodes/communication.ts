import type { Node, NodeRuntime, Shape, TensorSpec, ValidationError } from '../types'

export type CommunicationOperatorType = 'AllReduce' | 'ReduceScatter' | 'AllGather' | 'All2All'

const defaultParams: Record<CommunicationOperatorType, Record<string, unknown>> = {
  AllReduce: { operation: 'sum', group: 'world' },
  ReduceScatter: { operation: 'sum', axis: 0, group: 'world' },
  AllGather: { axis: 0, group: 'world' },
  All2All: { split_axis: 0, concat_axis: 0, group: 'world' }
}

export const createCommunicationNode = (
  id: string,
  position: { x: number; y: number },
  nodeType: CommunicationOperatorType,
  inputShape: Shape = ['B', 'N', 'H']
): Node => {
  const runtime: NodeRuntime = {
    // Communication topology/world size is deployment-specific. Preserve the
    // tensor shape until the user explicitly edits it instead of guessing.
    infer: (inputs: TensorSpec[]) => inputs.length > 0
      ? [{ shape: [...inputs[0].shape], dtype: inputs[0].dtype }]
      : [{ shape: ['?'], dtype: 'float32' }],
    validate: (inputs: TensorSpec[]) => {
      const errors: ValidationError[] = []
      if (inputs.length === 0) errors.push({ level: 'error', message: `${nodeType} requires an input tensor` })
      return errors
    }
  }

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: nodeType,
      nodeType,
      inputs: [{ id: 'in', name: 'in', type: 'input', tensor: { shape: [...inputShape], dtype: 'float32' } }],
      outputs: [{ id: 'out', name: 'out', type: 'output', tensor: { shape: [...inputShape], dtype: 'float32' } }],
      params: { ...defaultParams[nodeType] }
    },
    runtime
  }
}
