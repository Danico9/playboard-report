// ─── Cálculos sobre el resumen de ejecuciones ───
// summary.results[key] = [[runIndex, outcome, durationMs, signatureId, retries], ...]

import { moduleOfTest } from '../config/modules'
import { REMOVED_AFTER_RUNS } from '../config/status'
import { inRange } from './period'
import { fmtDate } from './format'
import { t } from '../i18n'

export const EMPTY_STATS = { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 }

// % éxito = (pasados + flaky) / (total − saltados)
export function successRate(s) {
  const executed = s.total - s.skipped
  return executed > 0 ? (s.passed + s.flaky) / executed : null
}

export function sumStats(list) {
  const out = { ...EMPTY_STATS }
  for (const s of list) for (const k of Object.keys(out)) out[k] += s[k] ?? 0
  return out
}

export function runsInRange(summary, range) {
  if (!range) return []
  return summary.runs.map((r, i) => ({ ...r, index: i })).filter((r) => inRange(r.date, range))
}

// Tests eliminados (borrados, renombrados o excluidos): no aparecen en las últimas REMOVED_AFTER_RUNS ejecuciones
// que los habrían incluido, es decir, de una suite en la que sí han aparecido alguna vez y con su proyecto.
// Así no cuentan las ejecuciones parciales (p. ej. de un solo spec). Un test saltado sí aparece en el reporte
// (con estado «saltado»), así que nunca se da por eliminado. Se mira todo el histórico, no el periodo.
// Devuelve Map clave → { lastSeen: índice de su última ejecución, lastDate, missing: ejecuciones en las que falta }
const removedCache = new WeakMap()
export function removedTests(summary) {
  let out = removedCache.get(summary)
  if (out) return out
  out = new Map()
  const runs = summary.runs
  for (const [key, entries] of Object.entries(summary.results)) {
    const project = summary.tests[key]?.project
    const suites = new Set(entries.map(([i]) => runs[i].suite))
    const lastSeen = entries.at(-1)[0]
    let missing = 0
    for (let i = lastSeen + 1; i < runs.length; i++) {
      const r = runs[i]
      if (suites.has(r.suite) && (!r.projects?.length || r.projects.includes(project))) missing++
    }
    if (missing >= REMOVED_AFTER_RUNS) out.set(key, { lastSeen, lastDate: runs[lastSeen].date, missing })
  }
  removedCache.set(summary, out)
  return out
}

export function removedTitle(info) {
  return t('Ya no aparece en las últimas {n} ejecuciones de su suite: se ha borrado, renombrado o excluido. Visto por última vez el {date}.',
    { n: info.missing, date: fmtDate(info.lastDate) })
}

export function testRows(summary, runIndexes) {
  const idx = new Set(runIndexes)
  const removed = removedTests(summary)
  const rows = []
  for (const [key, entries] of Object.entries(summary.results)) {
    const inside = entries.filter((e) => idx.has(e[0]))
    if (!inside.length) continue
    const meta = summary.tests[key]
    const row = {
      key, meta, module: moduleOfTest(meta), n: inside.length, removed: removed.get(key) ?? null,
      passed: 0, flaky: 0, failed: 0, skipped: 0, retries: 0,
      durSum: 0, durN: 0, maxDur: 0, cells: new Map(), sigs: new Set(),
    }
    for (const [runIndex, outcome, dur, sig, retries] of inside) {
      row[outcome]++
      row.retries += retries ?? 0
      row.cells.set(runIndex, outcome)
      if (sig != null && outcome !== 'passed') row.sigs.add(sig)
      if (outcome !== 'skipped' && dur != null) {
        row.durSum += dur
        row.durN++
        row.maxDur = Math.max(row.maxDur, dur)
      }
    }
    const last = inside[inside.length - 1]
    row.last = last[1]
    row.lastRun = last[0]
    row.avgDur = row.durN ? row.durSum / row.durN : null
    row.rate = successRate({ total: row.n, ...row })
    row.firstSeen = entries[0][0]
    rows.push(row)
  }
  return rows
}

// Diferencias entre una ejecución y la anterior: fallos nuevos, arreglados y tests nuevos
export function compareRuns(summary, runIndex) {
  const prev = runIndex - 1
  const out = { newFailures: [], fixed: [], newTests: [] }
  if (runIndex < 0) return out
  for (const [key, entries] of Object.entries(summary.results)) {
    const cur = entries.find((e) => e[0] === runIndex)
    if (!cur) continue
    const before = entries.find((e) => e[0] === prev)
    if (entries[0][0] === runIndex && runIndex > 0) out.newTests.push({ key, outcome: cur[1] })
    if (!before) continue
    const ok = (o) => o === 'passed' || o === 'flaky'
    if (cur[1] === 'failed' && ok(before[1])) out.newFailures.push({ key, sig: cur[3] })
    if (ok(cur[1]) && before[1] === 'failed') out.fixed.push({ key })
  }
  return out
}

