// ─── Plugin Vite: API local de reportes y notas ───

import fs from 'node:fs'
import path from 'node:path'
import GithubSlugger from 'github-slugger'
import { ingest, importZip, listZips, CACHE_DIR, NOTES_DIR, REPORTS_DIR, TIME_ZONE } from '../scripts/ingest-reports.mjs'

const MIME = {
  '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webm': 'video/webm', '.zip': 'application/zip',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
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
    const h1 = headingsOf(content).find((h) => h.level === 1)
    return { path: rel, title: h1?.text ?? null, size: st.size, mtime: st.mtimeMs, headings: headingsOf(content) }
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

// ─── Plugin ───

export default function playboard() {
  let summaryCache = null
  let running = false
  let lastEnd = 0
  let timer = null
  let zipTimer = null

  const runIngest = async (log) => {
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

  const middleware = (log, notify) => async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost')
    const p = url.pathname
    try {
      if (p === '/api/summary') {
        if (!summaryCache) await runIngest(log)
        return sendJson(res, summaryCache ?? '{"runs":[],"tests":{},"results":{},"signatures":[]}')
      }
      if (p.startsWith('/api/runs/')) {
        const id = decodeURIComponent(p.slice('/api/runs/'.length))
        return sendFile(res, safeJoin(path.join(CACHE_DIR, 'runs'), `${id}.json`))
      }
      if (p === '/api/notes') return sendJson(res, notesIndex())
      if (p === '/api/notes/file') return sendFile(res, safeJoin(NOTES_DIR, url.searchParams.get('path') ?? ''))
      if (p === '/api/notes/search') return sendJson(res, searchNotes(url.searchParams.get('q') ?? ''))
      if (p === '/api/info') return sendJson(res, { timeZone: TIME_ZONE, reportsDir: REPORTS_DIR, runsDir: path.join(REPORTS_DIR, 'playwright-reports'), notesDir: NOTES_DIR })
      if (p === '/api/zips' && req.method === 'GET') return sendJson(res, listZips())
      if (p === '/api/zips/import') {
        // La cabecera propia obliga a que la petición venga de la propia app (evita envíos desde otras webs)
        if (req.method !== 'POST' || req.headers['x-playboard'] !== '1') {
          res.statusCode = 403
          return res.end('Petición no permitida')
        }
        const { files = [] } = await readJsonBody(req)
        const results = []
        for (const file of files) {
          try {
            results.push(importZip(file, log))
          } catch (e) {
            results.push({ file, error: e.message, imported: [], alreadyImported: [], failed: [], deleted: false })
          }
        }
        await runIngest(log)
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

  return {
    name: 'playboard',
    config: () => ({
      server: { watch: { ignored: ['**/.cache/**'] } },
    }),
    configureServer(server) {
      const log = (m) => server.config.logger.info(m, { timestamp: true })
      const notify = (event) => server.ws.send({ type: 'custom', event, data: {} })
      runIngest(log)
      server.middlewares.use(middleware(log, notify))

      server.watcher.add([REPORTS_DIR, NOTES_DIR])
      server.watcher.on('all', (event, file) => {
        const abs = path.resolve(file)
        if (abs.startsWith(NOTES_DIR + path.sep) && abs.endsWith('.md')) {
          server.ws.send({ type: 'custom', event: 'playboard:notes', data: {} })
          return
        }
        if (path.dirname(abs) === REPORTS_DIR && abs.toLowerCase().endsWith('.zip')) {
          // Espera a que termine la copia de un zip grande antes de avisar a la pantalla «Importar»
          clearTimeout(zipTimer)
          zipTimer = setTimeout(() => notify('playboard:zips'), 1500)
          return
        }
        // Ignora los eventos que genera la propia ingesta al descomprimir zips
        if (!abs.startsWith(REPORTS_DIR + path.sep) || running || Date.now() - lastEnd < 2000) return
        const isReportIndex = /[\\/]playwright-reports[\\/][^\\/]+[\\/]index\.html$/.test(abs)
        const removedRun = event === 'unlinkDir'
        if (!isReportIndex && !removedRun) return
        clearTimeout(timer)
        timer = setTimeout(async () => {
          await runIngest(log)
          notify('playboard:data')
          notify('playboard:zips')
        }, 3000)
      })
    },
    configurePreviewServer(server) {
      const log = (m) => console.log(m)
      runIngest(log)
      server.middlewares.use(middleware(log, () => {}))
    },
  }
}
