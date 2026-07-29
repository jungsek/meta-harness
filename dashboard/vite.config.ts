import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    // The API lives in server/index.mjs on 4711 so it can import the CLI's own
    // ESM modules with no bundler in the way.
    proxy: { '/api': { target: 'http://127.0.0.1:4711', changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: true },
})
