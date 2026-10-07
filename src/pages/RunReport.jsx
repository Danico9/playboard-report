import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ErrorBox, Loading } from '../components/ui'
import { SKIP_REASON, STATUS, STATUS_ORDER } from '../config/status'
import { moduleName, moduleOfTest } from '../config/modules'
import { fmtDate, fmtDuration, fmtNum, fmtPct, plural } from '../lib/format'
import { successRate } from '../lib/stats'
import { envById, envLabel, hasEnvironments } from '../lib/environments'
import { useKnownIssues, useRunDetail, useSummary, issuesForTest } from '../lib/store'
import { isReviewable, reviewLabel, useReviews, verdictOf } from '../lib/reviews'
import { t } from '../i18n'

// ─── Informe imprimible de una ejecución ───
// Página sin menú lateral pensada para imprimir o guardar como PDF desde el navegador:
// los fallidos en una tabla (con su error, la marca de comprobado y los fallos conocidos) y el resto de tests en listas por fichero a dos columnas.

const NO_REVIEWS = {}
const lineOf = (x) => Number(/:(\d+)(?::\d+)?$/.exec(x.location ?? '')?.[1] ?? 0)
const codeOrder = (a, b) => a.file.localeCompare(b.file) || lineOf(a) - lineOf(b)
const fullTitle = (x) => [...x.path, x.title].join(' › ')

// Opciones del informe (no se imprimen): qué se incluye
const OPTIONS = [
  ['passed', 'Lista de pasados', true],
  ['skipped', 'Lista de saltados', true],
]

function byFile(list) {
  const map = new Map()
  for (const x of [...list].sort(codeOrder)) {
    if (!map.has(x.file)) map.set(x.file, [])
    map.get(x.file).push(x)
  }
  return [...map.entries()]
}

const Icon = ({ outcome }) => <span className="report-icon" style={{ color: STATUS[outcome].color }} title={STATUS[outcome].label} aria-label={STATUS[outcome].label}>{STATUS[outcome].icon}</span>

function ReviewChip({ review }) {
  if (!review) return null
  const failing = verdictOf(review) === 'failing'
  return <span className={`chip ${failing ? 'failed' : 'passed'}`} title={t('Marca personal: no cambia las métricas')}>{failing ? '✕' : '✓'} {reviewLabel(review)}</span>
}

