import { Node as ReactFlowNode, Edge as ReactFlowEdge } from 'reactflow'

export type Shape = (number | string)[]

export type TensorSpec = {
  shape: Shape
  dtype?: string
}

export type Port = {
  id: string
  name: string
  type: 'input' | 'output'
  tensor?: TensorSpec
}

export type ValidationError = {
  level: 'error' | 'warning'
  message: string
}

export type NodeRuntime = {
  infer: (inputs: TensorSpec[], params: Record<string, any>) => TensorSpec[]
  validate?: (inputs: TensorSpec[], params: Record<string, any>) => ValidationError[]
}

export type FillPattern = 'none' | 'stripes' | 'grid' | 'dots' | 'crosshatch'

export type NodeStyle = {
  width?: number
  height?: number
  hasFill?: boolean
  fillColor?: string
  fillPattern?: FillPattern
  patternColor?: string
  fontColor?: string
  headerColor?: string
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  fontSize?: number
  fontFamily?: string
  fontWeight?: number
  textAlign?: 'left' | 'center' | 'right'
}

export type CustomOperatorDef = {
  id: string
  label: string
  inputCount: number
  outputCount: number
}

export type CustomNodeData = {
  label: string
  nodeType: string
  inputs: Port[]
  outputs: Port[]
  params: Record<string, any>
  style?: NodeStyle
  [key: string]: unknown
}

export type CustomNode = ReactFlowNode<CustomNodeData> & {
  runtime: NodeRuntime
}

export type Node = CustomNode

export type Edge = ReactFlowEdge

export type Graph = {
  nodes: CustomNode[]
  edges: Edge[]
}

export type SavedGraphNode = {
  id: string
  type: string
  position: { x: number; y: number }
  zIndex?: number
  data: CustomNodeData
}

export type SavedGraphEdge = {
  id: string
  source: string
  sourceHandle?: string | null
  target: string
  targetHandle?: string | null
  type?: string
  animated?: boolean
  style?: Edge['style']
  markerEnd?: Edge['markerEnd']
}

export type SavedCanvasDocument = {
  format: 'playllm-canvas'
  /** v2: same payload; preferred for new saves (compact JSON on disk). */
  version: 1 | 2
  savedAt: string
  initialShape: string
  customOperators: CustomOperatorDef[]
  graph: {
    nodes: SavedGraphNode[]
    edges: SavedGraphEdge[]
  }
}

export type GraphRecordSummary = {
  id: string
  name: string
  userId: string
  updatedAt: string
  nodeCount: number
  edgeCount: number
}

export type WorkspaceGraphSummary = GraphRecordSummary & {
  isDraft?: boolean
  isDirty?: boolean
}

export type GraphRecord = GraphRecordSummary & {
  document: SavedCanvasDocument
}

export type UserSummary = {
  id: string
  displayName: string
  graphCount: number
  updatedAt: string
}
