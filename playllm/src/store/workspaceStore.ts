import { create } from 'zustand'
import { deleteGraphByUser, getGraphByUser, listGraphsByUser, saveGraphByUser, updateGraphByUser } from '../utils/serverApi'
import { canvasDocumentsEqual, cloneCanvasDocument, restoreCanvasState, serializeCanvasDocument } from '../utils/persistence'
import type { CustomOperatorDef, Graph, SavedCanvasDocument, WorkspaceGraphSummary } from '../types'
import { DEFAULT_INITIAL_SHAPE_STR } from '../utils/shapeSymbols'
import { useGraphStore } from './graphStore'

const DEFAULT_USER = 'demo'
const USER_STORAGE_KEY = 'playllm.currentUserId'
const SYNC_DEBOUNCE_MS = 300

let _syncTimer: ReturnType<typeof setTimeout> | null = null

type LoadCanvasState = (payload: { graph: Graph; initialShape: string; customOperators: CustomOperatorDef[] }) => void

type WorkingDocuments = Record<string, SavedCanvasDocument>
type BaseDocuments = Record<string, SavedCanvasDocument>
type SavedNames = Record<string, string>

interface WorkspaceState {
  currentUserId: string
  graphRecords: WorkspaceGraphSummary[]
  currentGraphId: string | null
  currentGraphName: string
  status: string
  isBusy: boolean
  workingDocuments: WorkingDocuments
  initializeWorkspace: () => Promise<void>
  setCurrentUserId: (userId: string) => Promise<void>
  refreshWorkspace: () => Promise<void>
  loadGraphIntoCanvas: (graphId: string, loadCanvasState: LoadCanvasState) => Promise<void>
  createNewGraph: (loadCanvasState: LoadCanvasState) => void
  saveCurrentGraph: (
    graph: Graph,
    initialShape: string,
    customOperators: CustomOperatorDef[],
    requestedName?: string
  ) => Promise<{ saved: boolean; graphId?: string; graphName?: string; duplicate?: boolean }>
  renameGraphRecord: (graphId: string, nextName: string) => Promise<boolean>
  deleteGraphRecord: (graphId: string, loadCanvasState: LoadCanvasState) => Promise<boolean>
  duplicateGraphRecord: (graphId: string, loadCanvasState: LoadCanvasState) => Promise<void>
  syncCurrentCanvas: () => void
  setCurrentGraphName: (name: string) => void
  /** After Import file: bind canvas to a draft record so Save syncs and the document appears in the list. */
  attachImportedDocument: (fileName: string) => void
}

const getStoredUserId = () => {
  if (typeof window === 'undefined') return DEFAULT_USER
  return window.localStorage.getItem(USER_STORAGE_KEY) || DEFAULT_USER
}

const persistUserId = (userId: string) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(USER_STORAGE_KEY, userId)
}

const isDraftId = (graphId: string | null) => Boolean(graphId && graphId.startsWith('draft:'))

const createEmptyDocument = (): SavedCanvasDocument => ({
  format: 'playllm-canvas',
  version: 1,
  savedAt: new Date().toISOString(),
  initialShape: DEFAULT_INITIAL_SHAPE_STR,
  customOperators: [],
  graph: {
    nodes: [],
    edges: []
  }
})

const markRecord = (
  records: WorkspaceGraphSummary[],
  graphId: string,
  patch: Partial<WorkspaceGraphSummary>
): WorkspaceGraphSummary[] => records.map(record => record.id === graphId ? { ...record, ...patch } : record)

