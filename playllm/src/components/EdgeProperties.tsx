import { useGraphStore } from '../store/graphStore'
import { MarkerType } from 'reactflow'

const EDGE_STYLES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' }
]

interface EdgeMarker {
  type?: typeof MarkerType.ArrowClosed | typeof MarkerType.Arrow | null
  width?: number
  height?: number
  color?: string
}

const ARROW_TYPES = [
  { value: 'arrowclosed', label: 'Arrow (closed)' },
  { value: 'arrow', label: 'Arrow (open)' },
  { value: 'none', label: 'No arrow' }
]

const EdgeProperties = () => {
  const selectedEdgeId = useGraphStore(state => state.selectedEdgeId)
  const graph = useGraphStore(state => state.graph)
  const updateEdgeStyle = useGraphStore(state => state.updateEdgeStyle)

  if (!selectedEdgeId) return null

  const edge = graph.edges.find(e => e.id === selectedEdgeId)
  if (!edge) return null

  const currentStyle = (edge.style || {}) as Record<string, any>
  const currentMarker = (edge.markerEnd || {}) as EdgeMarker

  const handleStyleChange = (key: string, value: any) => {
    if (key === 'stroke') {
      updateEdgeStyle(selectedEdgeId, {
        style: { ...currentStyle, [key]: value },
        markerEnd: currentMarker.type ? {
          type: currentMarker.type,
          width: currentMarker.width || 14,
          height: currentMarker.height || 14,
          color: value
        } : undefined
      })
    } else {
      updateEdgeStyle(selectedEdgeId, {
        style: { ...currentStyle, [key]: value }
      })
    }
  }

  const handleMarkerChange = (typeStr: string) => {
    if (typeStr === 'none') {
      updateEdgeStyle(selectedEdgeId, { markerEnd: undefined })
    } else {
      const markerType = typeStr === 'arrowclosed' ? MarkerType.ArrowClosed : MarkerType.Arrow
      updateEdgeStyle(selectedEdgeId, {
        markerEnd: {
          type: markerType,
          width: currentMarker.width || 14,
          height: currentMarker.height || 14,
          color: currentStyle.stroke || '#475569'
        }
      })
    }
  }

  const handleMarkerSizeChange = (size: number) => {
    updateEdgeStyle(selectedEdgeId, {
      markerEnd: {
        type: currentMarker.type || MarkerType.ArrowClosed,
        width: size,
        height: size,
        color: currentStyle.stroke || '#475569'
      }
    })
  }

  const getStrokeDashArray = (): string | undefined => {
    switch (currentStyle.strokeDasharray || '') {
      case '5 5': return '5 5'
      case '2 2': return '2 2'
      default: return undefined
    }
  }

  const handleLineStyleChange = (lineStyle: string) => {
    let dashArray: string | undefined
    switch (lineStyle) {
      case 'dashed':
        dashArray = '5 5'
        break
      case 'dotted':
        dashArray = '2 2'
        break
      default:
        dashArray = undefined
    }
    updateEdgeStyle(selectedEdgeId, {
      style: { ...currentStyle, strokeDasharray: dashArray }
    })
  }

  const currentLineStyle = getStrokeDashArray()
    ? (getStrokeDashArray() === '5 5' ? 'dashed' : 'dotted')
    : 'solid'

  const getCurrentArrowValue = (): string => {
    if (!currentMarker.type) return 'none'
    return currentMarker.type === MarkerType.ArrowClosed ? 'arrowclosed' : 'arrow'
  }

  return (
    <div className="p-3 space-y-3">
      <div className="text-xs font-semibold text-gray-700 border-b pb-1.5">Edge Properties</div>

      <div className="mb-3 p-2 bg-white rounded border border-gray-200">
        <div className="text-xs font-medium text-gray-700 mb-1.5">Line Style</div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-[9px] text-gray-500 mb-0.5">Color</label>
            <input
              type="color"
              value={currentStyle.stroke || '#475569'}
              onChange={e => handleStyleChange('stroke', e.target.value)}
              className="w-full h-6 border border-gray-300 rounded cursor-pointer p-0"
            />
          </div>
          <div>
            <label className="block text-[9px] text-gray-500 mb-0.5">Width</label>
            <input
              type="number"
              value={currentStyle.strokeWidth || 1.5}
              onChange={e => handleStyleChange('strokeWidth', parseFloat(e.target.value) || 1.5)}
              className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded font-mono"
              min={0.5}
              max={10}
              step={0.5}
            />
          </div>
        </div>

        <div className="mb-2">
          <label className="block text-[9px] text-gray-500 mb-0.5">Pattern</label>
          <select
            value={currentLineStyle}
            onChange={e => handleLineStyleChange(e.target.value)}
            className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded bg-white"
          >
            {EDGE_STYLES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3 p-2 bg-white rounded border border-gray-200">
        <div className="text-xs font-medium text-gray-700 mb-1.5">Arrow</div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] text-gray-500 mb-0.5">Shape</label>
            <select
              value={getCurrentArrowValue()}
              onChange={e => handleMarkerChange(e.target.value)}
              className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded bg-white"
            >
              {ARROW_TYPES.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[9px] text-gray-500 mb-0.5">Size</label>
            <input
              type="number"
              value={currentMarker.width || 14}
              onChange={e => handleMarkerSizeChange(parseInt(e.target.value) || 14)}
              className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded font-mono"
              min={8}
              max={30}
              step={2}
            />
          </div>
        </div>
      </div>

      <div className="text-[9px] text-gray-400 mt-2">
        ID: {edge.id}<br/>
        {edge.source} → {edge.target}
      </div>
    </div>
  )
}

export default EdgeProperties
