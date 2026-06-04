import { useCallback, useRef } from 'react'
import { Handle, Position, useReactFlow } from 'reactflow'
import { useGraphStore } from '../store/graphStore'
import type { CustomNodeData, FillPattern } from '../types'

interface RectNodeProps {
  id: string
  data: CustomNodeData
  selected: boolean
}

const patternDefs: Record<FillPattern, (id: string, color: string) => string> = {
  none: () => '',
  stripes: (id, c) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="6" stroke="${c}" stroke-width="1.5" opacity="0.25"/>
  </pattern>`,
  grid: (id, c) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="8" height="8">
    <path d="M 8 0 L 0 0 0 8" fill="none" stroke="${c}" stroke-width="0.8" opacity="0.25"/>
  </pattern>`,
  dots: (id, c) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="8" height="8">
    <circle cx="4" cy="4" r="1.2" fill="${c}" opacity="0.3"/>
  </pattern>`,
  crosshatch: (id, c) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="8" height="8">
    <path d="M 0 0 L 8 8 M 8 0 L 0 8" stroke="${c}" stroke-width="0.6" opacity="0.25"/>
  </pattern>`
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_SIZE = 24

const cursorMap: Record<ResizeDir, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', sw: 'nesw-resize'
}

const ResizeHandle = ({ dir, onMouseDown }: { dir: ResizeDir; onMouseDown: (dir: ResizeDir, e: React.MouseEvent) => void }) => {
  const isCorner = dir.length === 2
  const size = isCorner ? 8 : 6
  const posStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      position: 'absolute',
      width: size,
      height: size,
      backgroundColor: '#3b82f6',
      border: '1.5px solid #fff',
      borderRadius: isCorner ? 2 : 1,
      cursor: cursorMap[dir],
      pointerEvents: 'auto',
      zIndex: 10
    }
    switch (dir) {
      case 'n': return { ...base, top: -size / 2, left: '50%', marginLeft: -size / 2 }
      case 's': return { ...base, bottom: -size / 2, left: '50%', marginLeft: -size / 2 }
      case 'w': return { ...base, left: -size / 2, top: '50%', marginTop: -size / 2 }
      case 'e': return { ...base, right: -size / 2, top: '50%', marginTop: -size / 2 }
      case 'nw': return { ...base, top: -size / 2, left: -size / 2 }
      case 'ne': return { ...base, top: -size / 2, right: -size / 2 }
      case 'sw': return { ...base, bottom: -size / 2, left: -size / 2 }
      case 'se': return { ...base, bottom: -size / 2, right: -size / 2 }
    }
  })()

  return (
    <div
      className="nodrag nopan"
      style={posStyle}
      onMouseDown={e => onMouseDown(dir, e)}
    />
  )
}

