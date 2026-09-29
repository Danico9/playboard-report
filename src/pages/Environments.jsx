import { useState } from 'react'
import { Link } from 'react-router'
import { EnvChip, NameSignalForm } from '../components/Environments'
import { Empty, ErrorBox, Loading, Pagination, StatusBar } from '../components/ui'
import { useSummary } from '../lib/store'
import { ENV_PARAM, NO_SIGNAL, envLabel, pendingEnvironments, saveEnvironments, sourceLabel } from '../lib/environments'
import { successRate, sumStats } from '../lib/stats'
import { healthOf } from '../config/status'
import { fmtDate, fmtPct, plural } from '../lib/format'
import { paginate, usePagination } from '../lib/usePagination'
import { getLang, t } from '../i18n'

function useAction() {
  const [error, setError] = useState(null)
  const run = async (body) => {
    setError(null)
    try {
      await saveEnvironments(body)
    } catch (e) {
      setError(e.message)
    }
  }
  return { error, run }
}

function Dates({ env }) {
  if (!env.first) return <span className="muted">—</span>
  return env.first === env.last ? fmtDate(env.first) : `${fmtDate(env.first)} – ${fmtDate(env.last)}`
}

function Signals({ env, onUnlink }) {
  if (!env.signals.length) return <span className="muted small">{env.id === NO_SIGNAL ? t('Sin URLs, metadata ni datos del CI') : '—'}</span>
  return (
    <ul className="env-signals">
      {env.signals.map((s) => (
        <li key={s.key}>
          <span className="muted small">{sourceLabel(s.source)}</span> <span className="mono">{s.value}</span>
          <span className="muted small"> · {plural(s.runs, 'ejecución', 'ejecuciones')}</span>
          {onUnlink && env.signals.length > 1 && (
            <button className="btn link small" onClick={() => onUnlink(s.key)} title={t('Separar esta señal: sus ejecuciones vuelven a quedar como un entorno sin nombre')}>{t('Separar')}</button>
          )}
        </li>
      ))}
    </ul>
  )
}

function Rename({ env, run }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(env.name)
  if (!editing) return <button className="btn" onClick={() => setEditing(true)}>{t('Renombrar')}</button>
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); run({ action: 'rename', env: env.id, name }).then(() => setEditing(false)) }}>
      <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label={t('Nombre del entorno')} autoFocus />
      <button className="btn primary" type="submit" disabled={!name.trim()}>{t('Guardar')}</button>
      <button className="btn" type="button" onClick={() => setEditing(false)}>{t('Cancelar')}</button>
    </form>
  )
}

function Help() {
  return getLang() === 'en' ? (
    <p className="small text-2">
      A report does not say where it ran, so it is deduced from, in this order: <span className="mono">metadata.environment</span> or <span className="mono">metadata.baseURL</span> in
      your <span className="mono">playwright.config</span> (the most reliable: add it if you can), the most frequent domain in the report URLs (errors, output and steps) and the CI branch.
      Names and merges are saved in <span className="mono">reports/environments.json</span>.
    </p>
  ) : (
    <p className="small text-2">
      Un reporte no dice dónde se ejecutó, así que se deduce, por este orden, de: <span className="mono">metadata.environment</span> o <span className="mono">metadata.baseURL</span> de
      tu <span className="mono">playwright.config</span> (lo más fiable: añádelo si puedes), el dominio más frecuente en las URLs del reporte (errores, salidas y pasos) y la rama del CI.
      Los nombres y las fusiones se guardan en <span className="mono">reports/environments.json</span>.
    </p>
  )
}

