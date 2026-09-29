// ─── Entornos de ejecución ───
// El servidor añade a cada ejecución su entorno (run.env) y al resumen la lista summary.environments
// (ver server/environments.mjs). Los cambios se guardan en reports/environments.json con POST /api/environments.

import { useSearchParams } from 'react-router'
import { refreshData } from './store'
import { t } from '../i18n'

export const ENV_PARAM = 'env'
export const NO_SIGNAL = '_none'

// Qué se ha usado para detectar el entorno (se traducen al mostrarlas)
export const SOURCE_LABELS = {
  meta: 'metadata del playwright.config',
  metadata: 'metadata del playwright.config',
  baseURL: 'baseURL del playwright.config',
  host: 'Dominio de las URLs',
  branch: 'Rama del CI',
}

export const sourceLabel = (source) => t(SOURCE_LABELS[source] ?? source)

// Solo tiene sentido hablar de entornos si hay más de uno o el usuario ya ha puesto algún nombre
export function hasEnvironments(summary) {
  const envs = summary?.environments ?? []
  return envs.filter((e) => e.runs > 0).length > 1 || envs.some((e) => e.named)
}

export const pendingEnvironments = (summary) => (summary?.environments ?? []).filter((e) => e.pending)

export function envById(summary, id) {
  return summary?.environments?.find((e) => e.id === id) ?? null
}

// Nombre para mostrar: el que ha puesto el usuario o, si no tiene, el valor detectado (p. ej. el dominio)
export function envLabel(env) {
  if (!env) return '—'
  if (env.name) return env.name
  if (env.id === NO_SIGNAL) return t('Sin detectar')
  return env.signals?.[0]?.value ?? env.id.slice(env.id.indexOf(':') + 1)
}

export function useEnvFilter() {
  const [params] = useSearchParams()
  return params.get(ENV_PARAM) ?? ''
}

export async function saveEnvironments(body) {
  const r = await fetch('/api/environments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-playboard': '1' },
    body: JSON.stringify(body),
  })
  // Los mensajes del servidor están en castellano: se traducen aquí
  if (!r.ok) throw new Error(t((await r.text()) || `${r.status} ${r.statusText}`))
  refreshData()
}
