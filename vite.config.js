import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import playboard from './plugins/vite-plugin-playboard.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), playboard()],
  // App local: un único bundle es más sencillo de servir e incrustar en el ejecutable
  build: { chunkSizeWarningLimit: 2000 },
})