const removeRecord = (records: WorkspaceGraphSummary[], graphId: string): WorkspaceGraphSummary[] =>
  records.filter(record => record.id !== graphId)

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  let baseDocuments: BaseDocuments = {}
  let savedNames: SavedNames = {}

  const upsertServerRecord = (
    records: WorkspaceGraphSummary[],
    next: WorkspaceGraphSummary
  ): WorkspaceGraphSummary[] => {
    const without = records.filter(record => record.id !== next.id && record.id !== get().currentGraphId)
    return [next, ...without]
  }

  return {
    currentUserId: getStoredUserId(),
    graphRecords: [],
    currentGraphId: null,
    currentGraphName: '',
    status: 'Ready',
    isBusy: false,
    workingDocuments: {},

    initializeWorkspace: async () => {
      const userId = get().currentUserId.trim() || DEFAULT_USER
      set({ isBusy: true })

      try {
        const serverGraphs = await listGraphsByUser(userId)
        const draftRecords = get().graphRecords.filter(record => record.isDraft)

        persistUserId(userId)
        serverGraphs.forEach(graph => {
          savedNames[graph.id] = graph.name
        })

        set({
          currentUserId: userId,
          graphRecords: [...draftRecords, ...serverGraphs.map(graph => ({ ...graph, isDirty: get().graphRecords.find(r => r.id === graph.id)?.isDirty ?? false }))],
          status: `Loaded ${serverGraphs.length} graphs for ${userId}`,
          isBusy: false
        })
      } catch (error) {
        set({
          status: `Server unavailable: ${(error as Error).message}`,
          isBusy: false
        })
      }
    },

    setCurrentUserId: async (userId: string) => {
      const normalized = userId.trim() || DEFAULT_USER
      persistUserId(normalized)
      baseDocuments = {}
      savedNames = {}
      set({
        currentUserId: normalized,
        currentGraphId: null,
        currentGraphName: '',
        graphRecords: [],
        workingDocuments: {}
      })
      await get().initializeWorkspace()
    },

    refreshWorkspace: async () => {
      await get().initializeWorkspace()
    },

    loadGraphIntoCanvas: async (graphId: string, loadCanvasState: LoadCanvasState) => {
      const selected = get().graphRecords.find(record => record.id === graphId)
      const workingDocument = get().workingDocuments[graphId]

      if (selected && workingDocument) {
        baseDocuments[graphId] = cloneCanvasDocument(workingDocument)
        savedNames[graphId] = selected.name
        loadCanvasState(restoreCanvasState(workingDocument))
        set({
          currentGraphId: selected.id,
          currentGraphName: selected.name,
          status: `Loaded "${selected.name}"`,
          isBusy: false
        })
        return
      }

      const userId = get().currentUserId.trim() || DEFAULT_USER
      if (!graphId) return

      set({ isBusy: true })
      try {
        const record = await getGraphByUser(userId, graphId)
        const document = cloneCanvasDocument(record.document)
        baseDocuments[record.id] = cloneCanvasDocument(record.document)
        savedNames[record.id] = record.name

        loadCanvasState(restoreCanvasState(document))
        set(state => ({
          currentGraphId: record.id,
          currentGraphName: record.name,
          workingDocuments: {
            ...state.workingDocuments,
            [record.id]: document
          },
          graphRecords: markRecord(state.graphRecords, record.id, {
            name: record.name,
            updatedAt: record.updatedAt,
            isDirty: false
          }),
          status: `Loaded "${record.name}"`,
          isBusy: false
        }))
      } catch (error) {
        set({
          status: `Load failed: ${(error as Error).message}`,
          isBusy: false
        })
      }
    },

    createNewGraph: (loadCanvasState: LoadCanvasState) => {
      const draftId = `draft:${Date.now().toString(36)}`
      const draftName = 'Untitled Graph'
      const document = createEmptyDocument()

      loadCanvasState(restoreCanvasState(document))
      baseDocuments[draftId] = cloneCanvasDocument(document)
      savedNames[draftId] = draftName

      set(state => ({
        currentGraphId: draftId,
        currentGraphName: draftName,
        workingDocuments: {
          ...state.workingDocuments,
          [draftId]: document
        },
        graphRecords: [
          {
            id: draftId,
            name: draftName,
            userId: state.currentUserId,
            updatedAt: new Date().toISOString(),
            nodeCount: 0,
            edgeCount: 0,
            isDraft: true,
            isDirty: false
          },
          ...state.graphRecords
        ],
        status: 'Created a new graph'
      }))
    },

    saveCurrentGraph: async (graph, initialShape, customOperators, requestedName) => {
      const userId = get().currentUserId.trim() || DEFAULT_USER
      const graphId = get().currentGraphId
      const fallbackName = get().currentGraphName.trim()
      const graphName = (requestedName || fallbackName).trim()

      if (!graphName) {
        set({ status: 'Graph name is required before first save' })
        return { saved: false }
      }

      const isNewGraph = !graphId || isDraftId(graphId)
      if (isNewGraph) {
        const existingRecords = get().graphRecords.filter(
          record => !record.isDraft && record.name.toLowerCase() === graphName.toLowerCase()
        )
        if (existingRecords.length > 0) {
          set({ status: `A graph named "${graphName}" already exists. Please use a different name.` })
          return { saved: false, duplicate: true }
        }
      }

      if (_syncTimer) {
        clearTimeout(_syncTimer)
        _syncTimer = null
      }

      set({ isBusy: true })
      try {
        const serialized = serializeCanvasDocument({
          graph,
          initialShape,
          customOperators
        })

        const summary = !graphId || isDraftId(graphId)
          ? await saveGraphByUser(userId, graphName, serialized)
          : await updateGraphByUser(userId, graphId, graphName, serialized)

        baseDocuments[summary.id] = serialized
        savedNames[summary.id] = summary.name

        if (graphId && graphId !== summary.id) {
          delete baseDocuments[graphId]
          delete savedNames[graphId]
        }

        set(state => {
          const nextWorkingDocuments = { ...state.workingDocuments }
          if (graphId && graphId !== summary.id) {
            delete nextWorkingDocuments[graphId]
          }
          nextWorkingDocuments[summary.id] = serialized

          const nextRecord: WorkspaceGraphSummary = {
            id: summary.id,
            name: summary.name,
            userId: summary.userId,
            updatedAt: summary.updatedAt,
            nodeCount: summary.nodeCount,
            edgeCount: summary.edgeCount,
            isDirty: false
          }

          return {
            graphRecords: upsertServerRecord(removeRecord(state.graphRecords, graphId || ''), nextRecord),
            currentGraphId: summary.id,
            currentGraphName: summary.name,
            workingDocuments: nextWorkingDocuments,
            status: `Saved "${summary.name}"`,
            isBusy: false
          }
        })

        return { saved: true, graphId: summary.id, graphName: summary.name }
      } catch (error) {
        set({
          status: `Save failed: ${(error as Error).message}`,
          isBusy: false
        })
        return { saved: false }
      }
    },

    renameGraphRecord: async (graphId: string, nextName: string) => {
      const trimmedName = nextName.trim()
      if (!trimmedName) return false

      const current = get().graphRecords.find(record => record.id === graphId)
      if (!current) return false

      if (current.isDraft) {
        savedNames[graphId] = trimmedName
        set(state => ({
          currentGraphName: state.currentGraphId === graphId ? trimmedName : state.currentGraphName,
          graphRecords: markRecord(state.graphRecords, graphId, {
            name: trimmedName,
            updatedAt: new Date().toISOString()
          }),
          status: `Renamed "${trimmedName}"`
        }))
        return true
      }

      const userId = get().currentUserId.trim() || DEFAULT_USER
      set({ isBusy: true })
      try {
        const summary = await updateGraphByUser(userId, graphId, trimmedName)
        savedNames[graphId] = summary.name

        set(state => {
          const currentWorking = state.workingDocuments[graphId]
          const stillDirty = currentWorking && baseDocuments[graphId]
            ? !canvasDocumentsEqual(currentWorking, baseDocuments[graphId])
            : false

          const nextRecord: WorkspaceGraphSummary = {
            id: summary.id,
            name: summary.name,
            userId: summary.userId,
            updatedAt: summary.updatedAt,
            nodeCount: summary.nodeCount,
            edgeCount: summary.edgeCount,
            isDirty: stillDirty
          }

          return {
            graphRecords: upsertServerRecord(markRecord(state.graphRecords, graphId, nextRecord), nextRecord),
            currentGraphName: state.currentGraphId === graphId ? summary.name : state.currentGraphName,
            status: `Renamed "${summary.name}"`,
            isBusy: false
          }
        })
        return true
      } catch (error) {
        set({
          status: `Rename failed: ${(error as Error).message}`,
          isBusy: false
        })
        return false
      }
    },

    deleteGraphRecord: async (graphId: string, loadCanvasState: LoadCanvasState) => {
      const current = get().graphRecords.find(record => record.id === graphId)
      if (!current) return false

      const clearCurrentIfNeeded = () => {
        if (get().currentGraphId === graphId) {
          const emptyDocument = createEmptyDocument()
          loadCanvasState(restoreCanvasState(emptyDocument))
          set({
            currentGraphId: null,
            currentGraphName: '',
            status: 'Deleted graph'
          })
        }
      }

      if (current.isDraft) {
        delete baseDocuments[graphId]
        delete savedNames[graphId]
        set(state => {
          const nextWorkingDocuments = { ...state.workingDocuments }
          delete nextWorkingDocuments[graphId]
          return {
            graphRecords: removeRecord(state.graphRecords, graphId),
            workingDocuments: nextWorkingDocuments,
            status: `Deleted "${current.name}"`
          }
        })
        clearCurrentIfNeeded()
        return true
      }

      const userId = get().currentUserId.trim() || DEFAULT_USER
      set({ isBusy: true })
      try {
        await deleteGraphByUser(userId, graphId)
        delete baseDocuments[graphId]
        delete savedNames[graphId]
        set(state => {
          const nextWorkingDocuments = { ...state.workingDocuments }
          delete nextWorkingDocuments[graphId]
          return {
            graphRecords: removeRecord(state.graphRecords, graphId),
            workingDocuments: nextWorkingDocuments,
            status: `Deleted "${current.name}"`,
            isBusy: false
          }
        })
        clearCurrentIfNeeded()
        return true
      } catch (error) {
        set({
          status: `Delete failed: ${(error as Error).message}`,
          isBusy: false
        })
        return false
      }
    },

    duplicateGraphRecord: async (graphId: string, loadCanvasState: LoadCanvasState) => {
      const sourceRecord = get().graphRecords.find(record => record.id === graphId)
      if (!sourceRecord) return

      let sourceDocument = get().workingDocuments[graphId]
      if (!sourceDocument && !sourceRecord.isDraft) {
        const userId = get().currentUserId.trim() || DEFAULT_USER
        try {
          const record = await getGraphByUser(userId, graphId)
          sourceDocument = cloneCanvasDocument(record.document)
        } catch (error) {
          set({ status: `Copy failed: ${(error as Error).message}` })
          return
        }
      }

      if (!sourceDocument) return

      const draftId = `draft:${Date.now().toString(36)}`
      const draftName = `${sourceRecord.name} Copy`
      const draftDocument = cloneCanvasDocument(sourceDocument)
      draftDocument.savedAt = new Date().toISOString()

      baseDocuments[draftId] = cloneCanvasDocument(draftDocument)
      savedNames[draftId] = draftName
      loadCanvasState(restoreCanvasState(draftDocument))

      set(state => ({
        currentGraphId: draftId,
        currentGraphName: draftName,
        workingDocuments: {
          ...state.workingDocuments,
          [draftId]: draftDocument
        },
        graphRecords: [
          {
            id: draftId,
            name: draftName,
            userId: state.currentUserId,
            updatedAt: new Date().toISOString(),
            nodeCount: draftDocument.graph.nodes.length,
            edgeCount: draftDocument.graph.edges.length,
            isDraft: true,
            isDirty: false
          },
          ...state.graphRecords
        ],
        status: `Copied "${sourceRecord.name}"`
      }))
    },

    syncCurrentCanvas: () => {
      if (_syncTimer) clearTimeout(_syncTimer)
      _syncTimer = setTimeout(() => {
        const currentGraphId = get().currentGraphId
        if (!currentGraphId) return

        const nextDocument = serializeCanvasDocument({
          graph: useGraphStore.getState().graph,
          initialShape: useGraphStore.getState().initialShape,
          customOperators: useGraphStore.getState().customOperators
        })

        set(state => {
          const baseDocument = baseDocuments[currentGraphId]
          const docDirty = baseDocument ? !canvasDocumentsEqual(nextDocument, baseDocument) : true

          return {
            workingDocuments: {
              ...state.workingDocuments,
              [currentGraphId]: nextDocument
            },
            graphRecords: markRecord(state.graphRecords, currentGraphId, {
              nodeCount: useGraphStore.getState().graph.nodes.length,
              edgeCount: useGraphStore.getState().graph.edges.length,
              isDirty: docDirty
            })
          }
        })
      }, SYNC_DEBOUNCE_MS)
    },

    setCurrentGraphName: (name: string) => set({ currentGraphName: name }),

    attachImportedDocument: (fileName: string) => {
      const draftId = `draft:import:${Date.now().toString(36)}`
      const baseName = fileName.replace(/^.*[/\\]/, '').replace(/\.json$/i, '').trim() || 'Imported'
      const { graph, initialShape, customOperators } = useGraphStore.getState()
      const document = serializeCanvasDocument({ graph, initialShape, customOperators })
      baseDocuments[draftId] = cloneCanvasDocument(document)
      savedNames[draftId] = baseName

      set(state => ({
        currentGraphId: draftId,
        currentGraphName: baseName,
        workingDocuments: {
          ...state.workingDocuments,
          [draftId]: document
        },
        graphRecords: [
          {
            id: draftId,
            name: baseName,
            userId: state.currentUserId,
            updatedAt: new Date().toISOString(),
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            isDraft: true,
            isDirty: false
          },
          ...state.graphRecords
        ],
        status: `Imported "${baseName}" — use Save to store on server`
      }))
    }
  }
})
