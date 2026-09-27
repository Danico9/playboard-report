import { useMemo } from 'react'
import PeriodToolbar from '../components/PeriodToolbar'
import { Empty, ErrorBox, Loading, StatusBar, TestLink } from '../components/ui'
import { useReport } from '../lib/useReport'
import { moduleRows, successRate, testRows } from '../lib/stats'
import { HEALTH_LABEL, STATUS, healthOf } from '../config/status'
import { moduleName } from '../config/modules'
import { fmtDate, fmtPct } from '../lib/format'
import { t } from '../i18n'

function RateStrip({ runs, perRun }) {
  return (
    <div className="strip">
      {runs.map(([index, s]) => {
        const run = perRun.runs[index]
        const rate = s ? successRate(s) : null
        const h = healthOf(rate)
        return (
          <span
            key={index}
            className={`cell ${h ?? 'none'}`}
            title={`${fmtDate(run.date)} ${run.time} · ${s ? `${t('% éxito')} ${fmtPct(rate)} · ${s.failed} ${t('fallidos')} · ${s.flaky} ${t('flaky')}` : t('sin tests de este módulo')}`}
          />
        )
      })}
    </div>
  )
}

export default function Modules() {
  const { res, summary, period, setPeriod, runs, runIndexes } = useReport()
  const mods = useMemo(() => (summary ? moduleRows(testRows(summary, runIndexes), runIndexes.slice(-40)) : []), [summary, runIndexes])

  if (res.status === 'error' && !summary) return <ErrorBox error={res.error} />
  if (!summary) return <Loading />

  return (
    <div className="page">
      <PeriodToolbar period={period} setPeriod={setPeriod} latestDate={summary.runs.at(-1)?.date} runCount={runs.length} />
      <div className="page-head">
        <div>
          <h1>{t('Módulos')}</h1>
          <p>{t('Ordenados de peor a mejor % de éxito en el periodo. El historial colorea cada ejecución según el % de éxito del módulo.')}</p>
        </div>
        <div className="legend">
          {['passed', 'flaky', 'failed'].map((k) => <span key={k}><i style={{ background: STATUS[k].color }} />{HEALTH_LABEL[k]}</span>)}
        </div>
      </div>
      {mods.length === 0 ? <Empty>{t('No hay datos en este periodo.')}</Empty> : (
        <div className="card flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Módulo')}</th><th className="num">{t('Tests')}</th><th className="num">{t('% éxito')}</th><th style={{ width: 160 }}>{t('Resultado')}</th>
                  <th className="num">✕</th><th className="num">↻</th><th className="num">⤼</th><th>{t('Historial')}</th><th>{t('Tests más problemáticos')}</th>
                </tr>
              </thead>
              <tbody>
                {mods.map((m) => (
                  <tr key={m.module}>
                    <td>
                      <div className="test-title">{moduleName(m.module)}</div>
                      <div className="test-sub">{m.module}</div>
                    </td>
                    <td className="num">{m.tests}</td>
                    <td className="num"><span className={`chip ${healthOf(m.rate)}`}>{fmtPct(m.rate)}</span></td>
                    <td><StatusBar stats={m} /></td>
                    <td className="num">{m.failed ? <b>{m.failed}</b> : <span className="muted">0</span>}</td>
                    <td className="num">{m.flaky || <span className="muted">0</span>}</td>
                    <td className="num">{m.skipped || <span className="muted">0</span>}</td>
                    <td><RateStrip runs={m.runs} perRun={summary} /></td>
                    <td style={{ minWidth: 320, maxWidth: 460 }}>
                      {m.worst.slice(0, 3).map((r) => (
                        <div key={r.key} className="row" style={{ padding: '2px 0' }}>
                          <div className="grow" style={{ minWidth: 0, flex: 1 }}><TestLink testKey={r.key} meta={r.meta} sub={false} /></div>
                          <span className="small muted nowrap">{r.failed} ✕ · {r.flaky} ↻</span>
                        </div>
                      ))}
                      {m.worst.length === 0 && <span className="muted small">{t('Sin fallos ni flaky')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
