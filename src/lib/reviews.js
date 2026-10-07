// ─── Revisiones personales de tests fallidos ───
// Marca que el usuario pone a un test fallido o flaky de una ejecución: «lo he comprobado y está OK»
// (p. ej. tras repetirlo en local) o «sigue fallando» (para dejar anotado el porqué de un fallo que no se ha
// podido solucionar). Es solo informativa: no cambia ningún dato ni métrica.
// Se guarda en reports/reviews.json con POST /api/reviews (ver server/reviews.mjs).

import { refreshReviews, useResource } from './store'
import { t } from '../i18n'

// Veredictos: OK (color de acento) o sigue fallando (rojo). Sin verdict = 'ok' (marcas de versiones anteriores)
export const VERDICT_LABELS = { ok: 'Comprobado: OK', failing: 'Sigue fallando' }
export const verdictOf = (review) => (review?.verdict === 'failing' ? 'failing' : 'ok')

// Motivos (se guardan en castellano y se traducen al mostrarlos)
export const REVIEW_REASONS = {
  environment: 'Problema del entorno',
  transient: 'Fallo puntual',
  fixed: 'Test corregido',
  bug: 'Error de la aplicación',
  test: 'Error del propio test',
  other: 'Otro motivo',
}

// Motivos que tienen sentido en cada veredicto (los mismos que valida server/reviews.mjs)
export const VERDICT_REASONS = {
  ok: ['environment', 'transient', 'fixed', 'other'],
  failing: ['environment', 'bug', 'test', 'other'],
}

export const REVIEW_REASON_HINTS = {
  ok: {
    environment: 'Datos, servicios o configuración del entorno donde se ejecutó',
    transient: 'Un fallo aislado de la pipeline: al repetirlo pasa',
    fixed: 'Fallaba el propio test (p. ej. un selector que cambió) y ya está arreglado',
    other: 'Cualquier otra razón (explícala en la nota)',
  },
  failing: {
    environment: 'Datos, servicios o configuración del entorno que aún no se han podido arreglar',
    bug: 'La aplicación tiene un error real: el test hace bien en fallar',
    test: 'Falla el propio test (p. ej. un selector que cambió) y aún no está corregido',
    other: 'Cualquier otra razón (explícala en la nota)',
  },
}

// Solo tiene sentido revisar lo que no ha pasado a la primera
export const isReviewable = (outcome) => outcome === 'failed' || outcome === 'flaky'

export const reviewLabel = (review) => {
  const verdict = t(VERDICT_LABELS[verdictOf(review)])
  if (!review?.reason) return verdict
  const reason = t(REVIEW_REASONS[review.reason] ?? review.reason)
  // En OK el motivo basta (como hasta ahora); en «sigue fallando» se antepone para que no se confunda
  return verdictOf(review) === 'failing' ? `${verdict}: ${reason}` : reason
}

export function useReviews() {
  const res = useResource('/api/reviews')
  return res.data?.runs ?? {}
}

export const reviewOf = (reviews, runId, testKey) => reviews[runId]?.[testKey] ?? null

async function post(body) {
  const r = await fetch('/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-playboard': '1' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(t((await r.text()) || `${r.status} ${r.statusText}`))
  refreshReviews()
}

export const saveReview = (run, test, { verdict = 'ok', reason = null, note = '' } = {}) => post({ action: 'set', run, test, verdict, reason, note })
export const clearReview = (run, test) => post({ action: 'clear', run, test })
