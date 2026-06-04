import { createNodeFromSnapshot } from '../nodes'
import { CustomOperatorDef, Graph, SavedCanvasDocument, SavedGraphEdge, SavedGraphNode } from '../types'

export type GraphClipboardPayload = {
  format: 'playllm-fragment'
  version: 1
  nodes: SavedGraphNode[]
  edges: SavedGraphEdge[]
}

type CanvasStateSnapshot = {
  graph: Graph
  initialShape: string
  customOperators: CustomOperatorDef[]
}

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

export const cloneCanvasDocument = (document: SavedCanvasDocument): SavedCanvasDocument => cloneJson(document)

export const canvasDocumentsEqual = (left: SavedCanvasDocument, right: SavedCanvasDocument): boolean => {
  if (left.version !== right.version) return false
  if (left.initialShape !== right.initialShape) return false
  if (left.graph.nodes.length !== right.graph.nodes.length) return false
  if (left.graph.edges.length !== right.graph.edges.length) return false
  const { savedAt: _, ...leftContent } = left
  const { savedAt: __, ...rightContent } = right
  return JSON.stringify(leftContent) === JSON.stringify(rightContent)
}

export const serializeGraphNode = (node: Graph['nodes'][number]): SavedGraphNode => ({
  id: node.id,
  type: node.type || 'custom',
  position: { x: node.position.x, y: node.position.y },
  zIndex: node.zIndex,
  data: {
    label: node.data.label,
    nodeType: node.data.nodeType,
    inputs: node.data.inputs.map(input => ({
      id: input.id,
      name: input.name,
      type: input.type,
      tensor: input.tensor ? { shape: [...input.tensor.shape], dtype: input.tensor.dtype } : undefined
    })),
    outputs: node.data.outputs.map(output => ({
      id: output.id,
      name: output.name,
      type: output.type,
      tensor: output.tensor ? { shape: [...output.tensor.shape], dtype: output.tensor.dtype } : undefined
    })),
    params: node.data.params,
    style: node.data.style
  }
})

export const serializeGraphEdge = (edge: Graph['edges'][number]): SavedGraphEdge => {
  const serialized: SavedGraphEdge = {
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? null,
    target: edge.target,
    targetHandle: edge.targetHandle ?? null,
    type: edge.type,
    animated: edge.animated
  }
  if (edge.style) {
    serialized.style = typeof edge.style === 'object' ? { ...edge.style as object } as typeof edge.style : edge.style
  }
  if (edge.markerEnd) {
    serialized.markerEnd = typeof edge.markerEnd === 'object' ? { ...edge.markerEnd as object } as typeof edge.markerEnd : edge.markerEnd
  }
  return serialized
}

export const serializeCanvasDocument = ({
  graph,
  initialShape,
  customOperators
}: CanvasStateSnapshot): SavedCanvasDocument => ({
  format: 'playllm-canvas',
  version: 2,
  savedAt: new Date().toISOString(),
  initialShape,
  customOperators: cloneJson(customOperators),
  graph: {
    nodes: graph.nodes.map(serializeGraphNode),
    edges: graph.edges.map(serializeGraphEdge)
  }
})

/** Compact on the wire/disk; use pretty for human-edited exports. */
export const stringifyCanvasDocument = (document: SavedCanvasDocument, pretty = false): string =>
  pretty ? JSON.stringify(document, null, 2) : JSON.stringify(document)

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const parseCanvasDocument = (text: string): SavedCanvasDocument => {
  const parsed = JSON.parse(text) as unknown

  if (!isPlainObject(parsed)) {
    throw new Error('Invalid canvas file: root must be an object')
  }
  if (parsed.format !== 'playllm-canvas') {
    throw new Error('Invalid canvas file: unsupported format')
  }
  if (parsed.version !== 1 && parsed.version !== 2) {
    throw new Error(`Unsupported canvas version: ${String(parsed.version)}`)
  }
  if (!isPlainObject(parsed.graph) || !Array.isArray(parsed.graph.nodes) || !Array.isArray(parsed.graph.edges)) {
    throw new Error('Invalid canvas file: graph payload is incomplete')
  }

  return parsed as SavedCanvasDocument
}

export const restoreCanvasState = (document: SavedCanvasDocument): CanvasStateSnapshot => {
  const nodes = document.graph.nodes.map(node => {
    const restored = createNodeFromSnapshot(node)
    if (!restored) {
      throw new Error(`Unsupported node type: ${node.data.nodeType}`)
    }
    return restored
  })

  return {
    initialShape: document.initialShape || 'B, N, H',
    customOperators: cloneJson(document.customOperators || []),
    graph: {
      nodes,
      edges: document.graph.edges.map(edge => cloneJson(edge))
    }
  }
}

export const buildClipboardPayload = (nodes: Graph['nodes'], edges: Graph['edges']): GraphClipboardPayload => ({
  format: 'playllm-fragment',
  version: 1,
  nodes: nodes.map(serializeGraphNode),
  edges: edges.map(serializeGraphEdge)
})

export const parseClipboardPayload = (text: string): GraphClipboardPayload => {
  const parsed = JSON.parse(text) as unknown
  if (!isPlainObject(parsed)) throw new Error('Invalid clipboard data')
  if (parsed.format !== 'playllm-fragment' || parsed.version !== 1) {
    throw new Error('Invalid clipboard format')
  }
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('Invalid clipboard payload')
  }
  return parsed as GraphClipboardPayload
}
