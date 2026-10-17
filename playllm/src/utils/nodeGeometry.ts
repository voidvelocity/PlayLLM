import type { CustomNodeData, Graph } from '../types'

export const CANVAS_GRID = 8
export const PORT_TRACK = CANVAS_GRID / 2
export const PORT_STEP = 16
export const HEADER_HEIGHT = 28
export const NODE_PADDING_Y = 4
export const PORT_SEPARATOR_HEIGHT = 8

const DATA_NODE_TYPES = new Set(['Scalar', 'Vector', 'Matrix', 'Tensor'])

export const snapToPortTrack = (value: number): number =>
  Math.round(value / PORT_TRACK) * PORT_TRACK

export const getNodeHeight = (data: CustomNodeData): number => {
  const inputCount = data.inputs.length
  const outputCount = data.outputs.length
  const automaticHeight = NODE_PADDING_Y
    + HEADER_HEIGHT
    + inputCount * PORT_STEP
    + (inputCount > 0 && outputCount > 0 ? PORT_SEPARATOR_HEIGHT : 0)
    + outputCount * PORT_STEP
    + NODE_PADDING_Y
  const requestedHeight = data.style?.height
  const minimumHeight = DATA_NODE_TYPES.has(data.nodeType) ? 24 : automaticHeight
  const rawHeight = Math.max(requestedHeight ?? (DATA_NODE_TYPES.has(data.nodeType) ? 48 : automaticHeight), minimumHeight)

  // The frame follows the 8px grid, so a centred single port always lands on
  // either a grid line or its 4px half-step.
  return Math.max(CANVAS_GRID, Math.ceil(rawHeight / CANVAS_GRID) * CANVAS_GRID)
}

export const getNodePortOffsets = (
  data: CustomNodeData,
  nodeHeight: number,
  portType: 'inputs' | 'outputs'
): number[] => {
  const inputCount = data.inputs.length
  const outputCount = data.outputs.length
  const count = portType === 'inputs' ? inputCount : outputCount
  if (count === 0) return []
  if (count === 1) return [snapToPortTrack(nodeHeight / 2)]

  const inputBlockTop = NODE_PADDING_Y + HEADER_HEIGHT
  const inputBlockHeight = inputCount * PORT_STEP
  const separatorHeight = inputCount > 0 && outputCount > 0 ? PORT_SEPARATOR_HEIGHT : 0
  const blockTop = portType === 'inputs'
    ? inputBlockTop
    : inputBlockTop + inputBlockHeight + separatorHeight
  const firstPort = snapToPortTrack(blockTop + PORT_STEP / 2)

  return Array.from({ length: count }, (_, index) => firstPort + index * PORT_STEP)
}

export const alignGraphToPortTracks = (graph: Graph): Graph => {
  let changed = false
  const nodes = graph.nodes.map(node => {
    const x = snapToPortTrack(node.position.x)
    const y = snapToPortTrack(node.position.y)
    if (x === node.position.x && y === node.position.y) return node
    changed = true
    return { ...node, position: { x, y } }
  })

  return changed ? { ...graph, nodes } : graph
}
