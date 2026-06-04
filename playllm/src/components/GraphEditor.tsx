import { useCallback, useEffect, useRef } from 'react'
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  Connection,
  Edge,
  ReactFlowInstance,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  MarkerType
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { Node as GraphNode } from '../types'
import { useGraphStore } from '../store/graphStore'
import { useWorkspaceStore } from '../store/workspaceStore'
import { createNodeFromType, createCustomNode, createNodeFromSnapshot } from '../nodes'
import {
  buildClipboardPayload,
  parseCanvasDocument,
  parseClipboardPayload,
  restoreCanvasState,
  serializeCanvasDocument,
  stringifyCanvasDocument
} from '../utils/persistence'
import NodeComponent from './Node'
import RectNode from './RectNode'
import TextNode from './TextNode'

const nodeTypes = { custom: NodeComponent, rect: RectNode, text: TextNode }

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  pathOptions: { offset: 15 },
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
  const currentGraphName = useWorkspaceStore(state => state.currentGraphName)
  const attachImportedDocument = useWorkspaceStore(state => state.attachImportedDocument)
  const isWorkspaceBusy = useWorkspaceStore(state => state.isBusy)
  const createNewGraph = useWorkspaceStore(state => state.createNewGraph)
  const saveCurrentGraph = useWorkspaceStore(state => state.saveCurrentGraph)
  const syncCurrentCanvas = useWorkspaceStore(state => state.syncCurrentCanvas)
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
      type: 'smoothstep',
      animated: false,
      pathOptions: { offset: 15 },
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
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/reactflow')
    if (!type) return

    const position = reactFlowInstance.current?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    })
    if (!position) return

    useGraphStore.getState().pushSnapshot()

    const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`

    const customOpId = event.dataTransfer.getData('customOpId')
    let newNode

    if (type === 'Custom' && customOpId) {
      const customOperators = useGraphStore.getState().customOperators
      const opDef = customOperators.find(op => op.id === customOpId)
      if (opDef) {
        newNode = createCustomNode(id, position, opDef.label, opDef.inputCount, opDef.outputCount)
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

  const handleOpenCanvasFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleLoadCanvas = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const canvasDocument = parseCanvasDocument(text)
      const canvasState = restoreCanvasState(canvasDocument)

      loadCanvasState(canvasState)
      attachImportedDocument(file.name)
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
    <div className="flex-1 relative" style={{ height: '100%' }}>
      <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-sm rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2 text-left shadow-sm backdrop-blur-sm">
        <div className="truncate text-xs font-semibold text-slate-800" title={currentGraphName || 'Untitled'}>
          {currentGraphName || 'Untitled'}
        </div>
      </div>

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
        onInit={instance => { reactFlowInstance.current = instance }}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 1.5 }}
        deleteKeyCode={['Backspace', 'Delete']}
        panOnDrag
        multiSelectionKeyCode="Shift"
        snapToGrid
        snapGrid={[8, 8]}
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        elevateNodesOnSelect={false}
      >
        <Background color="#e5e7eb" gap={15} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
      </ReactFlow>

      <div className="absolute bottom-5 right-5 flex gap-2">
        <button
          onClick={() => useGraphStore.getState().undo()}
          disabled={!canUndo}
          className="px-3 py-2 bg-white text-slate-600 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:text-indigo-600 hover:border-indigo-200 transition-all duration-200 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          title="Undo (Ctrl+Z)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={() => useGraphStore.getState().redo()}
          disabled={!canRedo}
          className="px-3 py-2 bg-white text-slate-600 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:text-indigo-600 hover:border-indigo-200 transition-all duration-200 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          title="Redo (Ctrl+Y)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M12.207 2.232a.75.75 0 00.025 1.06l4.146 3.958H6.375a5.375 5.375 0 000 10.75H9.25a.75.75 0 000-1.5H6.375a3.875 3.875 0 010-7.75h10.003l-4.146 3.957a.75.75 0 001.036 1.085l5.5-5.25a.75.75 0 000-1.085l-5.5-5.25a.75.75 0 00-1.06.025z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="w-px bg-slate-200 mx-1" />
        <button
          onClick={handleNewGraph}
          disabled={isWorkspaceBusy}
          className="px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-xl shadow-sm hover:shadow-md hover:from-slate-700 hover:to-slate-800 transition-all duration-200 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          New
        </button>
        <button
          onClick={() => void handleSaveToServer()}
          disabled={isWorkspaceBusy}
          className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl shadow-sm hover:shadow-md hover:from-indigo-600 hover:to-indigo-700 transition-all duration-200 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={handleOpenCanvasFile}
          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-sm hover:shadow-md hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 text-xs font-semibold"
        >
          Import
        </button>
        <button
          onClick={handleSaveCanvas}
          className="px-4 py-2 bg-gradient-to-r from-amber-400 to-amber-500 text-white rounded-xl shadow-sm hover:shadow-md hover:from-amber-500 hover:to-amber-600 transition-all duration-200 text-xs font-semibold"
        >
          Download
        </button>
      </div>
    </div>
  )
}

export default GraphEditor