// Fallidos: una fila por test con su error, la marca de comprobado (motivo y nota) y los fallos conocidos de las notas
function FailedTable({ tests, summary, reviews, knownIssues }) {
  return (
    <table className="table report-table">
      <thead>
        <tr><th className="col-test">{t('Test')}</th><th>{t('Módulo')}</th><th>{t('Error')}</th><th className="num">{t('Reint.')}</th><th className="num">{t('Duración')}</th></tr>
      </thead>
      <tbody>
        {tests.map((x) => {
          const review = reviews[x.key]
          const issues = issuesForTest(knownIssues, summary?.tests[x.key]).filter((i) => !i.solved)
          return (
            <tr key={x.testId}>
              <td>
                <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                  <Icon outcome={x.outcome} />
                  <span className="test-title">{fullTitle(x)}</span>
                </div>
                <div className="test-sub">{x.location ?? x.file} · {x.project}</div>
                {review && <div className="report-meta"><ReviewChip review={review} />{review.note && <> {review.note}</>}</div>}
                {issues.map((issue, i) => (
                  <div key={i} className="report-meta">
                    <b>{issue.known ? t('Fallo conocido') : t('Anotado en las notas')}</b>
                    {issue.jira.length > 0 && <> · {issue.jira.map((j) => j.key).join(', ')}</>}
                  </div>
                ))}
              </td>
              <td className="small text-2">{moduleName(x.module)}</td>
              <td className="small text-2">{x.sig != null ? summary?.signatures[x.sig]?.title : null}</td>
              <td className="num">{x.retries || ''}</td>
              <td className="num nowrap">{fmtDuration(x.duration)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// Lista compacta por fichero: un test por línea, a dos columnas, con su icono de estado.
// El proyecto (chromium, firefox…) solo se indica en los tests que salen repetidos, uno por proyecto.
function TestList({ tests, extra, single }) {
  return (
    <div className="report-files">
      {byFile(tests).map(([file, list]) => {
        const repeated = new Set(list.filter((x, i) => list.findIndex((y) => fullTitle(y) === fullTitle(x)) !== i).map(fullTitle))
        return (
        <div key={file} className="report-file-block">
          <div className="report-file-head"><span className="mono">{file}</span><span className="muted"> · {list.length}</span></div>
          <ul className={`report-list${single ? ' single' : ''}`}>
            {list.map((x) => (
              <li key={x.testId}>
                <Icon outcome={x.outcome} />
                <span className="grow">
                  {fullTitle(x)}
                  {repeated.has(fullTitle(x)) && <span className="report-project">{x.project}</span>}
                  {extra?.(x)}
                </span>
                {x.outcome !== 'skipped' && <span className="muted nowrap">{fmtDuration(x.duration)}</span>}
              </li>
            ))}
          </ul>
        </div>
        )
      })}
    </div>
  )
}

function Section({ outcome, count, children }) {
  return (
    <section className="report-section">
      <h2><Icon outcome={outcome} /> {STATUS[outcome].plural} ({fmtNum(count)})</h2>
      {children}
    </section>
  )
}

export default function RunReport() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { data: summary } = useSummary()
  const res = useRunDetail(id)
  const knownIssues = useKnownIssues()
  const reviews = useReviews()[id] ?? NO_REVIEWS
  const [opts, setOpts] = useState(() => Object.fromEntries(OPTIONS.map(([k, , on]) => [k, on])))
  const mod = params.get('mod') ?? ''
  // Tema del informe (claro por defecto): va en la URL y no cambia la preferencia guardada de la app
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light'

  const detail = res.data
  const allTests = useMemo(() => (detail?.tests ?? []).map((x) => ({ ...x, module: moduleOfTest(x) })), [detail])
  const modules = useMemo(() => [...new Set(allTests.map((x) => x.module))].sort((a, b) => moduleName(a).localeCompare(moduleName(b))), [allTests])
  const tests = useMemo(() => allTests.filter((x) => !mod || x.module === mod), [allTests, mod])
  const by = useMemo(() => Object.fromEntries(STATUS_ORDER.map((k) => [k, tests.filter((x) => x.outcome === k).sort(codeOrder)])), [tests])
  const stats = useMemo(() => ({ total: tests.length, ...Object.fromEntries(STATUS_ORDER.map((k) => [k, by[k].length])) }), [tests, by])
  const moduleRows = useMemo(() => {
    const map = new Map()
    for (const x of tests) {
      const m = map.get(x.module) ?? { module: x.module, total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 }
      m.total++
      m[x.outcome]++
      map.set(x.module, m)
    }
    return [...map.values()].sort((a, b) => b.failed - a.failed || b.flaky - a.flaky || b.total - a.total)
  }, [tests])

  // Al salir se recuperan el tema de la app y el título de la pestaña
  useEffect(() => {
    const root = document.documentElement
    const prevTheme = root.dataset.theme
    const prevTitle = document.title
    return () => {
      root.dataset.theme = prevTheme
      document.title = prevTitle
    }
  }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  // El título de la pestaña es el nombre que el navegador propone para el PDF
  const run = detail?.run
  useEffect(() => {
    if (run) document.title = `${t('Informe de ejecución')} ${run.date} ${run.time.replace(':', '-')}${mod ? ` ${moduleName(mod)}` : ''}`
  }, [run, mod])

  if (res.status === 'error' && !detail) return <div className="report"><ErrorBox error={res.error} /></div>
  if (!detail) return <div className="report"><Loading what="ejecución" /></div>

  const summaryRun = summary?.runs.find((r) => r.id === run.id)
  const env = hasEnvironments(summary) && summaryRun ? envLabel(envById(summary, summaryRun.env)) : null
  const setParam = (key, value) => setParams((p) => { const n = new URLSearchParams(p); if (value) n.set(key, value); else n.delete(key); return n }, { replace: true })
  const reviewedCount = tests.filter((x) => isReviewable(x.outcome) && reviews[x.key]).length

  return (
    <div className="report">
      <div className="report-toolbar no-print">
        <Link className="btn" to={`/ejecucion/${encodeURIComponent(run.id)}`}>← {t('Volver a la ejecución')}</Link>
        <select className="select" value={mod} onChange={(e) => setParam('mod', e.target.value)} aria-label={t('Módulo')}>
          <option value="">{t('Todos los módulos')}</option>
          {modules.map((m) => <option key={m} value={m}>{moduleName(m)}</option>)}
        </select>
        <div className="seg" role="group" aria-label={t('Tema del informe')}>
          <button className={theme === 'light' ? 'on' : ''} aria-pressed={theme === 'light'} onClick={() => setParam('theme', '')}>☀ {t('Claro')}</button>
          <button className={theme === 'dark' ? 'on' : ''} aria-pressed={theme === 'dark'} onClick={() => setParam('theme', 'dark')}>☾ {t('Oscuro')}</button>
        </div>
        {OPTIONS.map(([k, label]) => (
          <label key={k} className="row filter-check">
            <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))} />
            {t(label)}
          </label>
        ))}
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => window.print()}>🖶 {t('Imprimir o guardar como PDF')}</button>
      </div>
      <p className="no-print muted small">{t('Para obtener un PDF, elige «Guardar como PDF» como impresora en la ventana de impresión del navegador.')}</p>

      <header className="report-head">
        <div className="muted small">playboard-report · {t('Informe de ejecución')}</div>
        <h1>{fmtDate(run.date, "EEEE d 'de' MMMM yyyy")} · {run.time}</h1>
        <div className="text-2">
          {fmtDuration(run.duration)} · {run.workers ?? '?'} {t('workers')} · {run.projects.join(', ')}
          {run.branch && <> · {t('rama')} <span className="mono">{run.branch}</span></>}
          {env && <> · {t('Entorno')} {env}</>}
        </div>
        {run.commit && (
          <div className="small text-2">
            {t('Commit')} <span className="mono">{run.commit.short}</span> {run.commit.subject}{run.commit.author && <span className="muted"> · {run.commit.author}</span>}
          </div>
        )}
        {mod && <div className="small"><b>{t('Solo el módulo {name}', { name: moduleName(mod) })}</b></div>}
      </header>

      <div className="report-kpis">
        <div><span className="label">{t('% de éxito')}</span><b>{fmtPct(successRate(stats))}</b><span className="muted small">{plural(stats.total, 'test', 'tests')}</span></div>
        {STATUS_ORDER.map((k) => (
          <div key={k}>
            <span className="label"><Icon outcome={k} /> {STATUS[k].plural}</span>
            <b>{fmtNum(stats[k])}</b>
            <span className="muted small">{fmtPct(stats.total ? stats[k] / stats.total : null)}</span>
          </div>
        ))}
      </div>
      {reviewedCount > 0 && (
        <p className="small text-2">{t('{a} de {b} fallos comprobados', { a: reviewedCount, b: stats.failed + stats.flaky })} · {t('Marca personal: no cambia las métricas')}</p>
      )}

      {!mod && moduleRows.length > 1 && (
        <section className="report-section">
          <h2>{t('Por módulo')}</h2>
          <table className="table report-table">
            <thead>
              <tr>
                <th>{t('Módulo')}</th><th className="num">{t('Tests')}</th>
                {STATUS_ORDER.map((k) => <th key={k} className="num"><Icon outcome={k} /> {STATUS[k].plural}</th>)}
                <th className="num">{t('% de éxito')}</th>
              </tr>
            </thead>
            <tbody>
              {moduleRows.map((m) => (
                <tr key={m.module}>
                  <td>{moduleName(m.module)}</td><td className="num">{fmtNum(m.total)}</td>
                  {STATUS_ORDER.map((k) => <td key={k} className="num">{m[k] ? fmtNum(m[k]) : '—'}</td>)}
                  <td className="num">{fmtPct(successRate(m))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Section outcome="failed" count={stats.failed}>
        {stats.failed === 0 ? <p className="text-2">{t('Ningún test ha fallado en esta ejecución.')}</p> : (
          <FailedTable tests={by.failed} summary={summary} reviews={reviews} knownIssues={knownIssues} />
        )}
      </Section>

      {stats.flaky > 0 && (
        <Section outcome="flaky" count={stats.flaky}>
          <p className="small text-2">{t('Fallaron al menos una vez, pero pasaron en un reintento.')}</p>
          <TestList tests={by.flaky} single extra={(x) => (
            <div className="report-meta">
              {plural(x.retries, 'reintento', 'reintentos')}
              {x.sig != null && <> · {summary?.signatures[x.sig]?.title}</>}
              {' '}<ReviewChip review={reviews[x.key]} />
            </div>
          )} />
        </Section>
      )}

      {opts.passed && stats.passed > 0 && (
        <Section outcome="passed" count={stats.passed}>
          <TestList tests={by.passed} />
        </Section>
      )}

      {opts.skipped && stats.skipped > 0 && (
        <Section outcome="skipped" count={stats.skipped}>
          <TestList tests={by.skipped} extra={(x) => (
            <div className="report-meta">{[SKIP_REASON[x.skipReason] ?? x.skipReason, x.skipDescription].filter(Boolean).join(' — ')}</div>
          )} />
        </Section>
      )}

      <footer className="muted small report-foot">{t('Generado el {date}', { date: fmtDate(new Date().toISOString(), 'd MMM yyyy, HH:mm') })} · playboard-report</footer>
    </div>
  )
}
