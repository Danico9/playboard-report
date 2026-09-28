// ─── Ingesta de reportes Playwright ───
// Lee reports/playwright-reports/<run>/index.html, extrae los datos embebidos y
// escribe una versión normalizada en .cache/data/ para la app.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, strFromU8 } from 'fflate'

// PLAYBOARD_ROOT lo fija el ejecutable (la carpeta donde está el .exe); si no, la raíz del proyecto
const ROOT = process.env.PLAYBOARD_ROOT
  ? path.resolve(process.env.PLAYBOARD_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// PLAYBOARD_DATA_DIR permite usar otra carpeta con reports/ y notes/ (p. ej. los datos de demo en .demo/)
const DATA_ROOT = process.env.PLAYBOARD_DATA_DIR ? path.resolve(ROOT, process.env.PLAYBOARD_DATA_DIR) : ROOT
export const REPORTS_DIR = path.join(DATA_ROOT, 'reports')
export const NOTES_DIR = path.join(DATA_ROOT, 'notes')
export const RUNS_DIR = path.join(REPORTS_DIR, 'playwright-reports')
export const CACHE_DIR = path.join(ROOT, '.cache', DATA_ROOT === ROOT ? 'data' : `data-${path.basename(DATA_ROOT).replace(/^\./, '')}`)
const SCHEMA_VERSION = 7
// Zona horaria para decidir a qué día pertenece cada ejecución: PLAYBOARD_TZ o, si no, la del sistema
export const TIME_ZONE = process.env.PLAYBOARD_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const MAX_TEXT = 20000

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
export const stripAnsi = (s) => (s ?? '').replace(ANSI_RE, '')
const clip = (s, n = MAX_TEXT) => (s && s.length > n ? s.slice(0, n) + '\n…(recortado)' : s)

// ─── Zips de artefactos ───
// Los zips no se descomprimen solos: el usuario elige cuáles importar desde la pantalla «Importar».
// Un zip puede contener uno o varios reportes HTML de Playwright (cualquier carpeta con su index.html).
// Si la carpeta ya se llama AAAA-MM-DD_HH-mm-ss_<suite> se respeta el nombre; si no (p. ej. «playwright-report»),
// se nombra con la hora de inicio del propio reporte en UTC: 2026-09-23_01-03-36_playwright-report.

const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/
const TRACE_VIEWER_RE = /(^|\/)trace$/

const norm = (name) => name.split(String.fromCharCode(92)).join('/')
const dirOfIndex = (name) => (name === 'index.html' ? '' : name.endsWith('/index.html') ? name.slice(0, -'/index.html'.length) : null)
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report'

function reportDirs(names) {
  const dirs = new Set()
  for (const name of names) {
    const dir = dirOfIndex(norm(name))
    if (dir != null && !TRACE_VIEWER_RE.test(dir)) dirs.add(dir)
  }
  return [...dirs]
}

const needsContent = (name) => {
  const dir = dirOfIndex(norm(name))
  return dir != null && !TRACE_VIEWER_RE.test(dir) && !RUN_ID_RE.test(dir.split('/').pop())
}

// Nombre con el que se guardará el reporte en playwright-reports/, o null si el index.html no es un reporte
function runIdFor(dir, zipFile, indexBytes) {
  const base = dir.split('/').pop() || zipFile.replace(/\.zip$/i, '')
  if (RUN_ID_RE.test(base)) return base
  if (!indexBytes) return null
  try {
    const { report } = parseEmbeddedHtml(strFromU8(indexBytes))
    const stamp = new Date(report.startTime).toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
    return `${stamp}_${slug(base)}`
  } catch {
    return null
  }
}

function runsInZip(file, names, contents) {
  const runs = new Map()
  for (const dir of reportDirs(names)) {
    const id = runIdFor(dir, file, contents[dir ? `${dir}/index.html` : 'index.html'])
    if (id) runs.set(dir, id)
  }
  return runs
}

// Un reporte ya está importado si existe su carpeta o cualquier otra con la misma fecha y hora de inicio
function runExists(runId) {
  if (fs.existsSync(path.join(RUNS_DIR, runId, 'index.html'))) return true
  const stamp = runId.match(RUN_ID_RE)?.[0]
  if (!stamp || !fs.existsSync(RUNS_DIR)) return false
  return fs.readdirSync(RUNS_DIR).some((d) => d.startsWith(stamp) && fs.existsSync(path.join(RUNS_DIR, d, 'index.html')))
}

function zipPathOf(file) {
  const p = path.resolve(REPORTS_DIR, file)
  if (path.dirname(p) !== REPORTS_DIR || !p.toLowerCase().endsWith('.zip')) throw new Error(`zip no válido: ${file}`)
  return p
}

const zipListCache = new Map()
const NESTED_ZIPS = 'Contiene otros zips en vez de reportes: descomprímelo en reports/ y aparecerán aquí para importarlos'

export function listZips() {
  if (!fs.existsSync(REPORTS_DIR)) return []
  const out = []
  for (const file of fs.readdirSync(REPORTS_DIR)) {
    if (!file.toLowerCase().endsWith('.zip')) continue
    const zipPath = path.join(REPORTS_DIR, file)
    const st = fs.statSync(zipPath)
    const stamp = `${st.size}:${st.mtimeMs}`
    let entry = zipListCache.get(file)
    if (entry?.stamp !== stamp) {
      entry = { stamp, runs: [], error: null }
      try {
        const names = []
        // Solo se descomprimen los index.html cuyo nombre de carpeta no lleva fecha; del resto basta con el nombre
        const contents = unzipSync(fs.readFileSync(zipPath), { filter: (f) => { names.push(f.name); return needsContent(f.name) } })
        entry.runs = [...runsInZip(file, names, contents).values()]
        // Los zips dentro de otro zip no se abren (un zip de zips puede ocupar varios GB): se pide descomprimirlo a mano
        if (!entry.runs.length) {
          entry.error = names.some((n) => n.toLowerCase().endsWith('.zip'))
            ? NESTED_ZIPS
            : 'No contiene ningún reporte HTML de Playwright'
        }
      } catch (e) {
        entry.error = `No se puede leer (¿aún se está copiando?): ${e.message}`
      }
      zipListCache.set(file, entry)
    }
    out.push({
      kind: 'zip',
      name: file,
      size: st.size,
      mtime: st.mtimeMs,
      error: entry.error,
      runs: entry.runs.map((id) => ({ id, imported: runExists(id) })),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
}

// Descomprime los reportes que falten y borra el zip solo si todos sus reportes quedan importados y legibles
export function importZip(file, log = console.log) {
  const zipPath = zipPathOf(file)
  const entries = unzipSync(fs.readFileSync(zipPath))
  const names = Object.keys(entries)
  const runs = runsInZip(file, names, entries)
  if (!runs.size) throw new Error('no contiene ningún reporte HTML de Playwright')

  const imported = []
  const failed = []
  for (const [runDir, runId] of runs) {
    if (runExists(runId)) continue
    const target = path.join(RUNS_DIR, runId)
    const prefix = runDir ? `${runDir}/` : ''
    for (const [name, data] of Object.entries(entries)) {
      const n = norm(name)
      if (!n.startsWith(prefix) || n.endsWith('/')) continue
      const out = path.resolve(target, n.slice(prefix.length))
      if (!out.startsWith(target + path.sep)) continue
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, data)
    }
    try {
      readEmbeddedReport(path.join(target, 'index.html'))
      imported.push(runId)
      log(`[importar] Descomprimido ${runId} desde ${file}`)
    } catch (e) {
      fs.rmSync(target, { recursive: true, force: true })
      failed.push({ runId, error: e.message })
      log(`[importar] El reporte ${runId} de ${file} no es válido (${e.message}); se conserva el zip.`)
    }
  }
  const deleted = failed.length === 0
  if (deleted) {
    fs.rmSync(zipPath)
    zipListCache.delete(file)
    log(`[importar] Eliminado ${file}`)
  }
  const alreadyImported = [...runs.values()].filter((id) => !imported.includes(id) && !failed.some((f) => f.runId === id))
  return { file, kind: 'zip', imported, alreadyImported, failed, deleted }
}

// ─── Carpetas de reportes sueltas en reports/ ───
// Una carpeta copiada directamente en reports/ (fuera de playwright-reports/) aparece en «Importar» como los zips.
// Al importarla, cada reporte que contiene se mueve a playwright-reports/<id>. Después solo se borran los reportes
// duplicados y las carpetas que hayan quedado vacías: si queda cualquier otro fichero, la carpeta se conserva.

const SKIP_DIRS = new Set(['data', 'trace', 'node_modules'])

function findReportFolders(dir, depth = 0) {
  if (fs.existsSync(path.join(dir, 'index.html'))) return [dir]
  if (depth >= 4) return []
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) out.push(...findReportFolders(path.join(dir, e.name), depth + 1))
  }
  return out
}

function folderPathOf(name) {
  const p = path.resolve(REPORTS_DIR, name)
  if (path.dirname(p) !== REPORTS_DIR || p === RUNS_DIR || name.startsWith('.') || !fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
    throw new Error(`carpeta no válida: ${name}`)
  }
  return p
}

function dirSize(dir) {
  let total = 0
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size
  }
  return total
}

