import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  server: { port: 5173, proxy: { '/history-api': 'http://127.0.0.1:3102' } },
  preview: { proxy: { '/history-api': 'http://127.0.0.1:3102' } }
})
