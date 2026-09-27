import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { DateRangeFilter } from './PeriodToolbar'
import { Empty, HistoryStrip, ModuleTag, StatusBar, StatusChip } from './ui'
import { successRate, testRows } from '../lib/stats'
import { healthOf } from '../config/status'
import { moduleName } from '../config/modules'
import { fmtDuration, fmtPct, plural } from '../lib/format'
import { periodSearch } from '../lib/usePeriod'
import { useUrlFilters } from '../lib/useUrlFilters'
import { useKnownIssues, issuesForTest } from '../lib/store'
import { t } from '../i18n'
import { IssueBadge } from './KnownIssues'

const FILTERS = [
  ['all', 'Todos'],
  ['failing', 'Con fallos'],
  ['flaky', 'Con flaky'],
  ['unstable', 'Con fallos o flaky'],
  ['green', 'Siempre OK'],
  ['skipped', 'Con saltados'],
  ['last-failed', 'Fallan en la última'],
]

// Cómo se organiza la tabla: lista plana o agrupada (por módulo o por fichero spec)
const VIEWS = [
  ['module', 'Por módulo'],
  ['file', 'Por fichero'],
  ['list', 'Lista'],
]

const COLUMNS = [
  ['name', 'Test'], ['module', 'Módulo'], ['n', 'Ejec.'], ['rate', '% éxito'], ['failed', '✕'],
  ['flaky', '↻'], ['skipped', '⤼'], ['avgDur', 'Dur. media'], ['last', 'Última'],
]
const NUMERIC = ['n', 'rate', 'failed', 'flaky', 'skipped', 'avgDur']

// Filtros en la URL (se pueden enlazar, p. ej. desde la fila de un módulo)
const DEFAULTS = { q: '', f: 'all', mod: '', proj: '', sort: 'failed', dir: '-1', view: 'module' }

