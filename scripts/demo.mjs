// ─── npm run demo ───
// Arranca la app con los datos inventados de .demo/ (los genera si no existen; --fresh los regenera).
// Usa su propia caché (.cache/data-demo) y el puerto 5174, así que no interfiere con tus datos reales.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.env.PLAYBOARD_DATA_DIR = '.demo'
process.env.VITE_PLAYBOARD_DEMO = '1'
// La demo siempre se muestra en la misma zona horaria, para que las capturas sean reproducibles
process.env.PLAYBOARD_TZ ??= 'Europe/Madrid'

const { generateDemo, DEMO_DIR } = await import('./generate-demo.mjs')
if (process.argv.includes('--fresh') || !fs.existsSync(DEMO_DIR)) {
  fs.rmSync(path.join(ROOT, '.cache', 'data-demo'), { recursive: true, force: true })
  generateDemo()
}

const { createServer } = await import('vite')
const server = await createServer({ root: ROOT, server: { port: 5174 } })
await server.listen()
server.printUrls()
