# PlayLLM 开发者指南

## 项目概述

PlayLLM 是一个基于 React + TypeScript 的可视化神经网络模型构建工具，支持通过拖拽方式创建和编辑计算图，主要用于 LLM（大语言模型）架构的可视化设计和分析。

### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2.0 | 前端框架 |
| TypeScript | 5.2.2 | 类型安全 |
| ReactFlow | 11.10.3 | 图编辑器核心 |
| Zustand | 4.4.7 | 状态管理 |
| Vite | 5.2.0 | 构建工具 |
| TailwindCSS | 3.4.19 | 样式框架 |
| KaTeX | 0.16.45 | LaTeX 公式渲染 |
| Python FastAPI | - | 后端 API（可选） |

---

## 目录结构

```
PlayLLM/
├── playllm/                    # 前端项目主目录
│   ├── src/                    # 源代码
│   │   ├── components/         # React 组件
│   │   │   ├── EdgeProperties.tsx   # 连线属性编辑面板
│   │   │   ├── GraphEditor.tsx      # 画布编辑器（核心）
│   │   │   ├── Node.tsx             # 节点渲染组件
│   │   │   ├── NodeLibrary.tsx      # 左侧节点库面板
│   │   │   ├── NodeProperties.tsx   # 右侧属性编辑面板
│   │   │   ├── RectNode.tsx         # Rectangle 注释节点
│   │   │   └── TextNode.tsx         # Text 注释节点
│   │   ├── nodes/              # 节点定义
│   │   │   ├── index.ts             # 节点注册与工厂函数
│   │   │   ├── activation.ts        # 激活函数节点
│   │   │   ├── add.ts               # 加法（残差连接）节点
│   │   │   ├── concat.ts            # 拼接节点
│   │   │   ├── einsum.ts            # Einstein 求和节点
│   │   │   ├── elementwise.ts       # 逐元素操作节点
│   │   │   ├── embedding.ts         # 嵌入层节点
│   │   │   ├── layernorm.ts         # Norm 层归一化节点
│   │   │   ├── linear.ts            # 线性层节点
│   │   │   ├── matmul.ts            # 矩阵乘法节点
│   │   │   ├── reshape.ts           # Reshape 节点
│   │   │   ├── softmax.ts           # Softmax 节点
│   │   │   ├── split.ts             # 分割节点
│   │   │   ├── tensor.ts            # Tensor 数据节点
│   │   │   └── transpose.ts         # 转置节点
│   │   ├── store/              # Zustand 状态管理
│   │   │   ├── graphStore.ts        # 图数据状态
│   │   │   ├── uiStore.ts           # UI 状态
│   │   │   └── workspaceStore.ts    # 工作区状态
│   │   ├── types/              # TypeScript 类型定义
│   │   │   └── index.ts             # 核心类型
│   │   ├── utils/             # 工具函数
│   │   │   ├── persistence.ts       # 数据持久化与剪贴板
│   │   │   ├── serverApi.ts         # API 调用
│   │   │   ├── shape.ts             # Shape 推导
│   │   │   └── shapeSymbols.ts      # 默认 Shape 符号常量
│   │   ├── examples/          # 示例图
│   │   │   ├── index.ts
│   │   │   └── mlp.ts               # Transformer MLP 示例
│   │   ├── App.tsx            # 应用入口组件
│   │   ├── main.tsx           # React 挂载入口
│   │   ├── index.css          # 全局样式
│   │   └── vite-env.d.ts      # Vite 环境类型声明
│   ├── backend/               # Python 后端
│   │   ├── run_api.py              # HTTP 服务器（含内置 & FastAPI 双模式）
│   │   └── requirements.txt        # Python 依赖
│   ├── server/                # Node.js 服务器
│   │   └── index.mjs               # Node.js HTTP 服务器（含静态文件服务）
│   ├── index.html             # HTML 入口
│   ├── package.json           # NPM 配置
│   ├── vite.config.ts         # Vite 配置
│   ├── tailwind.config.js     # Tailwind 配置
│   ├── postcss.config.js      # PostCSS 配置
│   ├── tsconfig.json          # TypeScript 配置
│   ├── tsconfig.node.json     # Node 端 TypeScript 配置
│   └── .eslintrc.json         # ESLint 配置
├── .gitignore                 # Git 忽略配置
├── DeveloperGuide.md          # 本文档
└── prompt.md                  # 项目需求文档
```

---

## 核心模块

### 1. 组件层 (`src/components/`)

