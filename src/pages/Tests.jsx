import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import PeriodToolbar, { DateRangeFilter } from '../components/PeriodToolbar'
import { Empty, ErrorBox, HistoryStrip, Loading, ModuleTag, StatusBar } from '../components/ui'
import { IssueBadge } from '../components/KnownIssues'
import { useReport } from '../lib/useReport'
import { testRows } from '../lib/stats'
import { STATUS, healthOf } from '../config/status'
import { moduleName } from '../config/modules'
import { fmtDuration, fmtPct, plural } from '../lib/format'
import { periodSearch } from '../lib/usePeriod'
import { useUrlFilters } from '../lib/useUrlFilters'
import { useKnownIssues, issuesForTest } from '../lib/store'
import { t } from '../i18n'

// ─── Índice de tests ───
// Como el reporte HTML de Playwright: carpeta → fichero spec → describe → test, en el orden en que están escritos,
// pero con los datos de todo el periodo (estado en la última ejecución, % de éxito, fallos, flaky e historial).

// Estado que se usa para filtrar: el de la última ejecución del periodo en la que se ejecutó el test.
// «Inestables» son los que han fallado o han sido flaky alguna vez en el periodo.
const STATUS_FILTERS = [
  ['all', 'Todos'],
  ['passed', null],
  ['failed', null],
  ['flaky', null],
  ['skipped', null],
  ['unstable', 'Inestables en el periodo'],
]
const statusMatch = {
  all: () => true,
  passed: (r) => r.last === 'passed',
  failed: (r) => r.last === 'failed',
  flaky: (r) => r.last === 'flaky',
  skipped: (r) => r.last === 'skipped',
  unstable: (r) => r.failed > 0 || r.flaky > 0,
}

const DEFAULTS = { q: '', s: 'all', mod: '', proj: '' }
const HISTORY_RUNS = 20

// 'flows/flows-003-payments-card.spec.ts:42' → ['flows/flows-003-payments-card.spec.ts', 42]
function splitLocation(location) {
  const m = /^(.*):(\d+)(?::\d+)?$/.exec(location ?? '')
  return m ? [m[1], Number(m[2])] : [location ?? '', 0]
}

const folderOf = (file) => (file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '')
const baseName = (file) => file.slice(file.lastIndexOf('/') + 1)

function countStats(rows) {
  const s = { total: rows.length, passed: 0, failed: 0, flaky: 0, skipped: 0 }
  for (const r of rows) if (s[r.last] != null) s[r.last]++
  return s
}

// Árbol carpeta → fichero → tests ordenados por su posición en el código
function buildTree(rows) {
  const folders = new Map()
  for (const r of rows) {
    const folder = folderOf(r.meta.file)
    if (!folders.has(folder)) folders.set(folder, new Map())
    const files = folders.get(folder)
    if (!files.has(r.meta.file)) files.set(r.meta.file, [])
    files.get(r.meta.file).push(r)
  }
  const byPosition = (a, b) => {
    const [fa, la] = splitLocation(a.meta.location)
    const [fb, lb] = splitLocation(b.meta.location)
    return fa.localeCompare(fb) || la - lb || a.meta.project.localeCompare(b.meta.project)
  }
  return [...folders.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, files]) => {
      const list = [...files.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, tests]) => {
          tests.sort(byPosition)
          const modules = [...new Set(tests.map((r) => r.module))]
          return { key: `file:${file}`, file, tests, modules, stats: countStats(tests) }
        })
      return { key: `folder:${folder}`, folder, files: list, stats: countStats(list.flatMap((f) => f.tests)) }
    })
}

function Counts({ stats }) {
  return (
    <span className="tree-counts">
      {['failed', 'flaky', 'skipped', 'passed'].map((k) => stats[k] > 0 && (
        <span key={k} className={`tree-count ${k}`} title={STATUS[k].plural}><span aria-hidden>{STATUS[k].icon}</span> {stats[k]}</span>
      ))}
    </span>
  )
}

function Caret({ open }) {
  return <span className="caret" aria-hidden>{open ? '▾' : '▸'}</span>
}

