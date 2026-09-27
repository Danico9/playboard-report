// ─── API local de reportes y notas ───
// La comparten el plugin de Vite (npm run dev) y el servidor del ejecutable (server/standalone.mjs).
// Los cambios en reports/ y notes/ se avisan al navegador con Server-Sent Events (/api/events).

import fs from 'node:fs'
import path from 'node:path'
import GithubSlugger from 'github-slugger'
import { ingest, importFolder, importZip, listFolders, listZips, CACHE_DIR, NOTES_DIR, REPORTS_DIR, RUNS_DIR, TIME_ZONE } from '../scripts/ingest-reports.mjs'

export { NOTES_DIR, REPORTS_DIR }

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webm': 'video/webm', '.zip': 'application/zip',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
}

function safeJoin(base, rel) {
  const p = path.resolve(base, '.' + path.sep + decodeURIComponent(rel))
  return p === base || p.startsWith(base + path.sep) ? p : null
}

function sendFile(res, file) {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404
    return res.end('No encontrado')
  }
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function sendJson(res, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(typeof data === 'string' ? data : JSON.stringify(data))
}

// ─── Notas ───

function listNotes(dir = NOTES_DIR, rel = '') {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...listNotes(path.join(dir, entry.name), r))
    else if (entry.name.toLowerCase().endsWith('.md')) out.push(r)
  }
  return out
}

function stripInline(text) {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]/g, '')
    .trim()
}

function headingsOf(content) {
  const slugger = new GithubSlugger()
  const headings = []
  let inCode = false
  for (const line of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode
    if (inCode) continue
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (m) {
      const text = stripInline(m[2])
      headings.push({ level: m[1].length, text, slug: slugger.slug(text) })
    }
  }
  return headings
}

function notesIndex() {
  return listNotes().map((rel) => {
    const file = path.join(NOTES_DIR, rel)
    const content = fs.readFileSync(file, 'utf8')
    const st = fs.statSync(file)
    const headings = headingsOf(content)
    const h1 = headings.find((h) => h.level === 1)
    return { path: rel, title: h1?.text ?? null, size: st.size, mtime: st.mtimeMs, headings }
  })
}

function searchNotes(query) {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const results = []
  for (const rel of listNotes()) {
    const content = fs.readFileSync(path.join(NOTES_DIR, rel), 'utf8')
    const slugger = new GithubSlugger()
    let heading = null
    let inCode = false
    const matches = []
    for (const [i, line] of content.split('\n').entries()) {
      if (/^\s*(```|~~~)/.test(line)) inCode = !inCode
      const hm = !inCode && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
      if (hm) {
        const text = stripInline(hm[2])
        heading = { text, slug: slugger.slug(text) }
      }
      if (line.toLowerCase().includes(q)) {
        matches.push({ line: i + 1, text: line.trim().slice(0, 240), heading })
        if (matches.length >= 20) break
      }
    }
    if (matches.length) results.push({ path: rel, count: matches.length, matches })
  }
  return results.sort((a, b) => b.count - a.count).slice(0, 60)
}

// ─── API ───

export function createApi({ log = console.log } = {}) {
  let summaryCache = null
  let running = false
  let lastEnd = 0
  let timer = null
  let zipTimer = null
  const clients = new Set()

  const notify = (event) => {
    for (const res of clients) res.write(`event: ${event}\ndata: {}\n\n`)
  }

  const runIngest = async () => {
    if (running) return
    running = true
    try {
      summaryCache = JSON.stringify(ingest({ log }))
    } catch (e) {
      log(`[ingest] Error: ${e.stack ?? e.message}`)
    } finally {
      running = false
      lastEnd = Date.now()
    }
  }

  // Recibe los cambios de ficheros (watcher de Vite o fs.watch) con rutas absolutas
  const handleFsEvent = (event, file) => {
    const abs = path.resolve(file)
    if (abs.startsWith(NOTES_DIR + path.sep) && abs.endsWith('.md')) {
      notify('playboard:notes')
      return
    }
    if (abs.startsWith(REPORTS_DIR + path.sep) && abs !== RUNS_DIR && !abs.startsWith(RUNS_DIR + path.sep)) {
      // Zips o carpetas sueltas en reports/: espera a que termine la copia antes de avisar a la pantalla «Importar»
      clearTimeout(zipTimer)
      zipTimer = setTimeout(() => notify('playboard:zips'), 1500)
      return
    }
    // Ignora los eventos que genera la propia ingesta al descomprimir zips
    if (!abs.startsWith(REPORTS_DIR + path.sep) || running || Date.now() - lastEnd < 2000) return
    const isReportIndex = /[\\/]playwright-reports[\\/][^\\/]+[\\/]index\.html$/.test(abs)
    const runFolderChanged = path.dirname(abs) === RUNS_DIR
    if (!isReportIndex && !runFolderChanged && event !== 'unlinkDir') return
    clearTimeout(timer)
    timer = setTimeout(async () => {
      await runIngest()
      notify('playboard:data')
      notify('playboard:zips')
    }, 3000)
  }

  const middleware = async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost')
    const p = url.pathname
    try {
      if (p === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        res.write(': conectado\n\n')
        clients.add(res)
        const ping = setInterval(() => res.write(': ping\n\n'), 25000)
        req.on('close', () => {
          clearInterval(ping)
          clients.delete(res)
        })
        return
      }
      if (p === '/api/summary') {
        if (!summaryCache) await runIngest()
        return sendJson(res, summaryCache ?? '{"runs":[],"tests":{},"results":{},"signatures":[]}')
      }
      if (p.startsWith('/api/runs/')) {
        const id = decodeURIComponent(p.slice('/api/runs/'.length))
        return sendFile(res, safeJoin(path.join(CACHE_DIR, 'runs'), `${id}.json`))
      }
      if (p === '/api/notes') return sendJson(res, notesIndex())
      if (p === '/api/notes/file') return sendFile(res, safeJoin(NOTES_DIR, url.searchParams.get('path') ?? ''))
      if (p === '/api/notes/search') return sendJson(res, searchNotes(url.searchParams.get('q') ?? ''))
      if (p === '/api/info') return sendJson(res, { timeZone: TIME_ZONE, reportsDir: REPORTS_DIR, runsDir: RUNS_DIR, notesDir: NOTES_DIR })
      // Elementos importables: zips y carpetas sueltas de reports/
      if (p === '/api/zips' && req.method === 'GET') return sendJson(res, [...listZips(), ...listFolders()])
      if (p === '/api/zips/import') {
        // La cabecera propia obliga a que la petición venga de la propia app (evita envíos desde otras webs)
        if (req.method !== 'POST' || req.headers['x-playboard'] !== '1') {
          res.statusCode = 403
          return res.end('Petición no permitida')
        }
        const { items = [] } = await readJsonBody(req)
        const results = []
        for (const { kind, name } of items) {
          try {
            results.push(kind === 'folder' ? importFolder(name, log) : importZip(name, log))
          } catch (e) {
            results.push({ file: name, kind, error: e.message, imported: [], alreadyImported: [], failed: [], deleted: false })
          }
        }
        await runIngest()
        notify('playboard:data')
        notify('playboard:zips')
        return sendJson(res, results)
      }
      if (p.startsWith('/reports/')) return sendFile(res, safeJoin(REPORTS_DIR, p.slice('/reports/'.length)))
    } catch (e) {
      res.statusCode = 500
      return res.end(String(e.message))
    }
    next()
  }

  return { middleware, runIngest, handleFsEvent, notify }
}