#### GraphEditor.tsx - 画布编辑器

核心画布组件，基于 ReactFlow 实现：

- **节点拖放**: 支持从左侧栏拖拽节点到画布
- **连线管理**: 处理节点间的连接
- **选择机制**: 管理节点和连线的选中状态
- **键盘快捷键**: 支持方向键/hjkl 移动节点，Ctrl+C/V 复制粘贴
- **剪贴板**: 支持节点组的复制粘贴，使用 `playllm-fragment` 格式
- **文件操作**: Import（导入 JSON 文件）、Download（下载画布为 JSON）
- **工作区操作**: New（新建草稿）、Save（保存到服务器）
- **自动同步**: 画布变更后自动同步到 workspaceStore
- **画布配置**: snap-to-grid (8px)、MiniMap、Controls、缩放范围 0.1~4x
- **事件处理**: `onNodeClick`, `onPaneClick`, `onEdgeClick` 等

```tsx
<ReactFlow
  nodes={graph.nodes}
  edges={graph.edges}
  onNodesChange={onNodesChange}
  onEdgesChange={onEdgesChange}
  onNodeClick={...}
  onConnect={...}
  snapToGrid
  snapGrid={[8, 8]}
  ...
/>
```

#### Node.tsx - 节点渲染

统一渲染所有类型的节点：

- **Operators**: Linear, Activation, Norm, MatMul, Softmax 等（圆角矩形 + Header）
- **Data**: Scalar, Vector, Matrix, Tensor（六边形菱形样式）
- **LaTeX 支持**: 节点标签和端口名支持 `$...$` 语法渲染 LaTeX 公式
- **填充图案**: 支持 stripes / grid / dots / crosshatch 四种 SVG 图案填充
- **错误显示**: 节点底部显示验证错误（✕ 错误 / ⚠ 警告）
- **自定义样式**: Header Color, Font Color, Fill Color, Fill Pattern 等

#### NodeLibrary.tsx - 左侧节点库

可折叠的左侧面板，包含：

- **User**: 用户 ID 设置（输入后自动切换工作区）
- **Documents**: 文档列表管理（加载、重命名、复制、删除），显示草稿/脏标记
- **Operators**: 算子列表（支持拖拽），自定义算子创建（名称 + 输入/输出数量）
- **Data**: 数据类型（Scalar, Vector, Matrix, Tensor）
- **Annotations**: 注释工具（Rectangle, Text）

#### NodeProperties.tsx - 右侧属性面板

根据选中节点类型显示不同属性：

- **通用属性**: Name（支持 LaTeX）、Type
- **Appearance**: Width, Height, Font Color, Header Color / Fill Color
- **Inputs/Outputs**: 端口名称编辑、Shape 编辑
- **Parameters**: 参数编辑（数字/字符串/数组/枚举类型自适应控件）
- **Rect 属性**: 边框样式、填充（含 Enable Fill 开关）、层级调整（Back/Front）
- **Text 属性**: Content, Font Size, Font Weight, Font Family, Alignment, Font Color

#### EdgeProperties.tsx - 连线属性面板

编辑连线样式：

- **颜色**: 线条颜色
- **样式**: 实线/虚线/点线
- **粗细**: 线条宽度
- **箭头**: 箭头类型（Arrow Closed / Arrow Open / No Arrow）、箭头大小
- **信息**: 连线 ID、源→目标节点

#### RectNode.tsx - 矩形注释节点

- **可调整大小**: 选中时显示 8 个方向的拖拽手柄（n/s/e/w/ne/nw/se/sw）
- **填充图案**: 与 Node.tsx 相同的 SVG 图案支持
- **边框样式**: 颜色、宽度、样式（solid/dashed/dotted）、圆角

#### TextNode.tsx - 文本注释节点

- **LaTeX 渲染**: 支持 `$...$` 语法
- **字体控制**: Font Size, Font Weight, Font Family, Alignment, Font Color

---

### 2. 节点定义 (`src/nodes/`)

#### index.ts - 节点注册中心

