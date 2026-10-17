import { ReactNode, useMemo, useRef, useState } from 'react'
import { getNodeConfig, getOperatorDefinitions, nodeCategories, nodeColorMap } from '../nodes'
import { useGraphStore } from '../store/graphStore'
import { useUIStore } from '../store/uiStore'
import { clearPaletteDrag, writePaletteDrag } from '../utils/dragPayload'
import { parseOperatorDefinitions } from '../utils/operatorDefinitions'
import SidebarToggle from './SidebarToggle'

const Section = ({ title, count, open, onToggle, children }: { title: string; count?: number; open: boolean; onToggle: () => void; children: ReactNode }) => (
  <section className="border-b border-slate-200/70">
    <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50">
      <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {title}
        {count != null && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[8px] tracking-normal text-slate-400">{count}</span>}
      </span>
      <svg className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 8 5 5 5-5" /></svg>
    </button>
    {open && <div className="px-4 pb-4">{children}</div>}
  </section>
)

const PaletteItem = ({ type, label, color, customId, onDelete }: { type: string; label: string; color: string; customId?: string; onDelete?: () => void }) => (
  <div
    className="operator-card group cursor-grab rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 transition-all duration-150 hover:-translate-y-px hover:border-indigo-200 hover:shadow-md active:cursor-grabbing"
    draggable
    onDragStart={event => writePaletteDrag(event.dataTransfer, { type, customId })}
    onDragEnd={() => window.setTimeout(clearPaletteDrag, 0)}
  >
    <div className="flex items-center gap-2.5">
      <div className="h-3 w-3 flex-none rounded-full shadow-sm" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{label}</div>
      {onDelete && (
        <button
          onClick={event => { event.stopPropagation(); event.preventDefault(); onDelete() }}
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100"
          title="Delete custom operator"
          aria-label={`Delete ${label}`}
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 6h12M8 3h4l1 3H7l1-3Zm-2 3 1 11h6l1-11M9 9v5m2-5v5" /></svg>
        </button>
      )}
    </div>
  </div>
)

const NodeLibrary = ({ collapsed = false }: { collapsed?: boolean }) => {
  const customOperators = useGraphStore(state => state.customOperators)
  const addCustomOperator = useGraphStore(state => state.addCustomOperator)
  const removeCustomOperator = useGraphStore(state => state.removeCustomOperator)
  const toggleLeftSidebar = useUIStore(state => state.toggleLeftSidebar)
  const operatorInputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [customName, setCustomName] = useState('MyOp')
  const [customInputs, setCustomInputs] = useState(1)
  const [customOutputs, setCustomOutputs] = useState(1)
  const [operatorMessage, setOperatorMessage] = useState('')
  const [openSections, setOpenSections] = useState({ operators: true, data: true, annotations: true, custom: false })

  const operators = useMemo(
    () => getOperatorDefinitions(customOperators).filter(item => item.label.toLowerCase().includes(query.toLowerCase())),
    [customOperators, query]
  )
  const filterTypes = (types: string[]) => types.filter(type => (getNodeConfig(type)?.label || type).toLowerCase().includes(query.toLowerCase()))
  const toggle = (key: keyof typeof openSections) => setOpenSections(current => ({ ...current, [key]: !current[key] }))

  const createCustom = () => {
    const label = customName.trim()
    if (!label || customOperators.some(operator => operator.label.toLowerCase() === label.toLowerCase())) {
      setOperatorMessage('Choose a unique operator name.')
      return
    }
    addCustomOperator({
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label,
      inputCount: customInputs,
      outputCount: customOutputs
    })
    setOperatorMessage(`Created ${label}.`)
    setOpenSections(current => ({ ...current, operators: true }))
  }

  const importOperators = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const imported = parseOperatorDefinitions(await file.text())
      const existingLabels = new Set(customOperators.map(operator => operator.label.toLowerCase()))
      const unique = imported.filter(operator => !existingLabels.has(operator.label.toLowerCase()))
      if (unique.length === 0) throw new Error('Every operator in this file already exists')
      unique.forEach(operator => addCustomOperator(operator))
      setOperatorMessage(`Imported ${unique.length} operator${unique.length === 1 ? '' : 's'}.`)
      setOpenSections(current => ({ ...current, operators: true, custom: true }))
    } catch (error) {
      setOperatorMessage(`Import failed: ${(error as Error).message}`)
    } finally {
      event.target.value = ''
    }
  }

  const deleteCustomOperator = (id: string, label: string) => {
    if (!window.confirm(`Delete custom operator “${label}”? Existing nodes will remain on the canvas.`)) return
    removeCustomOperator(id)
    setOperatorMessage(`Deleted ${label}.`)
  }

  const toggleControl = (
    <SidebarToggle
      side="left"
      collapsed={collapsed}
      onToggle={toggleLeftSidebar}
      label={collapsed ? 'Open component library' : 'Collapse component library'}
    />
  )

  if (collapsed) {
    return <aside className="relative flex h-full w-8 flex-none border-r border-slate-200 bg-white">{toggleControl}</aside>
  }

  return (
    <aside className="library-panel relative flex h-full w-[250px] flex-none flex-col border-r border-slate-200 bg-white">
      {toggleControl}
      <input ref={operatorInputRef} type="file" accept="application/json,.json" className="hidden" onChange={event => void importOperators(event)} />
      <div className="flex h-[72px] flex-none items-center border-b border-slate-200 px-4">
        <div><h2 className="text-sm font-semibold text-slate-900">Components</h2><p className="mt-0.5 text-[10px] text-slate-400">Drag blocks onto the canvas</p></div>
      </div>
      <div className="border-b border-slate-200 p-3">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-slate-400 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
          <input value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent py-2 text-xs text-slate-700 outline-none" placeholder="Find a block…" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
        <Section title="Operators" count={operators.length} open={openSections.operators} onToggle={() => toggle('operators')}>
          <div className="space-y-1.5">
            {operators.map(operator => (
              <PaletteItem
                key={operator.id}
                type={operator.nodeType}
                label={operator.label}
                color={operator.color}
                customId={operator.customOpId}
                onDelete={operator.source === 'custom' ? () => deleteCustomOperator(operator.id, operator.label) : undefined}
              />
            ))}
          </div>
        </Section>
        <Section title="Data" count={filterTypes(nodeCategories.Data).length} open={openSections.data} onToggle={() => toggle('data')}>
          <div className="space-y-1.5">{filterTypes(nodeCategories.Data).map(type => { const config = getNodeConfig(type); return config ? <PaletteItem key={type} type={type} label={config.label} color={nodeColorMap[type] || '#64748b'} /> : null })}</div>
        </Section>
        <Section title="Annotations" count={filterTypes(nodeCategories.Annotations).length} open={openSections.annotations} onToggle={() => toggle('annotations')}>
          <div className="space-y-1.5">{filterTypes(nodeCategories.Annotations).map(type => { const config = getNodeConfig(type); return config ? <PaletteItem key={type} type={type} label={config.label} color={nodeColorMap[type] || '#64748b'} /> : null })}</div>
        </Section>
        <Section title="Custom operators" open={openSections.custom} onToggle={() => toggle('custom')}>
          <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3">
            <div>
              <div className="mb-2 grid grid-cols-4 gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400"><span className="col-span-2">Name</span><span>In</span><span>Out</span></div>
              <div className="grid grid-cols-4 gap-2">
                <input value={customName} onChange={event => setCustomName(event.target.value)} className="col-span-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-indigo-300" />
                <input type="number" value={customInputs} min={1} max={32} onChange={event => setCustomInputs(Math.max(1, Math.min(32, Number(event.target.value) || 1)))} className="rounded-lg border border-slate-200 px-1 text-center text-xs" />
                <input type="number" value={customOutputs} min={1} max={32} onChange={event => setCustomOutputs(Math.max(1, Math.min(32, Number(event.target.value) || 1)))} className="rounded-lg border border-slate-200 px-1 text-center text-xs" />
              </div>
              <button onClick={createCustom} className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600">Create operator</button>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <button onClick={() => operatorInputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M10 13V3m0 0L6 7m4-4 4 4M4 12v4h12v-4" /></svg>
                Import operator JSON
              </button>
              <p className="mt-2 text-[9px] leading-4 text-slate-400">Format: playllm-operator v1. Imported operators do not infer output types.</p>
            </div>
            {operatorMessage && <p className={`rounded-md px-2 py-1.5 text-[9px] leading-4 ${operatorMessage.startsWith('Import failed') ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>{operatorMessage}</p>}
          </div>
        </Section>
      </div>
    </aside>
  )
}

export default NodeLibrary
