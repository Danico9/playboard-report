import { Fragment, useMemo, useState } from 'react'
import PeriodToolbar from '../components/PeriodToolbar'
import AnsiBlock from '../components/AnsiBlock'
import { Empty, ErrorBox, Loading, TestLink } from '../components/ui'
import { useReport } from '../lib/useReport'
import { useUrlFilters } from '../lib/useUrlFilters'
import { signatureRows } from '../lib/stats'
import { fmtDate, plural } from '../lib/format'
import { moduleName, moduleOfTest } from '../config/modules'
import { t } from '../i18n'

// Pestañas: errores del periodo elegido y de todo el histórico (sin mirar el periodo)
const TABS = [['period', 'Del periodo'], ['all', 'Histórico']]

// Filtro por estado del error (ver signatureRows en lib/stats.js)
const STATE_FILTERS = [
  ['', 'Todos los estados'],
  ['new', 'Nuevos'],
  ['active', 'Siguen apareciendo'],
  ['gone', 'Ya no aparecen'],
]
const stateMatch = {
  '': () => true,
  new: (r) => r.isNew,
  active: (r) => !r.gone,
  gone: (r) => r.gone,
}

const DEFAULTS = { tab: 'period', st: '' }

function RunCounts({ runs, counts }) {
  const max = Math.max(1, ...counts.values())
  return (
    <div className="strip" style={{ alignItems: 'flex-end', height: 20 }}>
      {runs.map((r) => {
        const c = counts.get(r.index) ?? 0
        return (
          <span
            key={r.id}
            title={`${fmtDate(r.date)} ${r.time} · ${plural(c, 'ocurrencia', 'ocurrencias')}`}
            style={{ width: 6, height: c ? 4 + (c / max) * 16 : 2, borderRadius: 2, background: c ? 'var(--failed)' : 'var(--surface-3)' }}
          />
        )
      })}
    </div>
  )
}

function StateBadges({ row, showNew }) {
  return (
    <>
      {showNew && row.isNew && <span className="chip info" title={t('No había aparecido nunca antes de este periodo')}>★ {t('Nuevo')}</span>}
      {row.gone && <span className="chip passed" title={t('Todos los tests afectados se han vuelto a ejecutar después y no ha vuelto a salir')}>✓ {t('Ya no aparece')}</span>}
    </>
  )
}