const folderRunCache = new Map()

// Nombre con el que se guardará el reporte de la carpeta, o null si su index.html no es un reporte de Playwright
function runIdForFolder(reportDir) {
  const base = path.basename(reportDir)
  if (RUN_ID_RE.test(base)) return base
  const indexPath = path.join(reportDir, 'index.html')
  const st = fs.statSync(indexPath)
  const stamp = `${indexPath}:${st.size}:${st.mtimeMs}`
  if (!folderRunCache.has(stamp)) {
    let id
    try {
      const { report } = readEmbeddedReport(indexPath)
      id = `${new Date(report.startTime).toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}_${slug(base)}`
    } catch {
      id = null
    }
    folderRunCache.set(stamp, id)
  }
  return folderRunCache.get(stamp)
}

export function listFolders() {
  if (!fs.existsSync(REPORTS_DIR)) return []
  const out = []
  for (const e of fs.readdirSync(REPORTS_DIR, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || path.join(REPORTS_DIR, e.name) === RUNS_DIR) continue
    const top = path.join(REPORTS_DIR, e.name)
    const runs = findReportFolders(top).map(runIdForFolder).filter(Boolean)
    out.push({
      kind: 'folder',
      name: e.name,
      size: dirSize(top),
      mtime: fs.statSync(top).mtimeMs,
      error: runs.length ? null : 'No contiene ningún reporte HTML de Playwright',
      runs: runs.map((id) => ({ id, imported: runExists(id) })),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

// Mueve una carpeta. En Windows el antivirus o un indexador pueden bloquearla un instante (EPERM/EBUSY): se reintenta
// y, si sigue bloqueada o es otra unidad de disco (EXDEV), se copia y se borra el original.
export function moveDir(src, dst) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(src, dst)
      return
    } catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES', 'EXDEV'].includes(e.code)) throw e
      if (e.code === 'EXDEV') break
      sleepSync(200)
    }
  }
  fs.cpSync(src, dst, { recursive: true })
  fs.rmSync(src, { recursive: true, force: true })
}

