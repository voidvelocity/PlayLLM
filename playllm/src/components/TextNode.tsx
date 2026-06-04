import { Handle, Position } from 'reactflow'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useGraphStore } from '../store/graphStore'
import type { CustomNodeData } from '../types'

interface TextNodeProps {
  id: string
  data: CustomNodeData
  selected: boolean
}

const isLatex = (text: string): boolean => {
  return text.startsWith('$') && text.endsWith('$') && text.length > 2
}

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

const renderContent = (label: string): string => {
  if (isLatex(label)) {
    return renderLatex(label.slice(1, -1))
  }
  return escapeHtml(label)
}

const TextNode = ({ id, data, selected }: TextNodeProps) => {
  const selectNode = useGraphStore(state => state.selectNode)
  const s = data.style || {}

  const w = s.width || 120
  const h = s.height || 32
  const fillColor = s.fillColor || 'transparent'
  const fontColor = s.fontColor || '#000000'
  const fontSize = s.fontSize || 14
  const fontFamily = s.fontFamily || 'sans-serif'
  const fontWeight = s.fontWeight || 400
  const textAlign = s.textAlign || 'left'

  return (
    <div
      onClick={() => selectNode(id)}
      style={{
        width: w,
        height: h,
        backgroundColor: fillColor,
        border: selected ? '2px solid #3b82f6' : '1px dashed transparent',
        position: 'relative',
        cursor: 'pointer',
        padding: '4px 8px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center'
      }}
    >
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
            border: '2px solid rgba(255,255,255,0.8)'
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
            border: '2px solid rgba(255,255,255,0.8)'
          }}
        />
      ))}

      <div
        style={{
          color: fontColor,
          fontSize,
          fontFamily,
          fontWeight,
          textAlign,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: '100%',
          lineHeight: 1.2
        }}
        dangerouslySetInnerHTML={{ __html: renderContent(data.label) }}
      />
    </div>
  )
}

export default TextNode