```typescript
export const nodeCategories = {
  'Operators': ['Linear', 'Embedding', 'Activation', 'Norm', 'Concat', 'Split', 'ElementWise', 'EinSum', 'Reshape', 'Transpose', 'MatMul', 'Softmax'],
  'Data': ['Scalar', 'Vector', 'Matrix', 'Tensor'],
  'Annotations': ['Rect', 'Text']
}

export const nodeColorMap = {
  'Linear': '#2563eb',
  'Embedding': '#0e7490',
  'Activation': '#ea580c',
  'Norm': '#ca8a04',
  'Concat': '#0d9488',
  'Split': '#db2777',
  'ElementWise': '#4f46e5',
  'EinSum': '#64748b',
  'Reshape': '#8b5cf6',
  'Transpose': '#ec4899',
  'MatMul': '#f97316',
  'Softmax': '#14b8a6',
  'Custom': '#78716c',
  'Rect': '#94a3b8',
  'Text': '#a1a1aa',
  'Scalar': '#0891b2',
  'Vector': '#059669',
  'Matrix': '#7c3aed',
  'Tensor': '#dc2626',
}

export const nodeCreators = {
  'Linear': createLinearNode,
  'Embedding': (id, pos) => createEmbeddingNode(id, pos, 'H', ['B', 'N']),
  'Activation': (id, pos) => createActivationNode(id, pos, 'ReLU'),
  'Norm': createLayerNormNode,
  'Concat': (id, pos) => createConcatNode(id, pos, [['B', 'N', 'H'], ['B', 'N', 'D']], -1),
  'Split': createSplitNode,
  'ElementWise': (id, pos) => createElementWiseNode(id, pos, 'Add'),
  'EinSum': (id, pos) => createEinSumNode(id, pos, '', [['B', 'N', 'H'], ['H', 'K']]),
  'Reshape': (id, pos) => createReshapeNode(id, pos, ['B', 'N', 'H'], ['B', 'N * D']),
  'Transpose': createTransposeNode,
  'MatMul': (id, pos) => createMatMulNode(id, pos, [['B', 'N', 'H'], ['B', 'H', 'K']]),
  'Softmax': createSoftmaxNode,
  'Custom': createCustomNode,
  'Rect': createRectNode,
  'Text': createTextNode,
  'Scalar': (id, pos) => createTensorNode(id, pos, [], 'Scalar'),
  'Vector': (id, pos) => createTensorNode(id, pos, ['N'], 'Vector'),
  'Matrix': (id, pos) => createTensorNode(id, pos, ['N', 'D'], 'Matrix'),
  'Tensor': (id, pos) => createTensorNode(id, pos, [...DEFAULT_TENSOR_SHAPE], 'Tensor')
}
```

关键导出函数：

- `createNodeFromType(type, id, position)` — 从类型字符串创建节点
- `createNodeFromSnapshot(snapshot)` — 从保存的快照恢复节点（兼容 v1/v2）
- `createCustomNode(id, position, label, inputCount, outputCount)` — 创建自定义算子节点
- `getNodeConfig(type)` — 获取节点配置（label, defaultParams, defaultInputShape 等）
- `getBuiltinOperatorDefinitions()` — 获取内置算子定义列表
- `getOperatorDefinitions(customOperators)` — 获取全部算子定义（内置 + 自定义）

#### 节点类型

| 节点 | 文件 | 输入 | 输出 | 功能 |
|------|------|------|------|------|
| Linear | linear.ts | 1 | 1 | 全连接层，参数 `out_features`（默认符号 **K**） |
| Embedding | embedding.ts | 1 | 1 | 词/索引嵌入，参数 `embedding_dim`（默认符号 **H**），输入 dtype 为 int64 |
| Activation | activation.ts | 1 | 1 | 激活函数：ReLU / GELU / SiLU |
| Norm | layernorm.ts | 1 | 1 | 层归一化，参数 `normalized_shape` |
| Concat | concat.ts | N | 1 | 张量拼接，参数 `dim` |
| Split | split.ts | 1 | N | 张量分割，参数 `sizes`, `axis` |
| ElementWise | elementwise.ts | 2 | 1 | 逐元素操作：Add / Mul / Sub / Div，支持广播 |
| EinSum | einsum.ts | N | 1 | Einstein 求和，参数 `expression` |
| Reshape | reshape.ts | 1 | 1 | 形状变换，参数 `target_shape`（支持 `*` 表达式如 `N * D`） |
| Transpose | transpose.ts | 1 | 1 | 转置，参数 `perm`（排列数组如 `[0, 2, 1]`） |
| MatMul | matmul.ts | 2 | 1 | 矩阵乘法，验证最后两维兼容性 |
| Softmax | softmax.ts | 1 | 1 | Softmax 归一化，参数 `axis` |
| Add | add.ts | N | 1 | 加法/残差连接，验证输入 Shape 一致性 |
| Custom | index.ts | N | N | 自定义算子（用户定义输入/输出数量） |
| Scalar | tensor.ts | 1 | 1 | 标量数据节点，Shape `[]` |
| Vector | tensor.ts | 1 | 1 | 向量数据节点，Shape `['N']` |
| Matrix | tensor.ts | 1 | 1 | 矩阵数据节点，Shape `['N', 'D']` |
| Tensor | tensor.ts | 1 | 1 | 张量数据节点，Shape `['B', 'N', 'H']` |

