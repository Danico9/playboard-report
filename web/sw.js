// ─── Versión web: la API de playboard dentro del navegador ───
// Service worker que responde a <base>/api/* y <base>/reports/** como lo hace el servidor de Node, pero leyendo la
// carpeta que ha elegido el usuario (File System Access API). Ejecuta el código real de server/api.mjs y de la
// ingesta: solo cambia node:fs por un sistema de ficheros en memoria (shims/fs.js) que se carga de esa carpeta,
// con la caché (lo que en la app normal es .cache/data) en el almacenamiento privado del navegador (OPFS).

import * as vfs from './shims/fs.js'
import { createApi, MIME } from '../server/api.mjs'
import { extractZip } from '../scripts/ingest-reports.mjs'
import { cacheName, getRoot, resolveFolders, rootDirectory } from './folder.js'

const ROOT = '/data' // rutas «de disco» que ve el código del servidor (PLAYBOARD_ROOT, ver scripts/build-web.mjs)
const BASE = new URL(self.registration.scope).pathname // «/» o «/playboard-report/» en GitHub Pages
let state = null // { api, timings, logs } de la carga actual
let loading = null

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

class NeedsFolder extends Error {}

async function folders() {
  const root = await getRoot()
  const dir = await rootDirectory(root)
  if (!dir) throw new NeedsFolder(root ? 'sin permiso para la carpeta' : 'no hay carpeta elegida')
  const found = await resolveFolders(dir)
  if (!found) throw new NeedsFolder('la carpeta elegida no tiene reportes')
  return { root, ...found }
}

async function boot() {
  const t = { start: performance.now() }
  const logs = []
  const log = (m) => logs.push(m)
  const { root, reports, notes } = await folders()
  const cache = await (await navigator.storage.getDirectory()).getDirectoryHandle(cacheName(root), { create: true })

  vfs.reset()
  vfs.mount(`${ROOT}/reports`, reports)
  if (notes) vfs.mount(`${ROOT}/notes`, notes)
  vfs.mount(`${ROOT}/.cache`, cache)

  // reports/: los .json de la raíz y solo el index.html de cada reporte (los adjuntos se sirven aparte, al pedirlos)
  await vfs.load(`${ROOT}/reports`, (rel, kind) => {
    const parts = rel.split('/')
    if (parts.length === 1) return kind === 'file' ? (rel.endsWith('.json') ? 'content' : 'skip') : rel === 'playwright-reports' ? 'stat' : 'skip'
    if (parts[0] !== 'playwright-reports') return 'skip'
    if (parts.length === 2) return kind === 'directory' ? 'stat' : 'skip'
    return parts.length === 3 && parts[2] === 'index.html' ? 'stat' : 'skip'
  })
  if (notes) await vfs.load(`${ROOT}/notes`, (rel, kind) => (kind === 'directory' || rel.toLowerCase().endsWith('.md') ? 'content' : 'skip'))
  await vfs.load(`${ROOT}/.cache`)
  t.read = performance.now()

  // Solo se leen los index.html nuevos o cambiados (la misma marca tamaño:fecha que usa la ingesta)
  const runsDir = `${ROOT}/reports/playwright-reports`
  const ids = vfs.existsSync(runsDir) ? vfs.readdirSync(runsDir).filter((id) => vfs.existsSync(`${runsDir}/${id}/index.html`)) : []
  let manifest = {}
  try { manifest = JSON.parse(vfs.readFileSync(`${ROOT}/.cache/data/manifest.json`, 'utf8')) } catch { /* primera vez */ }
  const stale = ids.filter((id) => {
    const st = vfs.statSync(`${runsDir}/${id}/index.html`)
    return manifest.runs?.[id] !== `${st.size}:${Math.round(st.mtimeMs)}`
  })
  for (const id of stale) await vfs.loadContent(`${runsDir}/${id}/index.html`)

  const api = createApi({ log })
  await api.runIngest()
  // Si cambió el formato de la caché la ingesta necesita todos los index.html: se cargan y se repite
  if (logs.some((l) => l.includes('no cargado'))) {
    logs.length = 0
    for (const id of ids) await vfs.loadContent(`${runsDir}/${id}/index.html`)
    await api.runIngest()
    stale.splice(0, stale.length, ...ids)
  }
  await vfs.flush()
  vfs.dropContents(`${runsDir}/`) // los index.html ya procesados no hacen falta en memoria
  const timings = { runs: ids.length, parsed: stale.length, readMs: Math.round(t.read - t.start), totalMs: Math.round(performance.now() - t.start) }
  return { api, timings, logs }
}

function ensureState() {
  if (state) return Promise.resolve(state)
  loading ??= boot()
    .then((s) => (state = s))
    .finally(() => { loading = null })
  return loading
}