const RectNode = ({ id, data, selected }: RectNodeProps) => {
  const updateNodeStyle = useGraphStore(state => state.updateNodeStyle)
  const updateNodePosition = useGraphStore(state => state.updateNodePosition)
  const selectNode = useGraphStore(state => state.selectNode)
  const selectEdge = useGraphStore(state => state.selectEdge)
  const { getZoom } = useReactFlow()
  const s = data.style || {}

  const w = s.width || 200
  const h = s.height || 120
  const hasFill = s.hasFill === true
  const fillColor = hasFill ? (s.fillColor || '#e5e7eb') : 'transparent'
  const fillPattern = s.fillPattern || 'none'
  const patternColor = s.patternColor || '#000000'
  const borderColor = selected ? '#3b82f6' : (s.borderColor || '#6b7280')
  const borderWidth = selected ? 2 : (s.borderWidth || 2)
  const borderStyle = s.borderStyle || 'solid'
  const borderRadius = s.borderRadius ?? 8

  const handleClick = useCallback(() => {
    selectNode(id)
    selectEdge(null)
  }, [id, selectNode, selectEdge])

  const patternId = `rect-p-${id}-${fillPattern}`
  const patternSvg = fillPattern !== 'none' ? patternDefs[fillPattern](patternId, patternColor) : ''
  const patternFill = fillPattern !== 'none' ? `url(#${patternId})` : null

  const dragRef = useRef<{
    dir: ResizeDir
    startX: number
    startY: number
    startW: number
    startH: number
    startPX: number
    startPY: number
  } | null>(null)

  const handleResizeStart = useCallback((dir: ResizeDir, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    useGraphStore.getState().pushSnapshot()

    const node = useGraphStore.getState().graph.nodes.find(n => n.id === id)
    if (!node) return
    dragRef.current = {
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startW: node.data.style?.width || 200,
      startH: node.data.style?.height || 120,
      startPX: node.position.x,
      startPY: node.position.y
    }

    const handleMouseMove = (ev: MouseEvent) => {
      const ref = dragRef.current
      if (!ref) return
      ev.preventDefault()
      const dx = ev.clientX - ref.startX
      const dy = ev.clientY - ref.startY
      const zoom = getZoom()

      let newW = ref.startW
      let newH = ref.startH
      let newPX = ref.startPX
      let newPY = ref.startPY

      if (ref.dir.includes('e')) {
        newW = Math.max(MIN_SIZE, ref.startW + dx / zoom)
      }
      if (ref.dir.includes('w')) {
        const dw = Math.min(dx / zoom, ref.startW - MIN_SIZE)
        newW = ref.startW - dw
        newPX = ref.startPX + dw
      }
      if (ref.dir.includes('s')) {
        newH = Math.max(MIN_SIZE, ref.startH + dy / zoom)
      }
      if (ref.dir.includes('n')) {
        const dh = Math.min(dy / zoom, ref.startH - MIN_SIZE)
        newH = ref.startH - dh
        newPY = ref.startPY + dh
      }

      newW = Math.round(newW / 8) * 8 || 8
      newH = Math.round(newH / 8) * 8 || 8
      newPX = Math.round(newPX / 8) * 8
      newPY = Math.round(newPY / 8) * 8

      updateNodeStyle(id, { width: newW, height: newH })
      updateNodePosition(id, { x: newPX, y: newPY })
    }

    const handleMouseUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [id, updateNodeStyle, updateNodePosition, getZoom])

  return (
    <div
      style={{
        width: w,
        height: h,
        position: 'relative',
        cursor: 'pointer',
        boxSizing: 'border-box'
      }}
      onClick={handleClick}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: fillColor,
          borderColor,
          borderWidth,
          borderStyle,
          borderRadius,
          boxSizing: 'border-box',
          pointerEvents: 'none',
          overflow: 'hidden'
        }}
      >
        {patternSvg && (
          <svg style={{ position: 'absolute', width: 0, height: 0 }}>
            <defs dangerouslySetInnerHTML={{ __html: patternSvg }} />
          </svg>
        )}
        {patternFill && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: patternFill,
              pointerEvents: 'none',
              borderRadius
            }}
          />
        )}
      </div>

      {selected && (
        <>
          <ResizeHandle dir="n" onMouseDown={handleResizeStart} />
          <ResizeHandle dir="s" onMouseDown={handleResizeStart} />
          <ResizeHandle dir="e" onMouseDown={handleResizeStart} />
          <ResizeHandle dir="w" onMouseDown={handleResizeStart} />
          <ResizeHandle dir="ne" onMouseDown={handleResizeStart} />
          <ResizeHandle dir="nw" onMouseDown={handleResizeStart} />
          <ResizeHandle dir="se" onMouseDown={handleResizeStart} />
          <ResizeHandle dir="sw" onMouseDown={handleResizeStart} />
        </>
      )}

      {data.inputs.map((input, i) => (
        <Handle
          key={input.id}
          type="target"
          position={Position.Left}
          id={input.id}
          style={{
            background: '#9ca3af',
            width: 10,
            height: 10,
            top: data.inputs.length === 1 ? h / 2 : (i + 0.5) * (h / data.inputs.length),
            left: -5,
            border: '2px solid rgba(255,255,255,0.8)',
            pointerEvents: 'auto'
          }}
        />
      ))}

      {data.outputs.map((output, i) => (
        <Handle
          key={output.id}
          type="source"
          position={Position.Right}
          id={output.id}
          style={{
            background: '#9ca3af',
            width: 10,
            height: 10,
            top: data.outputs.length === 1 ? h / 2 : (i + 0.5) * (h / data.outputs.length),
            right: -5,
            border: '2px solid rgba(255,255,255,0.8)',
            pointerEvents: 'auto'
          }}
        />
      ))}

      {data.label && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 6,
            fontSize: s.fontSize || 10,
            fontFamily: s.fontFamily || 'sans-serif',
            fontWeight: s.fontWeight || 400,
            color: s.fontColor || '#374151',
            textAlign: s.textAlign || 'left',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none'
          }}
        >
          {data.label}
        </div>
      )}
    </div>
  )
}

export default RectNode