#### 节点运行时接口

```typescript
type NodeRuntime = {
  infer: (inputs: TensorSpec[], params: Record<string, any>) => TensorSpec[]
  validate?: (inputs: TensorSpec[], params: Record<string, any>) => ValidationError[]
}
```

#### 默认 Shape 符号

项目使用符号化维度以保持模型无关性（避免硬编码如 768/7168），定义在 `src/utils/shapeSymbols.ts`：

```typescript
export const DEFAULT_INITIAL_SHAPE_STR = 'B, N, H'
export const DEFAULT_TENSOR_SHAPE = ['B', 'N', 'H'] as const
export const DEFAULT_LINEAR_IN = ['B', 'N', 'H'] as const
export const DEFAULT_FFN_DIM = 'K'
```

---

### 3. 状态管理 (`src/store/`)

#### graphStore.ts - 图数据状态

```typescript
interface GraphState {
  graph: Graph
  selectedNodeId: string | null
  selectedEdgeId: string | null
  errors: Record<string, ValidationError[]>
  initialShape: string
  customOperators: CustomOperatorDef[]

  setGraph: (graph: Graph) => void
  loadCanvasState: (payload: { graph: Graph; initialShape: string; customOperators: CustomOperatorDef[] }) => void
  addNode: (node: Node) => void
  removeNode: (nodeId: string) => void
  updateNodeParams: (nodeId: string, params: Record<string, any>) => void
  updateNodeLabel: (nodeId: string, label: string) => void
  updateNodeStyle: (nodeId: string, style: Partial<NodeStyle>) => void
  updatePortShape: (nodeId: string, portType: 'inputs' | 'outputs', portId: string, shapeStr: string) => void
  updatePortName: (nodeId: string, portType: 'inputs' | 'outputs', portId: string, name: string) => void
  selectNode: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void
  updateEdgeStyle: (edgeId: string, style: Record<string, any>) => void
  setInitialShape: (shape: string) => void
  runShapeInference: () => void
  addCustomOperator: (op: CustomOperatorDef) => void
  removeCustomOperator: (id: string) => void
  moveNodeToBack: (nodeId: string) => void
  moveNodeToFront: (nodeId: string) => void
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void
}
```

**Shape 推导特殊处理**：

- **Data 节点**（Scalar/Vector/Matrix/Tensor）：有连线时传递输入 Shape，否则使用端口上保存的 Shape
- **Custom 节点**：始终使用端口上保存的 Shape（避免闭包过期问题）
- **Split 节点**：当输入轴维度与 sizes 总和不匹配时，自动按半分重新计算 sizes

**选择逻辑**：
- 选中节点时清除边选中
- 选中边时清除节点选中
- 清除边选中时保留当前节点选中

#### uiStore.ts - UI 状态

```typescript
interface UIState {
  leftSidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  setLeftSidebarCollapsed: (collapsed: boolean) => void
  setRightSidebarCollapsed: (collapsed: boolean) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  openRightSidebar: () => void
}
```

#### workspaceStore.ts - 工作区状态

```typescript
interface WorkspaceState {
  currentUserId: string
  graphRecords: WorkspaceGraphSummary[]
  currentGraphId: string | null
  currentGraphName: string
  status: string
  isBusy: boolean
  workingDocuments: WorkingDocuments

  initializeWorkspace: () => Promise<void>
  setCurrentUserId: (userId: string) => Promise<void>
  refreshWorkspace: () => Promise<void>
  loadGraphIntoCanvas: (graphId: string, loadCanvasState: LoadCanvasState) => Promise<void>
  createNewGraph: (loadCanvasState: LoadCanvasState) => void
  saveCurrentGraph: (graph, initialShape, customOperators, requestedName?) => Promise<{ saved, graphId?, graphName?, duplicate? }>
  renameGraphRecord: (graphId: string, nextName: string) => Promise<boolean>
  deleteGraphRecord: (graphId: string, loadCanvasState: LoadCanvasState) => Promise<boolean>
  duplicateGraphRecord: (graphId: string, loadCanvasState: LoadCanvasState) => Promise<void>
  syncCurrentCanvas: () => void
  setCurrentGraphName: (name: string) => void
  attachImportedDocument: (fileName: string) => void
}
```

