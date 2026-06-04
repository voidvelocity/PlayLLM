import { Node, Shape, TensorSpec, Port, NodeRuntime, SavedGraphNode, CustomOperatorDef } from '../types'
import { createAddNode } from './add'
import { createLinearNode } from './linear'
import { createActivationNode } from './activation'
import { createLayerNormNode } from './layernorm'
import { createConcatNode } from './concat'
import { createSplitNode } from './split'
import { createElementWiseNode } from './elementwise'
import { createEinSumNode } from './einsum'
import { createTensorNode } from './tensor'
import { createReshapeNode } from './reshape'
import { createEmbeddingNode } from './embedding'
import { createTransposeNode } from './transpose'
import { createMatMulNode } from './matmul'
import { createSoftmaxNode } from './softmax'
import { DEFAULT_FFN_DIM, DEFAULT_LINEAR_IN, DEFAULT_TENSOR_SHAPE } from '../utils/shapeSymbols'

type NodeCreator = (id: string, position: { x: number; y: number }, ...args: any[]) => Node

const passThroughRuntime: NodeRuntime = {
  infer: (ins: TensorSpec[]) => ins.length > 0 ? [ins[0]] : [{ shape: ['?'], dtype: 'float32' }],
  validate: () => []
}

export const nodeCreators: Record<string, NodeCreator> = {
  'Linear': createLinearNode,
  'Embedding': (id, pos) => createEmbeddingNode(id, pos, 'H', ['B', 'N']),
  'Activation': (id, pos) => createActivationNode(id, pos, 'ReLU'),
  'Norm': createLayerNormNode,
  'Concat': (id, pos) => createConcatNode(id, pos, [['B', 'N', 'H'], ['B', 'N', 'D']], -1),
  'Split': createSplitNode,
  'ElementWise': (id, pos) => createElementWiseNode(id, pos, 'Add'),
  'EinSum': (id, pos) => createEinSumNode(id, pos, '', [['B', 'N', 'H'], ['H', 'K']]),
  'Reshape': (id, pos) => createReshapeNode(id, pos, ['B', 'N', 'H'], ['B', 'N * D']),
  'Transpose': createTransposeNode,
  'MatMul': (id, pos) => createMatMulNode(id, pos, [['B', 'N', 'H'], ['B', 'H', 'K']]),
  'Softmax': createSoftmaxNode,
  'Custom': createCustomNode,
  'Rect': createRectNode,
  'Text': createTextNode,
  'Scalar': (id, pos) => createTensorNode(id, pos, [], 'Scalar'),
  'Vector': (id, pos) => createTensorNode(id, pos, ['N'], 'Vector'),
  'Matrix': (id, pos) => createTensorNode(id, pos, ['N', 'D'], 'Matrix'),
  'Tensor': (id, pos) => createTensorNode(id, pos, [...DEFAULT_TENSOR_SHAPE], 'Tensor')
}

export const nodeCategories: Record<string, string[]> = {
  'Operators': ['Linear', 'Embedding', 'Activation', 'Norm', 'Concat', 'Split', 'ElementWise', 'EinSum', 'Reshape', 'Transpose', 'MatMul', 'Softmax'],
  'Data': ['Scalar', 'Vector', 'Matrix', 'Tensor'],
  'Annotations': ['Rect', 'Text']
}

export const nodeColorMap: Record<string, string> = {
  'Scalar': '#0891b2',
  'Vector': '#059669',
  'Matrix': '#7c3aed',
  'Tensor': '#dc2626',
  'Linear': '#2563eb',
  'Embedding': '#0e7490',
  'Activation': '#ea580c',
  'Norm': '#ca8a04',
  'Concat': '#0d9488',
  'Split': '#db2777',
  'ElementWise': '#4f46e5',
  'EinSum': '#64748b',
  'Reshape': '#8b5cf6',
  'Transpose': '#ec4899',
  'MatMul': '#f97316',
  'Softmax': '#14b8a6',
  'Custom': '#78716c',
  'Rect': '#94a3b8',
  'Text': '#a1a1aa'
}

export interface NodeConfig {
  label: string
  nodeType: string
  defaultParams: Record<string, any>
  defaultInputShape?: Shape
  defaultInputShapes?: Shape[]
}

export interface OperatorDefinition {
  id: string
  label: string
  nodeType: string
  color: string
  source: 'builtin' | 'custom'
  customOpId?: string
}

