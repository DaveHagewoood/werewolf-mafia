import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // Allow external connections
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'werewolf-host.serveo.net' // Allow Serveo host domain
    ]
  },
  resolve: {
    alias: {
      '@werewolf-mafia/shared': path.resolve(__dirname, '../../packages/shared/index.js')
    }
  }
}) 