**草稿机制**：
- 新建图和导入文件创建 `draft:` 前缀的草稿 ID
- 首次 Save 时上传到服务器并获取正式 ID
- 重名检测：保存时检查同名图，提示用户换名

**脏标记（isDirty）**：
- 通过对比 `workingDocuments` 和 `baseDocuments` 判断
- 画布变更后通过 `syncCurrentCanvas()` 自动更新（300ms 防抖）

**用户 ID 持久化**：存储在 `localStorage` 的 `playllm.currentUserId` 键

---

### 4. 类型定义 (`src/types/index.ts`)

#### 核心类型

```typescript
type Shape = (number | string)[]  // ['B', 'N', 'H']

type TensorSpec = {
  shape: Shape
  dtype?: string
}

type Port = {
  id: string
  name: string
  type: 'input' | 'output'
  tensor?: TensorSpec
}

type ValidationError = {
  level: 'error' | 'warning'
  message: string
}

type NodeRuntime = {
  infer: (inputs: TensorSpec[], params: Record<string, any>) => TensorSpec[]
  validate?: (inputs: TensorSpec[], params: Record<string, any>) => ValidationError[]
}

type FillPattern = 'none' | 'stripes' | 'grid' | 'dots' | 'crosshatch'

type NodeStyle = {
  width?: number
  height?: number
  hasFill?: boolean
  fillColor?: string
  fillPattern?: FillPattern
  patternColor?: string
  fontColor?: string
  headerColor?: string
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  fontSize?: number
  fontFamily?: string
  fontWeight?: number
  textAlign?: 'left' | 'center' | 'right'
}

type CustomOperatorDef = {
  id: string
  label: string
  inputCount: number
  outputCount: number
}

type CustomNodeData = {
  label: string
  nodeType: string
  inputs: Port[]
  outputs: Port[]
  params: Record<string, any>
  style?: NodeStyle
  [key: string]: unknown
}

type CustomNode = ReactFlowNode<CustomNodeData> & {
  runtime: NodeRuntime
}

type Node = CustomNode

type Edge = ReactFlowEdge

type Graph = {
  nodes: CustomNode[]
  edges: Edge[]
}
```

#### 持久化类型

```typescript
type SavedGraphNode = {
  id: string
  type: string
  position: { x: number; y: number }
  zIndex?: number
  data: CustomNodeData
}

type SavedGraphEdge = {
  id: string
  source: string
  sourceHandle?: string | null
  target: string
  targetHandle?: string | null
  type?: string
  animated?: boolean
  style?: Edge['style']
  markerEnd?: Edge['markerEnd']
}

type SavedCanvasDocument = {
  format: 'playllm-canvas'
  version: 1 | 2
  savedAt: string
  initialShape: string
  customOperators: CustomOperatorDef[]
  graph: {
    nodes: SavedGraphNode[]
    edges: SavedGraphEdge[]
  }
}
```

#### API 类型

```typescript
type GraphRecordSummary = {
  id: string
  name: string
  userId: string
  updatedAt: string
  nodeCount: number
  edgeCount: number
}

type WorkspaceGraphSummary = GraphRecordSummary & {
  isDraft?: boolean
  isDirty?: boolean
}

type GraphRecord = GraphRecordSummary & {
  document: SavedCanvasDocument
}

type UserSummary = {
  id: string
  displayName: string
  graphCount: number
  updatedAt: string
}
```

---

### 5. 工具函数 (`src/utils/`)

#### shapeSymbols.ts - 默认 Shape 符号常量

```typescript
export const DEFAULT_INITIAL_SHAPE_STR = 'B, N, H'
export const DEFAULT_TENSOR_SHAPE = ['B', 'N', 'H'] as const
export const DEFAULT_LINEAR_IN = ['B', 'N', 'H'] as const
export const DEFAULT_FFN_DIM = 'K'
```

#### persistence.ts - 数据持久化与剪贴板

