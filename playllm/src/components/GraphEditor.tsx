import { useCallback, useEffect, useRef } from 'react'
import ReactFlow, {
  Controls,
  ControlButton,
  Background,
  MiniMap,
  Connection,
  Edge,
  ReactFlowInstance,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  MarkerType,
  BaseEdge,
  EdgeProps,
  getSmoothStepPath,
  getStraightPath
} from 'reactflow'
import 'reactflow/dist/style.css'
import { toSvg } from 'html-to-image'
import type { Node as GraphNode } from '../types'
import { useGraphStore } from '../store/graphStore'
import { useWorkspaceStore } from '../store/workspaceStore'
import { useUIStore } from '../store/uiStore'
import { createNodeFromType, createCustomNode, createNodeFromSnapshot } from '../nodes'
import {
  buildClipboardPayload,
  parseCanvasImport,
  parseClipboardPayload,
  restoreCanvasState,
  serializeCanvasDocument,
  stringifyCanvasDocument
} from '../utils/persistence'
import NodeComponent from './Node'
import {
  CANVAS_GRID,
  PORT_TRACK,
  getNodeHeight,
  getNodePortOffsets,
  snapToPortTrack
} from '../utils/nodeGeometry'
import { clearPaletteDrag, readPaletteDrag } from '../utils/dragPayload'
import RectNode from './RectNode'
import TextNode from './TextNode'
import UserMenu from './UserMenu'

const nodeTypes = { custom: NodeComponent, rect: RectNode, text: TextNode }

const SmartEdge = ({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }: EdgeProps) => {
  const isHorizontal = Math.abs(sourceY - targetY) < 0.75
  const alignedY = isHorizontal ? (sourceY + targetY) / 2 : sourceY
  const [path] = isHorizontal
    ? getStraightPath({ sourceX, sourceY: alignedY, targetX, targetY: alignedY })
    : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 })
  return <BaseEdge path={path} markerEnd={markerEnd} style={style} />
}

const edgeTypes = { smoothstep: SmartEdge, smart: SmartEdge }

const getAbsolutePortYs = (node: GraphNode, portType: 'inputs' | 'outputs'): number[] => {
  if (node.data.nodeType === 'Rect' || node.data.nodeType === 'Text') return []
  const nodeHeight = getNodeHeight(node.data)
  return getNodePortOffsets(node.data, nodeHeight, portType)
    .map(offset => snapToPortTrack(node.position.y + offset))
}

const getAbsolutePortY = (
  node: GraphNode,
  portType: 'inputs' | 'outputs',
  portId: string | null | undefined
): number | null => {
  if (!portId) return null
  const portIndex = node.data[portType].findIndex(port => port.id === portId)
  if (portIndex < 0) return null
  return getAbsolutePortYs(node, portType)[portIndex] ?? null
}

type IconName = 'undo' | 'redo' | 'new' | 'save' | 'import' | 'download' | 'export' | 'sparkles' | 'check' | 'ignore'

