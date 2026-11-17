import { copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// MapLibre GL resolves its web worker at runtime via
// new URL('./maplibre-gl-worker.mjs', import.meta.url), which Vite cannot
// statically analyze, so the worker is never emitted. Copy it next to the
// bundle so the map works fully offline from locally hosted assets.
function copyMaplibreWorker() {
  return {
    name: 'copy-maplibre-worker',
    closeBundle() {
      const src = path.resolve(__dirname, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')
      const dest = path.resolve(__dirname, 'dist/assets/maplibre-gl-worker.mjs')
      copyFileSync(src, dest)
      console.log(`\ncopied maplibre web worker -> ${dest}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyMaplibreWorker()],
})