// Borra las carpetas vacías de abajo arriba; devuelve true si la carpeta raíz ha quedado vacía y se ha borrado
function removeEmptyDirs(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) removeEmptyDirs(path.join(dir, e.name))
  }
  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir)
    return true
  }
  return false
}

export function importFolder(name, log = console.log) {
  const top = folderPathOf(name)
  const reportDirs = findReportFolders(top).map((dir) => ({ dir, id: runIdForFolder(dir) })).filter((r) => r.id)
  if (!reportDirs.length) throw new Error('no contiene ningún reporte HTML de Playwright')

  const imported = []
  const alreadyImported = []
  const failed = []
  fs.mkdirSync(RUNS_DIR, { recursive: true })
  for (const { dir, id } of reportDirs) {
    if (runExists(id)) {
      alreadyImported.push(id)
      fs.rmSync(dir, { recursive: true, force: true })
      continue
    }
    try {
      readEmbeddedReport(path.join(dir, 'index.html'))
    } catch (e) {
      failed.push({ runId: id, error: e.message })
      log(`[importar] El reporte ${id} de la carpeta ${name} no es válido (${e.message}); se deja donde está.`)
      continue
    }
    moveDir(dir, path.join(RUNS_DIR, id))
    imported.push(id)
    log(`[importar] Movido ${id} desde la carpeta ${name}`)
  }
  const deleted = removeEmptyDirs(top)
  if (!deleted) log(`[importar] La carpeta ${name} se conserva porque aún tiene otros ficheros.`)
  return { file: name, kind: 'folder', imported, alreadyImported, failed, deleted }
}