export default function Errors() {
  const { res, summary, period, setPeriod, runs: periodRuns, runIndexes: periodIndexes } = useReport()
  const { get, set } = useUrlFilters(DEFAULTS)
  const tab = get('tab') === 'all' ? 'all' : 'period'
  const global = tab === 'all'
  const state = stateMatch[get('st')] && !(global && get('st') === 'new') ? get('st') : ''
  const [query, setQuery] = useState('')
  const [mod, setMod] = useState('')
  const [open, setOpen] = useState(null)

  const allRuns = useMemo(() => (summary ? summary.runs.map((r, index) => ({ ...r, index })) : []), [summary])
  const runs = global ? allRuns : periodRuns
  const runIndexes = useMemo(() => (global ? allRuns.map((r) => r.index) : periodIndexes), [global, allRuns, periodIndexes])

  const rows = useMemo(() => (summary && runIndexes.length ? signatureRows(summary, runIndexes) : []), [summary, runIndexes])
  const modules = useMemo(() => {
    const s = new Set()
    for (const r of rows) for (const k of r.tests.keys()) s.add(moduleOfTest(summary.tests[k]))
    return [...s].sort()
  }, [rows, summary])
  const counts = useMemo(() => ({ new: rows.filter((r) => r.isNew).length, gone: rows.filter((r) => r.gone).length }), [rows])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) =>
      stateMatch[state](r) &&
      (!q || `${r.info.title} ${r.info.location} ${r.info.sample}`.toLowerCase().includes(q)) &&
      (!mod || [...r.tests.keys()].some((k) => moduleOfTest(summary.tests[k]) === mod)))
  }, [rows, state, query, mod, summary])

  if (res.status === 'error' && !summary) return <ErrorBox error={res.error} />
  if (!summary) return <Loading />
  const stripRuns = runs.slice(-60)
  const dateFmt = global ? 'd MMM yyyy' : 'd MMM'

  return (
    <div className="page">
      {!global && <PeriodToolbar period={period} setPeriod={setPeriod} latestDate={summary.runs.at(-1)?.date} runCount={runs.length} />}
      <div className="page-head">
        <div>
          <h1>{t('Errores')}</h1>
          <p>
            {t('Errores agrupados por tipo (mensaje, locator y línea donde falla). Cada test suma una vez por ejecución en la que falla o es flaky.')}
            {' '}
            {global
              ? t('Histórico: todas las ejecuciones ({n}), sin tener en cuenta el periodo.', { n: runs.length })
              : t('«Nuevo»: no había aparecido nunca antes del periodo.')}
            {' '}
            {t('«Ya no aparece»: todos sus tests se han vuelto a ejecutar después y no ha vuelto a salir.')}
          </p>
        </div>
      </div>
      <div className="seg tabs" role="tablist" aria-label={t('Errores')}>
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => { set({ tab: k }); setOpen(null) }}>{t(label)}</button>
        ))}
      </div>
      <div className="card flush">
        <div className="card-head" style={{ flexWrap: 'wrap', paddingBottom: 12 }}>
          <div className="filters">
            <input className="input search" placeholder={t('Buscar en el error, locator o fichero…')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="select" value={state} onChange={(e) => set({ st: e.target.value })} aria-label={t('Estado del error')}>
              {STATE_FILTERS.filter(([k]) => !(global && k === 'new')).map(([k, label]) => <option key={k} value={k}>{t(label)}</option>)}
            </select>
            <select className="select" value={mod} onChange={(e) => setMod(e.target.value)} aria-label={t('Módulo')}>
              <option value="">{t('Todos los módulos')}</option>
              {modules.map((m) => <option key={m} value={m}>{moduleName(m)}</option>)}
            </select>
          </div>
          <span className="muted small">
            {plural(list.length, 'tipo de error', 'tipos de error')}
            {!global && counts.new > 0 && <> · {plural(counts.new, 'nuevo', 'nuevos')}</>}
            {counts.gone > 0 && <> · {t('{n} ya no aparecen', { n: counts.gone })}</>}
          </span>
        </div>
        {list.length === 0 ? <Empty>{rows.length ? t('Ningún error coincide con los filtros.') : global ? t('No hay errores.') : t('No hay errores en este periodo.')}</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th className="num">{t('Veces')}</th><th>{t('Error')}</th><th className="num">{t('Tests')}</th><th>{t('Primera / última')}</th><th>{t('Por ejecución')}</th></tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const first = summary.runs[r.first]
                  const last = summary.runs[r.last]
                  const isOpen = open === r.sig
                  return (
                    <Fragment key={r.sig}>
                      <tr className="clickable" onClick={() => setOpen(isOpen ? null : r.sig)}>
                        <td className="num"><b>{r.count}</b>{r.flaky ? <div className="muted small">{t('{n} en flaky', { n: r.flaky })}</div> : null}</td>
                        <td style={{ maxWidth: 640 }}>
                          <div className="text-2" style={{ wordBreak: 'break-word' }}>{isOpen ? '▾' : '▸'} {r.info.title}</div>
                          {r.info.location && <div className="test-sub">{r.info.location}</div>}
                          {(r.gone || (!global && r.isNew)) && <div className="row wrap" style={{ gap: 6, marginTop: 4 }}><StateBadges row={r} showNew={!global} /></div>}
                        </td>
                        <td className="num">{r.tests.size}</td>
                        <td className="nowrap small">{fmtDate(first.date, dateFmt)} → {fmtDate(last.date, dateFmt)}</td>
                        <td><RunCounts runs={stripRuns} counts={r.runs} /></td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td />
                          <td colSpan={4}>
                            <div className="stack" style={{ gap: 12, padding: '4px 0 12px' }}>
                              <AnsiBlock text={r.info.sample} />
                              <div className="stack">
                                <b className="small">{t('Tests afectados')}</b>
                                <ul className="list">
                                  {[...r.tests.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                                    <li key={k}><div className="grow"><TestLink testKey={k} meta={summary.tests[k]} /></div><span className="num">{n}×</span></li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
