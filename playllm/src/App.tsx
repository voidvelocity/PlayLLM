import { useEffect } from 'react'
import NodeLibrary from './components/NodeLibrary'
import GraphEditor from './components/GraphEditor'
import NodeProperties from './components/NodeProperties'
import EdgeProperties from './components/EdgeProperties'
import NavigationRail from './components/NavigationRail'
import FilesPage from './components/FilesPage'
import SidebarToggle from './components/SidebarToggle'
import { useUIStore } from './store/uiStore'
import { useGraphStore } from './store/graphStore'
import { useWorkspaceStore } from './store/workspaceStore'

const App = () => {
  const leftSidebarCollapsed = useUIStore(state => state.leftSidebarCollapsed)
  const rightSidebarCollapsed = useUIStore(state => state.rightSidebarCollapsed)
  const activeView = useUIStore(state => state.activeView)
  const selectedEdgeId = useGraphStore(state => state.selectedEdgeId)
  const initializeWorkspace = useWorkspaceStore(state => state.initializeWorkspace)

  useEffect(() => {
    void initializeWorkspace()
  }, [initializeWorkspace])

  useEffect(() => {
    const syncViewFromUrl = () => useUIStore.setState({ activeView: window.location.hash === '#/canvas' ? 'canvas' : 'files' })
    window.addEventListener('popstate', syncViewFromUrl)
    window.addEventListener('hashchange', syncViewFromUrl)
    return () => {
      window.removeEventListener('popstate', syncViewFromUrl)
      window.removeEventListener('hashchange', syncViewFromUrl)
    }
  }, [])

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden bg-slate-950">
      <NavigationRail />
      {activeView === 'files' ? (
        <FilesPage />
      ) : (
        <div className="flex min-w-0 flex-1">
          <NodeLibrary collapsed={leftSidebarCollapsed} />
          <GraphEditor />
          <aside className={`inspector-panel relative flex flex-none flex-col border-l border-slate-200/80 bg-white transition-[width] duration-200 ${rightSidebarCollapsed ? 'w-8' : 'w-[300px]'}`}>
            <SidebarToggle
              side="right"
              collapsed={rightSidebarCollapsed}
              onToggle={() => useUIStore.getState().toggleRightSidebar()}
              label={rightSidebarCollapsed ? 'Open inspector' : 'Collapse inspector'}
            />
            {!rightSidebarCollapsed && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {selectedEdgeId ? <EdgeProperties /> : <NodeProperties />}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

export default App
