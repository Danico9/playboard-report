import { useState } from 'react'
import { REVIEW_REASON_HINTS, REVIEW_REASONS, VERDICT_LABELS, VERDICT_REASONS, clearReview, reviewLabel, saveReview, verdictOf } from '../lib/reviews'
import { fmtDate } from '../lib/format'
import { t } from '../i18n'

const reviewTitle = (review) => [
  t(VERDICT_LABELS[verdictOf(review)]),
  review.reason ? t(REVIEW_REASONS[review.reason] ?? review.reason) : null,
  review.note || null,
  t('Marca personal: no cambia las métricas'),
].filter(Boolean).join(' · ')

const VerdictIcon = ({ review }) => <span aria-hidden>{verdictOf(review) === 'failing' ? '✕' : '✓'}</span>
const chipClass = (review) => `review-chip${verdictOf(review) === 'failing' ? ' failing' : ''}`
const confirmClear = (review) =>
  !(review.note || review.reason) || window.confirm(t('¿Quitar la marca de comprobado? Se perderán el motivo y la nota.'))

// Marca compacta para las tablas: clic para marcar como OK o desmarcar (el veredicto «sigue fallando», el motivo y la nota
// se editan en el detalle del test)
export function ReviewToggle({ runId, testKey, review }) {
  const [busy, setBusy] = useState(false)
  const toggle = async (e) => {
    e.stopPropagation()
    if (review && !confirmClear(review)) return
    setBusy(true)
    try {
      await (review ? clearReview(runId, testKey) : saveReview(runId, testKey))
    } catch (err) {
      window.alert(err.message)
    } finally {
      setBusy(false)
    }
  }
  if (review) {
    return (
      <button className={chipClass(review)} onClick={toggle} disabled={busy} title={reviewTitle(review)} aria-label={t('Quitar la marca de comprobado')} aria-pressed>
        <VerdictIcon review={review} />{reviewLabel(review)}{review.note && <span aria-hidden className="review-note-dot">✎</span>}
      </button>
    )
  }
  return (
    <button className="review-toggle" onClick={toggle} disabled={busy} aria-pressed={false}
      title={t('Marcar como comprobado: OK (marca personal, no cambia las métricas). Para marcarlo como «Sigue fallando», ábrelo.')} aria-label={t('Marcar como comprobado')}>
      <span aria-hidden>✓</span>
    </button>
  )
}

// Indicador de solo lectura (historial de un test)
export function ReviewBadge({ review }) {
  if (!review) return null
  return <span className={`${chipClass(review)} static`} title={reviewTitle(review)}><VerdictIcon review={review} />{reviewLabel(review)}</span>
}

const VERDICT_HELP = {
  ok: 'Lo he repetido por mi cuenta (en local, en otro entorno…) y funciona',
  failing: 'No se ha podido solucionar: deja anotado el porqué del fallo',
}

// Panel del detalle del test: veredicto (OK o sigue fallando), motivo y nota
export function ReviewPanel({ runId, testKey, review }) {
  const [note, setNote] = useState(review?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const verdict = review ? verdictOf(review) : null
  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const save = (changes) => run(() => saveReview(runId, testKey, { verdict, reason: review?.reason ?? null, note, ...changes }))
  // Clic en el veredicto activo: quitar la marca; en el otro: cambiar de veredicto (se conserva la nota y el motivo si vale en los dos)
  const pick = (v) => {
    if (verdict === v) {
      if (confirmClear(review)) run(() => clearReview(runId, testKey))
      return
    }
    const reason = VERDICT_REASONS[v].includes(review?.reason) ? review.reason : null
    run(() => saveReview(runId, testKey, { verdict: v, reason, note }))
  }

  return (
    <section className={`review-panel${verdict ? ` on ${verdict}` : ''}`}>
      <div className="review-verdicts" role="radiogroup" aria-label={t('Comprobado')}>
        {Object.entries(VERDICT_LABELS).map(([v, label]) => (
          <label key={v} className={`row review-check ${v}`}>
            <input type="checkbox" checked={verdict === v} disabled={busy} onChange={() => pick(v)} />
            <b><span aria-hidden>{v === 'failing' ? '✕ ' : '✓ '}</span>{t(label)}</b>
            <span className="muted small">{t(VERDICT_HELP[v])}</span>
          </label>
        ))}
      </div>
      {review && (
        <>
          <div className="filters" role="radiogroup" aria-label={t('Motivo del fallo')}>
            <span className="small text-2">{t('Motivo del fallo')}:</span>
            {VERDICT_REASONS[verdict].map((k) => (
              <button key={k} className={`toggle${review.reason === k ? ' on' : ''}`} role="radio" aria-checked={review.reason === k}
                disabled={busy} title={t(REVIEW_REASON_HINTS[verdict][k])} onClick={() => save({ reason: review.reason === k ? null : k })}>
                {t(REVIEW_REASONS[k])}
              </button>
            ))}
          </div>
          <textarea className="input" rows={verdict === 'failing' ? 3 : 2} maxLength={500} value={note}
            placeholder={verdict === 'failing' ? t('Nota: por qué falla y qué has probado…') : t('Nota (opcional): qué has comprobado o corregido…')}
            aria-label={t('Nota')} onChange={(e) => setNote(e.target.value)} onBlur={() => note.trim() !== (review.note ?? '') && save({ note })} />
          <div className="muted small">{t('Marcado el {date}', { date: fmtDate(review.at, 'd MMM yyyy, HH:mm') })}</div>
        </>
      )}
      <div className="muted small">{t('Es una marca personal: no cambia el estado del test ni ninguna métrica.')}</div>
      {error && <div className="error-box">{error}</div>}
    </section>
  )
}
