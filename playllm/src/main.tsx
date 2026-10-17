import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'reactflow/dist/style.css'
import { ReactFlowProvider } from 'reactflow'
import { clearBrowserAssetCaches } from './utils/runtimeCache'

const renderApp = () => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </React.StrictMode>,
  )
}

void clearBrowserAssetCaches().finally(renderApp)