const ToolbarIcon = ({ name }: { name: IconName }) => {
  const paths: Record<IconName, JSX.Element> = {
    undo: <path d="M9 7 5 11l4 4M6 11h7a4 4 0 0 1 0 8h-2" />,
    redo: <path d="m15 7 4 4-4 4m3-4h-7a4 4 0 0 0 0 8h2" />,
    new: <><path d="M12 5v14M5 12h14" /><path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /></>,
    save: <><path d="M5 3h12l4 4v14H3V3h2Z" /><path d="M7 3v6h9V3M7 21v-7h10v7" /></>,
    import: <><path d="M3 12h11m-4-4 4 4-4 4" /><path d="M14 4h6v16h-6" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 20h14" /></>,
    export: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v7H4V6h7" /></>,
    sparkles: <><path d="m12 3 .9 2.6L15.5 7l-2.6.9L12 10.5l-.9-2.6L8.5 7l2.6-1.4L12 3Z" /><path d="m6 13 .7 2.3L9 16l-2.3.7L6 19l-.7-2.3L3 16l2.3-.7L6 13Zm12-2 .6 1.8 1.9.7-1.9.6L18 16l-.6-1.9-1.9-.6 1.9-.7L18 11Z" /></>,
    check: <><path d="M4 12.5 9 17l11-11" /><path d="M12 3a9 9 0 1 0 9 9" /></>,
    ignore: <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></>
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

// html-to-image's toSvg() returns a `data:image/svg+xml;charset=utf-8,...` URI.
// Browsers can't open that file directly, so decode it back to a raw SVG string.
const decodeSvgDataUri = (dataUri: string): string => {
  const prefix = 'data:image/svg+xml'
  if (!dataUri.startsWith(prefix)) return dataUri
  const commaIdx = dataUri.indexOf(',')
  if (commaIdx < 0) return dataUri
  const header = dataUri.slice(5, commaIdx)
  const payload = dataUri.slice(commaIdx + 1)
  if (header.includes(';base64')) {
    try {
      return atob(payload)
    } catch {
      return dataUri
    }
  }
  try {
    return decodeURIComponent(payload)
  } catch {
    return payload
  }
}

const defaultEdgeOptions = {
  type: 'smart',
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: '#4f46e5'
  },
  style: { stroke: '#4f46e5', strokeWidth: 1.5 }
}

const GraphEditor = () => {
  const graph = useGraphStore(state => state.graph)
  const setGraph = useGraphStore(state => state.setGraph)
  const loadCanvasState = useGraphStore(state => state.loadCanvasState)
  const initialShape = useGraphStore(state => state.initialShape)
  const customOperators = useGraphStore(state => state.customOperators)
  const canUndo = useGraphStore(state => state.canUndo)
  const canRedo = useGraphStore(state => state.canRedo)
  const validationErrors = useGraphStore(state => state.errors)
  const currentGraphName = useWorkspaceStore(state => state.currentGraphName)
  const currentGraphId = useWorkspaceStore(state => state.currentGraphId)
  const setCurrentGraphName = useWorkspaceStore(state => state.setCurrentGraphName)
  const renameGraphRecord = useWorkspaceStore(state => state.renameGraphRecord)
  const attachImportedDocument = useWorkspaceStore(state => state.attachImportedDocument)
  const isWorkspaceBusy = useWorkspaceStore(state => state.isBusy)
  const createNewGraph = useWorkspaceStore(state => state.createNewGraph)
  const saveCurrentGraph = useWorkspaceStore(state => state.saveCurrentGraph)
  const syncCurrentCanvas = useWorkspaceStore(state => state.syncCurrentCanvas)
  const showGrid = useUIStore(state => state.showGrid)
  const toggleGrid = useUIStore(state => state.toggleGrid)
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const hasShapeErrors = Object.values(validationErrors)
    .some(nodeErrors => nodeErrors.some(error => error.level === 'error'))
  const hasValidationResults = Object.values(validationErrors)
    .some(nodeErrors => nodeErrors.length > 0)

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const hasRemove = changes.some(c => c.type === 'remove')
    if (hasRemove) {
      useGraphStore.getState().pushSnapshot()
    }

    const currentGraph = useGraphStore.getState().graph
    setGraph({
      ...currentGraph,
      nodes: applyNodeChanges(changes, currentGraph.nodes) as typeof currentGraph.nodes
    })

    for (const change of changes) {
      if (change.type === 'select' && change.selected) {
        useGraphStore.getState().selectNode(change.id)
        useGraphStore.getState().selectEdge(null)
        break
      }
    }
  }, [setGraph])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const hasStructuralChange = changes.some(c =>
      c.type === 'remove' || c.type === 'add'
    )
    if (hasStructuralChange) {
      useGraphStore.getState().pushSnapshot()
    }

    const currentGraph = useGraphStore.getState().graph
    setGraph({
      ...currentGraph,
      edges: applyEdgeChanges(changes, currentGraph.edges)
    })
  }, [setGraph])

  const onConnect = useCallback((connection: Connection) => {
    useGraphStore.getState().pushSnapshot()
    const edge: Edge = {
      id: `e-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
      source: connection.source!,
      sourceHandle: connection.sourceHandle!,
      target: connection.target!,
      targetHandle: connection.targetHandle!,
      type: 'smart',
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: '#4f46e5'
      },
      style: { stroke: '#4f46e5', strokeWidth: 1.5 }
    }
    const newGraph = { ...useGraphStore.getState().graph }
    newGraph.edges = [...newGraph.edges, edge]
    setGraph(newGraph)
    setTimeout(() => useGraphStore.getState().runShapeInference(), 0)
  }, [setGraph])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const dragPayload = readPaletteDrag(event.dataTransfer)
    if (!dragPayload) return
    const { type, customId: customOpId } = dragPayload

    const rawPosition = reactFlowInstance.current?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    })
    if (!rawPosition) return
    const position = {
      x: snapToPortTrack(rawPosition.x),
      y: snapToPortTrack(rawPosition.y)
    }

    useGraphStore.getState().pushSnapshot()

    const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`

    let newNode

    if (type === 'Custom' && customOpId) {
      const customOperators = useGraphStore.getState().customOperators
      const opDef = customOperators.find(op => op.id === customOpId)
      if (opDef) {
        newNode = createCustomNode(id, position, opDef.label, opDef.inputCount, opDef.outputCount, opDef.inputNames, opDef.outputNames)
      }
    }

    if (!newNode) {
      newNode = createNodeFromType(type, id, position)
    }

    if (!newNode) return

    const newGraph = { ...useGraphStore.getState().graph }
    newGraph.nodes = [...newGraph.nodes, newNode]
    setGraph(newGraph)
    useGraphStore.getState().selectNode(id)
    clearPaletteDrag()
    setTimeout(() => useGraphStore.getState().runShapeInference(), 0)
  }, [setGraph])

  const handleSaveCanvas = useCallback(() => {
    const canvasDocument = serializeCanvasDocument({
      graph,
      initialShape,
      customOperators
    })
    const blob = new Blob([stringifyCanvasDocument(canvasDocument, false)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    anchor.href = url
    anchor.download = `playllm-canvas-${timestamp}.json`
    anchor.click()

    URL.revokeObjectURL(url)
  }, [customOperators, graph, initialShape])

  const handleExportSVG = useCallback(async () => {
    const instance = reactFlowInstance.current
    if (!instance) return

    instance.fitView({ padding: 0.05, minZoom: 0.1, maxZoom: 4 })
    await new Promise(resolve => setTimeout(resolve, 200))

    // Export the ReactFlow root element. html-to-image returns a
    // data:image/svg+xml URI; we decode it back to a real SVG string so the
    // browser can open the file directly.
    const flow = document.querySelector('.react-flow') as HTMLElement | null
    if (!flow) return

    // Hide the controls panel, minimap, and grid background during capture so
    // they don't appear in the exported SVG.
    const hidden: HTMLElement[] = []
    const selectors = ['.react-flow__controls', '.react-flow__minimap', '.react-flow__background', '.react-flow__attribution']
    for (const sel of selectors) {
      const el = flow.querySelector(sel) as HTMLElement | null
      if (el) {
        hidden.push(el)
        el.style.visibility = 'hidden'
      }
    }

    try {
      const dataUri = await toSvg(flow, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true })
      const svgString = decodeSvgDataUri(dataUri)
      if (!svgString.startsWith('<svg') && !svgString.startsWith('<?xml')) {
        throw new Error('Generated content is not a valid SVG document')
      }
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      anchor.href = url
      anchor.download = `playllm-${timestamp}.svg`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      window.alert(`Export to SVG failed: ${(error as Error).message}`)
    } finally {
      for (const el of hidden) {
        el.style.visibility = ''
      }
    }
  }, [])

  const handleOpenCanvasFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleLoadCanvas = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const imported = parseCanvasImport(text)
      const canvasState = restoreCanvasState(imported.document)

      loadCanvasState(canvasState)
      attachImportedDocument(file.name, imported.name)
      setTimeout(() => useGraphStore.getState().runShapeInference(), 0)
    } catch (error) {
      window.alert(`Failed to load canvas: ${(error as Error).message}`)
    } finally {
      event.target.value = ''
    }
  }, [attachImportedDocument, loadCanvasState])

  const handleNewGraph = useCallback(() => {
    createNewGraph(loadCanvasState)
  }, [createNewGraph, loadCanvasState])

  const handleSaveToServer = useCallback(async () => {
    let graphName = currentGraphName.trim()

    if (!graphName) {
      graphName = 'Untitled Graph'
    }

    const result = await saveCurrentGraph(graph, initialShape, customOperators, graphName)
    
    if (result.duplicate) {
      const newName = window.prompt(`A graph named "${graphName}" already exists. Please enter a new name:`)
      if (newName && newName.trim()) {
        await saveCurrentGraph(graph, initialShape, customOperators, newName.trim())
      }
    }
  }, [currentGraphName, customOperators, graph, initialShape, saveCurrentGraph])

  useEffect(() => {
    syncCurrentCanvas()
  }, [customOperators, graph, initialShape, syncCurrentCanvas])

  useEffect(() => {
    const AUTO_SAVE_MS = 10_000
    const timer = setInterval(() => {
      const { currentGraphId, graphRecords, saveCurrentGraph } = useWorkspaceStore.getState()
      if (!currentGraphId) return

      const record = graphRecords.find(r => r.id === currentGraphId)
      if (!record || record.isDraft || !record.isDirty) return

      const { graph: g, initialShape: is, customOperators: co } = useGraphStore.getState()
      void saveCurrentGraph(g, is, co)
    }, AUTO_SAVE_MS)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const typingTarget = (target: EventTarget | null) => {
      if (!target || !(target instanceof HTMLElement)) return null
      return target.closest('input, textarea, select, [contenteditable="true"]')
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (typingTarget(event.target)) return

      const mod = event.ctrlKey || event.metaKey

      if (mod && (event.key === 'c' || event.key === 'C')) {
        const g = useGraphStore.getState().graph
        const selected = g.nodes.filter(n => n.selected)
        if (selected.length === 0) return
        const idSet = new Set(selected.map(n => n.id))
        const internalEdges = g.edges.filter(e => idSet.has(e.source) && idSet.has(e.target))
        const payload = buildClipboardPayload(selected, internalEdges)
        event.preventDefault()
        void navigator.clipboard.writeText(JSON.stringify(payload))
        return
      }

      if (mod && (event.key === 'v' || event.key === 'V')) {
        event.preventDefault()
        void navigator.clipboard.readText().then(text => {
          try {
            const payload = parseClipboardPayload(text)
            const idMap = new Map<string, string>()
            let seq = 0
            const newNodes = payload.nodes.map(snapshot => {
              const newId = `node_${Date.now()}_${seq++}_${Math.random().toString(36).slice(2, 8)}`
              idMap.set(snapshot.id, newId)
              const snap = {
                ...snapshot,
                id: newId,
                position: { x: snapshot.position.x + 48, y: snapshot.position.y + 48 }
              }
              return createNodeFromSnapshot(snap)
            }).filter((n): n is GraphNode => n != null)

            const newEdges: Edge[] = payload.edges.map(e => {
              const src = idMap.get(e.source)
              const tgt = idMap.get(e.target)
              if (!src || !tgt) return null
              const raw = JSON.parse(JSON.stringify(e)) as Edge
              return {
                ...raw,
                id: `e-${src}-${e.sourceHandle}-${tgt}-${e.targetHandle}`,
                source: src,
                target: tgt
              }
            }).filter((e): e is Edge => e != null)

            const state = useGraphStore.getState()
            state.pushSnapshot()
            const cleared = state.graph.nodes.map(n => ({ ...n, selected: false }))
            const withSel = newNodes.map(n => ({ ...n, selected: true }))
            state.setGraph({
              nodes: [...cleared, ...withSel],
              edges: [...state.graph.edges, ...newEdges]
            })
            if (newNodes.length > 0) {
              state.selectNode(newNodes[0].id)
              state.selectEdge(null)
            }
            setTimeout(() => useGraphStore.getState().runShapeInference(), 0)
          } catch {
            /* not our clipboard format */
          }
        })
        return
      }

      if (mod && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        useGraphStore.getState().undo()
        return
      }

      if (mod && (event.key === 'y' || (event.key === 'z' && event.shiftKey) || (event.key === 'Z' && event.shiftKey))) {
        event.preventDefault()
        useGraphStore.getState().redo()
        return
      }

      const selectedNodeId = useGraphStore.getState().selectedNodeId
      if (!selectedNodeId) return

      const GRID = 8
      let dx = 0
      let dy = 0

      switch (event.key) {
        case 'ArrowUp':
        case 'k':
          if (event.key === 'ArrowUp' && event.metaKey) return
          dy = -GRID
          break
        case 'ArrowDown':
        case 'j':
          if (event.key === 'ArrowDown' && event.metaKey) return
          dy = GRID
          break
        case 'ArrowLeft':
        case 'h':
          if (event.key === 'ArrowLeft' && event.metaKey) return
          dx = -GRID
          break
        case 'ArrowRight':
        case 'l':
          if (event.key === 'ArrowRight' && event.metaKey) return
          dx = GRID
          break
        default:
          return
      }

      event.preventDefault()
      const currentGraph = useGraphStore.getState().graph
      const node = currentGraph.nodes.find(n => n.id === selectedNodeId)
      if (!node) return

      useGraphStore.getState().updateNodePosition(selectedNodeId, {
        x: node.position.x + dx,
        y: node.position.y + dy
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <main className="canvas-workspace relative flex min-w-0 flex-1 flex-col" style={{ height: '100%' }}>
      <header className="canvas-toolbar z-20 flex h-[72px] flex-none items-center justify-between border-b border-slate-200/80 bg-white px-5">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            <span>Architecture canvas</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="normal-case tracking-normal text-emerald-600">{isWorkspaceBusy ? 'Working…' : 'Workspace ready'}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="canvas-title-field" title="Edit canvas name">
              <input
                value={currentGraphName}
                onChange={event => setCurrentGraphName(event.target.value)}
                onBlur={() => {
                  if (currentGraphId && currentGraphName.trim()) {
                    void renameGraphRecord(currentGraphId, currentGraphName)
                  }
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                className="canvas-title-input"
                placeholder="Untitled model"
                aria-label="Canvas name"
                spellCheck={false}
              />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/></svg>
            </label>
            <span className="hidden rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] font-medium text-slate-500 2xl:inline-flex">
              {graph.nodes.length} nodes · {graph.edges.length} edges
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="toolbar-group">
            <button onClick={() => useGraphStore.getState().undo()} disabled={!canUndo} className="icon-button" title="Undo (⌘Z)" aria-label="Undo"><ToolbarIcon name="undo" /></button>
            <button onClick={() => useGraphStore.getState().redo()} disabled={!canRedo} className="icon-button" title="Redo (⇧⌘Z)" aria-label="Redo"><ToolbarIcon name="redo" /></button>
          </div>
          <div className={`toolbar-group ${hasShapeErrors ? 'border-red-200 bg-red-50' : ''}`}>
            <button
              onClick={() => useGraphStore.getState().runShapeInference(true)}
              className={`toolbar-button ${hasShapeErrors ? 'text-red-700' : ''}`}
              title="Manually check connected tensor shapes"
            >
              <ToolbarIcon name="check" />
              <span className="hidden 2xl:inline">Check</span>
            </button>
            <button
              onClick={() => useGraphStore.getState().clearValidationErrors()}
              disabled={!hasValidationResults}
              className="toolbar-button"
              title="Ignore all check results and clear error highlighting"
            >
              <ToolbarIcon name="ignore" />
              <span className="hidden 2xl:inline">Ignore all</span>
            </button>
          </div>
          <div className="toolbar-group hidden xl:flex">
            <button onClick={handleNewGraph} disabled={isWorkspaceBusy} className="toolbar-button" title="New model"><ToolbarIcon name="new" /><span className="hidden 2xl:inline">New</span></button>
            <button onClick={handleOpenCanvasFile} className="toolbar-button" title="Import Model"><ToolbarIcon name="import" /><span className="hidden 2xl:inline">Import Model</span></button>
            <button onClick={handleSaveCanvas} className="toolbar-button" title="Export Model"><ToolbarIcon name="download" /><span className="hidden 2xl:inline">Export Model</span></button>
            <button onClick={() => void handleExportSVG()} className="toolbar-button" title="Export SVG"><ToolbarIcon name="export" /><span className="hidden 2xl:inline">SVG</span></button>
          </div>
          <button onClick={() => void handleSaveToServer()} disabled={isWorkspaceBusy} className="primary-toolbar-button">
            <ToolbarIcon name="save" /><span>{isWorkspaceBusy ? 'Working…' : 'Save'}</span>
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="relative min-h-0 flex-1" onDragOver={onDragOver} onDrop={onDrop}>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleLoadCanvas}
      />

      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={() => {
          useGraphStore.getState().selectNode(null)
          useGraphStore.getState().selectEdge(null)
        }}
        onNodeClick={(_, node) => {
          useGraphStore.getState().selectNode(node.id)
        }}
        onEdgeClick={(_, edge) => {
          useGraphStore.getState().selectEdge(edge.id)
        }}
        onNodeDragStart={() => {
          useGraphStore.getState().pushSnapshot()
        }}
        onNodeDragStop={(_, draggedNode) => {
          const currentGraph = useGraphStore.getState().graph
          const draggedInputs = getAbsolutePortYs(draggedNode as GraphNode, 'inputs')
          const draggedOutputs = getAbsolutePortYs(draggedNode as GraphNode, 'outputs')
          const connectedDeltas: number[] = []
          const deltas: number[] = []

          for (const edge of currentGraph.edges) {
            if (edge.source === draggedNode.id) {
              const targetNode = currentGraph.nodes.find(node => node.id === edge.target)
              if (!targetNode) continue
              const sourceY = getAbsolutePortY(draggedNode as GraphNode, 'outputs', edge.sourceHandle)
              const targetY = getAbsolutePortY(targetNode, 'inputs', edge.targetHandle)
              if (sourceY != null && targetY != null) connectedDeltas.push(targetY - sourceY)
            } else if (edge.target === draggedNode.id) {
              const sourceNode = currentGraph.nodes.find(node => node.id === edge.source)
              if (!sourceNode) continue
              const sourceY = getAbsolutePortY(sourceNode, 'outputs', edge.sourceHandle)
              const targetY = getAbsolutePortY(draggedNode as GraphNode, 'inputs', edge.targetHandle)
              if (sourceY != null && targetY != null) connectedDeltas.push(sourceY - targetY)
            }
          }

          for (const node of currentGraph.nodes) {
            if (node.id === draggedNode.id) continue
            const otherInputs = getAbsolutePortYs(node, 'inputs')
            const otherOutputs = getAbsolutePortYs(node, 'outputs')
            for (const sourceY of draggedOutputs) {
              for (const targetY of otherInputs) deltas.push(targetY - sourceY)
            }
            for (const targetY of draggedInputs) {
              for (const sourceY of otherOutputs) deltas.push(sourceY - targetY)
            }
          }

          const nearbyConnectedDeltas = connectedDeltas.filter(delta => Math.abs(delta) <= 12)
          const nearestDelta = (nearbyConnectedDeltas.length > 0 ? nearbyConnectedDeltas : deltas)
            .filter(delta => Math.abs(delta) <= 12)
            .sort((a, b) => Math.abs(a) - Math.abs(b))[0]
          if (nearestDelta == null || nearestDelta === 0) return
          useGraphStore.getState().updateNodePosition(draggedNode.id, {
            x: draggedNode.position.x,
            y: draggedNode.position.y + nearestDelta
          })
        }}
        onInit={instance => { reactFlowInstance.current = instance }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 1.5 }}
        deleteKeyCode={['Backspace', 'Delete']}
        panOnDrag
        snapToGrid
        snapGrid={[PORT_TRACK, PORT_TRACK]}
        multiSelectionKeyCode="Shift"
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        elevateNodesOnSelect={false}
      >
        {showGrid && <Background color="#cbd5e1" gap={CANVAS_GRID} size={1} />}
        <Controls>
          <ControlButton
            onClick={toggleGrid}
            title={showGrid ? 'Hide grid' : 'Show grid'}
            aria-label="Toggle grid"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5A.75.75 0 012.75 14h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 14.75z" clipRule="evenodd" />
            </svg>
          </ControlButton>
        </Controls>
        <MiniMap
          nodeStrokeWidth={3}
          maskColor="rgba(15, 23, 42, 0.08)"
          zoomable
          pannable
        />
      </ReactFlow>

      {graph.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="empty-canvas-card pointer-events-auto max-w-sm rounded-2xl border border-slate-200/80 bg-white/95 p-6 text-center shadow-xl shadow-slate-200/50 backdrop-blur">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><ToolbarIcon name="sparkles" /></div>
            <h2 className="text-sm font-semibold text-slate-900">Start mapping your model</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">Drag operators or tensors from the library onto the canvas, then connect ports to describe the data flow.</p>
            <div className="mt-4 flex items-center justify-center gap-3 text-[10px] font-medium text-slate-400"><span>Drag to add</span><span>·</span><span>Shift to multi-select</span><span>·</span><span>⌘Z to undo</span></div>
          </div>
        </div>
      )}
      </div>
    </main>
  )
}

export default GraphEditor