```typescript
cloneCanvasDocument(doc): SavedCanvasDocument
canvasDocumentsEqual(left, right): boolean

serializeGraphNode(node): SavedGraphNode
serializeGraphEdge(edge): SavedGraphEdge
serializeCanvasDocument({ graph, initialShape, customOperators }): SavedCanvasDocument  // version 2
stringifyCanvasDocument(doc, pretty?): string  // pretty=false 紧凑 JSON

parseCanvasDocument(json): SavedCanvasDocument  // 兼容 version 1 与 2
restoreCanvasState(doc): { graph, initialShape, customOperators }

buildClipboardPayload(nodes, edges): GraphClipboardPayload  // format: 'playllm-fragment'
parseClipboardPayload(text): GraphClipboardPayload
```

#### shape.ts - Shape 推导

```typescript
parseShape(shapeStr: string): Shape
formatShape(shape: Shape): string  // e.g. ['B', 'N', 'H'] -> "(B, N, H)"

shapesEqual(shape1, shape2): boolean
validateSameShape(shapes): ValidationError[]
validateLastDimEqual(shapes): ValidationError[]

inferBroadcastShape(shapes): Shape | null
inferLinearShape(inputShape, outFeatures): Shape
inferActivationShape(inputShape): Shape
inferLayerNormShape(inputShape): Shape
inferConcatShape(shapes, dim): Shape | null
inferSplitShape(inputShape, sizes): Shape[]
inferElementWiseShape(shapes): Shape | null

parseEinSumExpression(expr): { inputs: string[], output: string }
inferEinSumShape(expr, inputShapes): Shape | null
```

#### serverApi.ts - API 调用

```typescript
const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:3001/api' : '/api'

listUsers(): Promise<UserSummary[]>
listGraphsByUser(userId): Promise<GraphRecordSummary[]>
getGraphByUser(userId, graphId): Promise<GraphRecord>
saveGraphByUser(userId, name, document): Promise<GraphRecordSummary>
updateGraphByUser(userId, graphId, name, document?): Promise<GraphRecordSummary>
deleteGraphByUser(userId, graphId): Promise<void>
```

---

## 后端 API

### Python 后端 (`backend/`)

#### run_api.py - 双模式 HTTP 服务器

同一文件包含内置 Python 服务器和 FastAPI 服务器两种模式。启动时自动检测 FastAPI 是否安装，有则使用 FastAPI，否则回退到内置服务器。

```
GET    /api/users                           # 列出所有用户
GET    /api/users/:userId/graphs            # 列出用户的图
POST   /api/users/:userId/graphs            # 创建新图
GET    /api/users/:userId/graphs/:graphId   # 获取图详情
PUT    /api/users/:userId/graphs/:graphId   # 更新图（名称 + 文档）
DELETE /api/users/:userId/graphs/:graphId   # 删除图
```

特性：
- 原子写入（先写 `.tmp` 再 rename）
- 图列表缓存（2 秒 TTL）
- ID 规范化（小写 + 去特殊字符）
- 文档格式验证（`format: playllm-canvas`, `version: 1|2`）
- 环境变量配置：`PLAYLLM_HOST`（默认 127.0.0.1）、`PLAYLLM_PORT`（默认 3001）

### Node.js 服务器 (`server/index.mjs`)

基于 Node.js 原生 `http` 模块（非 Express），同时提供：
- **API 路由**：与 Python 后端相同的 REST 端点
- **静态文件服务**：从 `dist/` 目录提供前端构建产物（支持 SPA fallback 到 `index.html`）
- 端口冲突检测：启动时探测已有服务

数据存储在 `server-data/` 目录：

```
server-data/
├── users/
│   └── {userId}.json        # 用户信息
└── graphs/
    └── {userId}/
        └── {graphId}.json   # 图数据
```

---

## 数据流

### 1. 创建节点流程

```
用户拖拽节点 → onDrop → createNodeFromType / createCustomNode → addNode → setGraph
                                                                    ↓
                                                              runShapeInference
```

### 2. 编辑属性流程

```
用户修改属性 → handleParamChange → updateNodeParams → setGraph
                                                    ↓
                                              runShapeInference
```

### 3. 连接节点流程

```
用户连线 → onConnect → 创建 Edge → setGraph → runShapeInference
```

### 4. Shape 推导

```
runShapeInference
    ↓
topologicalSort (拓扑排序)
    ↓
遍历节点:
  - Data 节点: 有连线 → 传递输入 Shape; 无连线 → 使用端口保存的 Shape
  - Custom 节点: 始终使用端口保存的 Shape
  - Split 节点: 自动调整 sizes 以匹配输入轴维度
  - 其他节点: node.runtime.infer(inputs, params)
    ↓
更新 inputs/outputs 的 TensorSpec + 运行 validate
```

