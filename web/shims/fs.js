// Sustituto de node:fs para la versión web: un sistema de ficheros en memoria, síncrono como el de Node,
// que se carga antes de cada petición desde carpetas del navegador (File System Access API / OPFS)
// y que, al terminar, escribe en ellas los ficheros que el código haya cambiado.

import { dirname } from './path.js'

const files = new Map() // ruta → { data: Uint8Array | null (sin cargar), size, mtimeMs }
const dirs = new Set(['/'])
const mounts = [] // { prefix, handle }
const dirty = new Set()
const removed = new Set()
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const enoent = (p) => Object.assign(new Error(`ENOENT: no such file or directory, '${p}'`), { code: 'ENOENT' })
const addDir = (p) => {
  for (let d = p; d && !dirs.has(d); d = dirname(d)) dirs.add(d)
}

// ─── Carga y volcado ───

export function reset() {
  files.clear()
  dirs.clear()
  dirs.add('/')
  mounts.length = 0
  dirty.clear()
  removed.clear()
}

export function mount(prefix, handle) {
  mounts.push({ prefix, handle })
  addDir(prefix)
}

// Recorre la carpeta montada en prefix; decide(relPath, kind) → 'skip' | 'stat' | 'content'
export async function load(prefix, decide = () => 'content') {
  const m = mounts.find((x) => x.prefix === prefix)
  const walk = async (handle, rel) => {
    for await (const [name, child] of handle.entries()) {
      const r = rel ? `${rel}/${name}` : name
      const action = decide(r, child.kind)
      if (action === 'skip') continue
      if (child.kind === 'directory') {
        addDir(`${prefix}/${r}`)
        await walk(child, r)
      } else {
        const file = await child.getFile()
        const data = action === 'content' ? new Uint8Array(await file.arrayBuffer()) : null
        files.set(`${prefix}/${r}`, { data, size: file.size, mtimeMs: file.lastModified, handle: child })
        addDir(dirname(`${prefix}/${r}`))
      }
    }
  }
  await walk(m.handle, '')
}

export async function loadContent(p) {
  const f = files.get(p)
  if (f && !f.data) f.data = new Uint8Array(await (await f.handle.getFile()).arrayBuffer())
}

// Libera el contenido de los ficheros bajo prefix (se quedan su tamaño y fecha; se pueden volver a cargar con loadContent)
export function dropContents(prefix) {
  for (const [p, f] of files) if (p.startsWith(prefix) && f.handle && !dirty.has(p)) f.data = null
}

async function handleFor(p, create) {
  const m = mounts.find((x) => p.startsWith(x.prefix + '/'))
  if (!m) return null
  const parts = p.slice(m.prefix.length + 1).split('/')
  let dir = m.handle
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create })
  return { dir, name: parts.at(-1) }
}

export async function flush() {
  const written = []
  for (const p of removed) {
    const h = await handleFor(p, false).catch(() => null)
    if (h) await h.dir.removeEntry(h.name).catch(() => {})
  }
  for (const p of dirty) {
    const f = files.get(p)
    const h = f && (await handleFor(p, true))
    if (!h) continue
    const w = await (await h.dir.getFileHandle(h.name, { create: true })).createWritable()
    await w.write(f.data)
    await w.close()
    written.push(p)
  }
  dirty.clear()
  removed.clear()
  return written
}

// ─── API síncrona de node:fs que usa el código del servidor ───

export function existsSync(p) {
  return files.has(p) || dirs.has(p)
}

export function readFileSync(p, enc) {
  const f = files.get(p)
  if (!f) throw enoent(p)
  if (!f.data) throw new Error(`[web] fichero no cargado en memoria: ${p}`)
  return enc ? decoder.decode(f.data) : f.data
}

export function writeFileSync(p, content) {
  const data = typeof content === 'string' ? encoder.encode(content) : content
  files.set(p, { data, size: data.length, mtimeMs: Date.now() })
  addDir(dirname(p))
  dirty.add(p)
  removed.delete(p)
}

export function renameSync(a, b) {
  const f = files.get(a)
  if (!f) throw enoent(a)
  files.delete(a)
  files.set(b, f)
  if (dirty.delete(a)) dirty.add(b)
  else { removed.add(a); dirty.add(b) }
  removed.delete(b)
}

export function rmSync(p, opts) {
  if (files.delete(p)) {
    dirty.delete(p)
    removed.add(p)
  } else if (!opts?.force) throw enoent(p)
}

export function mkdirSync(p) {
  addDir(p)
}

export function readdirSync(dir, opts) {
  if (!dirs.has(dir)) throw enoent(dir)
  const prefix = dir === '/' ? '/' : dir + '/'
  const names = new Map()
  for (const p of files.keys()) if (p.startsWith(prefix) && !p.slice(prefix.length).includes('/')) names.set(p.slice(prefix.length), 'file')
  for (const p of dirs) if (p.startsWith(prefix) && p !== dir && !p.slice(prefix.length).includes('/')) names.set(p.slice(prefix.length), 'dir')
  const list = [...names].sort((a, b) => a[0].localeCompare(b[0]))
  return opts?.withFileTypes
    ? list.map(([name, kind]) => ({ name, isDirectory: () => kind === 'dir', isFile: () => kind === 'file' }))
    : list.map(([name]) => name)
}

export function statSync(p) {
  const f = files.get(p)
  if (f) return { size: f.size, mtimeMs: f.mtimeMs, isFile: () => true, isDirectory: () => false }
  if (dirs.has(p)) return { size: 0, mtimeMs: 0, isFile: () => false, isDirectory: () => true }
  throw enoent(p)
}

// sendFile() de server/api.mjs hace createReadStream(...).pipe(res)
export function createReadStream(p, opts = {}) {
  const data = readFileSync(p)
  const chunk = data.subarray(opts.start ?? 0, opts.end != null ? opts.end + 1 : undefined)
  return { pipe: (res) => res.end(chunk) }
}

export const watch = () => ({ close() {} })

export default { existsSync, readFileSync, writeFileSync, renameSync, rmSync, mkdirSync, readdirSync, statSync, createReadStream, watch }
