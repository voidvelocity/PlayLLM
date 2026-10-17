import { useState, useEffect } from 'react'
import { useGraphStore } from '../store/graphStore'
import { Shape } from '../types'
import { nodeColorMap } from '../nodes'
import { getNodeHeight } from '../utils/nodeGeometry'

const shapeToRaw = (shape?: Shape): string => {
  if (!shape) return ''
  return shape.map(s => String(s)).join(', ')
}

const ShapeInput = ({ shape, onChange, onEditStart, placeholder, invalid = false }: { shape?: Shape, onChange: (value: string) => void, onEditStart: () => void, placeholder?: string, invalid?: boolean }) => {
  const [raw, setRaw] = useState(shapeToRaw(shape))
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setRaw(shapeToRaw(shape))
    }
  }, [shape, isFocused])

  return (
    <input
      type="text"
      value={raw}
      placeholder={placeholder}
      onChange={e => {
        const next = e.target.value
        setRaw(next)
        onChange(next)
      }}
      onFocus={() => {
        setIsFocused(true)
        onEditStart()
      }}
      onBlur={() => {
        setIsFocused(false)
      }}
      className={`flex-1 px-1 py-0 text-[10px] rounded font-mono transition-colors ${invalid ? 'border border-red-300 bg-red-50 text-red-800 focus:border-red-500 focus:ring-red-100' : 'border border-gray-200 bg-white'}`}
    />
  )
}

const fontFamilyOptions = [
  { value: 'sans-serif', label: 'Sans Serif' },
  { value: 'serif', label: 'Serif' },
  { value: "'Menlo', 'Consolas', monospace", label: 'Monospace' },
  { value: "'Courier New', monospace", label: 'Courier' }
]