### 5. 复制粘贴流程

```
Ctrl+C → buildClipboardPayload(selectedNodes, internalEdges) → clipboard
Ctrl+V → parseClipboardPayload(text) → createNodeFromSnapshot (偏移 48px) → setGraph
```

### 6. 工作区同步流程

```
画布变更 → useEffect → syncCurrentCanvas (300ms 防抖)
    ↓
serializeCanvasDocument → 对比 baseDocument → 更新 isDirty 标记
```

---

## 样式系统

### TailwindCSS 配置

```javascript
// tailwind.config.js
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {}
  },
  plugins: []
}
```

### 节点颜色方案

| 类别 | 节点 | 颜色 |
|------|------|------|
| **Data** | Scalar | `#0891b2` (青色) |
| | Vector | `#059669` (绿色) |
| | Matrix | `#7c3aed` (紫色) |
| | Tensor | `#dc2626` (红色) |
| **Operators** | Linear | `#2563eb` (蓝色) |
| | Embedding | `#0e7490` (深青) |
| | Activation | `#ea580c` (橙色) |
| | Norm | `#ca8a04` (黄色) |
| | Concat | `#0d9488` (青绿) |
| | Split | `#db2777` (粉色) |
| | ElementWise | `#4f46e5` (靛蓝) |
| | EinSum | `#64748b` (灰色) |
| | Reshape | `#8b5cf6` (紫色) |
| | Transpose | `#ec4899` (亮粉) |
| | MatMul | `#f97316` (橙色) |
| | Softmax | `#14b8a6` (青色) |
| | Custom | `#78716c` (石色) |
| **Annotations** | Rect | `#94a3b8` (浅灰蓝) |
| | Text | `#a1a1aa` (灰色) |

### 填充图案

| 图案 | 值 | 描述 |
|------|------|------|
| 无 | `none` | 无图案 |
| 条纹 | `stripes` | 45° 斜线条纹 |
| 网格 | `grid` | 正交网格线 |
| 点阵 | `dots` | 均匀圆点 |
| 交叉 | `crosshatch` | 对角交叉线 |

---

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 启动后端 API（自动检测 FastAPI，回退到内置服务器）
npm run api
# 或
python3 backend/run_api.py

# 指定端口启动
PLAYLLM_PORT=3210 npm run api

# 构建生产版本
npm run build

# 预览生产版本
npm run preview

# 代码检查
npm run lint
```

---

## 扩展开发

### 添加新的 Operator

1. 在 `src/nodes/` 创建新文件，如 `myop.ts`：

```typescript
import { Node, TensorSpec, ValidationError, Shape } from '../types'

export const createMyOpNode = (
  id: string,
  position: { x: number; y: number },
  inputShape: Shape = ['B', 'N', 'H']
): Node => {
  const inputTensor: TensorSpec = { shape: [...inputShape], dtype: 'float32' }
  const outputTensor: TensorSpec = { shape: [...inputShape], dtype: 'float32' }

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'MyOp',
      nodeType: 'MyOp',
      inputs: [{ id: 'in', name: 'in', type: 'input', tensor: inputTensor }],
      outputs: [{ id: 'out', name: 'out', type: 'output', tensor: outputTensor }],
      params: {}
    },
    runtime: {
      infer: (inputs: TensorSpec[]) => inputs.length > 0 ? [inputs[0]] : [{ shape: ['?'], dtype: 'float32' }],
      validate: (inputs: TensorSpec[]) => {
        const errors: ValidationError[] = []
        if (inputs.length === 0) {
          errors.push({ level: 'error', message: 'MyOp requires at least one input' })
        }
        return errors
      }
    }
  }
}
```

2. 在 `src/nodes/index.ts` 注册：

```typescript
import { createMyOpNode } from './myop'

export const nodeCreators = {
  ...
  'MyOp': createMyOpNode,
}

export const nodeCategories = {
  'Operators': [..., 'MyOp'],
}

