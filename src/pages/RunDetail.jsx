import { Fragment, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import TestDrawer from '../components/TestDrawer'
import { Empty, ErrorBox, Kpi, Loading, ModuleTag, StatusBar, StatusChip } from '../components/ui'
import { STATUS, STATUS_ORDER } from '../config/status'
import { moduleId, moduleName } from '../config/modules'
import { fmtDate, fmtDuration, fmtNum, fmtPct, plural } from '../lib/format'
import { successRate } from '../lib/stats'
import { useKnownIssues, useRunDetail, useSummary, issuesForTest } from '../lib/store'
import { periodSearch } from '../lib/usePeriod'
import { t } from '../i18n'
import { IssueBadge } from '../components/KnownIssues'

const SEVERITY = { failed: 0, flaky: 1, skipped: 2, passed: 3 }

export default function RunDetail() {
  const { id } = useParams()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { data: summary } = useSummary()
  const res = useRunDetail(id)
  const knownIssues = useKnownIssues()

  const [statuses, setStatuses] = useState(() => new Set(['failed', 'flaky']))
  const [query, setQuery] = useState('')
  const [mod, setMod] = useState('')
  const [group, setGroup] = useState('file')
  const [sort, setSort] = useState('status')

  const detail = res.data
  const tests = useMemo(() => (detail?.tests ?? []).map((x) => ({ ...x, module: moduleId(x.module) })), [detail])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sig = (x) => (x.sig != null ? summary?.signatures[x.sig]?.title ?? '' : '')
    const list = tests.filter((x) =>
      statuses.has(x.outcome) &&
      (!mod || x.module === mod) &&
      (!q || [x.title, ...x.path, x.file, sig(x)].join(' ').toLowerCase().includes(q)))
    const cmp = {
      status: (a, b) => SEVERITY[a.outcome] - SEVERITY[b.outcome] || a.file.localeCompare(b.file),
      duration: (a, b) => b.duration - a.duration,
      name: (a, b) => a.file.localeCompare(b.file) || a.title.localeCompare(b.title),
    }[sort]
    return list.sort(cmp)
  }, [tests, statuses, query, mod, sort, summary])

  const groups = useMemo(() => {
    if (group === 'none') return [[null, filtered]]
    const map = new Map()
    for (const x of filtered) {
      const k = group === 'file' ? x.file : x.module
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(x)
    }
    return [...map.entries()].sort((a, b) =>
      Math.min(...a[1].map((x) => SEVERITY[x.outcome])) - Math.min(...b[1].map((x) => SEVERITY[x.outcome])) || String(a[0]).localeCompare(String(b[0])))
  }, [filtered, group])

  const modules = useMemo(() => {
    const map = new Map()
    for (const x of tests) {
      const m = map.get(x.module) ?? { module: x.module, total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 }
      m.total++
      m[x.outcome]++
      map.set(x.module, m)
    }
    return [...map.values()].sort((a, b) => b.failed - a.failed || b.flaky - a.flaky || b.total - a.total)
  }, [tests])

  if (res.status === 'error' && !detail) return <ErrorBox error={res.error} />
  if (!detail) return <Loading what="ejecución" />

  const run = detail.run
  const runIndex = summary?.runs.findIndex((r) => r.id === run.id) ?? -1
  const prev = runIndex > 0 ? summary.runs[runIndex - 1] : null
  const next = runIndex >= 0 ? summary.runs[runIndex + 1] : null
  const selected = params.get('t') ? tests.find((x) => x.testId === params.get('t')) : null
  const counts = Object.fromEntries(STATUS_ORDER.map((k) => [k, tests.filter((x) => x.outcome === k).length]))
  const toggle = (k) => setStatuses((s) => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    return n
  })
  const openTest = (x) => setParams((p) => { const n = new URLSearchParams(p); n.set('t', x.testId); return n })
  const closeTest = () => setParams((p) => { const n = new URLSearchParams(p); n.delete('t'); return n })
  const runLink = (r) => `/ejecucion/${encodeURIComponent(r.id)}${periodSearch(location.search)}`

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="row small muted"><Link to={`/ejecuciones${periodSearch(location.search)}`}>← {t('Ejecuciones')}</Link></div>
          <h1>{fmtDate(run.date, "EEEE d 'de' MMMM yyyy")} · {run.time}</h1>
          <p>
            {fmtDuration(run.duration)} · {run.workers ?? '?'} {t('workers')} · {run.projects.join(', ')}
            {run.branch && <> · {t('rama')} <span className="mono">{run.branch}</span></>}
          </p>
          {run.commit && (
            <p className="small">
              {t('Commit')} {run.commit.href ? <a href={run.commit.href} target="_blank" rel="noreferrer" className="mono">{run.commit.short}</a> : <span className="mono">{run.commit.short}</span>}
              {' '}<span className="text-2">{run.commit.subject}</span>{run.commit.author && <span className="muted"> · {run.commit.author}</span>}
            </p>
          )}
        </div>
        <div className="row wrap">
          {prev && <Link className="btn" to={runLink(prev)} title={`${prev.date} ${prev.time}`}>◀ {t('Anterior')}</Link>}
          {next && <Link className="btn" to={runLink(next)} title={`${next.date} ${next.time}`}>{t('Siguiente')} ▶</Link>}
          {run.buildHref && <a className="btn" href={run.buildHref} target="_blank" rel="noreferrer">{t('Job del CI')} ↗</a>}
          <a className="btn primary" href={`/reports/playwright-reports/${encodeURIComponent(run.id)}/index.html`} target="_blank" rel="noreferrer">{t('Reporte original de Playwright')} ↗</a>
        </div>
      </div>

      <div className="grid kpis">
        <Kpi label={t('% de éxito')} value={fmtPct(successRate(run.stats))} sub={`${fmtNum(run.stats.total)} ${t('tests')}`} />
        {STATUS_ORDER.map((k) => (
          <Kpi key={k} label={<><span style={{ color: STATUS[k].color }}>{STATUS[k].icon}</span>{STATUS[k].plural}</>} value={fmtNum(run.stats[k])} sub={fmtPct(run.stats[k] / run.stats.total)} />
        ))}
      </div>

      <div className="card">
        <div className="card-head"><div><h2>{t('Por módulo')}</h2><p>{t('Clic en un módulo para filtrar la lista')}</p></div></div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {modules.map((m) => (
            <button
              key={m.module}
              className={`card${mod === m.module ? ' on' : ''}`}
              style={{ padding: '10px 12px', textAlign: 'left', cursor: 'pointer', background: mod === m.module ? 'var(--surface-2)' : 'var(--surface)' }}
              onClick={() => setMod(mod === m.module ? '' : m.module)}
            >
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <span><b>{moduleName(m.module)}</b> <span className="muted small">{m.module}</span></span>
                <span className="small text-2">{m.failed ? <b style={{ color: 'var(--failed-text)' }}>{m.failed} ✕</b> : null} {m.flaky ? `${m.flaky} ↻` : null} {m.total} {t('tests')}</span>
              </div>
              <StatusBar stats={m} />
            </button>
          ))}
        </div>
      </div>

      <div className="card flush">
        <div className="card-head" style={{ flexWrap: 'wrap', paddingBottom: 12 }}>
          <div className="filters">
            {STATUS_ORDER.map((k) => (
              <button key={k} className={`toggle${statuses.has(k) ? ' on' : ''}`} onClick={() => toggle(k)} aria-pressed={statuses.has(k)}>
                <span style={{ color: STATUS[k].color }}>{STATUS[k].icon}</span>{STATUS[k].plural}<span className="count">{counts[k]}</span>
              </button>
            ))}
            <input className="input search" placeholder={t('Buscar test, fichero o error…')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="select" value={mod} onChange={(e) => setMod(e.target.value)} aria-label={t('Módulo')}>
              <option value="">{t('Todos los módulos')}</option>
              {modules.map((m) => <option key={m.module} value={m.module}>{moduleName(m.module)}</option>)}
            </select>
            <select className="select" value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t('Agrupar')}>
              <option value="file">{t('Agrupar por fichero')}</option>
              <option value="module">{t('Agrupar por módulo')}</option>
              <option value="none">{t('Sin agrupar')}</option>
            </select>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('Ordenar')}>
              <option value="status">{t('Ordenar por estado')}</option>
              <option value="duration">{t('Ordenar por duración')}</option>
              <option value="name">{t('Ordenar por nombre')}</option>
            </select>
          </div>
          <span className="muted small">{t('{a} de {b} tests', { a: filtered.length, b: tests.length })}</span>
        </div>
        {filtered.length === 0 ? <Empty>{t('Ningún test coincide con los filtros.')}</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th style={{ width: 110 }}>{t('Estado')}</th><th>{t('Test')}</th><th>{t('Módulo')}</th><th>{t('Error')}</th><th className="num">{t('Reint.')}</th><th className="num">{t('Duración')}</th></tr>
              </thead>
              <tbody>
                {groups.map(([name, list]) => (
                  <Fragment key={name ?? 'all'}>
                    {name && (
                      <tr className="group">
                        <td colSpan={6}>
                          <span className={group === 'file' ? 'mono' : ''}>{group === 'module' ? moduleName(name) : name}</span>
                          <span className="muted small"> · {plural(list.length, 'test', 'tests')}</span>
                        </td>
                      </tr>
                    )}
                    {list.map((x) => {
                      const issues = issuesForTest(knownIssues, summary?.tests[x.key])
                      const sig = x.sig != null ? summary?.signatures[x.sig] : null
                      return (
                        <tr key={x.testId} className="clickable" onClick={() => openTest(x)}>
                          <td><StatusChip outcome={x.outcome} /></td>
                          <td style={{ maxWidth: 520 }}>
                            <div className="test-title">{[...x.path, x.title].join(' › ')}</div>
                            {group !== 'file' && <div className="test-sub truncate">{x.file}</div>}
                            <IssueBadge issues={issues} />
                          </td>
                          <td><ModuleTag id={x.module} /></td>
                          <td className="small text-2" style={{ maxWidth: 420 }}>
                            {sig ? <div className="truncate" title={sig.title}>{sig.title}</div> : x.outcome === 'skipped' ? <span className="muted">{x.skipReason === 'not-run' ? t('No llegó a ejecutarse') : 'test.skip()'}</span> : null}
                            {sig?.location && <div className="test-sub truncate">{sig.location}</div>}
                          </td>
                          <td className="num">{x.retries || ''}</td>
                          <td className="num">{fmtDuration(x.duration)}</td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <TestDrawer key={selected.testId} run={run} test={selected} onClose={closeTest} />}
    </div>
  )
}
