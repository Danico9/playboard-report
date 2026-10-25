import { useLocation, useNavigate } from 'react-router'
import PeriodToolbar from '../components/PeriodToolbar'
import { Empty, ErrorBox, Loading, Pagination, StatusBar } from '../components/ui'
import { useReport } from '../lib/useReport'
import { successRate } from '../lib/stats'
import { healthOf } from '../config/status'
import { fmtDate, fmtDuration, fmtPct } from '../lib/format'
import { periodSearch } from '../lib/usePeriod'
import { paginate, usePagination } from '../lib/usePagination'
import { t } from '../i18n'
import { EnvChip } from '../components/Environments'
import { hasEnvironments } from '../lib/environments'
import { appUrl } from '../lib/webMode'

export default function Runs() {
  const { res, summary, period, setPeriod, runs } = useReport()
  const navigate = useNavigate()
  const location = useLocation()
  const pager = usePagination()
  if (res.status === 'error' && !summary) return <ErrorBox error={res.error} />
  if (!summary) return <Loading />

  const list = [...runs].reverse()
  const showEnv = hasEnvironments(summary)
  const page = paginate(list, pager)
  return (
    <div className="page">
      <PeriodToolbar period={period} setPeriod={setPeriod} latestDate={summary.runs.at(-1)?.date} runCount={runs.length} />
      <div className="page-head">
        <div><h1>{t('Ejecuciones')}</h1><p>{t('Hora de inicio en la zona horaria {tz}. Clic en una fila para ver sus tests.', { tz: summary.timeZone })}</p></div>
      </div>
      <div className="card flush">
        {list.length === 0 ? <Empty>{t('No hay ejecuciones en este periodo.')}</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Fecha')}</th><th>{t('Inicio')}</th>{showEnv && <th>{t('Entorno')}</th>}<th className="num">{t('Duración')}</th><th className="num">{t('Tests')}</th>
                  <th style={{ width: 180 }}>{t('Resultado')}</th><th className="num">{t('% éxito')}</th>
                  <th className="num">✓</th><th className="num">↻</th><th className="num">✕</th><th className="num">⤼</th>
                  <th>{t('Commit')}</th><th />
                </tr>
              </thead>
              <tbody>
                {page.items.map((r) => {
                  const rate = successRate(r.stats)
                  const health = healthOf(rate)
                  return (
                    <tr key={r.id} className="clickable" onClick={() => navigate(`/ejecucion/${encodeURIComponent(r.id)}${periodSearch(location.search)}`)}>
                      <td className="nowrap">{fmtDate(r.date, 'EEE d MMM yyyy')}</td>
                      <td className="num">{r.time}</td>
                      {showEnv && <td><EnvChip summary={summary} id={r.env} /></td>}
                      <td className="num">{fmtDuration(r.duration)}</td>
                      <td className="num">{r.stats.total}</td>
                      <td><StatusBar stats={r.stats} /></td>
                      <td className="num"><span className={`chip ${health}`}>{fmtPct(rate)}</span></td>
                      <td className="num">{r.stats.passed}</td>
                      <td className="num">{r.stats.flaky}</td>
                      <td className="num"><b>{r.stats.failed}</b></td>
                      <td className="num">{r.stats.skipped}</td>
                      <td className="truncate" style={{ maxWidth: 320 }} title={r.commit?.subject}>
                        {r.commit ? <><span className="mono">{r.commit.short}</span> <span className="muted">{r.commit.subject}</span></> : '—'}
                      </td>
                      <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                        <a className="small" href={appUrl(`/reports/playwright-reports/${encodeURIComponent(r.id)}/index.html`)} target="_blank" rel="noreferrer">{t('Reporte original')} ↗</a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination pager={pager} info={page} unit="ejecuciones" />
          </div>
        )}
      </div>
    </div>
  )
}
