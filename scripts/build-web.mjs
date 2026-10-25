// ─── npm run build:web ───
// Versión web estática en dist-web/ (para GitHub Pages o cualquier hosting de ficheros): la app sin servidor.
// La API la sirve un service worker (web/sw.js) que ejecuta server/api.mjs en el navegador sobre la carpeta
// que elige el usuario. No lleva datos de nadie: ni reportes, ni notas, ni los *.local.js; solo los datos de ejemplo.
//
//   npm run build:web                              → base «/»
//   npm run build:web -- --base playboard-report  → para https://<usuario>.github.io/playboard-report/
//     (sin barra inicial: Git Bash convierte «/playboard-report/» en una ruta de Windows)
//   (también PLAYBOARD_WEB_BASE=playboard-report, por si los argumentos no llegan desde PowerShell)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build as viteBuild } from 'vite'
import { rolldown } from 'rolldown'
import { strToU8, zipSync } from 'fflate'
import { DEMO_DIR, generateDemo } from './generate-demo.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'dist-web')
const argBase = process.argv.indexOf('--base')
let base = (argBase > 0 ? process.argv[argBase + 1] : process.env.PLAYBOARD_WEB_BASE) || '/'
if (!base.startsWith('/')) base = '/' + base
if (!base.endsWith('/')) base += '/'

// 1. La app, como siempre, pero en modo web y sin la configuración local (*.local.js)
process.env.VITE_PLAYBOARD_WEB = '1'
process.env.VITE_PLAYBOARD_NO_LOCAL = '1'
await viteBuild({ root: ROOT, base, logLevel: 'warn', build: { outDir: OUT, emptyOutDir: true } })

// 2. El service worker: server/api.mjs y la ingesta tal cual; node:fs, node:path y node:url se cambian por los de web/shims/
const shims = { 'node:fs': 'fs.js', 'node:path': 'path.js', 'node:url': 'url.js' }
const sw = await rolldown({
  input: path.join(ROOT, 'web', 'sw.js'),
  platform: 'browser',
  logLevel: 'warn',
  plugins: [{ name: 'node-shims', resolveId: (id) => (shims[id] ? path.join(ROOT, 'web', 'shims', shims[id]) : null) }],
  transform: { define: { 'import.meta': '{}' } },
})
await sw.write({
  file: path.join(OUT, 'sw.js'),
  format: 'iife',
  // La ingesta usa process.env y Buffer.from(base64); PLAYBOARD_ROOT fija sus rutas en /data (ver web/sw.js)
  banner: [
    "var process = { env: { PLAYBOARD_ROOT: '/data' }, argv: [] };",
    "var Buffer = { from(s, enc) { if (enc !== 'base64') throw new Error('Buffer: solo base64'); const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u } };",
  ].join('\n'),
})
await sw.close()

// 3. Visor de trazas de Playwright (Apache-2.0, con su licencia): el que va dentro de cada reporte necesita un servidor
const pwCore = path.join(ROOT, 'node_modules', 'playwright-core')
fs.cpSync(path.join(pwCore, 'lib', 'vite', 'traceViewer'), path.join(OUT, 'trace-viewer'), { recursive: true })
for (const f of ['LICENSE', 'NOTICE']) fs.copyFileSync(path.join(pwCore, f), path.join(OUT, 'trace-viewer', f))

// 4. Datos de ejemplo (los de npm run demo) para «Ver con datos de ejemplo»: reportes, environments/reviews.json y notas
if (!fs.existsSync(DEMO_DIR)) generateDemo({ log: () => {} })
const demo = {}
const addDir = (dir, rel) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = `${rel}/${e.name}`
    if (e.isDirectory()) addDir(path.join(dir, e.name), r)
    else demo[r] = fs.readFileSync(path.join(dir, e.name))
  }
}
addDir(path.join(DEMO_DIR, 'reports', 'playwright-reports'), 'reports/playwright-reports')
for (const f of fs.readdirSync(path.join(DEMO_DIR, 'reports'))) {
  if (f.endsWith('.json')) demo[`reports/${f}`] = fs.readFileSync(path.join(DEMO_DIR, 'reports', f))
}
addDir(path.join(DEMO_DIR, 'notes'), 'notes')
fs.writeFileSync(path.join(OUT, 'demo.zip'), zipSync(demo))

// 5. GitHub Pages: 404.html = la app (un enlace directo a /calendario la abre aunque aún no haya service worker)
//    y .nojekyll para que sirva los ficheros tal cual
fs.copyFileSync(path.join(OUT, 'index.html'), path.join(OUT, '404.html'))
fs.writeFileSync(path.join(OUT, '.nojekyll'), strToU8(''))

const size = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1)
console.log(`[web] dist-web/ listo (base ${base}) · demo.zip ${size(path.join(OUT, 'demo.zip'))} MB`)