export const getNodeConfig = (type: string): NodeConfig | null => {
  const configs: Record<string, NodeConfig> = {
    'Scalar': { label: 'Scalar', nodeType: 'Scalar', defaultParams: {} },
    'Vector': { label: 'Vector', nodeType: 'Vector', defaultParams: {}, defaultInputShape: ['N'] },
    'Matrix': { label: 'Matrix', nodeType: 'Matrix', defaultParams: {}, defaultInputShape: ['N', 'D'] },
    'Tensor': { label: 'Tensor', nodeType: 'Tensor', defaultParams: {}, defaultInputShape: [...DEFAULT_TENSOR_SHAPE] },
    'Linear': { label: 'Linear', nodeType: 'Linear', defaultParams: { out_features: DEFAULT_FFN_DIM }, defaultInputShape: [...DEFAULT_LINEAR_IN] },
    'Embedding': { label: 'Embedding', nodeType: 'Embedding', defaultParams: { embedding_dim: 'H' }, defaultInputShape: ['B', 'N'] },
    'Activation': { label: 'Activation', nodeType: 'Activation', defaultParams: { activation: 'ReLU' }, defaultInputShape: [...DEFAULT_LINEAR_IN] },
    'Norm': { label: 'Norm', nodeType: 'Norm', defaultParams: {}, defaultInputShape: [...DEFAULT_LINEAR_IN] },
    'Concat': { label: 'Concat', nodeType: 'Concat', defaultParams: { dim: -1 }, defaultInputShapes: [['B', 'N', 'H'], ['B', 'N', 'D']] },
    'Split': { label: 'Split', nodeType: 'Split', defaultParams: { sizes: [256, 256], axis: -1 }, defaultInputShape: [...DEFAULT_LINEAR_IN] },
    'ElementWise': { label: 'ElementWise Add', nodeType: 'ElementWise', defaultParams: { operation: 'Add' }, defaultInputShapes: [[...DEFAULT_LINEAR_IN], [...DEFAULT_LINEAR_IN]] },
    'EinSum': { label: 'EinSum', nodeType: 'EinSum', defaultParams: { expression: '' }, defaultInputShapes: [['B', 'N', 'H'], ['H', 'K']] },
    'Reshape': { label: 'Reshape', nodeType: 'Reshape', defaultParams: { target_shape: 'B, N * D' }, defaultInputShape: [...DEFAULT_LINEAR_IN] },
    'Transpose': { label: 'Transpose', nodeType: 'Transpose', defaultParams: { perm: [0, 2, 1] }, defaultInputShape: [...DEFAULT_LINEAR_IN] },
    'MatMul': { label: 'MatMul', nodeType: 'MatMul', defaultParams: {}, defaultInputShapes: [['B', 'N', 'H'], ['B', 'H', 'K']] },
    'Softmax': { label: 'Softmax', nodeType: 'Softmax', defaultParams: { axis: -1 }, defaultInputShape: [...DEFAULT_LINEAR_IN] },
    'Rect': { label: 'Rectangle', nodeType: 'Rect', defaultParams: {} },
    'Text': { label: 'Text', nodeType: 'Text', defaultParams: {} }
  }
  return configs[type] || null
}

export const getBuiltinOperatorDefinitions = (): OperatorDefinition[] => {
  const items: OperatorDefinition[] = []

  for (const type of nodeCategories.Operators) {
    const config = getNodeConfig(type)
    if (!config) continue

    items.push({
      id: type,
      label: config.label,
      nodeType: type,
      color: nodeColorMap[type] || '#6b7280',
      source: 'builtin'
    })
  }

  return items
}

export const getOperatorDefinitions = (customOperators: CustomOperatorDef[]): OperatorDefinition[] => [
  ...getBuiltinOperatorDefinitions(),
  ...customOperators.map(op => ({
    id: op.id,
    label: op.label,
    nodeType: 'Custom',
    color: nodeColorMap.Custom,
    source: 'custom' as const,
    customOpId: op.id
  }))
]

export const createNodeFromType = (type: string, id: string, position: { x: number; y: number }): Node | null => {
  const creator = nodeCreators[type]
  if (!creator) return null
  return creator(id, position)
}

const clonePorts = (ports: Port[]): Port[] => ports.map(port => ({
  ...port,
  tensor: port.tensor
    ? {
        ...port.tensor,
        shape: [...port.tensor.shape]
      }
    : undefined
}))

const cloneSavedNodeData = (snapshot: SavedGraphNode['data']) => ({
  ...snapshot,
  inputs: clonePorts(snapshot.inputs),
  outputs: clonePorts(snapshot.outputs),
  params: JSON.parse(JSON.stringify(snapshot.params || {})),
  style: snapshot.style ? { ...snapshot.style } : undefined
})