// ─── Lectura del reporte embebido ───

function parseEmbeddedHtml(html) {
  const m = html.match(/data:application\/zip;base64,([A-Za-z0-9+/=]+)/)
  if (!m) throw new Error('no se encontró el reporte embebido en index.html')
  const files = unzipSync(Buffer.from(m[1], 'base64'))
  if (!files['report.json']) throw new Error('falta report.json')
  const json = (name) => (files[name] ? JSON.parse(strFromU8(files[name])) : null)
  return { report: json('report.json'), fileDetail: (fileId) => json(`${fileId}.json`) }
}

export function readEmbeddedReport(indexPath) {
  return parseEmbeddedHtml(fs.readFileSync(indexPath, 'utf8'))
}

// ─── Normalización ───

const localParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
function localDateTime(ms) {
  const p = Object.fromEntries(localParts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

export function moduleOf(fileName) {
  const base = path.posix.basename(fileName).replace(/\.spec\.[jt]s$/, '')
  const parts = base.split('-')
  // Convención <prefijo>-<NNN>[-<NNN>…]-<módulo>-…; si no se sigue, el módulo es la carpeta del spec
  if (parts.length > 2 && /^\d+$/.test(parts[1])) {
    let i = 1
    while (i < parts.length && /^\d+$/.test(parts[i])) i++
    const token = (parts[i] ?? '').replace(/\d+$/, '').toLowerCase()
    if (token) return token
  }
  const dir = path.posix.dirname(fileName.replace(/\\/g, '/'))
  return dir === '.' ? 'general' : dir.split('/').pop().toLowerCase()
}

// Identificadores de spec con la convención <prefijo>-<NNN>: crud-024-025-026-mat-… → [crud-024, crud-025, crud-026]
export function specNumbers(fileName) {
  const parts = path.posix.basename(fileName).split('-')
  if (!/^[a-z][a-z0-9]*$/i.test(parts[0])) return []
  const out = []
  for (let i = 1; i < parts.length && /^\d{3}$/.test(parts[i]); i++) out.push(`${parts[0]}-${parts[i]}`)
  return out
}

function errorSignature(message) {
  const text = stripAnsi(message)
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const first = lines[0] ?? 'Error'
  const locator = lines.find((l) => /^Locator:/.test(l))
  const expected = lines.find((l) => /^Expected( substring| string| pattern)?:/.test(l))
  const at = text.match(/at (?:\.\.\/)?([\w./@-]+\.[jt]s):(\d+)/)
  const location = at ? `${at[1]}:${at[2]}` : null
  const norm = (s) => s?.replace(/\d{3,}/g, '#').replace(/\s+/g, ' ').slice(0, 300)
  const title = [first, locator].filter(Boolean).map((s) => s.replace(/\s+/g, ' ').slice(0, 300)).join(' — ')
  const key = [first, locator, expected, location].filter(Boolean).map(norm).join(' | ')
  return { key, title, location }
}

const OUTCOME = { expected: 'passed', unexpected: 'failed', flaky: 'flaky', skipped: 'skipped' }

function normalizeRun(runId, report, fileDetail, signatures) {
  const start = report.startTime
  const { date, time } = localDateTime(start)
  const meta = report.metadata ?? {}
  const git = meta.gitCommit ?? {}
  const run = {
    id: runId,
    suite: runId.replace(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_?/, '') || 'tests',
    startTime: start,
    date,
    time,
    duration: Math.round(report.duration),
    stats: {
      total: report.stats.total,
      passed: report.stats.expected,
      failed: report.stats.unexpected,
      flaky: report.stats.flaky,
      skipped: report.stats.skipped,
    },
    projects: report.projectNames ?? [],
    workers: meta.actualWorkers ?? null,
    branch: meta.ci?.branch ?? git.branch ?? null,
    buildHref: meta.ci?.buildHref ?? null,
    commit: git.hash
      ? {
          short: git.shortHash, hash: git.hash, subject: git.subject,
          author: git.author?.name, href: meta.ci?.commitHref ?? null,
        }
      : null,
  }

  const tests = []
  for (const file of report.files) {
    const detail = fileDetail(file.fileId)
    const detailById = new Map((detail?.tests ?? []).map((t) => [t.testId, t]))
    for (const t of file.tests) {
      const full = detailById.get(t.testId) ?? t
      const titlePath = [...(t.path ?? []), t.title]
      const outcome = OUTCOME[t.outcome] ?? t.outcome
      const attempts = (full.results ?? []).map((r) => {
        const att = r.attachments ?? []
        const firstError = (r.errors ?? [])[0]?.message ?? null
        let sig = null
        if (firstError) {
          const s = errorSignature(firstError)
          if (!signatures.has(s.key)) {
            signatures.set(s.key, { id: signatures.size, title: s.title, location: s.location, sample: clip(stripAnsi(firstError), 4000) })
          }
          sig = signatures.get(s.key).id
        }
        return {
          status: r.status ?? null,
          retry: r.retry ?? 0,
          duration: r.duration ?? null,
          startTime: r.startTime ?? null,
          worker: r.workerIndex ?? null,
          error: firstError ? clip(firstError) : null,
          extraErrors: Math.max(0, (r.errors ?? []).length - 1),
          sig,
          screenshots: att.filter((a) => a.contentType?.startsWith('image/') && a.path).map((a) => a.path),
          errorContext: att.find((a) => a.name === 'error-context' && a.path)?.path ?? null,
          trace: att.find((a) => a.name === 'trace' && a.path)?.path ?? null,
          video: att.find((a) => a.contentType?.startsWith('video/') && a.path)?.path ?? null,
          stdout: clip(att.filter((a) => a.name === 'stdout' && a.body).map((a) => a.body).join('')) || null,
        }
      })
      const failing = [...attempts].reverse().find((a) => a.sig != null)
      const skipAnnotation = (t.annotations ?? []).find((a) => ['skip', 'fixme'].includes(a.type))
      tests.push({
        key: `${t.projectName}|${file.fileName}|${titlePath.join(' › ')}`,
        testId: t.testId,
        title: t.title,
        path: t.path ?? [],
        file: file.fileName,
        location: t.location ? `${t.location.file}:${t.location.line}` : null,
        project: t.projectName,
        kind: file.fileName.split('/')[0],
        module: moduleOf(file.fileName),
        tags: t.tags ?? [],
        specs: specNumbers(file.fileName),
        outcome,
        duration: t.duration,
        retries: Math.max(0, attempts.length - 1),
        sig: failing?.sig ?? null,
        skipReason: outcome === 'skipped' ? (skipAnnotation ? skipAnnotation.type : 'not-run') : null,
        skipDescription: skipAnnotation?.description ?? null,
        attempts,
      })
    }
  }
  return { run, tests }
}

// ─── Ingesta completa (incremental) ───

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback }
}

