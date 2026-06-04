import NodeLibrary from './components/NodeLibrary'
import GraphEditor from './components/GraphEditor'
import NodeProperties from './components/NodeProperties'
import EdgeProperties from './components/EdgeProperties'
import { useUIStore } from './store/uiStore'
import { useGraphStore } from './store/graphStore'

const App = () => {
  const leftSidebarCollapsed = useUIStore(state => state.leftSidebarCollapsed)
  const rightSidebarCollapsed = useUIStore(state => state.rightSidebarCollapsed)
  const selectedEdgeId = useGraphStore(state => state.selectedEdgeId)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
      <NodeLibrary collapsed={leftSidebarCollapsed} />
      <GraphEditor />
      {rightSidebarCollapsed ? (
        <NodeProperties collapsed={true} />
      ) : (
        <div className="w-64 bg-white/90 backdrop-blur-sm border-l border-gray-200 flex flex-col shadow-lg overflow-y-auto">
          {selectedEdgeId ? (
            <EdgeProperties />
          ) : (
            <NodeProperties collapsed={false} />
          )}
        </div>
      )}
    </div>
  )
}

export default App