// Adapta Request/Response de la web a los req/res de Node que espera el middleware de server/api.mjs
async function runMiddleware(request, path) {
  const url = new URL(request.url)
  const body = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text()
  const handlers = {}
  const req = {
    url: path + url.search,
    method: request.method,
    headers: Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v])),
    on(event, cb) {
      handlers[event] = cb
      if (event === 'end') queueMicrotask(() => { if (body) handlers.data?.(body); cb() })
      return req
    },
  }
  return new Promise((resolve, reject) => {
    const headers = new Headers()
    const chunks = []
    const res = {
      statusCode: 200,
      setHeader: (k, v) => headers.set(k, String(v)),
      writeHead(code, h = {}) { res.statusCode = code; for (const [k, v] of Object.entries(h)) headers.set(k, String(v)) },
      write: (c) => chunks.push(c),
      end(c) {
        if (c != null) chunks.push(c)
        resolve(new Response(new Blob(chunks), { status: res.statusCode, headers }))
      },
    }
    state.api.middleware(req, res, () => resolve(new Response('No encontrado', { status: 404 }))).catch(reject)
  })
}

// reports/**: se leen directamente de la carpeta (capturas, vídeos con Range, el reporte original…)
async function serveReportFile(request, rel) {
  const parts = decodeURIComponent(rel).split('/').filter(Boolean)
  if (!parts.length || parts.some((p) => p === '..' || p === '.')) return new Response('Petición no permitida', { status: 403 })
  let dir = (await folders()).reports
  try {
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
    const file = await (await dir.getFileHandle(parts.at(-1))).getFile()
    const ext = parts.at(-1).match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? ''
    const type = MIME[ext] ?? 'application/octet-stream'
    const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, file.size - Number(m[2]))
      const end = m[1] && m[2] ? Math.min(Number(m[2]), file.size - 1) : file.size - 1
      if (start > end || start >= file.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } })
      return new Response(file.slice(start, end + 1), {
        status: 206,
        headers: { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${file.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) },
      })
    }
    return new Response(file, { headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(file.size) } })
  } catch {
    return new Response('No encontrado', { status: 404 })
  }
}

// Un zip elegido en el navegador: sus reportes se descomprimen en reports/playwright-reports/ de la carpeta del usuario
// (solo se añaden carpetas nuevas; el zip no se toca). Después se vuelve a leer la carpeta para que entren en el dashboard.
async function importZip(request) {
  if (request.method !== 'POST' || request.headers.get('x-playboard') !== '1') return new Response('Petición no permitida', { status: 403 })
  const name = new URL(request.url).searchParams.get('name') || 'zip'
  await ensureState()
  const logs = []
  let result
  try {
    result = extractZip(name, new Uint8Array(await request.arrayBuffer()), (m) => logs.push(m))
    await vfs.flush()
  } catch (e) {
    result = { file: name, kind: 'zip', error: e.message, imported: [], alreadyImported: [], failed: [] }
  }
  state = null // la siguiente petición vuelve a cargar la carpeta y procesa los reportes nuevos
  return json({ ...result, kind: 'upload' })
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })

async function handle(request, path) {
  try {
    // Sin avisos en vivo: 204 hace que EventSource no vuelva a intentarlo (la app web no lo abre, por si acaso)
    if (path === '/api/events') return new Response(null, { status: 204 })
    // Vuelve a leer la carpeta (botón «Recargar datos» y al elegir carpeta)
    if (path === '/api/web/reload') {
      state = null
      await ensureState()
      return json(state.timings)
    }
    // La lista de «Importar» (zips y carpetas sueltas en reports/) es de la app de escritorio, que los mueve y borra.
    // En la web el usuario elige los zips en el navegador y se suben de uno en uno a /api/web/import-zip
    if (path === '/api/zips') return json([])
    if (path === '/api/zips/import') return new Response('En la versión web los zips se importan con /api/web/import-zip', { status: 501 })
    if (path === '/api/web/import-zip') return await importZip(request)
    if (path.startsWith('/reports/')) return await serveReportFile(request, path.slice('/reports/'.length))
    await ensureState()
    const res = await runMiddleware(request, path)
    await vfs.flush()
    return res
  } catch (e) {
    if (e instanceof NeedsFolder) return json({ needsFolder: true, error: e.message }, 409)
    return new Response(String(e.stack ?? e.message), { status: 500 })
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return
  const path = '/' + url.pathname.slice(BASE.length)
  if (path.startsWith('/api/') || path.startsWith('/reports/')) {
    event.respondWith(handle(event.request, path))
    return
  }
  // Rutas de la app (/calendario, /ejecucion/…): siempre el index.html, sin depender del servidor (GitHub Pages da 404)
  if (event.request.mode === 'navigate' && !/\.[a-z0-9]+$/i.test(path) && !path.startsWith('/trace-viewer/')) {
    event.respondWith(fetch(BASE + 'index.html'))
  }
})
