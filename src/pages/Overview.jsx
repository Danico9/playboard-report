import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import PeriodToolbar from '../components/PeriodToolbar'
import { DurationChart, RateChart, RunsChart } from '../components/charts'
import { Empty, ErrorBox, Kpi, Loading, StatusBar, StatusChip, StatusLegend, TestLink } from '../components/ui'
import { useReport } from '../lib/useReport'
import { pendingZips, useZips } from '../lib/store'
import { ReportsHelp } from '../components/Help'
import { t } from '../i18n'
import { chartBuckets, compareRuns, successRate, sumStats, testRows } from '../lib/stats'
import { fmtDate, fmtDuration, fmtNum, fmtPct, fmtSigned, plural } from '../lib/format'
import { PREVIOUS_LABEL } from '../lib/period'
import { periodSearch } from '../lib/usePeriod'

function delta(cur, prev, { unit = '', higherIsGood = true, scale = 1, label }) {
  if (cur == null || prev == null) return null
  const d = (cur - prev) * scale
  const text = fmtSigned(Math.round(d * 10) / 10, unit)
  if (!text) return { text: `= ${label}`, tone: 'neutral' }
  return { text: `${text} ${label}`, tone: (d > 0) === higherIsGood ? 'good' : 'bad' }
}

function TopList({ title, sub, rows, value, empty }) {
  return (
    <div className="card">
      <div className="card-head">
        <div><h2>{t(title)}</h2>{sub && <p>{t(sub)}</p>}</div>
      </div>
      {rows.length ? (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="grow"><TestLink testKey={r.key} meta={r.meta} /></div>
              {value(r)}
            </li>
          ))}
        </ul>
      ) : <div className="muted small">{t(empty)}</div>}
    </div>
  )
}

