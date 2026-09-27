import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import playboard from './plugins/vite-plugin-playboard.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), playboard()],
})
