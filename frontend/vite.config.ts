/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const api = env.VITE_API_PROXY || 'http://127.0.0.1:8100'
  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: {
      port: 5173,
      // Same-origin proxy: the HttpOnly refresh cookie (SameSite=Strict) works without CORS.
      proxy: { '/api': { target: api, changeOrigin: false } },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 900 },
    test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
  }
})