export default function Overview() {
  const { res, summary, period, setPeriod, runs, prevRuns, runIndexes } = useReport()
  const navigate = useNavigate()
  const location = useLocation()
  const pending = pendingZips(useZips().data).length

  const data = useMemo(() => {
    if (!summary || !runs.length) return null
    const stats = sumStats(runs.map((r) => r.stats))
    const prevStats = prevRuns?.length ? sumStats(prevRuns.map((r) => r.stats)) : null
    const rows = testRows(summary, runIndexes)
    const lastRun = runs.at(-1)
    const diff = compareRuns(summary, lastRun.index)
    return {
      stats, prevStats, rows, lastRun, diff,
      avgDuration: runs.reduce((a, r) => a + r.duration, 0) / runs.length,
      prevAvgDuration: prevRuns?.length ? prevRuns.reduce((a, r) => a + r.duration, 0) / prevRuns.length : null,
      buckets: chartBuckets(runs),
    }
  }, [summary, runs, prevRuns, runIndexes])

  if (res.status === 'error' && !summary) return <ErrorBox error={res.error} />
  if (!summary) return <Loading what="reportes (la primera vez se procesan todos, puede tardar ~30 s)" />

  const toolbar = <PeriodToolbar period={period} setPeriod={setPeriod} latestDate={summary.runs.at(-1)?.date} runCount={runs.length} />
  if (!summary.runs.length) {
    return (
      <div className="page">
        {toolbar}
        <Empty>{t('Todavía no hay reportes en el dashboard.')} {pending > 0 ? <>{t('Hay {n} zip(s) listos:', { n: pending })} <Link to="/importar">{t('impórtalos aquí')}</Link>.</> : <>{t('Sigue estos pasos para añadir los tuyos:')}</>}</Empty>
        <ReportsHelp open />
      </div>
    )
  }
  if (!data) return <div className="page">{toolbar}<Empty>{t('No hay ejecuciones en este periodo.')}</Empty></div>

  const { stats, prevStats, rows, lastRun, diff } = data
  const rate = successRate(stats)
  const prevRate = prevStats ? successRate(prevStats) : null
  const prevLabel = t(PREVIOUS_LABEL[period.type] ?? '')
  const openBucket = (b) => {
    if (b.runs.length === 1) navigate(`/ejecucion/${encodeURIComponent(b.runs[0].id)}${periodSearch(location.search)}`)
    else navigate(`/ejecuciones${periodSearch('', { p: 'week', d: b.label })}`)
  }
  const byFails = [...rows].filter((r) => r.failed).sort((a, b) => b.failed - a.failed || a.rate - b.rate).slice(0, 8)
  const byFlaky = [...rows].filter((r) => r.flaky).sort((a, b) => b.flaky - a.flaky).slice(0, 8)
  const bySlow = [...rows].filter((r) => r.avgDur).sort((a, b) => b.avgDur - a.avgDur).slice(0, 8)
  const meta = (k) => summary.tests[k]
  const failedTests = rows.filter((r) => r.failed).length

  return (
    <div className="page">
      {toolbar}
      {pending > 0 && (
        <div className="banner">
          <span>{t('Hay {n} zip(s) o carpetas de reportes en reports/ sin importar.', { n: pending })}</span>
          <Link className="btn primary" to="/importar">{t('Ir a Importar')}</Link>
        </div>
      )}
      <div className="page-head">
        <div>
          <h1>{t('Resumen')}</h1>
          <p>{plural(runs.length, 'ejecución', 'ejecuciones')} · {t('{n} tests distintos', { n: fmtNum(rows.length) })} · {t('del {from} al {to}', { from: fmtDate(runs[0].date), to: fmtDate(lastRun.date) })}</p>
        </div>
      </div>

      <div className="grid kpis">
        <Kpi hero label={t('% de éxito')} value={fmtPct(rate)} sub={t('(pasados + flaky) / ejecutados')}
          delta={delta(rate, prevRate, { unit: ' pp', scale: 100, label: prevLabel })} />
        <Kpi label={t('Fallidos')} value={fmtNum(stats.failed)} sub={t('{n} tests distintos', { n: fmtNum(failedTests) })}
          delta={prevRuns?.length ? delta(stats.failed / runs.length, prevStats.failed / prevRuns.length, { higherIsGood: false, unit: ` ${t('por ejec.')}`, label: prevLabel }) : null} />
        <Kpi label={t('Flaky')} value={fmtNum(stats.flaky)} sub={t('pasaron tras reintentar')}
          delta={prevRuns?.length ? delta(stats.flaky / runs.length, prevStats.flaky / prevRuns.length, { higherIsGood: false, unit: ` ${t('por ejec.')}`, label: prevLabel }) : null} />
        <Kpi label={t('Saltados')} value={fmtNum(stats.skipped)} sub={t('{pct} del total', { pct: fmtPct(stats.skipped / stats.total) })} />
        <Kpi label={t('Duración media')} value={fmtDuration(data.avgDuration)} sub={t('por ejecución')}
          delta={data.prevAvgDuration ? delta(data.avgDuration / 60000, data.prevAvgDuration / 60000, { unit: ' min', higherIsGood: false, label: prevLabel }) : null} />
        <Kpi label={t('Tests ejecutados')} value={fmtNum(stats.total)} sub={t('{n} pasados', { n: fmtNum(stats.passed) })} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{t('Resultado por ejecución')}</h2>
            <p>{data.buckets.some((b) => b.week) ? t('Agrupado por semana') : t('Una barra por ejecución')} · {t('clic para abrir')}</p>
          </div>
          <StatusLegend />
        </div>
        <RunsChart buckets={data.buckets} onPick={openBucket} />
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head"><div><h2>{t('% de éxito')}</h2><p>{t('(pasados + flaky) / (total − saltados)')}</p></div></div>
          <RateChart buckets={data.buckets} onPick={openBucket} />
        </div>
        <div className="card">
          <div className="card-head"><div><h2>{t('Duración de la ejecución')}</h2><p>{t('Tiempo total de cada ejecución completa')}</p></div></div>
          <DurationChart buckets={data.buckets} onPick={openBucket} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{t('Última ejecución del periodo')}</h2>
            <p>{fmtDate(lastRun.date, "EEEE d MMM yyyy")} · {lastRun.time} · {fmtDuration(lastRun.duration)}{lastRun.commit && <> · commit <span className="mono">{lastRun.commit.short}</span> {lastRun.commit.subject}</>}</p>
          </div>
          <Link className="btn primary" to={`/ejecucion/${encodeURIComponent(lastRun.id)}${periodSearch(location.search)}`}>{t('Abrir ejecución')}</Link>
        </div>
        <StatusBar stats={lastRun.stats} tall />
        <div className="row wrap small text-2" style={{ marginTop: 8 }}>
          <StatusChip outcome="passed">{lastRun.stats.passed} {t('pasados')}</StatusChip>
          <StatusChip outcome="flaky">{lastRun.stats.flaky} {t('flaky')}</StatusChip>
          <StatusChip outcome="failed">{lastRun.stats.failed} {t('fallidos')}</StatusChip>
          <StatusChip outcome="skipped">{lastRun.stats.skipped} {t('saltados')}</StatusChip>
          <span>· {t('% éxito')} {fmtPct(successRate(lastRun.stats))}</span>
        </div>
      </div>

      <div className="grid three">
        <TopList
          title="Fallos nuevos" sub="Fallan en la última ejecución y pasaban en la anterior"
          rows={diff.newFailures.map((d) => ({ key: d.key, meta: meta(d.key) }))}
          value={() => <StatusChip outcome="failed" />}
          empty="Ningún fallo nuevo respecto a la ejecución anterior."
        />
        <TopList
          title="Arreglados" sub="Fallaban en la ejecución anterior y ahora pasan"
          rows={diff.fixed.map((d) => ({ key: d.key, meta: meta(d.key) }))}
          value={() => <StatusChip outcome="passed" />}
          empty="Ningún test arreglado respecto a la ejecución anterior."
        />
        <TopList
          title="Tests nuevos" sub="Aparecen por primera vez en la última ejecución"
          rows={diff.newTests.map((d) => ({ key: d.key, meta: meta(d.key), outcome: d.outcome }))}
          value={(r) => <StatusChip outcome={r.outcome} />}
          empty="No hay tests nuevos en la última ejecución."
        />
      </div>

      <div className="grid three">
        <TopList title="Los que más fallan" sub="Nº de ejecuciones fallidas en el periodo" rows={byFails}
          value={(r) => <span className="num"><b>{r.failed}</b><span className="muted"> / {r.n}</span></span>} empty="Sin fallos en el periodo." />
        <TopList title="Los más flaky" sub="Pasaron solo tras reintentar" rows={byFlaky}
          value={(r) => <span className="num"><b>{r.flaky}</b><span className="muted"> / {r.n}</span></span>} empty="Sin flaky en el periodo." />
        <TopList title="Los más lentos" sub="Duración media en el periodo" rows={bySlow}
          value={(r) => <span className="num">{fmtDuration(r.avgDur)}</span>} empty="—" />
      </div>
    </div>
  )
}
