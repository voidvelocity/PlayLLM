import { useMemo, useState } from 'react'
import { useWorkspaceStore } from '../store/workspaceStore'
import { useGraphStore } from '../store/graphStore'
import { useUIStore } from '../store/uiStore'
import type { WorkspaceGraphSummary } from '../types'
import UserMenu from './UserMenu'

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

const FileIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 3h9l5 5v13H5V3Z" /><path d="M14 3v6h5M8 14h8M8 17h6" /></svg>

const FilesPage = () => {
  const graphRecords = useWorkspaceStore(state => state.graphRecords)
  const currentUserId = useWorkspaceStore(state => state.currentUserId)
  const isBusy = useWorkspaceStore(state => state.isBusy)
  const status = useWorkspaceStore(state => state.status)
  const refreshWorkspace = useWorkspaceStore(state => state.refreshWorkspace)
  const createNewGraph = useWorkspaceStore(state => state.createNewGraph)
  const loadGraphIntoCanvas = useWorkspaceStore(state => state.loadGraphIntoCanvas)
  const renameGraphRecord = useWorkspaceStore(state => state.renameGraphRecord)
  const deleteGraphRecord = useWorkspaceStore(state => state.deleteGraphRecord)
  const duplicateGraphRecord = useWorkspaceStore(state => state.duplicateGraphRecord)
  const loadCanvasState = useGraphStore(state => state.loadCanvasState)
  const setActiveView = useUIStore(state => state.setActiveView)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceGraphSummary | null>(null)

  const filteredRecords = useMemo(() => graphRecords.filter(record => record.name.toLowerCase().includes(query.trim().toLowerCase())), [graphRecords, query])

  const openFile = async (record: WorkspaceGraphSummary) => {
    await loadGraphIntoCanvas(record.id, loadCanvasState)
    setActiveView('canvas')
  }

  const createFile = () => {
    createNewGraph(loadCanvasState)
    setActiveView('canvas')
  }

  const commitRename = async () => {
    if (!editingId) return
    const ok = await renameGraphRecord(editingId, editingName)
    if (ok) setEditingId(null)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const deleted = await deleteGraphRecord(deleteTarget.id, loadCanvasState)
    if (deleted) setDeleteTarget(null)
  }

  return (
    <section className="files-page flex min-w-0 flex-1 flex-col bg-slate-50">
      <header className="flex h-[72px] flex-none items-center justify-between border-b border-slate-200 bg-white px-7">
        <div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</div><h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Model files</h1></div>
        <UserMenu />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-7">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="text-2xl font-semibold tracking-tight text-slate-900">Your architectures</h2><p className="mt-1 text-sm text-slate-500">Open, organize and continue editing model diagrams for <span className="font-medium text-slate-700">{currentUserId}</span>.</p></div>
            <button onClick={createFile} className="primary-page-button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>New model</button>
          </div>

          <div className="mt-7 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/30">
            <label className="flex min-w-0 flex-1 items-center gap-2 px-2 text-slate-400"><svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg><input value={query} onChange={event => setQuery(event.target.value)} className="w-full border-0 bg-transparent py-2 text-xs text-slate-700 outline-none" placeholder="Search model files…" /></label>
            <button onClick={() => void refreshWorkspace()} disabled={isBusy} className="secondary-page-button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 9A7 7 0 0 1 18 6l2 6M18 15a7 7 0 0 1-11.9 3L4 12"/></svg>{isBusy ? 'Refreshing…' : 'Refresh'}</button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400"><span className={`h-1.5 w-1.5 rounded-full ${/unavailable|failed|error/i.test(status) ? 'bg-rose-400' : isBusy ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`} />{status}</div>

          {filteredRecords.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><FileIcon /></div><h3 className="mt-4 text-sm font-semibold text-slate-800">{query ? 'No matching model files' : 'Create your first architecture'}</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">{query ? 'Try a different search term.' : 'Start with an empty canvas, then drag operators and tensors to map the model data flow.'}</p>{!query && <button onClick={createFile} className="mt-5 text-xs font-semibold text-indigo-600 hover:text-indigo-700">Create a new model →</button>}</div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {filteredRecords.map(record => (
                <article key={record.id} className="file-card group" onDoubleClick={() => void openFile(record)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileIcon /></div>
                    <div className="flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
                      <button onClick={() => { setEditingId(record.id); setEditingName(record.name) }} className="file-action-button" title="Rename" aria-label={`Rename ${record.name}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/></svg></button>
                      <button onClick={() => void duplicateGraphRecord(record.id, loadCanvasState).then(() => setActiveView('canvas'))} className="file-action-button" title="Duplicate" aria-label={`Duplicate ${record.name}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg></button>
                      <button onClick={() => setDeleteTarget(record)} className="file-action-button danger" title="Delete" aria-label={`Delete ${record.name}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/></svg></button>
                    </div>
                  </div>
                  {editingId === record.id ? (
                    <form className="mt-4 flex gap-2" onSubmit={event => { event.preventDefault(); void commitRename() }}><input autoFocus value={editingName} onChange={event => setEditingName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditingId(null) }} className="min-w-0 flex-1 rounded-lg border border-indigo-300 px-2.5 py-1.5 text-sm font-semibold outline-none ring-2 ring-indigo-100"/><button className="rounded-lg bg-slate-900 px-3 text-[10px] font-semibold text-white">Save</button></form>
                  ) : <button onClick={() => void openFile(record)} className="mt-4 block w-full text-left"><h3 className="truncate text-sm font-semibold text-slate-800">{record.name}</h3><p className="mt-1 text-[10px] text-slate-400">Updated {formatDate(record.updatedAt)}</p></button>}
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3"><div className="flex gap-3 font-mono text-[10px] text-slate-400"><span>{record.nodeCount} nodes</span><span>{record.edgeCount} edges</span></div><div className="flex items-center gap-1.5">{record.isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes"/>}<span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{record.isDraft ? 'Draft' : 'Saved'}</span></div></div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDeleteTarget(null) }}>
          <div className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4m0 4h.01M10.3 3.9 2.8 18a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg></div>
            <h2 id="delete-title" className="mt-4 text-base font-semibold text-slate-900">Delete “{deleteTarget.name}”?</h2><p className="mt-2 text-xs leading-5 text-slate-500">This permanently removes the model file and its canvas data. This action cannot be undone.</p>
            <div className="mt-6 flex justify-end gap-2"><button onClick={() => setDeleteTarget(null)} className="secondary-page-button">Cancel</button><button onClick={() => void confirmDelete()} disabled={isBusy} className="danger-page-button">{isBusy ? 'Deleting…' : 'Delete file'}</button></div>
          </div>
        </div>
      )}
    </section>
  )
}

export default FilesPage
