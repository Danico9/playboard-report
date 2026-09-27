import { useMemo } from 'react'
import { useSummary } from './store'
import { usePeriod } from './usePeriod'
import { runsInRange } from './stats'

// Datos comunes a todas las páginas de reportes: resumen, periodo y ejecuciones del periodo
export function useReport() {
  const res = useSummary()
  const summary = res.data
  const latest = summary?.runs.at(-1)?.date
  const { period, setPeriod, range, prevRange } = usePeriod(latest)
  const runs = useMemo(() => (summary ? runsInRange(summary, range) : []), [summary, range])
  const prevRuns = useMemo(() => (summary && prevRange ? runsInRange(summary, prevRange) : null), [summary, prevRange])
  const runIndexes = useMemo(() => runs.map((r) => r.index), [runs])
  return { res, summary, period, setPeriod, range, prevRange, runs, prevRuns, runIndexes }
}