export default function Environments() {
  const res = useSummary()
  const summary = res.data
  const { error, run } = useAction()
  const pager = usePagination()
  if (res.status === 'error' && !summary) return <ErrorBox error={res.error} />
  if (!summary) return <Loading />

  const envs = summary.environments ?? []
  const pending = pendingEnvironments(summary)
  const statsOf = (id) => sumStats(summary.runs.filter((r) => r.env === id).map((r) => r.stats))
  const manual = [...summary.runs].reverse().filter((r) => r.envManual)
  const page = paginate(manual, pager)
  const remove = (env) => {
    if (window.confirm(t('¿Quitar el nombre «{name}»? Sus ejecuciones volverán a agruparse según lo detectado.', { name: env.name }))) run({ action: 'delete', env: env.id })
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Entornos')}</h1>
          <p>{t('Dónde se ha ejecutado cada reporte. Ponle nombre a cada entorno detectado o fusiónalo con uno que ya exista.')}</p>
        </div>
      </div>
      {error && <div className="error-box" role="alert">{t('No se pudo guardar:')} {error}</div>}

      {pending.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <h2>{t('Entornos nuevos detectados')}</h2>
              <p>{t('Ponerles nombre es opcional: si no, se muestran con el valor detectado.')}</p>
            </div>
          </div>
          <ul className="list env-pending">
            {pending.map((env) => (
              <li key={env.id}>
                <div className="grow">
                  <div><b className="mono">{envLabel(env)}</b> <span className="muted small">· {sourceLabel(env.signals[0]?.source)}</span></div>
                  <div className="muted small">{plural(env.runs, 'ejecución', 'ejecuciones')} · <Dates env={env} /></div>
                </div>
                <NameSignalForm signalKey={env.id} summary={summary} onDismiss />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card flush">
        <div className="card-head"><div><h2>{t('Todos los entornos')}</h2><Help /></div></div>
        {envs.length === 0 ? <Empty>{t('Todavía no hay ejecuciones.')}</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Entorno')}</th><th>{t('Detectado por')}</th><th className="num">{t('Ejecuciones')}</th><th>{t('Fechas')}</th>
                  <th style={{ width: 160 }}>{t('Resultado')}</th><th className="num">{t('% éxito')}</th><th />
                </tr>
              </thead>
              <tbody>
                {envs.map((env) => {
                  const stats = statsOf(env.id)
                  const rate = successRate(stats)
                  return (
                    <tr key={env.id}>
                      <td>
                        <EnvChip summary={summary} id={env.id} />
                        {!env.named && env.id !== NO_SIGNAL && <div className="muted small">{t('Sin nombre')}</div>}
                      </td>
                      <td><Signals env={env} onUnlink={env.named ? (key) => run({ action: 'unlink', key }) : null} /></td>
                      <td className="num">
                        {env.runs > 0 ? <Link to={`/ejecuciones?${ENV_PARAM}=${encodeURIComponent(env.id)}`}>{env.runs}</Link> : 0}
                      </td>
                      <td className="nowrap small"><Dates env={env} /></td>
                      <td>{env.runs > 0 && <StatusBar stats={stats} />}</td>
                      <td className="num">{env.runs > 0 && <span className={`chip ${healthOf(rate)}`}>{fmtPct(rate)}</span>}</td>
                      <td>
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          {env.named && <Rename env={env} run={run} />}
                          {env.named && <button className="btn" onClick={() => remove(env)}>{t('Quitar nombre')}</button>}
                          {!env.named && env.id !== NO_SIGNAL && !env.pending && (
                            <details className="env-details">
                              <summary className="btn">{t('Poner nombre')}</summary>
                              <NameSignalForm signalKey={env.id} summary={summary} />
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card flush">
        <div className="card-head">
          <div>
            <h2>{t('Ejecuciones asignadas a mano')}</h2>
            <p>{t('Para cambiar el entorno de una ejecución, ábrela desde «Ejecuciones».')}</p>
          </div>
        </div>
        {manual.length === 0 ? <Empty>{t('Ninguna: todas usan el entorno detectado.')}</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('Ejecución')}</th><th>{t('Entorno')}</th><th>{t('Detectado')}</th><th /></tr></thead>
              <tbody>
                {page.items.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap"><Link to={`/ejecucion/${encodeURIComponent(r.id)}`}>{fmtDate(r.date, 'EEE d MMM yyyy')} · {r.time}</Link></td>
                    <td><EnvChip summary={summary} id={r.env} /></td>
                    <td className="mono small">{r.signal?.value ?? t('Sin detectar')}</td>
                    <td><button className="btn" onClick={() => run({ action: 'assignRun', run: r.id, env: null })}>{t('Usar el detectado')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination pager={pager} info={page} unit="ejecuciones" />
          </div>
        )}
      </div>
    </div>
  )
}
