import { Fragment, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import PeriodToolbar from '../components/PeriodToolbar'
import TestStatsTable from '../components/TestStatsTable'
import { Empty, ErrorBox, Loading, RemovedChip, StatusBar, StatusChip, StatusLegend, TestLink } from '../components/ui'
import { useReport } from '../lib/useReport'
import { moduleRows, successRate, testRows } from '../lib/stats'
import { HEALTH_LABEL, STATUS, healthOf } from '../config/status'
import { moduleName } from '../config/modules'
import { fmtDate, fmtPct } from '../lib/format'
import { periodSearch } from '../lib/usePeriod'
import { useUrlFilters } from '../lib/useUrlFilters'
import { t } from '../i18n'

// Ejecuciones que se muestran en el historial (más no caben junto a la columna de tests problemáticos)
const HISTORY_RUNS = 30

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

// Todos los tests del módulo, de peor a mejor (se ve al desplegar la fila)
function ModuleTests({ m, colSpan }) {
  const location = useLocation()
  return (
    <tr className="expanded">
      <td colSpan={colSpan}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="muted small">{t('{n} tests del módulo en el periodo', { n: m.rows.length })}</span>
          <div className="row">
            <Link className="btn" to={`/modulos${periodSearch(location.search, { tab: 'tests', mod: m.module })}`}>{t('Ver en «Tests por módulo»')} →</Link>
            <Link className="btn" to={`/tests${periodSearch(location.search, { mod: m.module })}`}>{t('Ver en el índice de Tests')} →</Link>
          </div>
        </div>
        <table className="table compact">
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.key} className={r.removed ? 'removed' : ''}>
                <td style={{ minWidth: 0 }}><TestLink testKey={r.key} meta={r.meta} /><RemovedChip info={r.removed} /></td>
                <td className="num">{r.rate == null ? '—' : <span className={`chip ${healthOf(r.rate)}`}>{fmtPct(r.rate, 0)}</span>}</td>
                <td className="num small">{r.failed} ✕ · {r.flaky} ↻ · {r.skipped} ⤼</td>
                <td><StatusChip outcome={r.last} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  )
}

// Pestañas de la pantalla: resumen por módulo y tabla de estadísticas de sus tests
const TABS = [['summary', 'Resumen'], ['tests', 'Tests por módulo']]

export default function Modules() {
  const report = useReport()
  const { res, summary, period, setPeriod, runs, runIndexes } = report
  const { get, set } = useUrlFilters({ tab: 'summary' })
  const tab = get('tab')
  const [open, setOpen] = useState(() => new Set())
  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const mods = useMemo(() => (summary ? moduleRows(testRows(summary, runIndexes), runIndexes.slice(-HISTORY_RUNS)) : []), [summary, runIndexes])

  if (res.status === 'error' && !summary) return <ErrorBox error={res.error} />
  if (!summary) return <Loading />

  return (
    <div className="page">
      <PeriodToolbar period={period} setPeriod={setPeriod} latestDate={summary.runs.at(-1)?.date} runCount={runs.length} />
      <div className="page-head">
        <div>
          <h1>{t('Módulos')}</h1>
          <p>
            {tab === 'tests'
              ? t('Estadísticas de cada test en el periodo, agrupadas por módulo o por fichero. El historial muestra un cuadrado por ejecución.')
              : `${t('Ordenados de peor a mejor % de éxito en el periodo. El historial colorea cada ejecución según el % de éxito del módulo.')} ${t('Pulsa un módulo para ver todos sus tests.')}`}
          </p>
        </div>
        {tab === 'tests' ? <StatusLegend /> : (
          <div className="legend">
            {['passed', 'flaky', 'failed'].map((k) => <span key={k}><i style={{ background: STATUS[k].color }} />{HEALTH_LABEL[k]}</span>)}
          </div>
        )}
      </div>
      <div className="seg tabs" role="tablist" aria-label={t('Módulos')}>
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => set({ tab: k })}>{t(label)}</button>
        ))}
      </div>
      {tab === 'tests' ? <TestStatsTable {...report} /> : mods.length === 0 ? <Empty>{t('No hay datos en este periodo.')}</Empty> : (
        <div className="card flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Módulo')}</th><th className="num">{t('Tests')}</th><th className="num">{t('% éxito')}</th><th style={{ width: 160 }}>{t('Resultado')}</th>
                  <th className="num">✕</th><th className="num">↻</th><th className="num">⤼</th><th>{t('Historial')}{runs.length > HISTORY_RUNS ? ` ${t('(últimas 30)')}` : ''}</th><th>{t('Tests más problemáticos')}</th>
                </tr>
              </thead>
              <tbody>
                {mods.map((m) => (
                  <Fragment key={m.module}>
                    <tr className="clickable" onClick={() => toggle(m.module)}>
                      <td>
                        <button className="group-toggle" aria-expanded={open.has(m.module)} onClick={(e) => { e.stopPropagation(); toggle(m.module) }}>
                          <span aria-hidden>{open.has(m.module) ? '▾' : '▸'}</span>
                          <span className="test-title">{moduleName(m.module)}</span>
                        </button>
                        <div className="test-sub" style={{ paddingLeft: 18 }}>{m.module}</div>
                      </td>
                      <td className="num">
                        {m.tests}
                        {m.removed > 0 && <div className="muted small nowrap" title={t('Tests que ya no aparecen en los reportes (borrados, renombrados o excluidos)')}>{t('{n} eliminados', { n: m.removed })}</div>}
                      </td>
                      <td className="num"><span className={`chip ${healthOf(m.rate)}`}>{fmtPct(m.rate)}</span></td>
                      <td><StatusBar stats={m} /></td>
                      <td className="num">{m.failed ? <b>{m.failed}</b> : <span className="muted">0</span>}</td>
                      <td className="num">{m.flaky || <span className="muted">0</span>}</td>
                      <td className="num">{m.skipped || <span className="muted">0</span>}</td>
                      <td><RateStrip runs={m.runs} perRun={summary} /></td>
                      <td style={{ minWidth: 280, maxWidth: 420 }}>
                        {m.worst.slice(0, 3).map((r) => (
                          <div key={r.key} className="row" style={{ padding: '2px 0' }}>
                            <div className="grow" style={{ minWidth: 0, flex: 1 }}><TestLink testKey={r.key} meta={r.meta} sub={false} /></div>
                            <span className="small muted nowrap">{r.failed} ✕ · {r.flaky} ↻</span>
                          </div>
                        ))}
                        {m.worst.length > 3 && !open.has(m.module) && (
                          <span className="small muted">{t('y {n} más: pulsa para ver todos', { n: m.worst.length - 3 })}</span>
                        )}
                        {m.worst.length === 0 && <span className="muted small">{t('Sin fallos ni flaky')}</span>}
                      </td>
                    </tr>
                    {open.has(m.module) && <ModuleTests m={m} colSpan={9} />}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