export const nodeColorMap = {
  ...
  'MyOp': '#ff6b6b',
}
```

3. 在 `src/nodes/index.ts` 的 `getNodeConfig` 中添加配置：

```typescript
'MyOp': { label: 'MyOp', nodeType: 'MyOp', defaultParams: {}, defaultInputShape: ['B', 'N', 'H'] },
```

4. 在 `createNodeFromSnapshot` 的 `switch` 中添加反序列化支持。

### 添加新的属性编辑器

在 `src/components/NodeProperties.tsx` 中添加：

```tsx
{nodeType === 'MyOp' && (
  <div className="mb-3 p-2 bg-white rounded border border-gray-200">
    <div className="text-xs font-medium text-gray-700 mb-1.5">MyOp Properties</div>
    {/* 添加属性编辑控件 */}
  </div>
)}
```

---

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         App.tsx                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ NodeLibrary  │  │ GraphEditor  │  │NodeProperties│       │
│  │  (左侧栏)    │  │   (画布)     │  │  (右侧栏)    │       │
│  │  - User      │  │  - 拖放      │  │  - Name      │       │
│  │  - Documents │  │  - 连线      │  │  - Params    │       │
│  │  - Operators │  │  - 剪贴板    │  │  - Ports     │       │
│  │  - Data      │  │  - 文件操作  │  │  - Style     │       │
│  │  - Annotation│  │  - 工作区同步│  │              │       │
│  └──────────────┘  └──────────────┘  ├──────────────┤       │
│                                     │EdgeProperties│       │
│                                     │  (连线属性)  │       │
│                                     └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Zustand Stores                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ graphStore   │  │  uiStore     │  │workspaceStore│       │
│  │  (图数据)    │  │  (UI状态)    │  │ (工作区)     │       │
│  │  - Shape推导 │  │  - 侧栏折叠  │  │  - 用户/文档 │       │
│  │  - 错误验证  │  │              │  │  - 草稿/脏标 │       │
│  │  - 自定义算子│  │              │  │  - 服务器同步│       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Nodes Layer                             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │Linear  │ │Activ.  │ │Norm    │ │Concat  │ │Embed.  │    │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │Split   │ │ElemWise│ │EinSum  │ │Reshape │ │Transp. │    │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │MatMul  │ │Softmax │ │Add     │ │Custom  │ │Scalar  │    │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │
│  ┌────────┐ ┌────────┐ ┌────────┐                            │
│  │Vector  │ │Matrix  │ │Tensor  │                            │
│  └────────┘ └────────┘ └────────┘                            │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend API                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Python (builtin / FastAPI) / Node.js HTTP            │  │
│  │  - 用户管理                                            │  │
│  │  - 图 CRUD（含 PUT 更新）                              │  │
│  │  - 原子写入 + 缓存                                     │  │
│  │  - 静态文件服务 (Node.js)                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 版本历史

- **v1.0.0** - 初始版本
  - 基本图编辑功能
  - 节点拖拽和连接
  - Shape 推导
  - 后端 API

- **v1.1.0** - 功能增强
  - 新增节点：MatMul, Softmax, Transpose, Embedding, Add (残差连接)
  - LayerNorm 重命名为 Norm
  - 自定义算子（Custom Operator）支持
  - 符号化默认 Shape（B, N, H, K）
  - LaTeX 公式渲染（节点标签、端口名）
  - 填充图案系统（stripes, grid, dots, crosshatch）
  - 剪贴板复制粘贴（Ctrl+C/V）
  - 文件导入/导出（Import/Download）
  - 工作区管理（草稿、脏标记、服务器同步）
  - 文档管理面板（加载、重命名、复制、删除）
  - 端口名称和 Shape 可编辑
  - 连线箭头类型和大小可配置
  - Rect 节点可调整大小（8 方向手柄）
  - 后端 API 新增 PUT 端点、用户列表端点
  - 画布文档版本升级至 v2（兼容 v1）
  - Node.js 服务器新增静态文件服务

- **v1.2.0** - Bug 修复与功能完善
  - EinSum 改进：支持无空格表达式（如 `bshd,bthd->bsht`），属性面板编辑 expression 时自动触发 shape 推导
  - ElementWise 广播修复：相同 shape 输入不再误报 "shapes are not broadcastable"
  - Split 增强：新增 `axis` 参数，自动计算另一输出维度
  - Linear 输出 shape 保持：修改输出 shape 时同步更新 `out_features` 参数
  - Reshape 输出 shape 保持：使用 `params.target_shape` 而非存储的输出 shape
  - Custom 输出 shape 保持：分离 Custom 节点处理逻辑，避免被重置为输入 shape
  - 节点高度统一：Linear 与 Custom Operator 默认高度一致（64px）
  - 后端 API 性能优化：添加缓存、keep-alive headers、启动时初始化存储
  - 文件管理改进：移除冗余 "Current" 标签，修复橙色圆点仅在内容变更时显示

---

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 许可证

MIT License
