import { KeyboardEvent, ReactNode, useEffect, useState } from 'react'
import { getNodeConfig, getOperatorDefinitions, nodeCategories, nodeColorMap } from '../nodes'
import { useGraphStore } from '../store/graphStore'
import { useUIStore } from '../store/uiStore'
import { useWorkspaceStore } from '../store/workspaceStore'

const formatUpdatedAt = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const Section = ({
  title,
  open,
  onToggle,
  children
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) => (
  <div className="border-b border-slate-100">
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</span>
      <span className={`text-[10px] text-slate-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
    </button>
    {open && <div className="px-4 pb-4">{children}</div>}
  </div>
)

const NodeLibrary = ({ collapsed = false }: { collapsed?: boolean }) => {
  const loadCanvasState = useGraphStore(state => state.loadCanvasState)
  const customOperators = useGraphStore(state => state.customOperators)
  const addCustomOperator = useGraphStore(state => state.addCustomOperator)
  const removeCustomOperator = useGraphStore(state => state.removeCustomOperator)

  const currentUserId = useWorkspaceStore(state => state.currentUserId)
  const graphRecords = useWorkspaceStore(state => state.graphRecords)
  const currentGraphId = useWorkspaceStore(state => state.currentGraphId)
  const status = useWorkspaceStore(state => state.status)
  const isBusy = useWorkspaceStore(state => state.isBusy)
  const initializeWorkspace = useWorkspaceStore(state => state.initializeWorkspace)
  const setCurrentUserId = useWorkspaceStore(state => state.setCurrentUserId)
  const loadGraphIntoCanvas = useWorkspaceStore(state => state.loadGraphIntoCanvas)
  const renameGraphRecord = useWorkspaceStore(state => state.renameGraphRecord)
  const deleteGraphRecord = useWorkspaceStore(state => state.deleteGraphRecord)
  const duplicateGraphRecord = useWorkspaceStore(state => state.duplicateGraphRecord)
  const toggleLeftSidebar = useUIStore(state => state.toggleLeftSidebar)

  const [draftUserId, setDraftUserId] = useState(currentUserId)
  const [customName, setCustomName] = useState('MyOp')
  const [customInputs, setCustomInputs] = useState(1)
  const [customOutputs, setCustomOutputs] = useState(1)
  const [openSections, setOpenSections] = useState({
    user: true,
    documents: true,
    operators: true,
    data: true,
    annotations: true
  })
  const [editingGraphId, setEditingGraphId] = useState<string | null>(null)
  const [editingGraphName, setEditingGraphName] = useState('')

  useEffect(() => {
    void initializeWorkspace()
  }, [initializeWorkspace])

  useEffect(() => {
    setDraftUserId(currentUserId)
  }, [currentUserId])

  const operatorDefinitions = getOperatorDefinitions(customOperators)

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections(current => ({ ...current, [key]: !current[key] }))
  }

  const applyUserId = async () => {
    await setCurrentUserId(draftUserId)
  }

  const startRename = (graphId: string, currentName: string) => {
    setEditingGraphId(graphId)
    setEditingGraphName(currentName)
  }

  const commitRename = async () => {
    if (!editingGraphId) return

    const ok = await renameGraphRecord(editingGraphId, editingGraphName)
    if (ok) {
      setEditingGraphId(null)
      setEditingGraphName('')
    }
  }

  const handleRenameKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      await commitRename()
    }
    if (event.key === 'Escape') {
      setEditingGraphId(null)
      setEditingGraphName('')
    }
  }

  const handleSaveCustomOperator = () => {
    const normalizedName = customName.trim()
    if (!normalizedName) return
    if (customOperators.some(op => op.label === normalizedName)) return

    addCustomOperator({
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label: normalizedName,
      inputCount: customInputs,
      outputCount: customOutputs
    })
  }

  if (collapsed) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center border-r border-slate-200 bg-gradient-to-b from-slate-50 to-white" style={{ width: '28px' }}>
        <button
          onClick={toggleLeftSidebar}
          className="flex h-20 w-6 items-center justify-center rounded-lg bg-white shadow-sm border border-slate-200 text-slate-400 hover:text-indigo-500 hover:border-indigo-200 hover:shadow-md transition-all duration-200"
          title="Open Sidebar"
        >
          ▸
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-72 flex-col border-r border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-sm">
      <button
        onClick={toggleLeftSidebar}
        className="absolute top-1/2 z-20 flex h-20 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg bg-white shadow-sm border border-slate-200 text-slate-400 hover:text-indigo-500 hover:border-indigo-200 hover:shadow-md transition-all duration-200"
        style={{ right: '-12px', clipPath: 'inset(0 50% 0 0)' }}
        title="Collapse Sidebar"
      >
        ◂
      </button>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
      <Section title="User" open={openSections.user} onToggle={() => toggleSection('user')}>
        <input
          value={draftUserId}
          onChange={event => setDraftUserId(event.target.value)}
          onBlur={() => { void applyUserId() }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              void applyUserId()
            }
          }}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800"
          placeholder="demo"
        />
      </Section>

      <Section title="Documents" open={openSections.documents} onToggle={() => toggleSection('documents')}>
        <div className="max-h-72 overflow-y-auto rounded border border-gray-200 bg-white">
          {graphRecords.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-500">No documents for this user.</div>
          ) : (
            graphRecords.map(record => (
              <div
                key={record.id}
                className={`border-b border-gray-100 px-3 py-2 last:border-b-0 ${
                  currentGraphId === record.id ? 'bg-indigo-50' : 'bg-white hover:bg-gray-50'
                }`}
              >
                {editingGraphId === record.id ? (
                  <input
                    autoFocus
                    value={editingGraphName}
                    onChange={event => setEditingGraphName(event.target.value)}
                    onBlur={() => { void commitRename() }}
                    onKeyDown={event => { void handleRenameKeyDown(event) }}
                    className="w-full rounded border border-indigo-300 bg-white px-1.5 py-0.5 text-xs font-medium text-gray-800"
                  />
                ) : (
                  <button
                    onClick={() => void loadGraphIntoCanvas(record.id, loadCanvasState)}
                    onDoubleClick={() => startRename(record.id, record.name)}
                    className="block w-full text-left"
                  >
                    <div className="flex items-center gap-1">
                      <div className="truncate text-xs font-semibold text-gray-800">
                        {record.name}
                      </div>
                      {record.isDirty && (
                        <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" title="Unsaved changes" />
                      )}
                      {record.isDraft && (
                        <div className="text-[9px] uppercase tracking-wide text-gray-300">Draft</div>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-gray-400">
                      {formatUpdatedAt(record.updatedAt)}
                    </div>
                  </button>
                )}
                {editingGraphId !== record.id && (
                  <div className="mt-1 flex gap-1">
                    <button
                      onClick={event => {
                        event.stopPropagation()
                        void duplicateGraphRecord(record.id, loadCanvasState)
                      }}
                      className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    >
                      Copy
                    </button>
                    <button
                      onClick={event => {
                        event.stopPropagation()
                        if (!window.confirm(`Delete "${record.name}"? This cannot be undone.`)) return
                        void deleteGraphRecord(record.id, loadCanvasState)
                      }}
                      className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-400 hover:border-red-300 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="mt-2 truncate text-[10px] text-gray-400">{isBusy ? 'Working...' : status}</div>
      </Section>

      <Section title="Operators" open={openSections.operators} onToggle={() => toggleSection('operators')}>
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {operatorDefinitions.map(operator => (
            <div
              key={operator.id}
              className="group cursor-grab rounded-xl border border-slate-100 bg-white p-2.5 transition-all duration-200 hover:shadow-md hover:border-slate-200 active:cursor-grabbing"
              draggable
              onDragStart={event => {
                event.dataTransfer.setData('application/reactflow', operator.nodeType)
                if (operator.customOpId) {
                  event.dataTransfer.setData('customOpId', operator.customOpId)
                }
                event.dataTransfer.effectAllowed = 'move'
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="h-3 w-3 flex-shrink-0 rounded-full shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${operator.color} 0%, color-mix(in srgb, ${operator.color} 70%, white) 100%)` }}
                />
                <div className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600">{operator.label}</div>
                {operator.source === 'custom' && (
                  <button
                    onClick={event => {
                      event.stopPropagation()
                      event.preventDefault()
                      if (window.confirm(`Delete custom operator "${operator.label}"?`)) {
                        removeCustomOperator(operator.id)
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-4 h-4 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="Delete operator"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-3">
          <div className="mb-2 grid grid-cols-4 gap-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-400">
            <div className="col-span-2">Name</div>
            <div>In</div>
            <div>Out</div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <input
              type="text"
              value={customName}
              onChange={event => setCustomName(event.target.value)}
              className="col-span-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
              placeholder="Name"
            />
            <input
              type="number"
              value={customInputs}
              onChange={event => setCustomInputs(Math.max(1, Math.min(10, parseInt(event.target.value, 10) || 1)))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono text-center focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
              min={1}
              max={10}
              placeholder="In"
            />
            <input
              type="number"
              value={customOutputs}
              onChange={event => setCustomOutputs(Math.max(1, Math.min(10, parseInt(event.target.value, 10) || 1)))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono text-center focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
              min={1}
              max={10}
              placeholder="Out"
            />
          </div>
          <button
            onClick={handleSaveCustomOperator}
            className="mt-3 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:shadow-md hover:from-indigo-600 hover:to-indigo-700 transition-all duration-200"
          >
            Create
          </button>
        </div>
      </Section>

      <Section title="Data" open={openSections.data || true} onToggle={() => toggleSection('data')}>
        <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
            {nodeCategories.Data.map(type => {
              const config = getNodeConfig(type)
              if (!config) return null

              return (
                <div
                  key={type}
                  className="cursor-grab rounded-xl border border-slate-100 bg-white p-2.5 transition-all duration-200 hover:shadow-md hover:border-slate-200 active:cursor-grabbing"
                  draggable
                  onDragStart={event => {
                    event.dataTransfer.setData('application/reactflow', type)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-3 w-3 flex-shrink-0 rounded-full shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${nodeColorMap[type] || '#6b7280'} 0%, color-mix(in srgb, ${nodeColorMap[type] || '#6b7280'} 70%, white) 100%)` }}
                    />
                    <div className="text-xs font-semibold text-slate-600">{config.label}</div>
                  </div>
                </div>
              )
            })}
          </div>
      </Section>

      <Section title="Annotation" open={openSections.annotations} onToggle={() => toggleSection('annotations')}>
        <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
            {nodeCategories.Annotations.map(type => {
              const config = getNodeConfig(type)
              if (!config) return null

              return (
                <div
                  key={type}
                  className="cursor-grab rounded-xl border border-slate-100 bg-white p-2.5 transition-all duration-200 hover:shadow-md hover:border-slate-200 active:cursor-grabbing"
                  draggable
                  onDragStart={event => {
                    event.dataTransfer.setData('application/reactflow', type)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-3 w-3 flex-shrink-0 rounded-full shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${nodeColorMap[type] || '#6b7280'} 0%, color-mix(in srgb, ${nodeColorMap[type] || '#6b7280'} 70%, white) 100%)` }}
                    />
                    <div className="text-xs font-semibold text-slate-600">{config.label}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      </div>
    </div>
  )
}

export default NodeLibrary
