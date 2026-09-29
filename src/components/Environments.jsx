import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useSummary } from '../lib/store'
import { ENV_PARAM, NO_SIGNAL, envById, envLabel, hasEnvironments, saveEnvironments, sourceLabel } from '../lib/environments'
import { PAGE_PARAM } from '../lib/usePagination'
import { t } from '../i18n'

// Selector de entorno de la barra del periodo: solo aparece si hay varios entornos
export function EnvironmentFilter() {
  const { data: summary } = useSummary()
  const [params, setParams] = useSearchParams()
  if (!hasEnvironments(summary)) return null
  const value = params.get(ENV_PARAM) ?? ''
  const envs = summary.environments.filter((e) => e.runs > 0)
  const pick = (id) => setParams((prev) => {
    const out = new URLSearchParams(prev)
    out.delete(PAGE_PARAM)
    if (id) out.set(ENV_PARAM, id)
    else out.delete(ENV_PARAM)
    return out
  })
  return (
    <select className={`select${value ? ' on' : ''}`} value={value} onChange={(e) => pick(e.target.value)} aria-label={t('Entorno')}>
      <option value="">{t('Todos los entornos')}</option>
      {envs.map((e) => <option key={e.id} value={e.id}>{envLabel(e)} ({e.runs})</option>)}
      {value && !envs.some((e) => e.id === value) && <option value={value}>{value}</option>}
    </select>
  )
}

export function EnvChip({ summary, id }) {
  const env = envById(summary, id)
  const unnamed = !env?.named
  return (
    <span className={`chip ${unnamed ? 'neutral' : 'info'} env-chip`} title={unnamed ? t('Entorno sin nombre') : undefined}>
      {unnamed && id !== NO_SIGNAL && <span aria-hidden>?</span>}{envLabel(env)}
    </span>
  )
}

// Poner nombre a una señal detectada o añadirla a un entorno que ya existe
export function NameSignalForm({ signalKey, summary, onDismiss }) {
  const named = summary.environments.filter((e) => e.named)
  const [name, setName] = useState('')
  const [target, setTarget] = useState(named[0]?.id ?? '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const run = async (body) => {
    setBusy(true)
    setError(null)
    try {
      await saveEnvironments(body)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const existing = named.find((e) => e.name.toLowerCase() === name.trim().toLowerCase())
  return (
    <div className="env-form">
      <form className="row wrap" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run({ action: 'name', key: signalKey, name }) }}>
        <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('Nombre del entorno (p. ej. Preproducción)')} aria-label={t('Nombre del entorno')} />
        <button className="btn primary" type="submit" disabled={busy || !name.trim()}>
          {existing ? t('Fusionar con «{name}»', { name: existing.name }) : t('Crear entorno')}
        </button>
      </form>
      {named.length > 0 && (
        <div className="row wrap">
          <span className="muted small">{t('o ya pertenece a')}</span>
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t('Entorno existente')}>
            {named.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button className="btn" disabled={busy || !target} onClick={() => run({ action: 'merge', key: signalKey, env: target })}>{t('Fusionar')}</button>
        </div>
      )}
      {onDismiss && (
        <div className="row wrap">
          <button className="btn" disabled={busy} onClick={() => run({ action: 'dismiss', key: signalKey })} title={t('Se seguirá mostrando con el valor detectado y no se volverá a preguntar')}>
            {t('Dejar sin nombre')}
          </button>
        </div>
      )}
      {error && <div className="small" style={{ color: 'var(--failed-text)' }} role="alert">✕ {error}</div>}
    </div>
  )
}


// Entorno de una ejecución, con la opción de asignarlo a mano (vacío = el detectado)
export function RunEnvironment({ summary, run }) {
  const [error, setError] = useState(null)
  if (!run || !hasEnvironments(summary)) return null
  const named = summary.environments.filter((e) => e.named)
  const detectedKey = run.signal?.key ?? NO_SIGNAL
  const detectedEnv = envById(summary, summary.environments.find((e) => e.signals.some((s) => s.key === detectedKey))?.id ?? detectedKey)
  const detectedName = detectedEnv ? envLabel(detectedEnv) : run.signal?.value ?? t('Sin detectar')
  const change = async (value) => {
    setError(null)
    try {
      await saveEnvironments({ action: 'assignRun', run: run.id, env: value || null })
    } catch (e) {
      setError(e.message)
    }
  }
  const title = run.signal?.value ? `${sourceLabel(run.signal.source)}: ${run.signal.value}` : t('Sin detectar')
  return (
    <span className="row wrap" style={{ display: 'inline-flex' }}>
      <span className="muted">{t('Entorno')}</span>
      <select className="select" value={run.envManual ? run.env : ''} onChange={(e) => change(e.target.value)} aria-label={t('Entorno de esta ejecución')} title={title}>
        <option value="">{t('Detectado: {name}', { name: detectedName })}</option>
        {named.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      {error && <span className="small" style={{ color: 'var(--failed-text)' }} role="alert">✕ {error}</span>}
    </span>
  )
}