export const createNodeFromSnapshot = (snapshot: SavedGraphNode): Node | null => {
  const { id, position, zIndex } = snapshot
  const data = cloneSavedNodeData(snapshot.data)
  const inputShapes = data.inputs.map(input => input.tensor?.shape || ['?'])
  const outputShapes = data.outputs.map(output => output.tensor?.shape || ['?'])

  let baseNode: Node | null = null

  switch (data.nodeType) {
    case 'Scalar':
      baseNode = createTensorNode(id, position, [], 'Scalar')
      break
    case 'Vector':
      baseNode = createTensorNode(id, position, outputShapes[0] || ['N'], 'Vector')
      break
    case 'Matrix':
      baseNode = createTensorNode(id, position, outputShapes[0] || ['N', 'D'], 'Matrix')
      break
    case 'Tensor':
      baseNode = createTensorNode(id, position, outputShapes[0] || [...DEFAULT_TENSOR_SHAPE], 'Tensor')
      break
    case 'Linear': {
      const outF = data.params.out_features
      baseNode = createLinearNode(
        id,
        position,
        typeof outF === 'number' || typeof outF === 'string' ? outF : DEFAULT_FFN_DIM,
        inputShapes[0] || [...DEFAULT_LINEAR_IN]
      )
      break
    }
    case 'Embedding': {
      const ed = data.params.embedding_dim
      baseNode = createEmbeddingNode(
        id,
        position,
        typeof ed === 'number' || typeof ed === 'string' ? ed : 'H',
        inputShapes[0] || ['B', 'N']
      )
      break
    }
    case 'Activation':
      baseNode = createActivationNode(
        id,
        position,
        (data.params.activation as 'ReLU' | 'GELU' | 'SiLU') || 'ReLU',
        inputShapes[0] || [...DEFAULT_LINEAR_IN]
      )
      break
    case 'Norm':
    case 'LayerNorm':
      baseNode = createLayerNormNode(id, position, inputShapes[0] || [...DEFAULT_LINEAR_IN])
      break
    case 'Add':
      baseNode = createAddNode(id, position, inputShapes)
      break
    case 'Concat':
      baseNode = createConcatNode(id, position, inputShapes, Number(data.params.dim ?? -1))
      break
    case 'Split':
      baseNode = createSplitNode(
        id,
        position,
        inputShapes[0] || [...DEFAULT_LINEAR_IN],
        Array.isArray(data.params.sizes) ? data.params.sizes as number[] : [256, 256],
        data.params.axis ?? -1
      )
      break
    case 'ElementWise':
      baseNode = createElementWiseNode(
        id,
        position,
        (data.params.operation as 'Add' | 'Mul' | 'Sub' | 'Div') || 'Add',
        inputShapes
      )
      break
    case 'EinSum':
      baseNode = createEinSumNode(
        id,
        position,
        String(data.params.expression || ''),
        inputShapes
      )
      break
    case 'Reshape':
      baseNode = createReshapeNode(
        id,
        position,
        inputShapes[0] || [...DEFAULT_LINEAR_IN],
        outputShapes[0] || ['B', 'N * D']
      )
      break
    case 'Transpose':
      baseNode = createTransposeNode(
        id,
        position,
        inputShapes[0] || [...DEFAULT_LINEAR_IN],
        Array.isArray(data.params.perm) ? data.params.perm as number[] : [0, 2, 1]
      )
      break
    case 'MatMul':
      baseNode = createMatMulNode(
        id,
        position,
        inputShapes.length >= 2 ? inputShapes : [['B', 'N', 'H'], ['B', 'H', 'K']]
      )
      break
    case 'Softmax':
      baseNode = createSoftmaxNode(
        id,
        position,
        inputShapes[0] || [...DEFAULT_LINEAR_IN],
        data.params.axis ?? -1
      )
      break
    case 'Custom':
      baseNode = createCustomNode(id, position, data.label, data.inputs.length, data.outputs.length)
      break
    case 'Rect':
      baseNode = createRectNode(id, position)
      break
    case 'Text':
      baseNode = createTextNode(id, position)
      break
    default:
      return null
  }

  return {
    ...baseNode,
    type: snapshot.type || baseNode.type,
    position: { ...position },
    zIndex,
    data
  }
}

export function createCustomNode(
  id: string,
  position: { x: number; y: number },
  label: string = 'Custom',
  inputCount: number = 1,
  outputCount: number = 1
): Node {
  const inputs: Port[] = Array.from({ length: inputCount }, (_, i) => ({
    id: `in_${i}`, name: `in_${i}`, type: 'input' as const
  }))
  const outputs: Port[] = Array.from({ length: outputCount }, (_, i) => ({
    id: `out_${i}`, name: `out_${i}`, type: 'output' as const
  }))

  const runtime: NodeRuntime = {
    infer: (ins: TensorSpec[]) => {
      return Array.from({ length: outputCount }, () =>
        ins.length > 0 ? { ...ins[0] } : { shape: ['?'], dtype: 'float32' }
      )
    },
    validate: () => []
  }

  return {
    id, type: 'custom', position,
    data: { label, nodeType: 'Custom', inputs, outputs, params: {} },
    runtime
  }
}

export function createRectNode(
  id: string,
  position: { x: number; y: number }
): Node {
  return {
    id, type: 'rect', position,
    data: {
      label: '',
      nodeType: 'Rect',
      inputs: [],
      outputs: [],
      params: {},
      style: {
        width: 200,
        height: 120,
        hasFill: false,
        fillColor: '#e5e7eb',
        borderColor: '#6b7280',
        borderWidth: 2,
        borderStyle: 'solid',
        borderRadius: 8
      }
    },
    runtime: passThroughRuntime
  }
}

export function createTextNode(
  id: string,
  position: { x: number; y: number }
): Node {
  return {
    id, type: 'text', position,
    data: {
      label: 'Text',
      nodeType: 'Text',
      inputs: [],
      outputs: [],
      params: {},
      style: {
        width: 120,
        height: 32,
        fillColor: 'transparent',
        fontColor: '#000000',
        fontSize: 14,
        fontFamily: 'sans-serif',
        fontWeight: 400,
        textAlign: 'left'
      }
    },
    runtime: passThroughRuntime
  }
}