function groupRows(list, view) {
  const map = new Map()
  for (const r of list) {
    const key = view === 'file' ? r.meta.file : r.module
    let g = map.get(key)
    if (!g) {
      g = { key, rows: [], n: 0, passed: 0, flaky: 0, failed: 0, skipped: 0 }
      map.set(key, g)
    }
    g.rows.push(r)
    g.n += r.n
    for (const k of ['passed', 'flaky', 'failed', 'skipped']) g[k] += r[k]
  }
  const label = (g) => (view === 'file' ? g.key : moduleName(g.key))
  return [...map.values()]
    .map((g) => ({ ...g, label: label(g), rate: successRate({ total: g.n, ...g }) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

// Tabla de estadísticas de los tests del periodo, agrupable por módulo o por fichero (pestaña «Tests por módulo» de Módulos).
// Recibe lo que devuelve useReport().
export default function TestStatsTable({ summary, period, setPeriod, range, runs, runIndexes }) {
  const navigate = useNavigate()
  const location = useLocation()
  const knownIssues = useKnownIssues()
  const { get, set } = useUrlFilters(DEFAULTS)
  const query = get('q')
  const filter = get('f')
  const mod = get('mod')
  const project = get('proj')
  const view = get('view')
  const sort = { key: get('sort'), dir: Number(get('dir')) || -1 }
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [limit, setLimit] = useState(300)

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
    }[filter] ?? (() => true)
    const out = rows.filter((r) =>
      pass(r) && (!mod || r.module === mod) && (!project || r.meta.project === project) &&
      (!q || [r.meta.title, ...r.meta.path, r.meta.file, r.module, moduleName(r.module)].join(' ').toLowerCase().includes(q)))
    const val = (r) => ({
      name: `${r.meta.file} ${r.meta.title}`, module: r.module, last: r.last, rate: r.rate ?? -1,
    }[sort.key] ?? r[sort.key] ?? -1)
    return out.sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb
      return c * sort.dir || b.failed - a.failed || b.flaky - a.flaky
    })
  }, [rows, query, filter, mod, project, sort.key, sort.dir, lastIndex])

  const groups = useMemo(() => (view === 'list' ? null : groupRows(list, view)), [list, view])
  const modules = useMemo(() => [...new Set(rows.map((r) => r.module))].sort(), [rows])
  const projects = useMemo(() => [...new Set(rows.map((r) => r.meta.project))].sort(), [rows])

  const setSortKey = (key) => {
    const dir = sort.key === key ? -sort.dir : ['name', 'module'].includes(key) ? 1 : -1
    set({ sort: key, dir: String(dir) })
  }
  const toggleGroup = (key) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const stripRuns = runs.slice(-40)
  const hasFilters = query || filter !== DEFAULTS.f || mod || project

  const testRow = (r) => {
    const issues = issuesForTest(knownIssues, r.meta)
    return (
      <tr key={r.key} className="clickable" onClick={() => navigate(`/test${periodSearch(location.search, { k: r.key })}`)}>
        <td style={{ maxWidth: 480 }} className={groups ? 'indent' : ''}>
          <div className="test-title">{[...r.meta.path, r.meta.title].join(' › ')}</div>
          <div className="test-sub truncate">{view === 'file' ? r.meta.project : `${r.meta.file} · ${r.meta.project}`}</div>
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
  }

  const groupHead = (g) => {
    const open = !collapsed.has(g.key)
    return (
      <tr key={`group:${g.key}`} className="group clickable" onClick={() => toggleGroup(g.key)}>
        <td colSpan={3} className="nowrap">
          <button className="group-toggle" aria-expanded={open} onClick={(e) => { e.stopPropagation(); toggleGroup(g.key) }}>
            <span aria-hidden>{open ? '▾' : '▸'}</span>
            <span className={view === 'file' ? 'mono' : ''}>{g.label}</span>
          </button>
          {view === 'module' && <span className="muted small"> {g.key}</span>}
          <span className="muted small"> · {plural(g.rows.length, 'test', 'tests')}</span>
        </td>
        <td className="num">{g.rate == null ? '—' : <span className={`chip ${healthOf(g.rate)}`}>{fmtPct(g.rate, 0)}</span>}</td>
        <td className="num">{g.failed ? g.failed : <span className="muted">0</span>}</td>
        <td className="num">{g.flaky || <span className="muted">0</span>}</td>
        <td className="num">{g.skipped || <span className="muted">0</span>}</td>
        <td colSpan={3}><StatusBar stats={g} /></td>
      </tr>
    )
  }

  return (
    <div className="card flush">
      <div className="card-head stack" style={{ alignItems: 'stretch', paddingBottom: 12 }}>
        <div className="filters">
          <input className="input search" type="search" placeholder={t('Buscar test, fichero o módulo…')} value={query} onChange={(e) => set({ q: e.target.value })} />
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
          <div className="seg" role="group" aria-label={t('Estado')}>
            {FILTERS.map(([k, label]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => set({ f: k })}>{t(label)}</button>)}
          </div>
          <div className="seg" role="group" aria-label={t('Organizar')}>
            {VIEWS.map(([k, label]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => set({ view: k })}>{t(label)}</button>)}
          </div>
          {groups && (
            <>
              <button className="btn" onClick={() => setCollapsed(new Set())}>{t('Desplegar todo')}</button>
              <button className="btn" onClick={() => setCollapsed(new Set(groups.map((g) => g.key)))}>{t('Plegar todo')}</button>
            </>
          )}
          {hasFilters && <button className="btn" onClick={() => set({ q: '', f: DEFAULTS.f, mod: '', proj: '' })}>{t('Quitar filtros')}</button>}
          <span className="spacer" />
          <span className="muted small">
            {t('{a} de {b} tests', { a: list.length, b: rows.length })}
            {groups ? ` · ${view === 'file' ? plural(groups.length, 'fichero', 'ficheros') : plural(groups.length, 'módulo', 'módulos')}` : ''}
          </span>
        </div>
      </div>
      {list.length === 0 ? <Empty>{t('Ningún test coincide con los filtros.')}</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {COLUMNS.map(([k, label]) => (
                  <th key={k} className={`sortable${NUMERIC.includes(k) ? ' num' : ''}`} onClick={() => setSortKey(k)}>
                    {t(label)}{sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th>{t('Historial')}</th>
              </tr>
            </thead>
            <tbody>
              {groups
                ? groups.flatMap((g) => [groupHead(g), ...(collapsed.has(g.key) ? [] : g.rows.map(testRow))])
                : list.slice(0, limit).map(testRow)}
            </tbody>
          </table>
          {!groups && list.length > limit && (
            <div className="empty row" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => setLimit((l) => l + 300)}>{t('Mostrar más ({n} restantes)', { n: list.length - limit })}</button>
              <button className="btn" onClick={() => setLimit(Infinity)}>{t('Mostrar todos')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
