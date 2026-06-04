import { create } from 'zustand'
import { Edge, Graph, ValidationError, Node, TensorSpec, Port, NodeStyle, CustomOperatorDef } from '../types'
import { parseShape } from '../utils/shape'

type HistorySnapshot = {
  graph: Graph
  initialShape: string
  customOperators: CustomOperatorDef[]
}

const MAX_HISTORY = 50

interface GraphState {
  graph: Graph
  selectedNodeId: string | null
  selectedEdgeId: string | null
  errors: Record<string, ValidationError[]>
  initialShape: string
  customOperators: CustomOperatorDef[]
  canUndo: boolean
  canRedo: boolean
  setGraph: (graph: Graph) => void
  loadCanvasState: (payload: { graph: Graph; initialShape: string; customOperators: CustomOperatorDef[] }) => void
  addNode: (node: Node) => void
  removeNode: (nodeId: string) => void
  updateNodeParams: (nodeId: string, params: Record<string, any>) => void
  updateNodeLabel: (nodeId: string, label: string) => void
  updateNodeStyle: (nodeId: string, style: Partial<NodeStyle>) => void
  updatePortShape: (nodeId: string, portType: 'inputs' | 'outputs', portId: string, shapeStr: string) => void
  updatePortName: (nodeId: string, portType: 'inputs' | 'outputs', portId: string, name: string) => void
  selectNode: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void
  updateEdgeStyle: (edgeId: string, style: Record<string, any>) => void
  setInitialShape: (shape: string) => void
  runShapeInference: () => void
  addCustomOperator: (op: CustomOperatorDef) => void
  removeCustomOperator: (id: string) => void
  moveNodeToBack: (nodeId: string) => void
  moveNodeToFront: (nodeId: string) => void
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void
  undo: () => void
  redo: () => void
  pushSnapshot: () => void
}

function topologicalSort(nodes: Node[], edges: Edge[]): Node[] {
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  nodes.forEach(n => {
    inDegree.set(n.id, 0)
    adjacency.set(n.id, [])
  })

  edges.forEach(e => {
    if (adjacency.has(e.source) && inDegree.has(e.target)) {
      adjacency.get(e.source)!.push(e.target)
      inDegree.set(e.target, inDegree.get(e.target)! + 1)
    }
  })

  const queue: string[] = []
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id)
  })

  const sorted: Node[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    const node = nodes.find(n => n.id === id)
    if (node) sorted.push(node)

    for (const nextId of adjacency.get(id) || []) {
      const newDeg = inDegree.get(nextId)! - 1
      inDegree.set(nextId, newDeg)
      if (newDeg === 0) queue.push(nextId)
    }
  }

  const remaining = nodes.filter(n => !sorted.find(s => s.id === n.id))
  return [...sorted, ...remaining]
}

/** Data nodes carry shapes on outputs; runtime.infer uses stale closures — derive tensors from live port data. */
const DATA_NODE_TYPES = new Set(['Scalar', 'Vector', 'Matrix', 'Tensor'])
const CUSTOM_NODE_TYPES = new Set(['Custom'])

const cloneGraph = (graph: Graph): Graph => JSON.parse(JSON.stringify(graph))

