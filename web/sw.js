// ─── Versión web: la API de playboard dentro del navegador ───
// Service worker que responde a <base>/api/* y <base>/reports/** como lo hace el servidor de Node, pero leyendo la
// carpeta que ha elegido el usuario (File System Access API). Ejecuta el código real de server/api.mjs y de la
// ingesta: solo cambia node:fs por un sistema de ficheros en memoria (shims/fs.js) que se carga de esa carpeta,
// con la caché (lo que en la app normal es .cache/data) en el almacenamiento privado del navegador (OPFS).

import * as vfs from './shims/fs.js'
import { createApi, MIME } from '../server/api.mjs'
import { cacheName, getRoot, resolveFolders, rootDirectory } from './folder.js'

const ROOT = '/data' // rutas «de disco» que ve el código del servidor (PLAYBOARD_ROOT, ver scripts/build-web.mjs)
const REPORTS = `${ROOT}/reports`
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

  // reports/: los .json de la raíz, solo el index.html de cada reporte (los adjuntos se sirven aparte, al pedirlos)
  // y, para «Importar», los zips y carpetas sueltas
  await vfs.load(REPORTS, (rel, kind) => {
    const parts = rel.split('/')
    if (parts[0] !== 'playwright-reports') return parts.length === 1 && kind === 'file' && rel.endsWith('.json') ? 'content' : looseEntry(rel, kind)
    if (parts.length === 1) return 'stat'
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

// Zips y carpetas sueltas de reports/ (lo que lista «Importar»): de los zips basta con el tamaño y la fecha (se leen
// al listarlos o importarlos); de las carpetas, todos sus ficheros, porque al importarlas se mueven, y el index.html entero
function looseEntry(rel, kind) {
  const parts = rel.split('/')
  if (parts.some((p) => p.startsWith('.'))) return 'skip'
  if (parts.length === 1 && kind === 'file') return rel.toLowerCase().endsWith('.zip') ? 'stat' : 'skip'
  return kind === 'file' && parts.at(-1) === 'index.html' ? 'content' : 'stat'
}

const isLoose = (name) => name !== 'playwright-reports' && !name.endsWith('.json')

// Sin avisos del disco: antes de listar o importar se vuelve a mirar qué hay suelto en reports/ y se leen los zips
async function loadLoose() {
  for (const name of vfs.readdirSync(REPORTS)) if (isLoose(name)) vfs.forget(`${REPORTS}/${name}`)
  await vfs.load(REPORTS, (rel, kind) => (isLoose(rel.split('/')[0]) ? looseEntry(rel, kind) : 'skip'))
  for (const name of vfs.readdirSync(REPORTS)) if (name.toLowerCase().endsWith('.zip')) await vfs.loadContent(`${REPORTS}/${name}`)
}

// «Añadir zips»: el zip elegido en el navegador se copia en reports/ y aparece en «Importar» como los demás
async function addZip(request) {
  const name = new URL(request.url).searchParams.get('name') ?? ''
  if (request.method !== 'POST' || request.headers.get('x-playboard') !== '1' || !/^[^/\\]+\.zip$/i.test(name) || name.startsWith('.')) {
    return new Response('Petición no permitida', { status: 403 })
  }
  const { reports } = await folders()
  // Si ya hay uno con ese nombre se guarda como «nombre (2).zip»
  const exists = (n) => reports.getFileHandle(n).then(() => true, () => false)
  let target = name
  for (let n = 2; await exists(target); n++) target = name.replace(/\.zip$/i, ` (${n}).zip`)
  const w = await (await reports.getFileHandle(target, { create: true })).createWritable()
  await w.write(await request.blob())
  await w.close()
  return json({ name: target })
}

// Las rutas de /api/info son las de dentro del service worker (/data/…): se muestran con el nombre de la carpeta elegida
async function folderLabels() {
  const { root, reports, notes } = await folders()
  const dir = await rootDirectory(root)
  const base = (await dir.isSameEntry(reports)) ? dir.name : `${dir.name}/reports`
  return { reportsDir: base, runsDir: `${base}/playwright-reports`, notesDir: notes ? `${dir.name}/notes` : null }
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

// Los reportes y sus adjuntos (HTML, SVG…) pueden venir de otros: se abren en un origen aislado (CSP sandbox) para que
// su JavaScript no comparta el de la app ni llegue al permiso sobre la carpeta (IndexedDB/OPFS). A capturas y vídeos
// dentro de la app no les afecta. El visor de trazas de la web es el publicado (trace-viewer/), no el del reporte.
const ISOLATED = {
  'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads allow-forms allow-modals',
  'X-Content-Type-Options': 'nosniff',
}

// Un documento aislado no puede usar localStorage (el reporte de Playwright lo usa y se quedaría en blanco):
// a cada HTML se le añade delante uno en memoria, que solo dura mientras está abierta la pestaña. Playwright guarda ahí
// su tema y «Merge files»: el tema se toma de ?theme= (lo pone la app, ver originalReportUrl) y, si no, oscuro.
const STORAGE_SHIM = `<script>(() => {
  try { localStorage } catch {
    // Playwright lee y escribe localStorage[clave]: los datos son propiedades y los métodos van en el prototipo
    const memory = () => Object.create({
      get length() { return Object.keys(this).length },
      key(i) { return Object.keys(this)[i] ?? null },
      getItem(k) { return Object.hasOwn(this, k) ? this[k] : null },
      setItem(k, v) { this[k] = String(v) },
      removeItem(k) { delete this[k] },
      clear() { for (const k of Object.keys(this)) delete this[k] },
    })
    for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, { value: memory(), configurable: true })
    localStorage.theme = new URLSearchParams(location.search).get('theme') === 'light' ? 'light-mode' : 'dark-mode'
  }
})()</script>`

// El visor de trazas que va dentro de cada reporte (trace/index.html) no funciona aislado (scripts de módulo y su propio
// service worker): el enlace «View trace» del reporte abre en su lugar esta página de la app, que carga la traza
// (solo de reports/) en el visor publicado (trace-viewer/), igual que «Abrir trace» (openTraceViewer en src/lib/webMode.js)
const traceLauncher = () => new Response(`<!doctype html>
<html><head><meta charset="utf-8"><title>Playwright Trace Viewer</title>
<style>html, body, iframe { margin: 0; width: 100%; height: 100%; border: 0; display: block }</style></head>
<body><iframe id="viewer" src="${BASE}trace-viewer/index.html"></iframe>
<script>(() => {
  const param = new URLSearchParams(location.search).get('trace')
  const url = param && new URL(param, location.href)
  if (!url || url.origin !== location.origin || !url.pathname.startsWith(${JSON.stringify(BASE + 'reports/')})) return
  const viewer = document.getElementById('viewer')
  let blob = null
  let ready = false
  const send = () => { if (blob && ready) viewer.contentWindow.postMessage({ method: 'load', params: { trace: blob } }, location.origin) }
  addEventListener('message', (e) => {
    if (e.source === viewer.contentWindow && e.data?.method === 'ready') { ready = true; send() }
  })
  fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then((b) => { blob = b; send() })
})()</script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })

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
        headers: { ...ISOLATED, 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${file.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) },
      })
    }
    if (ext === '.html' || ext === '.htm') return new Response(STORAGE_SHIM + (await file.text()), { headers: { ...ISOLATED, 'Content-Type': type } })
    return new Response(file, { headers: { ...ISOLATED, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(file.size) } })
  } catch {
    return new Response('No encontrado', { status: 404 })
  }
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
    if (path === '/api/web/add-zip') return await addZip(request)
    if (/^\/reports\/.+\/trace\/index\.html$/.test(path)) return traceLauncher()
    if (path.startsWith('/reports/')) return await serveReportFile(request, path.slice('/reports/'.length))
    await ensureState()
    if (path === '/api/info') return json({ ...(await (await runMiddleware(request, path)).json()), ...(await folderLabels()) })
    // «Importar», igual que en la app de escritorio: lista y procesa los zips y carpetas sueltas de reports/
    const importing = path === '/api/zips/import'
    if (path === '/api/zips' || importing) await loadLoose()
    const res = await runMiddleware(request, path)
    await vfs.flush()
    vfs.dropContents(`${REPORTS}/`)
    // Tras importar se han movido y borrado ficheros: la siguiente petición vuelve a leer la carpeta
    if (importing) state = null
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
