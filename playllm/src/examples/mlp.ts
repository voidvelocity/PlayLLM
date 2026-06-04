import { Node, Edge, Graph } from '../types'
import { createLinearNode } from '../nodes/linear'
import { createActivationNode } from '../nodes/activation'
import { createLayerNormNode } from '../nodes/layernorm'
import { createAddNode } from '../nodes/add'

export const createTransformerMLPExample = (): Graph => {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const layerNorm = createLayerNormNode('layer_norm_1', { x: 100, y: 200 })
  nodes.push(layerNorm)

  const linear1 = createLinearNode('linear_1', { x: 400, y: 100 }, 'K', ['B', 'N', 'H'])
  nodes.push(linear1)

  const gelu = createActivationNode('gelu', { x: 700, y: 100 }, 'GELU', ['B', 'N', 'K'])
  nodes.push(gelu)

  const linear2 = createLinearNode('linear_2', { x: 1000, y: 100 }, 'H', ['B', 'N', 'K'])
  nodes.push(linear2)

  const add = createAddNode('add_1', { x: 1300, y: 200 }, [['B', 'N', 'H'], ['B', 'N', 'H']])
  nodes.push(add)

  edges.push({
    id: 'edge_ln_to_l1',
    source: 'layer_norm_1',
    sourceHandle: 'out',
    target: 'linear_1',
    targetHandle: 'in'
  })

  edges.push({
    id: 'edge_l1_to_gelu',
    source: 'linear_1',
    sourceHandle: 'out',
    target: 'gelu',
    targetHandle: 'in'
  })

  edges.push({
    id: 'edge_gelu_to_l2',
    source: 'gelu',
    sourceHandle: 'out',
    target: 'linear_2',
    targetHandle: 'in'
  })

  edges.push({
    id: 'edge_l2_to_add',
    source: 'linear_2',
    sourceHandle: 'out',
    target: 'add_1',
    targetHandle: 'in_1'
  })

  edges.push({
    id: 'edge_ln_to_add',
    source: 'layer_norm_1',
    sourceHandle: 'out',
    target: 'add_1',
    targetHandle: 'in_0'
  })

  return { nodes, edges }
}
