import { useCallback } from 'react'
import { Handle, Position } from 'reactflow'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useGraphStore } from '../store/graphStore'
import { formatShape } from '../utils/shape'
import { nodeColorMap } from '../nodes'
import type { CustomNodeData, FillPattern } from '../types'

interface NodeProps {
  id: string
  data: CustomNodeData
  selected: boolean
}

const GRID = 8

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

const renderLatex = (text: string): string => {
  try {
    return katex.renderToString(text, {
      throwOnError: false,
      output: 'html'
    })
  } catch {
    return escapeHtml(text)
  }
}

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const isLatex = (text: string): boolean => {
  return text.startsWith('$') && text.endsWith('$') && text.length > 2
}

const stripLatex = (text: string): string => {
  if (isLatex(text)) return text.slice(1, -1)
  return text
}

const renderLabel = (label: string): string => {
  if (isLatex(label)) {
    return renderLatex(stripLatex(label))
  }
  return escapeHtml(label)
}

const NodeComponent = ({ id, data, selected }: NodeProps) => {
  const selectNode = useGraphStore(state => state.selectNode)
  const errors = useGraphStore(state => state.errors)

  const nodeErrors = errors[id] || []
  const hasError = nodeErrors.some(e => e.level === 'error')
  const color = nodeColorMap[data.nodeType] || '#6b7280'
  const isData = ['Scalar', 'Vector', 'Matrix', 'Tensor'].includes(data.nodeType)

  const inputCount = data.inputs.length
  const outputCount = data.outputs.length

  const nodeStyle = data.style || {}
  const fillColor = nodeStyle.fillColor || '#ffffff'
  const fillPattern = nodeStyle.fillPattern || 'none'
  const patternColor = nodeStyle.patternColor || '#000000'
  const fontColor = nodeStyle.fontColor || '#000000'
  const headerColor = nodeStyle.headerColor || color
  const dataFillColor = isData ? (nodeStyle.fillColor || color) : fillColor

  const headerH = 28
  const portRowH = 11
  const sepH = 4
  const errorH = nodeErrors.length > 0 ? 14 : 0
  const padY = 4

  const inputBlockH = inputCount * portRowH
  const outputBlockH = outputCount * portRowH
  const sepBlockH = (inputCount > 0 && outputCount > 0) ? sepH : 0

  const autoH = padY + headerH + inputBlockH + sepBlockH + outputBlockH + errorH + padY
  const nodeH = nodeStyle.height || (isData ? 34 : Math.ceil(autoH / GRID) * GRID)
  const nodeW = nodeStyle.width || (isData ? 112 : 120)

  const contentTop = padY
  const inputBlockTop = contentTop + headerH
  const outputBlockTop = inputBlockTop + inputBlockH + sepBlockH

  const getHandlePx = (i: number, count: number) => {
    if (count === 1) return nodeH / 2
    return inputBlockTop + (i + 0.5) * (inputBlockH / count)
  }

  const getOutputHandlePx = (i: number, count: number) => {
    if (count === 1) return nodeH / 2
    return outputBlockTop + (i + 0.5) * (outputBlockH / count)
  }

  const patternId = `p-${id}-${fillPattern}`
  const patternSvg = fillPattern !== 'none' ? patternDefs[fillPattern](patternId, patternColor) : ''
  const patternFill = fillPattern !== 'none' ? `url(#${patternId})` : null

  const labelHtml = renderLabel(data.label)
  const tensorShape = data.outputs[0]?.tensor ? formatShape(data.outputs[0].tensor.shape) : '?'

  const renderPortLabel = useCallback((name: string, shapeStr?: string) => {
    const isLat = isLatex(name)
    const nameHtml = isLat ? renderLatex(stripLatex(name)) : escapeHtml(name)
    const shapeHtml = shapeStr ? `<span style="margin-left:1px;font-size:6px;color:#000">${escapeHtml(shapeStr)}</span>` : ''
    return (
      <span
        className="leading-none truncate"
        style={{ color: fontColor, fontSize: 7, fontFamily: "'Menlo', 'Consolas', monospace", fontWeight: 300 }}
        dangerouslySetInnerHTML={{ __html: nameHtml + shapeHtml }}
      />
    )
  }, [fontColor])

  return (
    <div
      onClick={() => selectNode(id)}
      style={{
        borderColor: isData ? 'transparent' : hasError ? '#ef4444' : selected ? headerColor : '#e2e8f0',
        position: 'relative',
        width: nodeW,
        height: nodeH,
        backgroundColor: isData ? 'transparent' : fillColor,
        overflow: 'hidden',
        boxShadow: isData ? 'none' : selected ? '0 4px 12px rgba(99, 102, 241, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.1)' : '0 1px 3px rgba(0, 0, 0, 0.08)'
      }}
      className={`${isData ? '' : 'rounded-xl'} ${
        isData ? '' : hasError ? 'border-2' : selected ? 'border-2' : 'border'
      } transition-all duration-200`}
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
            pointerEvents: 'none'
          }}
        />
      )}

      {data.inputs.map((input, i) => (
        <Handle
          key={input.id}
          type="target"
          position={Position.Left}
          id={input.id}
          className={`data-handle ${isData ? 'data-handle-hidden' : ''}`}
          style={{
            zIndex: 10,
            background: `linear-gradient(135deg, ${headerColor} 0%, color-mix(in srgb, ${headerColor} 80%, white) 100%)`,
            width: isData ? 18 : 12,
            height: isData ? 18 : 12,
            top: getHandlePx(i, inputCount),
            left: isData ? -9 : -6,
            border: '2px solid rgba(255,255,255,0.95)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            cursor: 'crosshair'
          }}
        />
      ))}

      {data.outputs.map((output, i) => (
        <Handle
          key={output.id}
          type="source"
          position={Position.Right}
          id={output.id}
          className={`data-handle ${isData ? 'data-handle-hidden' : ''}`}
          style={{
            zIndex: 10,
            background: `linear-gradient(135deg, ${headerColor} 0%, color-mix(in srgb, ${headerColor} 80%, white) 100%)`,
            width: isData ? 18 : 12,
            height: isData ? 18 : 12,
            top: getOutputHandlePx(i, outputCount),
            right: isData ? -9 : -6,
            border: '2px solid rgba(255,255,255,0.95)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            cursor: 'crosshair'
          }}
        />
      ))}

      {isData ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            filter: selected ? 'drop-shadow(0 0 12px ' + dataFillColor + ') drop-shadow(0 4px 8px rgba(99, 102, 241, 0.3))' : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
            transition: 'filter 0.2s ease'
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(135deg, ${dataFillColor} 0%, color-mix(in srgb, ${dataFillColor} 70%, #0891b2) 100%)`,
              clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)'
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 1,
                clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 50%)'
              }}
            />
            <div
              className="px-2 text-center"
              style={{
                position: 'absolute',
                top: 5,
                left: 10,
                right: 10,
                fontSize: 10,
                fontWeight: 700,
                color: '#ffffff',
                textShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }}
              dangerouslySetInnerHTML={{ __html: labelHtml }}
            />
            <div
              style={{
                position: 'absolute',
                left: 8,
                right: 8,
                bottom: 4,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 7,
                fontFamily: "'Menlo', 'Consolas', monospace",
                fontWeight: 500,
                textAlign: 'center',
                textShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }}
            >
              {tensorShape}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ position: 'absolute', top: contentTop, left: 0, right: 0 }}>
            <div
              className="font-bold px-2 rounded text-center mx-1"
              style={{
                backgroundColor: headerColor,
                height: headerH - 4,
                lineHeight: `${headerH - 4}px`,
                fontSize: 12,
                color: '#ffffff'
              }}
              dangerouslySetInnerHTML={{ __html: labelHtml }}
            />
          </div>

          <div style={{ position: 'absolute', top: inputBlockTop, left: 6, right: 6 }}>
            {data.inputs.map((input) => (
              <div key={input.id} style={{ height: portRowH }} className="flex items-center">
                {renderPortLabel(input.name, input.tensor ? formatShape(input.tensor.shape) : undefined)}
              </div>
            ))}
          </div>

          {sepBlockH > 0 && (
            <div style={{ position: 'absolute', top: inputBlockTop + inputBlockH, left: 6, right: 6, height: sepH }}>
              <div style={{ marginTop: sepH / 2, borderColor: fontColor, opacity: 0.1 }} className="border-t" />
            </div>
          )}

          <div style={{ position: 'absolute', top: outputBlockTop, left: 6, right: 6 }}>
            {data.outputs.map((output) => (
              <div key={output.id} style={{ height: portRowH }} className="flex items-center justify-end">
                {renderPortLabel(output.name, output.tensor ? formatShape(output.tensor.shape) : undefined)}
              </div>
            ))}
          </div>
        </>
      )}

      {nodeErrors.length > 0 && (
        <div
          className="text-red-600 border-t border-red-100"
          style={{ position: 'absolute', bottom: padY, left: 4, right: 4, fontSize: 7 }}
        >
          {nodeErrors.map((err, i) => (
            <div key={i}>{err.level === 'error' ? '✕' : '⚠'} {err.message}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default NodeComponent
