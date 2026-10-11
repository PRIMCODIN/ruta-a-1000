import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sirve el sitio en /<repo>/. Cambia VITE_BASE si usas otro dominio.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/ruta-a-1000/',
  plugins: [react()],
})
