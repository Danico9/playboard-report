import { useMemo } from 'react'
import { useSummary } from './store'
import { usePeriod } from './usePeriod'
import { runsInRange } from './stats'
import { useEnvFilter } from './environments'

// Datos comunes a todas las páginas de reportes: resumen, periodo y ejecuciones del periodo (y del entorno elegido)
export function useReport() {
  const res = useSummary()
  const summary = res.data
  const latest = summary?.runs.at(-1)?.date
  const { period, setPeriod, range, prevRange } = usePeriod(latest)
  const env = useEnvFilter()
  const runs = useMemo(() => (summary ? runsInRange(summary, range, env) : []), [summary, range, env])
  const prevRuns = useMemo(() => (summary && prevRange ? runsInRange(summary, prevRange, env) : null), [summary, prevRange, env])
  const runIndexes = useMemo(() => runs.map((r) => r.index), [runs])
  return { res, summary, period, setPeriod, range, prevRange, runs, prevRuns, runIndexes, env }
}