const snapshotEquals = (a: HistorySnapshot, b: HistorySnapshot): boolean => {
  if (a.initialShape !== b.initialShape) return false
  if (a.customOperators.length !== b.customOperators.length) return false
  if (a.graph.nodes.length !== b.graph.nodes.length) return false
  if (a.graph.edges.length !== b.graph.edges.length) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

let _undoStack: HistorySnapshot[] = []
let _redoStack: HistorySnapshot[] = []
let _skipSnapshot = false

export const useGraphStore = create<GraphState>((set, get) => ({
  graph: { nodes: [], edges: [] },
  selectedNodeId: null,
  selectedEdgeId: null,
  errors: {},
  initialShape: 'B, N, H',
  customOperators: [],
  canUndo: false,
  canRedo: false,

  pushSnapshot: () => {
    if (_skipSnapshot) return
    const { graph, initialShape, customOperators } = get()
    const next: HistorySnapshot = {
      graph: cloneGraph(graph),
      initialShape,
      customOperators: JSON.parse(JSON.stringify(customOperators))
    }
    if (_undoStack.length > 0 && snapshotEquals(_undoStack[_undoStack.length - 1], next)) return
    _undoStack.push(next)
    if (_undoStack.length > MAX_HISTORY) {
      _undoStack = _undoStack.slice(_undoStack.length - MAX_HISTORY)
    }
    _redoStack = []
    set({ canUndo: true, canRedo: false })
  },

  undo: () => {
    if (_undoStack.length === 0) return
    const { graph, initialShape, customOperators } = get()
    _redoStack.push({
      graph: cloneGraph(graph),
      initialShape,
      customOperators: JSON.parse(JSON.stringify(customOperators))
    })
    const prev = _undoStack.pop()!
    _skipSnapshot = true
    try {
      set({
        graph: prev.graph,
        initialShape: prev.initialShape,
        customOperators: prev.customOperators,
        selectedNodeId: null,
        selectedEdgeId: null,
        errors: {},
        canUndo: _undoStack.length > 0,
        canRedo: true
      })
    } finally {
      _skipSnapshot = false
    }
  },

  redo: () => {
    if (_redoStack.length === 0) return
    const { graph, initialShape, customOperators } = get()
    _undoStack.push({
      graph: cloneGraph(graph),
      initialShape,
      customOperators: JSON.parse(JSON.stringify(customOperators))
    })
    const next = _redoStack.pop()!
    _skipSnapshot = true
    try {
      set({
        graph: next.graph,
        initialShape: next.initialShape,
        customOperators: next.customOperators,
        selectedNodeId: null,
        selectedEdgeId: null,
        errors: {},
        canUndo: true,
        canRedo: _redoStack.length > 0
      })
    } finally {
      _skipSnapshot = false
    }
  },

  setGraph: (graph: Graph) => set({ graph }),

  loadCanvasState: ({ graph, initialShape, customOperators }) => {
    _undoStack = []
    _redoStack = []
    set({
      graph,
      initialShape,
      customOperators,
      selectedNodeId: null,
      errors: {},
      canUndo: false,
      canRedo: false
    })
  },

  addNode: (node: Node) => {
    get().pushSnapshot()
    set(state => ({
      graph: { ...state.graph, nodes: [...state.graph.nodes, node] }
    }))
  },

  removeNode: (nodeId: string) => {
    get().pushSnapshot()
    set(state => ({
      graph: {
        nodes: state.graph.nodes.filter(n => n.id !== nodeId),
        edges: state.graph.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
      },
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId
    }))
  },

  updateNodeParams: (nodeId: string, params: Record<string, any>) => {
    get().pushSnapshot()
    set(state => ({
      graph: {
        ...state.graph,
        nodes: state.graph.nodes.map(n =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, params: { ...n.data.params, ...params } } }
            : n
        )
      }
    }))
    get().runShapeInference()
  },

  updateNodeLabel: (nodeId: string, label: string) => {
    get().pushSnapshot()
    set(state => ({
      graph: {
        ...state.graph,
        nodes: state.graph.nodes.map(n =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, label } }
            : n
        )
      }
    }))
  },

  updateNodeStyle: (nodeId: string, style: Partial<NodeStyle>) => {
    set(state => ({
      graph: {
        ...state.graph,
        nodes: state.graph.nodes.map(n =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, style: { ...n.data.style, ...style } } }
            : n
        )
      }
    }))
  },

  updatePortShape: (nodeId: string, portType: 'inputs' | 'outputs', portId: string, shapeStr: string) => {
    get().pushSnapshot()
    set(state => {
      const newShape = parseShape(shapeStr)
      return {
        graph: {
          ...state.graph,
          nodes: state.graph.nodes.map(n => {
            if (n.id !== nodeId) return n
            const ports = n.data[portType].map((p: Port) => {
              if (p.id !== portId) return p
              return { ...p, tensor: { shape: newShape, dtype: p.tensor?.dtype || 'float32' } }
            })
            const newData: typeof n.data = { ...n.data, [portType]: ports }

            if (portType === 'outputs' && newShape.length > 0) {
              if (n.data.nodeType === 'Linear' && portId === 'out') {
                newData.params = { ...n.data.params, out_features: newShape[newShape.length - 1] }
              } else if (n.data.nodeType === 'Embedding' && portId === 'out') {
                newData.params = { ...n.data.params, embedding_dim: newShape[newShape.length - 1] }
              } else if (n.data.nodeType === 'Split' && portId.startsWith('out_')) {
                const idx = parseInt(portId.slice(4), 10)
                if (!isNaN(idx)) {
                  const axis = n.data.params.axis ?? -1
                  const inputShape = n.data.inputs[0]?.tensor?.shape || []
                  const normAxis = axis < 0 ? inputShape.length + axis : axis
                  const axisDim = newShape[normAxis]

                  const oldSizes = Array.isArray(n.data.params.sizes) ? [...n.data.params.sizes] : []
                  oldSizes[idx] = axisDim as number

                  const inputAxisDim = inputShape[normAxis]
                  if (typeof inputAxisDim === 'number' && typeof axisDim === 'number' && oldSizes.length === 2) {
                    const otherIdx = 1 - idx
                    const otherSize = inputAxisDim - axisDim
                    if (otherSize > 0) {
                      oldSizes[otherIdx] = otherSize
                      const otherPortId = `out_${otherIdx}`
                      const otherPorts = newData.outputs.map((p: Port) => {
                        if (p.id !== otherPortId) return p
                        const otherShape = [...p.tensor!.shape]
                        otherShape[normAxis] = otherSize
                        return { ...p, tensor: { ...p.tensor!, shape: otherShape } }
                      })
                      newData.outputs = otherPorts
                    }
                  }

                  newData.params = { ...n.data.params, sizes: oldSizes }
                }
              } else if (n.data.nodeType === 'Reshape' && portId === 'out') {
                newData.params = { ...n.data.params, target_shape: newShape.join(', ') }
              }
            }

            return { ...n, data: newData }
          })
        }
      }
    })
  },

  updatePortName: (nodeId: string, portType: 'inputs' | 'outputs', portId: string, name: string) => {
    get().pushSnapshot()
    set(state => ({
      graph: {
        ...state.graph,
        nodes: state.graph.nodes.map(n => {
          if (n.id !== nodeId) return n
          const ports = n.data[portType].map((p: Port) => {
            if (p.id !== portId) return p
            return { ...p, name }
          })
          return { ...n, data: { ...n.data, [portType]: ports } }
        })
      }
    }))
  },

  selectNode: (nodeId: string | null) => set({
    selectedNodeId: nodeId,
    ...(nodeId !== null ? { selectedEdgeId: null as string | null } : {})
  }),

  /** Selecting an edge clears node selection; clearing the edge does not clear the current node. */
  selectEdge: (edgeId: string | null) => set(
    edgeId !== null
      ? { selectedEdgeId: edgeId, selectedNodeId: null }
      : { selectedEdgeId: null }
  ),

  updateEdgeStyle: (edgeId: string, style: Record<string, any>) => {
    get().pushSnapshot()
    set(state => ({
      graph: {
        ...state.graph,
        edges: state.graph.edges.map(e =>
          e.id === edgeId ? { ...e, ...style } : e
        )
      }
    }))
  },

  setInitialShape: (shape: string) => {
    get().pushSnapshot()
    set({ initialShape: shape })
  },

  addCustomOperator: (op: CustomOperatorDef) => {
    get().pushSnapshot()
    set(state => ({
      customOperators: [...state.customOperators, op]
    }))
  },

  removeCustomOperator: (id: string) => {
    get().pushSnapshot()
    set(state => ({
      customOperators: state.customOperators.filter(op => op.id !== id)
    }))
  },

  moveNodeToBack: (nodeId: string) => {
    get().pushSnapshot()
    set(state => ({
      graph: {
        ...state.graph,
        nodes: state.graph.nodes.map(n =>
          n.id === nodeId ? { ...n, zIndex: -1 } : n
        )
      }
    }))
  },

  moveNodeToFront: (nodeId: string) => {
    get().pushSnapshot()
    set(state => ({
      graph: {
        ...state.graph,
        nodes: state.graph.nodes.map(n =>
          n.id === nodeId ? { ...n, zIndex: 1 } : n
        )
      }
    }))
  },

  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => {
    set(state => ({
      graph: {
        ...state.graph,
        nodes: state.graph.nodes.map(n =>
          n.id === nodeId ? { ...n, position } : n
        )
      }
    }))
  },

  runShapeInference: () => {
    const { graph, initialShape } = get()

    const parsedShape = parseShape(initialShape)

    const sorted = topologicalSort(graph.nodes, graph.edges)
    const nodeMap = new Map<string, Node>()
    sorted.forEach(n => nodeMap.set(n.id, { ...n }))

    const outputCache = new Map<string, Map<string, TensorSpec>>()

    const errors: Record<string, ValidationError[]> = {}

    for (const node of sorted) {
      const currentNode = nodeMap.get(node.id)!

      const incomingEdges = graph.edges.filter(e => e.target === node.id)

      const inputTensors: (TensorSpec | undefined)[] = currentNode.data.inputs.map(input => {
        const edge = incomingEdges.find(e => e.targetHandle === input.id)
        if (!edge) return input.tensor

        const sourceOutputs = outputCache.get(edge.source)
        if (!sourceOutputs) return input.tensor

        return sourceOutputs.get(edge.sourceHandle!) || input.tensor
      })

      const definedInputs = inputTensors.filter((t): t is TensorSpec => t !== undefined)

      const firstInputTensor: TensorSpec = definedInputs.length > 0
        ? definedInputs[0]
        : { shape: [...parsedShape], dtype: 'float32' }

      const allInputTensors: TensorSpec[] = currentNode.data.inputs.map((_, i) =>
        inputTensors[i] || firstInputTensor
      )

      try {
        let outputTensors: TensorSpec[]
        let updatedParams: Record<string, any> | undefined
        
        if (currentNode.data.nodeType === 'Split') {
          const inputShape = allInputTensors[0]?.shape || []
          const axis = currentNode.data.params.axis ?? -1
          const normAxis = axis < 0 ? inputShape.length + axis : axis
          const inputAxisDim = inputShape[normAxis]
          const currentSizes = currentNode.data.params.sizes || [256, 256]
          
          if (typeof inputAxisDim === 'number') {
            const numericSizes = currentSizes.filter((v: number | string) => typeof v === 'number')
            const totalSize = numericSizes.length === currentSizes.length 
              ? numericSizes.reduce((a: number, b: number) => a + b, 0) 
              : null
            
            if (totalSize !== inputAxisDim) {
              const half = Math.floor(inputAxisDim / 2)
              const remainder = inputAxisDim % 2
              const newSizes = [half + remainder, half]
              updatedParams = { ...currentNode.data.params, sizes: newSizes }
              const outputShapes = newSizes.map(size => {
                const shape = [...inputShape]
                shape[normAxis] = size
                return shape
              })
              outputTensors = outputShapes.map(shape => ({ shape, dtype: allInputTensors[0].dtype }))
            } else {
              outputTensors = currentNode.runtime.infer(allInputTensors, currentNode.data.params)
            }
          } else {
            outputTensors = currentNode.runtime.infer(allInputTensors, currentNode.data.params)
          }
        } else if (DATA_NODE_TYPES.has(currentNode.data.nodeType)) {
          const hasWiredInput = incomingEdges.some(e => currentNode.data.inputs.some(inp => e.targetHandle === inp.id))
          if (hasWiredInput && allInputTensors.length > 0 && allInputTensors[0]) {
            outputTensors = [{ shape: [...allInputTensors[0].shape], dtype: allInputTensors[0].dtype }]
          } else {
            outputTensors = currentNode.data.outputs.map(o =>
              o.tensor
                ? { shape: [...o.tensor.shape], dtype: o.tensor.dtype || 'float32' }
                : { shape: ['?'], dtype: 'float32' }
            )
          }
        } else if (CUSTOM_NODE_TYPES.has(currentNode.data.nodeType)) {
          outputTensors = currentNode.data.outputs.map(o =>
            o.tensor
              ? { shape: [...o.tensor.shape], dtype: o.tensor.dtype || 'float32' }
              : { shape: ['?'], dtype: 'float32' }
          )
        } else {
          outputTensors = currentNode.runtime.infer(allInputTensors, currentNode.data.params)
        }

        const outputMap = new Map<string, TensorSpec>()
        currentNode.data.outputs.forEach((output, i) => {
          if (outputTensors[i]) {
            outputMap.set(output.id, outputTensors[i])
          }
        })
        outputCache.set(node.id, outputMap)

        const updatedOutputs: Port[] = currentNode.data.outputs.map((output, i) => ({
          ...output,
          tensor: outputTensors[i] || output.tensor
        }))

        /** Do not overwrite user/port shapes for inputs that have no wire (avoids resetting the whole graph when infer runs). */
        const updatedInputs: Port[] = currentNode.data.inputs.map((input, i) => {
          const wired = incomingEdges.some(e => e.targetHandle === input.id)
          if (!wired) {
            return { ...input }
          }
          return {
            ...input,
            tensor: allInputTensors[i] || input.tensor
          }
        })

        const updatedNodeData = {
          ...currentNode.data,
          inputs: updatedInputs,
          outputs: updatedOutputs,
          ...(updatedParams ? { params: updatedParams } : {})
        }
        
        nodeMap.set(node.id, {
          ...currentNode,
          data: updatedNodeData
        })

        if (currentNode.runtime.validate) {
          const nodeErrors = currentNode.runtime.validate(allInputTensors, updatedNodeData.params)
          if (nodeErrors.length > 0) {
            errors[node.id] = nodeErrors
          }
        }
      } catch (e) {
        errors[node.id] = [{ level: 'error', message: `Inference failed: ${(e as Error).message}` }]
      }
    }

    set({
      graph: {
        nodes: Array.from(nodeMap.values()),
        edges: graph.edges
      },
      errors
    })
  }
}))