export default function Tests() {
  const { res, summary, period, setPeriod, range, runs, runIndexes } = useReport()
  const navigate = useNavigate()
  const location = useLocation()
  const knownIssues = useKnownIssues()
  const { get, set } = useUrlFilters(DEFAULTS)
  const query = get('q')
  const status = statusMatch[get('s')] ? get('s') : 'all'
  const mod = get('mod')
  const project = get('proj')
  const [collapsed, setCollapsed] = useState(() => new Set())

  const rows = useMemo(() => (summary ? testRows(summary, runIndexes) : []), [summary, runIndexes])
  const modules = useMemo(() => [...new Set(rows.map((r) => r.module))].sort(), [rows])
  const projects = useMemo(() => [...new Set(rows.map((r) => r.meta.project))].sort(), [rows])

  // Primero búsqueda, módulo y proyecto (los contadores de estado salen de aquí); después el estado
  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => (!mod || r.module === mod) && (!project || r.meta.project === project) &&
      (!q || [r.meta.title, ...r.meta.path, r.meta.file, ...(r.meta.tags ?? []), r.module, moduleName(r.module)].join(' ').toLowerCase().includes(q)))
  }, [rows, query, mod, project])
  const counts = useMemo(() => ({ ...countStats(scoped), unstable: scoped.filter(statusMatch.unstable).length }), [scoped])
  const tree = useMemo(() => buildTree(scoped.filter(statusMatch[status])), [scoped, status])

  if (res.status === 'error' && !summary) return <ErrorBox error={res.error} />
  if (!summary) return <Loading />

  const toggle = (key) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const allKeys = () => tree.flatMap((f) => [f.key, ...f.files.map((x) => x.key)])
  const stripRuns = runs.slice(-HISTORY_RUNS)
  const shown = tree.reduce((a, f) => a + f.stats.total, 0)
  const fileCount = tree.reduce((a, f) => a + f.files.length, 0)
  const hasFilters = query || status !== 'all' || mod || project

  const testRow = (r) => {
    const issues = issuesForTest(knownIssues, r.meta)
    const [, line] = splitLocation(r.meta.location)
    const st = STATUS[r.last]
    return (
      <div
        key={r.key}
        className="tree-test"
        role="link"
        tabIndex={0}
        style={{ paddingLeft: 18 + r.meta.path.length * 18 }}
        onClick={() => navigate(`/test${periodSearch(location.search, { k: r.key })}`)}
        onKeyDown={(e) => e.key === 'Enter' && navigate(`/test${periodSearch(location.search, { k: r.key })}`)}
      >
        <span className={`tree-status ${r.last}`} title={`${t('Última')}: ${st?.label}`}>{st?.icon}</span>
        <div className="tree-test-main">
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="test-title">{r.meta.title}</span>
            {(r.meta.tags ?? []).map((tag) => <span key={tag} className="chip neutral tag">{tag}</span>)}
            <IssueBadge issues={issues} />
          </div>
          <div className="test-sub">
            {line ? `${baseName(splitLocation(r.meta.location)[0])}:${line} · ` : ''}{r.meta.project}
          </div>
        </div>
        <div className="tree-test-stats">
          <span className="num" style={{ width: 52 }}>{r.rate == null ? '—' : <span className={`chip ${healthOf(r.rate)}`}>{fmtPct(r.rate, 0)}</span>}</span>
          <span className="num small text-2" style={{ width: 88 }} title={`${STATUS.failed.plural} · ${STATUS.flaky.plural} · ${t('ejecuciones')}`}>
            {r.failed ? <b className="failed-text">{r.failed} ✕</b> : <span className="muted">0 ✕</span>} · {r.flaky ? `${r.flaky} ↻` : <span className="muted">0 ↻</span>}
          </span>
          <span className="num small text-2" style={{ width: 64 }}>{fmtDuration(r.avgDur)}</span>
          <HistoryStrip runs={stripRuns} cells={r.cells} testId={r.meta.testId} />
        </div>
      </div>
    )
  }

  // Tests de un fichero con las cabeceras de sus describe (se repiten solo cuando cambia el bloque)
  const fileBody = (f) => {
    const out = []
    let prev = []
    for (const r of f.tests) {
      const p = r.meta.path
      let d = 0
      while (d < p.length && d < prev.length && p[d] === prev[d]) d++
      for (let i = d; i < p.length; i++) {
        out.push(<div key={`${r.key}:describe:${i}`} className="tree-describe" style={{ paddingLeft: 18 + i * 18 }}>{p[i]}</div>)
      }
      out.push(testRow(r))
      prev = p
    }
    return out
  }

  return (
    <div className="page">
      <PeriodToolbar period={period} setPeriod={setPeriod} latestDate={summary.runs.at(-1)?.date} runCount={runs.length} />
      <div className="page-head">
        <div>
          <h1>{t('Tests')}</h1>
          <p>{t('Índice de tests como en el reporte de Playwright: por carpeta, fichero y describe, en el orden del código. El icono es el estado en la última ejecución del periodo; el historial, las últimas 20.')}</p>
        </div>
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <div className="filters">
          <input className="input search" type="search" placeholder={t('Buscar test, fichero, tag o módulo…')} value={query} onChange={(e) => set({ q: e.target.value })} />
          <select className="select" value={mod} onChange={(e) => set({ mod: e.target.value })} aria-label={t('Módulo')}>
            <option value="">{t('Todos los módulos')}</option>
            {modules.map((m) => <option key={m} value={m}>{moduleName(m)}</option>)}
          </select>
          <select className="select" value={project} onChange={(e) => set({ proj: e.target.value })} aria-label={t('Proyecto')}>
            <option value="">{t('Todos los proyectos')}</option>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <DateRangeFilter period={period} setPeriod={setPeriod} range={range} firstDate={summary.runs[0]?.date} latestDate={summary.runs.at(-1)?.date} />
        </div>
        <div className="filters">
          <div className="seg" role="group" aria-label={t('Estado en la última ejecución')}>
            {STATUS_FILTERS.map(([k, label]) => (
              <button key={k} className={status === k ? 'on' : ''} onClick={() => set({ s: k })}>
                {STATUS[k] ? <><span className={`tree-status inline ${k}`} aria-hidden>{STATUS[k].icon}</span> {STATUS[k].plural}</> : t(label)}
                <span className="seg-count">{k === 'all' ? counts.total : counts[k]}</span>
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => setCollapsed(new Set())}>{t('Desplegar todo')}</button>
          <button className="btn" onClick={() => setCollapsed(new Set(allKeys()))}>{t('Plegar todo')}</button>
          {hasFilters && <button className="btn" onClick={() => set({ q: '', s: 'all', mod: '', proj: '' })}>{t('Quitar filtros')}</button>}
          <span className="spacer" />
          <span className="muted small">{t('{a} de {b} tests', { a: shown, b: rows.length })} · {plural(fileCount, 'fichero', 'ficheros')}</span>
        </div>
      </div>

      {tree.length === 0 ? <Empty>{t('Ningún test coincide con los filtros.')}</Empty> : tree.map((folder) => {
        const folderOpen = !collapsed.has(folder.key)
        return (
          <section key={folder.key} className="tree-folder">
            <button className="tree-folder-head" aria-expanded={folderOpen} onClick={() => toggle(folder.key)}>
              <Caret open={folderOpen} />
              <span className="mono">{folder.folder ? `${folder.folder}/` : t('(raíz)')}</span>
              <span className="muted small">{plural(folder.files.length, 'fichero', 'ficheros')} · {plural(folder.stats.total, 'test', 'tests')}</span>
              <Counts stats={folder.stats} />
            </button>
            {folderOpen && folder.files.map((f) => {
              const open = !collapsed.has(f.key)
              return (
                <div key={f.key} className="tree-file">
                  <button className="tree-file-head" aria-expanded={open} onClick={() => toggle(f.key)}>
                    <Caret open={open} />
                    <span className="mono tree-file-name">{baseName(f.file)}</span>
                    {f.modules.map((m) => <ModuleTag key={m} id={m} />)}
                    <span className="spacer" />
                    <Counts stats={f.stats} />
                    <span style={{ width: 90 }}><StatusBar stats={f.stats} /></span>
                  </button>
                  {open && <div className="tree-file-body">{fileBody(f)}</div>}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
