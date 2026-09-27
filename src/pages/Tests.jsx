import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import PeriodToolbar from '../components/PeriodToolbar'
import { Empty, ErrorBox, HistoryStrip, Loading, ModuleTag, StatusChip, StatusLegend } from '../components/ui'
import { useReport } from '../lib/useReport'
import { testRows } from '../lib/stats'
import { healthOf } from '../config/status'
import { moduleName } from '../config/modules'
import { fmtDuration, fmtPct } from '../lib/format'
import { periodSearch } from '../lib/usePeriod'
import { useKnownIssues, issuesForTest } from '../lib/store'
import { t } from '../i18n'
import { IssueBadge } from '../components/KnownIssues'

const FILTERS = [
  ['all', 'Todos'],
  ['failing', 'Con fallos'],
  ['flaky', 'Con flaky'],
  ['unstable', 'Con fallos o flaky'],
  ['green', 'Siempre OK'],
  ['skipped', 'Con saltados'],
  ['last-failed', 'Fallan en la última'],
]

const COLUMNS = [
  ['name', 'Test'], ['module', 'Módulo'], ['n', 'Ejec.'], ['rate', '% éxito'], ['failed', '✕'],
  ['flaky', '↻'], ['skipped', '⤼'], ['avgDur', 'Dur. media'], ['last', 'Última'],
]

export default function Tests() {
  const { res, summary, period, setPeriod, runs, runIndexes } = useReport()
  const navigate = useNavigate()
  const location = useLocation()
  const knownIssues = useKnownIssues()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('unstable')
  const [mod, setMod] = useState('')
  const [project, setProject] = useState('')
  const [sort, setSort] = useState({ key: 'failed', dir: -1 })
  const [limit, setLimit] = useState(150)

  const rows = useMemo(() => (summary ? testRows(summary, runIndexes) : []), [summary, runIndexes])
  const lastIndex = runs.at(-1)?.index

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pass = {
      all: () => true,
      failing: (r) => r.failed > 0,
      flaky: (r) => r.flaky > 0,
      unstable: (r) => r.failed > 0 || r.flaky > 0,
      green: (r) => !r.failed && !r.flaky && r.passed > 0,
      skipped: (r) => r.skipped > 0,
      'last-failed': (r) => r.cells.get(lastIndex) === 'failed',
    }[filter]
    const out = rows.filter((r) =>
      pass(r) && (!mod || r.module === mod) && (!project || r.meta.project === project) &&
      (!q || [r.meta.title, ...r.meta.path, r.meta.file].join(' ').toLowerCase().includes(q)))
    const val = (r) => ({
      name: `${r.meta.file} ${r.meta.title}`, module: r.module, last: r.last, rate: r.rate ?? -1,
    }[sort.key] ?? r[sort.key] ?? -1)
    return out.sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb
      return c * sort.dir || b.failed - a.failed || b.flaky - a.flaky
    })
  }, [rows, query, filter, mod, project, sort, lastIndex])

  const modules = useMemo(() => [...new Set(rows.map((r) => r.module))].sort(), [rows])
  const projects = useMemo(() => [...new Set(rows.map((r) => r.meta.project))].sort(), [rows])

  if (res.status === 'error' && !summary) return <ErrorBox error={res.error} />
  if (!summary) return <Loading />

  const setSortKey = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : ['name', 'module'].includes(key) ? 1 : -1 }))
  const stripRuns = runs.slice(-40)

  return (
    <div className="page">
      <PeriodToolbar period={period} setPeriod={setPeriod} latestDate={summary.runs.at(-1)?.date} runCount={runs.length} />
      <div className="page-head">
        <div>
          <h1>{t('Tests')}</h1>
          <p>{t('Estadísticas de cada test en el periodo. El historial muestra un cuadrado por ejecución')}{runs.length > 40 ? ` ${t('(últimas 40)')}` : ''}.</p>
        </div>
        <StatusLegend />
      </div>

      <div className="card flush">
        <div className="card-head" style={{ flexWrap: 'wrap', paddingBottom: 12 }}>
          <div className="filters">
            <div className="seg">
              {FILTERS.map(([k, label]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{t(label)}</button>)}
            </div>
            <input className="input search" placeholder={t('Buscar test o fichero…')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="select" value={mod} onChange={(e) => setMod(e.target.value)} aria-label={t('Módulo')}>
              <option value="">{t('Todos los módulos')}</option>
              {modules.map((m) => <option key={m} value={m}>{moduleName(m)}</option>)}
            </select>
            <select className="select" value={project} onChange={(e) => setProject(e.target.value)} aria-label={t('Proyecto')}>
              <option value="">{t('Todos los proyectos')}</option>
              {projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <span className="muted small">{t('{a} de {b} tests', { a: list.length, b: rows.length })}</span>
        </div>
        {list.length === 0 ? <Empty>{t('Ningún test coincide con los filtros.')}</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {COLUMNS.map(([k, label]) => (
                    <th key={k} className={`sortable${['n', 'rate', 'failed', 'flaky', 'skipped', 'avgDur'].includes(k) ? ' num' : ''}`} onClick={() => setSortKey(k)}>
                      {t(label)}{sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                  <th>{t('Historial')}</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, limit).map((r) => {
                  const issues = issuesForTest(knownIssues, r.meta)
                  return (
                    <tr key={r.key} className="clickable" onClick={() => navigate(`/test${periodSearch(location.search, { k: r.key })}`)}>
                      <td style={{ maxWidth: 480 }}>
                        <div className="test-title">{[...r.meta.path, r.meta.title].join(' › ')}</div>
                        <div className="test-sub truncate">{r.meta.file} · {r.meta.project}</div>
                        <IssueBadge issues={issues} />
                      </td>
                      <td><ModuleTag id={r.module} /></td>
                      <td className="num">{r.n}</td>
                      <td className="num">{r.rate == null ? '—' : <span className={`chip ${healthOf(r.rate)}`}>{fmtPct(r.rate, 0)}</span>}</td>
                      <td className="num">{r.failed ? <b>{r.failed}</b> : <span className="muted">0</span>}</td>
                      <td className="num">{r.flaky || <span className="muted">0</span>}</td>
                      <td className="num">{r.skipped || <span className="muted">0</span>}</td>
                      <td className="num">{fmtDuration(r.avgDur)}</td>
                      <td><StatusChip outcome={r.last} /></td>
                      <td><HistoryStrip runs={stripRuns} cells={r.cells} testId={r.meta.testId} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {list.length > limit && (
              <div className="empty"><button className="btn" onClick={() => setLimit((l) => l + 300)}>{t('Mostrar más ({n} restantes)', { n: list.length - limit })}</button></div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
