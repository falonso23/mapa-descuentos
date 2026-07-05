import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Sirve en https://falonso23.github.io/mapa-descuentos/ (GitHub Pages de un repo de
  // proyecto, no de user/org page) — sin esto, los assets se piden desde la raíz y rompen.
  base: '/mapa-descuentos/',
})