export function ingest({ log = console.log } = {}) {
  const t0 = Date.now()
  fs.mkdirSync(path.join(CACHE_DIR, 'runs'), { recursive: true })

  const manifestPath = path.join(CACHE_DIR, 'manifest.json')
  const old = readJson(manifestPath, {})
  const fresh = old.schema === SCHEMA_VERSION
  const oldRuns = fresh ? old.runs ?? {} : {}

  const runIds = fs.existsSync(RUNS_DIR)
    ? fs.readdirSync(RUNS_DIR).filter((d) => fs.existsSync(path.join(RUNS_DIR, d, 'index.html'))).sort()
    : []

  // Las firmas de error se recalculan en cada ingesta para que los ids sean estables en todo el histórico
  const signatures = new Map()
  const manifest = { schema: SCHEMA_VERSION, runs: {} }
  const runs = []
  const testMeta = {}
  const results = {}
  let parsed = 0

  runIds.forEach((runId) => {
    const indexPath = path.join(RUNS_DIR, runId, 'index.html')
    const st = fs.statSync(indexPath)
    const stamp = `${st.size}:${Math.round(st.mtimeMs)}`
    const outPath = path.join(CACHE_DIR, 'runs', `${runId}.json`)
    let data
    const raw = oldRuns[runId] === stamp ? readJson(path.join(CACHE_DIR, 'runs', `${runId}.raw.json`), null) : null
    if (raw) {
      data = normalizeRun(runId, raw.report, (id) => raw.details[id] ?? null, signatures)
    } else {
      try {
        const { report, fileDetail } = readEmbeddedReport(indexPath)
        const details = {}
        for (const f of report.files) {
          const d = fileDetail(f.fileId)
          if (d) details[f.fileId] = stripSteps(d)
        }
        fs.writeFileSync(path.join(CACHE_DIR, 'runs', `${runId}.raw.json`), JSON.stringify({ report, details }))
        data = normalizeRun(runId, report, (id) => details[id] ?? null, signatures)
        parsed++
      } catch (e) {
        log(`[ingest] Error leyendo ${runId}: ${e.message}`)
        return
      }
    }
    manifest.runs[runId] = stamp
    fs.writeFileSync(outPath, JSON.stringify(data))
    runs.push(data.run)
    for (const t of data.tests) {
      testMeta[t.key] ??= {}
      Object.assign(testMeta[t.key], {
        testId: t.testId, title: t.title, path: t.path, file: t.file, project: t.project, tags: t.tags,
        kind: t.kind, module: t.module, specs: t.specs, location: t.location,
      })
      ;(results[t.key] ??= []).push([runs.length - 1, t.outcome, t.duration, t.sig, t.retries])
    }
  })

  // Borrar datos de ejecuciones que ya no existen
  for (const f of fs.readdirSync(path.join(CACHE_DIR, 'runs'))) {
    const id = f.replace(/(\.raw)?\.json$/, '')
    if (!manifest.runs[id]) fs.rmSync(path.join(CACHE_DIR, 'runs', f))
  }

  const summary = {
    generatedAt: Date.now(),
    timeZone: TIME_ZONE,
    runs,
    tests: testMeta,
    results,
    signatures: [...signatures.values()].map(({ sample, ...s }) => ({ ...s, sample })),
  }
  fs.writeFileSync(path.join(CACHE_DIR, 'summary.json'), JSON.stringify(summary))
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))
  log(`[ingest] ${runs.length} ejecuciones (${parsed} leídas de nuevo) en ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  return summary
}

// Los steps ocupan la mayor parte del JSON y la app no los usa
function stripSteps(detail) {
  return {
    ...detail,
    tests: detail.tests.map((t) => ({
      ...t,
      results: (t.results ?? []).map((r) => {
        const { steps, ...rest } = r
        void steps
        return rest
      }),
    })),
  }
}

if (!process.env.PLAYBOARD_ROOT && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ingest()
}
