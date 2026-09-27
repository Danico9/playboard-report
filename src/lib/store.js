// ─── Caché de peticiones a la API local ───
// Al recargar datos se conserva el contenido anterior hasta que llega el nuevo (sin parpadeos).

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { parseKnownIssues } from './knownIssues'
import { KNOWN_ISSUES_NOTE } from '../config/notes'

const cache = new Map()
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

function load(url, type) {
  const prev = cache.get(url)
  cache.set(url, { status: prev?.data !== undefined ? 'refreshing' : 'loading', data: prev?.data, type })
  emit()
  fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      return type === 'text' ? r.text() : r.json()
    })
    .then((data) => cache.set(url, { status: 'ok', data, type }))
    .catch((error) => cache.set(url, { status: 'error', error, data: prev?.data, type }))
    .finally(emit)
}

export function useResource(url, type = 'json') {
  const entry = useSyncExternalStore(subscribe, () => (url ? cache.get(url) : undefined))
  useEffect(() => {
    if (url && !cache.has(url)) load(url, type)
  }, [url, type])
  return entry ?? { status: url ? 'loading' : 'idle' }
}

function invalidate(prefix) {
  for (const [url, entry] of cache) if (url.startsWith(prefix)) load(url, entry.type)
}

// Avisos del servidor cuando cambian reports/ o notes/ (funciona igual con npm run dev y con el ejecutable)
if (typeof EventSource !== 'undefined') {
  const events = new EventSource('/api/events')
  events.addEventListener('playboard:data', () => refreshData())
  events.addEventListener('playboard:notes', () => invalidate('/api/notes'))
  events.addEventListener('playboard:zips', () => invalidate('/api/zips'))
  import.meta.hot?.dispose(() => events.close())
}

export const useSummary = () => useResource('/api/summary')
export const useRunDetail = (id) => useResource(id ? `/api/runs/${encodeURIComponent(id)}` : null)
export const useNotesIndex = () => useResource('/api/notes')
export const useZips = () => useResource('/api/zips')
export const useInfo = () => useResource('/api/info')
export const refreshZips = () => invalidate('/api/zips')
export function refreshData() {
  for (const url of [...cache.keys()]) if (url.startsWith('/api/runs/')) cache.delete(url)
  invalidate('/api/summary')
  emit()
}

// Zips con algún reporte que todavía no está descomprimido
export const pendingZips = (zips) => (zips ?? []).filter((z) => !z.error && z.runs.some((r) => !r.imported))
export const useNoteFile = (path) => useResource(path ? `/api/notes/file?path=${encodeURIComponent(path)}` : null, 'text')

export function useKnownIssues() {
  const res = useNoteFile(KNOWN_ISSUES_NOTE)
  const { data: summary } = useSummary()
  const prefixes = useMemo(() => {
    const set = new Set()
    for (const t of Object.values(summary?.tests ?? {})) for (const s of t.specs ?? []) set.add(s.split('-')[0].toLowerCase())
    return [...set].sort().join(',')
  }, [summary])
  return useMemo(() => (res.data ? parseKnownIssues(res.data, prefixes ? prefixes.split(',') : []) : new Map()), [res.data, prefixes])
}

export function issuesForTest(knownIssues, meta) {
  return (meta?.specs ?? []).flatMap((s) => knownIssues.get(s) ?? [])
}
