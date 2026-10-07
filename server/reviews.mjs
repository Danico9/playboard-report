// ─── Revisiones personales (reports/reviews.json) ───
// Marcas que pone el usuario a un test que falló en una ejecución, con un motivo y una nota opcionales:
// «lo he comprobado y está OK» (verdict 'ok') o «sigue fallando» (verdict 'failing', para dejar anotado el porqué
// de un fallo que no se ha podido solucionar). Son solo informativas: no cambian ningún dato ni métrica.
//   runs: { runId: { testKey: { verdict, reason, note, at } } }   (sin verdict = 'ok', de versiones anteriores)
// testKey es la clave del test en el resumen (proyecto|fichero|título), la misma en todas las ejecuciones.
// Está en reports/, como environments.json: fuera de git y fuera de .cache/ (que se puede borrar sin perder nada).

import fs from 'node:fs'
import path from 'node:path'
import { REPORTS_DIR } from '../scripts/ingest-reports.mjs'

export const REVIEWS_FILE = path.join(REPORTS_DIR, 'reviews.json')
export const REVIEW_VERDICTS = ['ok', 'failing']
// Motivo del fallo (opcional) según el veredicto. OK: del entorno, puntual, del propio test ya corregido (p. ej. un selector) u otro.
// Sigue fallando: del entorno, error de la aplicación, error del propio test pendiente de corregir u otro.
export const REVIEW_REASONS = {
  ok: ['environment', 'transient', 'fixed', 'other'],
  failing: ['environment', 'bug', 'test', 'other'],
}
const MAX_NOTE = 500
const MAX_ID = 1000

const empty = () => ({ version: 1, runs: {} })

export function readReviews() {
  try {
    const c = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'))
    return { version: 1, runs: c.runs && typeof c.runs === 'object' ? c.runs : {} }
  } catch {
    return empty()
  }
}

function writeReviews(data) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  const tmp = `${REVIEWS_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  fs.renameSync(tmp, REVIEWS_FILE)
}

const checkId = (value, error) => {
  if (typeof value !== 'string' || !value || value.length > MAX_ID || value in Object.prototype) throw new Error(error)
  return value
}

export function updateReviews(body) {
  const data = readReviews()
  const run = checkId(body?.run, 'ejecución no válida')
  const test = checkId(body?.test, 'test no válido')
  switch (body?.action) {
    // Marcar como revisado (o cambiar el veredicto, el motivo o la nota)
    case 'set': {
      const verdict = REVIEW_VERDICTS.includes(body.verdict) ? body.verdict : 'ok'
      const reason = REVIEW_REASONS[verdict].includes(body.reason) ? body.reason : null
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : ''
      const prev = data.runs[run]?.[test]
      // Al cambiar de veredicto cuenta como una marca nueva (fecha nueva)
      const at = prev && (prev.verdict ?? 'ok') === verdict ? prev.at : new Date().toISOString()
      data.runs[run] = { ...data.runs[run], [test]: { verdict, reason, note, at } }
      break
    }
    // Quitar la marca
    case 'clear':
      if (data.runs[run]) {
        delete data.runs[run][test]
        if (!Object.keys(data.runs[run]).length) delete data.runs[run]
      }
      break
    default:
      throw new Error('acción no válida')
  }
  writeReviews(data)
  return data
}
