import { Fragment, useMemo, useState } from 'react'
import PeriodToolbar from '../components/PeriodToolbar'
import AnsiBlock from '../components/AnsiBlock'
import { Empty, ErrorBox, Loading, TestLink } from '../components/ui'
import { useReport } from '../lib/useReport'
import { signatureRows } from '../lib/stats'
import { fmtDate, plural } from '../lib/format'
import { moduleName, moduleOfTest } from '../config/modules'
import { t } from '../i18n'

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

export default function Errors() {
  const { res, summary, period, setPeriod, runs, runIndexes } = useReport()
  const [query, setQuery] = useState('')
  const [mod, setMod] = useState('')
  const [open, setOpen] = useState(null)

  const rows = useMemo(() => (summary ? signatureRows(summary, runIndexes) : []), [summary, runIndexes])
  const modules = useMemo(() => {
    const s = new Set()
    for (const r of rows) for (const k of r.tests.keys()) s.add(moduleOfTest(summary.tests[k]))
    return [...s].sort()
  }, [rows, summary])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) =>
      (!q || `${r.info.title} ${r.info.location} ${r.info.sample}`.toLowerCase().includes(q)) &&
      (!mod || [...r.tests.keys()].some((k) => moduleOfTest(summary.tests[k]) === mod)))
  }, [rows, query, mod, summary])

  if (res.status === 'error' && !summary) return <ErrorBox error={res.error} />
  if (!summary) return <Loading />
  const stripRuns = runs.slice(-60)

  return (
    <div className="page">
      <PeriodToolbar period={period} setPeriod={setPeriod} latestDate={summary.runs.at(-1)?.date} runCount={runs.length} />
      <div className="page-head">
        <div>
          <h1>{t('Errores')}</h1>
          <p>{t('Errores agrupados por tipo (mensaje, locator y línea donde falla). Cuenta fallos y reintentos de tests flaky.')}</p>
        </div>
      </div>
      <div className="card flush">
        <div className="card-head" style={{ flexWrap: 'wrap', paddingBottom: 12 }}>
          <div className="filters">
            <input className="input search" placeholder={t('Buscar en el error, locator o fichero…')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="select" value={mod} onChange={(e) => setMod(e.target.value)} aria-label={t('Módulo')}>
              <option value="">{t('Todos los módulos')}</option>
              {modules.map((m) => <option key={m} value={m}>{moduleName(m)}</option>)}
            </select>
          </div>
          <span className="muted small">{plural(list.length, 'tipo de error', 'tipos de error')}</span>
        </div>
        {list.length === 0 ? <Empty>{t('No hay errores en este periodo.')}</Empty> : (
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
                        </td>
                        <td className="num">{r.tests.size}</td>
                        <td className="nowrap small">{fmtDate(first.date, 'd MMM')} → {fmtDate(last.date, 'd MMM')}</td>
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
