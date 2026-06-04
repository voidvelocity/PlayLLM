import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const frontendPort = parseInt(process.env.PLAYLLM_FRONTEND_PORT || '3000')
const backendHost = process.env.PLAYLLM_HOST || '127.0.0.1'
const backendPort = parseInt(process.env.PLAYLLM_PORT || '3001')

export default defineConfig({
  plugins: [react()],
  server: {
    port: frontendPort,
    host: true,
    proxy: {
      '/api': {
        target: `http://${backendHost}:${backendPort}`,
        changeOrigin: true
      }
    }
  }
})
