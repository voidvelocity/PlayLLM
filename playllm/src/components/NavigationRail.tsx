import { useUIStore } from '../store/uiStore'

const NavIcon = ({ name }: { name: 'canvas' | 'files' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'canvas' ? (
      <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="9" r="1.5" /><circle cx="16" cy="8" r="1.5" /><circle cx="14" cy="16" r="1.5" /><path d="m9.5 9 5-1m.5 1.5-1 5" /></>
    ) : (
      <><path d="M3 7.5h7l2-2h9v14H3v-12Z" /><path d="M3 9h18" /></>
    )}
  </svg>
)

const NavigationRail = () => {
  const activeView = useUIStore(state => state.activeView)
  const setActiveView = useUIStore(state => state.setActiveView)

  return (
    <nav className="navigation-rail flex h-full w-[72px] flex-none flex-col items-center border-r border-slate-800 bg-slate-950 py-4 text-slate-400" aria-label="Primary navigation">
      <button onClick={() => setActiveView('files')} className="mb-8 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 text-white shadow-lg shadow-indigo-950/40" title="PlayLLM home" aria-label="PlayLLM home">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="8" cy="18" r="2"/><path d="m8 7 8 0M7 8l1 8m2-1 6-6"/></svg>
      </button>

      <div className="flex w-full flex-col items-center gap-2 px-2">
        <button onClick={() => setActiveView('files')} className={`nav-rail-button ${activeView === 'files' ? 'is-active' : ''}`} title="Files" aria-label="Files">
          <NavIcon name="files" /><span>Files</span>
        </button>
        <button onClick={() => setActiveView('canvas')} className={`nav-rail-button ${activeView === 'canvas' ? 'is-active' : ''}`} title="Canvas" aria-label="Canvas">
          <NavIcon name="canvas" /><span>Canvas</span>
        </button>
      </div>

      <div className="mt-auto h-2 w-2 rounded-full bg-emerald-400 ring-4 ring-emerald-400/10" title="Application ready" />
    </nav>
  )
}

export default NavigationRail