export function signatureRows(summary, runIndexes) {
  const idx = new Set(runIndexes)
  const map = new Map()
  for (const [key, entries] of Object.entries(summary.results)) {
    for (const [runIndex, outcome, , sig] of entries) {
      if (sig == null || !idx.has(runIndex) || outcome === 'passed') continue
      let row = map.get(sig)
      if (!row) {
        row = { sig, info: summary.signatures[sig], count: 0, failed: 0, flaky: 0, tests: new Map(), runs: new Map(), first: runIndex, last: runIndex }
        map.set(sig, row)
      }
      row.count++
      row[outcome === 'flaky' ? 'flaky' : 'failed']++
      row.tests.set(key, (row.tests.get(key) ?? 0) + 1)
      row.runs.set(runIndex, (row.runs.get(runIndex) ?? 0) + 1)
      row.first = Math.min(row.first, runIndex)
      row.last = Math.max(row.last, runIndex)
    }
  }
  // Nuevo: no había aparecido nunca antes del primer día del periodo.
  // Ya no aparece: todos los tests afectados se han vuelto a ejecutar (sin saltarse) después de su última aparición
  // o se han eliminado. Si alguno no se ha ejecutado desde entonces no hay pruebas de que esté arreglado y sigue activo.
  const removed = removedTests(summary)
  const start = Math.min(...runIndexes)
  const firstEver = new Map()
  for (const entries of Object.values(summary.results)) {
    for (const [runIndex, outcome, , sig] of entries) {
      if (sig != null && outcome !== 'passed' && !(firstEver.get(sig) <= runIndex)) firstEver.set(sig, runIndex)
    }
  }
  for (const row of map.values()) {
    row.isNew = firstEver.get(row.sig) >= start
    const keys = [...row.tests.keys()]
    row.removedTests = keys.filter((key) => removed.has(key)).length
    row.gone = keys.every((key) => removed.has(key) ||
      summary.results[key].some(([runIndex, outcome]) => runIndex > row.last && idx.has(runIndex) && outcome !== 'skipped'))
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

export function moduleRows(rows, runIndexes) {
  const map = new Map()
  for (const r of rows) {
    let m = map.get(r.module)
    if (!m) {
      m = { module: r.module, tests: 0, removed: 0, total: 0, passed: 0, flaky: 0, failed: 0, skipped: 0, perRun: new Map(), worst: [], rows: [] }
      map.set(r.module, m)
    }
    m.tests++
    if (r.removed) m.removed++
    m.total += r.n
    for (const k of ['passed', 'flaky', 'failed', 'skipped']) m[k] += r[k]
    for (const [runIndex, outcome] of r.cells) {
      const pr = m.perRun.get(runIndex) ?? { ...EMPTY_STATS }
      pr.total++
      pr[outcome]++
      m.perRun.set(runIndex, pr)
    }
    m.rows.push(r)
    // Los eliminados no cuentan entre los más problemáticos: ya no se ejecutan
    if ((r.failed || r.flaky) && !r.removed) m.worst.push(r)
  }
  const out = [...map.values()]
  for (const m of out) {
    m.rate = successRate(m)
    m.worst.sort((a, b) => b.failed - a.failed || b.flaky - a.flaky)
    m.rows.sort((a, b) => b.failed - a.failed || b.flaky - a.flaky || b.skipped - a.skipped || a.meta.title.localeCompare(b.meta.title))
    m.runs = runIndexes.map((i) => [i, m.perRun.get(i)])
  }
  return out.sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1))
}

// Agrupa por semana cuando hay demasiadas ejecuciones para una barra por ejecución
export function chartBuckets(runs, maxBars = 45) {
  if (runs.length <= maxBars) {
    return runs.map((r) => ({ id: r.id, label: r.date, time: r.time, runs: [r], ...r.stats, duration: r.duration }))
  }
  const map = new Map()
  for (const r of runs) {
    const d = new Date(r.date + 'T00:00:00')
    const day = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - day)
    const monday = d.toISOString().slice(0, 10)
    const b = map.get(monday) ?? { id: null, label: monday, week: true, runs: [], ...EMPTY_STATS, duration: 0 }
    b.runs.push(r)
    for (const k of Object.keys(EMPTY_STATS)) b[k] += r.stats[k]
    b.duration += r.duration
    map.set(monday, b)
  }
  return [...map.values()].map((b) => ({ ...b, duration: b.duration / b.runs.length }))
}
