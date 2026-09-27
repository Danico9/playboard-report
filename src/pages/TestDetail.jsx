import { useMemo } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { TestDurationChart } from '../components/charts'
import AnsiBlock from '../components/AnsiBlock'
import KnownIssues from '../components/KnownIssues'
import NoteLinks from '../components/NoteLinks'
import { Empty, ErrorBox, HistoryStrip, Kpi, Loading, ModuleTag, StatusChip, StatusLegend } from '../components/ui'
import { moduleName, moduleOfTest } from '../config/modules'
import { fmtDate, fmtDuration, fmtPct, plural } from '../lib/format'
import { successRate } from '../lib/stats'
import { issuesForTest, useKnownIssues, useSummary } from '../lib/store'
import { periodSearch } from '../lib/usePeriod'
import { t } from '../i18n'

export default function TestDetail() {
  const [params] = useSearchParams()
  const location = useLocation()
  const key = params.get('k')
  const res = useSummary()
  const summary = res.data
  const knownIssues = useKnownIssues()

  const data = useMemo(() => {
    if (!summary || !summary.results[key]) return null
    const runs = summary.runs.map((r, index) => ({ ...r, index }))
    const entries = summary.results[key]
    const points = entries.map(([i, outcome, duration, sig, retries]) => ({ run: runs[i], outcome, duration, sig, retries, date: runs[i].date, time: runs[i].time }))
    const stats = { total: points.length, passed: 0, failed: 0, flaky: 0, skipped: 0 }
    for (const p of points) stats[p.outcome]++
    const bySig = new Map()
    for (const p of points) {
      if (p.sig == null || p.outcome === 'passed') continue
      const g = bySig.get(p.sig) ?? { sig: p.sig, info: summary.signatures[p.sig], points: [] }
      g.points.push(p)
      bySig.set(p.sig, g)
    }
    const executed = points.filter((p) => p.outcome !== 'skipped')
    return {
      runs, points, stats,
      cells: new Map(entries.map((e) => [e[0], e[1]])),
      errors: [...bySig.values()].sort((a, b) => b.points.length - a.points.length),
      avg: executed.length ? executed.reduce((a, p) => a + p.duration, 0) / executed.length : null,
      executed,
    }
  }, [summary, key])

  if (res.status === 'error' && !summary) return <ErrorBox error={res.error} />
  if (!summary) return <Loading />
  const meta = summary.tests[key]
  if (!meta || !data) return <Empty>{t('No se encontró el test.')} <Link to="/tests">{t('Volver a Tests')}</Link></Empty>

  const issues = issuesForTest(knownIssues, meta)
  const runLink = (p) => `/ejecucion/${encodeURIComponent(p.run.id)}${periodSearch(location.search, { t: meta.testId })}`
  const first = data.points[0]
  const last = data.points.at(-1)

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack">
          <div className="row small muted"><Link to={`/tests${periodSearch(location.search)}`}>← {t('Tests')}</Link></div>
          <div className="row wrap">
            <StatusChip outcome={last.outcome}>{t('Última')}: {fmtDate(last.date, 'd MMM')}</StatusChip>
            <ModuleTag id={moduleOfTest(meta)} />
            <span className="chip neutral">{moduleName(moduleOfTest(meta))}</span>
            <span className="chip neutral">{meta.project}</span>
          </div>
          <h1>{[...meta.path, meta.title].join(' › ')}</h1>
          <p className="test-sub">{meta.file}{meta.location ? ` · ${meta.location}` : ''}</p>
        </div>
      </div>

      <KnownIssues issues={issues} />

      <div className="grid kpis">
        <Kpi hero label={t('% de éxito histórico')} value={fmtPct(successRate(data.stats))} sub={plural(data.stats.total, 'ejecución', 'ejecuciones')} />
        <Kpi label={t('Fallidos')} value={data.stats.failed} sub={fmtPct(data.stats.failed / data.stats.total, 0)} />
        <Kpi label={t('Flaky')} value={data.stats.flaky} />
        <Kpi label={t('Saltados')} value={data.stats.skipped} />
        <Kpi label={t('Duración media')} value={fmtDuration(data.avg)} />
        <Kpi label={t('Visto por primera vez')} value={fmtDate(first.date, 'd MMM')} sub={fmtDate(first.date, 'yyyy')} />
      </div>

      <div className="card">
        <div className="card-head"><div><h2>{t('Historial')}</h2><p>{t('Un cuadrado por ejecución (todas las ejecuciones). Clic para abrir el test en esa ejecución.')}</p></div><StatusLegend /></div>
        <HistoryStrip runs={data.runs} cells={data.cells} testId={meta.testId} />
      </div>

      {data.executed.length > 1 && (
        <div className="card">
          <div className="card-head"><div><h2>{t('Duración')}</h2><p>{t('El color de cada punto indica el estado de esa ejecución')}</p></div></div>
          <TestDurationChart points={data.executed} />
        </div>
      )}

      {data.errors.length > 0 && (
        <div className="card">
          <div className="card-head"><div><h2>{t('Errores')}</h2><p>{t('Agrupados por tipo de error · {n} distintos', { n: data.errors.length })}</p></div></div>
          <div className="stack" style={{ gap: 14 }}>
            {data.errors.map((g) => (
              <details key={g.sig} className="fold">
                <summary>
                  <b>{g.points.length}×</b> {g.info.title}
                  <span className="muted small"> · {g.info.location} · {t('última')} {fmtDate(g.points.at(-1).date, 'd MMM')}</span>
                </summary>
                <AnsiBlock text={g.info.sample} />
              </details>
            ))}
          </div>
        </div>
      )}

      <div className="card flush">
        <div className="card-head"><div><h2>{t('Ejecuciones')}</h2></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('Fecha')}</th><th>{t('Estado')}</th><th className="num">{t('Duración')}</th><th className="num">{t('Reint.')}</th><th>{t('Error')}</th></tr></thead>
            <tbody>
              {[...data.points].reverse().map((p) => (
                <tr key={p.run.id}>
                  <td className="nowrap"><Link to={runLink(p)}>{fmtDate(p.date, 'EEE d MMM yyyy')} · {p.time}</Link></td>
                  <td><StatusChip outcome={p.outcome} /></td>
                  <td className="num">{p.outcome === 'skipped' ? '—' : fmtDuration(p.duration)}</td>
                  <td className="num">{p.retries || ''}</td>
                  <td className="small text-2 truncate" style={{ maxWidth: 600 }} title={p.sig != null ? summary.signatures[p.sig].title : ''}>
                    {p.sig != null ? summary.signatures[p.sig].title : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <NoteLinks meta={meta} />
    </div>
  )
}
