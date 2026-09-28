import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { periodRange, previousRange } from './period'
import { PAGE_PARAM } from './usePagination'

const PERIOD_KEYS = ['p', 'd', 'from', 'to']

export function usePeriod(latestDate) {
  const [params, setParams] = useSearchParams()
  const fallback = latestDate ?? new Date().toISOString().slice(0, 10)
  const period = useMemo(() => ({
    type: params.get('p') ?? 'all',
    anchor: params.get('d') ?? fallback,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  }), [params, fallback])

  const setPeriod = useCallback((next) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev)
      for (const k of PERIOD_KEYS) out.delete(k)
      out.delete(PAGE_PARAM)
      if (next.type !== 'all') out.set('p', next.type)
      if (next.anchor && next.type !== 'all' && next.type !== 'range') out.set('d', next.anchor)
      if (next.type === 'range') {
        if (next.from) out.set('from', next.from)
        if (next.to) out.set('to', next.to)
      }
      return out
    })
  }, [setParams])

  const range = useMemo(() => periodRange(period), [period])
  const prevRange = useMemo(() => previousRange(period), [period])
  return { period, setPeriod, range, prevRange }
}

// Parte de la URL que conserva el periodo al navegar entre páginas
export function periodSearch(search, extra = {}) {
  const src = new URLSearchParams(search)
  const out = new URLSearchParams()
  for (const k of PERIOD_KEYS) if (src.has(k)) out.set(k, src.get(k))
  for (const [k, v] of Object.entries(extra)) if (v != null) out.set(k, v)
  const s = out.toString()
  return s ? `?${s}` : ''
}