const NodeProperties = () => {
  const selectedNodeId = useGraphStore(state => state.selectedNodeId)
  const graph = useGraphStore(state => state.graph)
  const errors = useGraphStore(state => state.errors)
  const updateNodeParams = useGraphStore(state => state.updateNodeParams)
  const updateNodeLabel = useGraphStore(state => state.updateNodeLabel)
  const updateNodeStyle = useGraphStore(state => state.updateNodeStyle)
  const updatePortShape = useGraphStore(state => state.updatePortShape)
  const updatePortName = useGraphStore(state => state.updatePortName)
  const moveNodeToBack = useGraphStore(state => state.moveNodeToBack)
  const moveNodeToFront = useGraphStore(state => state.moveNodeToFront)
  const selectedNode = graph.nodes.find(n => n.id === selectedNodeId)

  const handleParamChange = (param: string, value: any) => {
    if (!selectedNodeId) return
    updateNodeParams(selectedNodeId, { [param]: value })
  }

  const handleLabelChange = (label: string) => {
    if (!selectedNodeId) return
    updateNodeLabel(selectedNodeId, label)
  }

  const handleStyleChange = (key: string, value: any) => {
    if (!selectedNodeId) return
    useGraphStore.getState().pushSnapshot()
    updateNodeStyle(selectedNodeId, { [key]: value })
  }

  const handleShapeChange = (portType: 'inputs' | 'outputs', portId: string, value: string) => {
    if (!selectedNodeId) return
    updatePortShape(selectedNodeId, portType, portId, value, false)
  }

  const beginShapeEdit = () => useGraphStore.getState().pushSnapshot()

  const handlePortNameChange = (portType: 'inputs' | 'outputs', portId: string, name: string) => {
    if (!selectedNodeId) return
    updatePortName(selectedNodeId, portType, portId, name)
  }

  const nodeStyle = selectedNode?.data.style || {}
  const nodeType = selectedNode?.data.nodeType
  const color = nodeColorMap[nodeType || ''] || '#6b7280'
  const isDataNode = ['Scalar', 'Vector', 'Matrix', 'Tensor'].includes(nodeType || '')
  const hasShapeError = selectedNode
    ? (errors[selectedNode.id] || []).some(error => error.level === 'error')
    : false
  const actualNodeHeight = selectedNode
    ? getNodeHeight(selectedNode.data)
    : 0

  return (
    <div className="property-form relative h-full w-full overflow-y-auto bg-slate-50/70 p-4 pt-0">
      <div className="sticky top-0 z-[5] -mx-4 mb-4 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white px-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Inspector</h2>
          <p className="mt-0.5 text-[10px] text-slate-400">Fine-tune the selected element</p>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[9px] uppercase text-slate-500">{selectedNode ? selectedNode.data.nodeType : 'None'}</span>
      </div>

      {!selectedNode ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center">
          <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 3 14 9-6 2-2 6L5 3Z" /></svg>
          </div>
          <p className="text-xs font-medium text-slate-600">Nothing selected</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">Select a node or connection on the canvas to edit its properties.</p>
        </div>
      ) : (
        <>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={selectedNode.data.label}
              onChange={e => handleLabelChange(e.target.value)}
              className="w-full px-2 py-0.5 text-xs border border-gray-300 rounded"
            />
            <p className="text-[9px] text-gray-400 mt-0.5">
              {nodeType === 'Text' ? 'Internal element name; edit the visible content below or directly on canvas.' : 'Use $...$ for LaTeX, e.g. $x$, $W_i$'}
            </p>
          </div>

          <div className="mb-3">
            <div className="text-xs font-medium text-gray-700 mb-1">Type</div>
            <div className="text-xs text-gray-900 font-mono">{nodeType}</div>
          </div>

          {isDataNode && selectedNode.data.outputs.length > 0 && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Shape</label>
              <ShapeInput
                shape={selectedNode.data.outputs[0].tensor?.shape}
                onChange={value => handleShapeChange('outputs', selectedNode.data.outputs[0].id, value)}
                onEditStart={beginShapeEdit}
                placeholder="B, N, H"
                invalid={hasShapeError}
              />
            </div>
          )}

          <div className="mb-3 p-2 bg-white rounded border border-gray-200">
            <div className="text-xs font-medium text-gray-700 mb-1.5">Appearance</div>
            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
              <div>
                <label className="block text-[9px] text-gray-500 mb-0.5">Width</label>
                <input
                  type="number"
                  value={nodeStyle.width || ''}
                  onChange={e => handleStyleChange('width', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded font-mono"
                  placeholder="auto"
                  min={40}
                  step={8}
                />
              </div>
              <div>
                <label className="block text-[9px] text-gray-500 mb-0.5">Height</label>
                <input
                  type="number"
                  value={actualNodeHeight}
                  onChange={e => handleStyleChange('height', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded font-mono"
                  min={24}
                  step={8}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] text-gray-500 mb-0.5">Font Color</label>
                <input
                  type="color"
                  value={nodeStyle.fontColor || '#000000'}
                  onChange={e => handleStyleChange('fontColor', e.target.value)}
                  className="w-full h-6 border border-gray-300 rounded cursor-pointer p-0"
                />
              </div>
              {(nodeType === 'Scalar' || nodeType === 'Vector' || nodeType === 'Matrix' || nodeType === 'Tensor') && (
              <div>
                <label className="block text-[9px] text-gray-500 mb-0.5">Fill Color</label>
                <input
                  type="color"
                  value={nodeStyle.fillColor || color}
                  onChange={e => handleStyleChange('fillColor', e.target.value)}
                  className="w-full h-6 border border-gray-300 rounded cursor-pointer p-0"
                />
              </div>
              )}
              {(nodeType !== 'Scalar' && nodeType !== 'Vector' && nodeType !== 'Matrix' && nodeType !== 'Tensor' && nodeType !== 'Rect' && nodeType !== 'Text') && (
              <div>
                <label className="block text-[9px] text-gray-500 mb-0.5">Header Color</label>
                <input
                  type="color"
                  value={nodeStyle.headerColor || color}
                  onChange={e => handleStyleChange('headerColor', e.target.value)}
                  className="w-full h-6 border border-gray-300 rounded cursor-pointer p-0"
                />
              </div>
              )}
            </div>
          </div>

          {nodeType === 'Rect' && (
            <div className="mb-3 p-2 bg-white rounded border border-gray-200">
              <div className="text-xs font-medium text-gray-700 mb-1.5">Border</div>
              <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">Radius</label>
                  <input
                    type="number"
                    value={nodeStyle.borderRadius ?? ''}
                    onChange={e => handleStyleChange('borderRadius', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded font-mono"
                    min={0}
                    max={50}
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">Width</label>
                  <input
                    type="number"
                    value={nodeStyle.borderWidth ?? ''}
                    onChange={e => handleStyleChange('borderWidth', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded font-mono"
                    min={0}
                    max={10}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">Color</label>
                  <input
                    type="color"
                    value={nodeStyle.borderColor || '#6b7280'}
                    onChange={e => handleStyleChange('borderColor', e.target.value)}
                    className="w-full h-6 border border-gray-300 rounded cursor-pointer p-0"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">Style</label>
                  <select
                    value={nodeStyle.borderStyle || 'solid'}
                    onChange={e => handleStyleChange('borderStyle', e.target.value as 'solid' | 'dashed' | 'dotted')}
                    className="w-full px-0.5 py-0.5 text-[10px] border border-gray-300 rounded"
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200">
                <div className="text-xs font-medium text-gray-700 mb-1.5">Fill</div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={nodeStyle.hasFill === true}
                      onChange={e => handleStyleChange('hasFill', e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-gray-600">Enable Fill</span>
                  </label>
                </div>
                {nodeStyle.hasFill && (
                  <div>
                    <label className="block text-[9px] text-gray-500 mb-0.5">Fill Color</label>
                    <input
                      type="color"
                      value={nodeStyle.fillColor || '#e5e7eb'}
                      onChange={e => handleStyleChange('fillColor', e.target.value)}
                      className="w-full h-6 border border-gray-300 rounded cursor-pointer p-0"
                    />
                  </div>
                )}
              </div>
              <div className="mt-2 flex gap-1">
                <button
                  onClick={() => selectedNodeId && moveNodeToBack(selectedNodeId)}
                  className="flex-1 px-2 py-1 bg-gray-500 text-white rounded text-[10px] font-medium hover:bg-gray-600 transition-colors"
                >
                  ⬇ Back
                </button>
                <button
                  onClick={() => selectedNodeId && moveNodeToFront(selectedNodeId)}
                  className="flex-1 px-2 py-1 bg-gray-500 text-white rounded text-[10px] font-medium hover:bg-gray-600 transition-colors"
                >
                  ⬆ Front
                </button>
              </div>
            </div>
          )}

          {nodeType === 'Text' && (
            <div className="mb-3 p-2 bg-white rounded border border-gray-200">
              <div className="text-xs font-medium text-gray-700 mb-1.5">Text</div>
              <div className="mb-1.5">
                <label className="block text-[9px] text-gray-500 mb-0.5">Content</label>
                <textarea
                  value={String(selectedNode.data.params.content ?? selectedNode.data.label)}
                  onChange={e => handleParamChange('content', e.target.value)}
                  rows={3}
                  className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded resize-y"
                />
                <p className="text-[9px] text-gray-400 mt-0.5">Use $...$ for LaTeX. Multi-line is supported.</p>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">Font Size</label>
                  <input
                    type="number"
                    value={nodeStyle.fontSize ?? ''}
                    onChange={e => handleStyleChange('fontSize', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded font-mono"
                    min={6}
                    max={72}
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">Font Weight</label>
                  <select
                    value={nodeStyle.fontWeight || 400}
                    onChange={e => handleStyleChange('fontWeight', parseInt(e.target.value))}
                    className="w-full px-0.5 py-0.5 text-[10px] border border-gray-300 rounded"
                  >
                    <option value={100}>Thin (100)</option>
                    <option value={200}>Extra Light (200)</option>
                    <option value={300}>Light (300)</option>
                    <option value={400}>Regular (400)</option>
                    <option value={500}>Medium (500)</option>
                    <option value={600}>Semi Bold (600)</option>
                    <option value={700}>Bold (700)</option>
                    <option value={800}>Extra Bold (800)</option>
                    <option value={900}>Black (900)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">Font Family</label>
                  <select
                    value={nodeStyle.fontFamily || 'sans-serif'}
                    onChange={e => handleStyleChange('fontFamily', e.target.value)}
                    className="w-full px-0.5 py-0.5 text-[10px] border border-gray-300 rounded"
                  >
                    {fontFamilyOptions.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">Alignment</label>
                  <select
                    value={nodeStyle.textAlign || 'left'}
                    onChange={e => handleStyleChange('textAlign', e.target.value as 'left' | 'center' | 'right')}
                    className="w-full px-0.5 py-0.5 text-[10px] border border-gray-300 rounded"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[9px] text-gray-500 mb-0.5">Font Color</label>
                <input
                  type="color"
                  value={nodeStyle.fontColor || '#000000'}
                  onChange={e => handleStyleChange('fontColor', e.target.value)}
                  className="w-full h-6 border border-gray-300 rounded cursor-pointer p-0"
                />
              </div>
            </div>
          )}

          {selectedNode.data.inputs.length > 0 && !isDataNode && (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-700 mb-1.5">Inputs</div>
              {selectedNode.data.inputs.map((input) => (
                <div key={input.id} className="mb-2 p-1.5 bg-white rounded border border-gray-100">
                  <div className="flex items-center gap-1 mb-1">
                    <label className="text-[9px] text-gray-500 w-8 shrink-0">Name</label>
                    <input
                      type="text"
                      value={input.name}
                      onChange={e => handlePortNameChange('inputs', input.id, e.target.value)}
                      className="flex-1 px-1 py-0 text-[10px] border border-gray-200 rounded font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-500 w-8 shrink-0">Shape</label>
                    <ShapeInput
                      shape={input.tensor?.shape}
                      onChange={value => handleShapeChange('inputs', input.id, value)}
                      onEditStart={beginShapeEdit}
                      placeholder="B, N, H"
                      invalid={hasShapeError}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedNode.data.outputs.length > 0 && !isDataNode && (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-700 mb-1.5">Outputs</div>
              {selectedNode.data.outputs.map((output) => (
                <div key={output.id} className="mb-2 p-1.5 bg-white rounded border border-gray-100">
                  <div className="flex items-center gap-1 mb-1">
                    <label className="text-[9px] text-gray-500 w-8 shrink-0">Name</label>
                    <input
                      type="text"
                      value={output.name}
                      onChange={e => handlePortNameChange('outputs', output.id, e.target.value)}
                      className="flex-1 px-1 py-0 text-[10px] border border-gray-200 rounded font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-500 w-8 shrink-0">Shape</label>
                    <ShapeInput
                      shape={output.tensor?.shape}
                      onChange={value => handleShapeChange('outputs', output.id, value)}
                      onEditStart={beginShapeEdit}
                      placeholder="B, N, H"
                      invalid={hasShapeError}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {Object.keys(selectedNode.data.params).filter(k => !k.startsWith('_')).length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-700 mb-1.5">Parameters</div>
              {Object.entries(selectedNode.data.params).filter(([k]) => !k.startsWith('_')).map(([key, value]) => (
                <div key={key} className="mb-1.5">
                  <label className="block text-[9px] text-gray-600 mb-0.5">{key}</label>
                  {typeof value === 'number' ? (
                    <input
                      type="number"
                      value={value}
                      onChange={e => handleParamChange(key, parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-0.5 text-xs border border-gray-300 rounded font-mono"
                    />
                  ) : typeof value === 'object' && Array.isArray(value) ? (
                    <input
                      type="text"
                      value={JSON.stringify(value)}
                      onChange={e => {
                        try {
                          handleParamChange(key, JSON.parse(e.target.value))
                        } catch { /* ignore parse errors while typing */ }
                      }}
                      className="w-full px-2 py-0.5 text-xs border border-gray-300 rounded font-mono"
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(value)}
                      onChange={e => handleParamChange(key, e.target.value)}
                      className="w-full px-2 py-0.5 text-xs border border-gray-300 rounded font-mono"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default NodeProperties
