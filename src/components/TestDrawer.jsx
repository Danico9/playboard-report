import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import AnsiBlock from './AnsiBlock'
import Markdown from './Markdown'
import { HistoryStrip, StatusChip, ModuleTag } from './ui'
import KnownIssues from './KnownIssues'
import NoteLinks from './NoteLinks'
import { ReviewPanel } from './Review'
import { SKIP_REASON, STATUS } from '../config/status'
import { moduleOfTest } from '../config/modules'
import { fmtDate, fmtDuration, plural } from '../lib/format'
import { useKnownIssues, useResource, useSummary, issuesForTest } from '../lib/store'
import { periodSearch } from '../lib/usePeriod'
import { numberLocale, t } from '../i18n'
import { isReviewable, reviewOf, useReviews } from '../lib/reviews'

const attemptLabel = (a, i) => (i === 0 ? t('Intento inicial') : t('Reintento {n}', { n: i }))

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="lightbox" onClick={onClose}><img src={src} alt={t('Captura ampliada')} /></div>
}

function ErrorContext({ url }) {
  const res = useResource(url, 'text')
  if (res.status === 'loading') return <div className="muted small">{t('Cargando…')}</div>
  if (res.status === 'error') return <div className="muted small">{t('No se pudo cargar el error-context.')}</div>
  return <Markdown>{res.data ?? ''}</Markdown>
}

function Attempt({ attempt, runId, openShot, timeZone }) {
  const base = `/reports/playwright-reports/${encodeURIComponent(runId)}/`
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row wrap small text-2">
        <span>{t('Estado')}: <b>{attempt.status}</b></span>
        <span>· {t('Duración')}: <b>{fmtDuration(attempt.duration)}</b></span>
        {attempt.startTime && <span>· {t('Inicio')}: {new Date(attempt.startTime).toLocaleTimeString(numberLocale(), { timeZone })}</span>}
        {attempt.worker != null && attempt.worker >= 0 && <span>· Worker {attempt.worker}</span>}
      </div>

      {attempt.error && (
        <section className="stack">
          <h3>{t('Error')}{attempt.extraErrors ? ` ${t('(+{n} más)', { n: attempt.extraErrors })}` : ''}</h3>
          <AnsiBlock text={attempt.error} />
        </section>
      )}

      {attempt.screenshots.length > 0 && (
        <section className="stack">
          <h3>{t('Capturas')}</h3>
          <div className="shots">
            {attempt.screenshots.map((p) => (
              <img key={p} src={base + p} alt={t('Captura del test')} loading="lazy" onClick={() => openShot(base + p)} />
            ))}
          </div>
        </section>
      )}

      {attempt.video && (
        <section className="stack">
          <h3>{t('Vídeo')}</h3>
          <video className="test-video" src={base + attempt.video} controls preload="metadata" />
        </section>
      )}

      {(attempt.trace || attempt.video) && (
        <div className="row wrap">
          {/* El visor de trazas va dentro de cada reporte (trace/), igual que en el reporte HTML de Playwright */}
          {attempt.trace && (
            <a className="btn primary" href={`${base}trace/index.html?trace=${encodeURIComponent(new URL(base + attempt.trace, window.location.href).href)}`} target="_blank" rel="noreferrer">
              {t('Abrir trace')} ↗
            </a>
          )}
          {attempt.trace && <a className="btn" href={base + attempt.trace} download>{t('Descargar trace')}</a>}
          {attempt.video && <a className="btn" href={base + attempt.video} target="_blank" rel="noreferrer">{t('Abrir vídeo en otra pestaña')} ↗</a>}
        </div>
      )}

      {attempt.errorContext && (
        <details className="fold">
          <summary>{t('Contexto del error (snapshot de la página)')}</summary>
          <ErrorContext url={base + attempt.errorContext} />
        </details>
      )}

      {attempt.stdout && (
        <details className="fold">
          <summary>{t('Salida por consola (stdout)')}</summary>
          <AnsiBlock text={attempt.stdout} wrap />
        </details>
      )}

      {!attempt.error && !attempt.screenshots.length && !attempt.stdout && !attempt.trace && !attempt.video && (
        <div className="muted small">{t('Este intento no tiene error ni adjuntos.')}</div>
      )}
    </div>
  )
}

export default function TestDrawer({ run, test, onClose }) {
  const location = useLocation()
  const { data: summary } = useSummary()
  const knownIssues = useKnownIssues()
  const reviews = useReviews()
  const [tab, setTab] = useState(() => Math.max(0, test.attempts.findIndex((a) => a.error)))
  const [shot, setShot] = useState(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !shot && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, shot])

  const entries = summary?.results[test.key] ?? []
  const cells = new Map(entries.map((e) => [e[0], e[1]]))
  const allRuns = (summary?.runs ?? []).map((r, index) => ({ ...r, index }))
  const meta = summary?.tests[test.key] ?? test
  const issues = issuesForTest(knownIssues, meta)
  const attempt = test.attempts[tab]
  const review = reviewOf(reviews, run.id, test.key)

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={t('Detalle del test')}>
        <div className="drawer-head">
          <div className="grow stack">
            <div className="row wrap">
              <StatusChip outcome={test.outcome} />
              <ModuleTag id={moduleOfTest(test)} />
              <span className="chip neutral">{test.project}</span>
              {test.retries > 0 && <span className="chip neutral">{plural(test.retries, 'reintento', 'reintentos')}</span>}
            </div>
            <h2>{[...test.path, test.title].join(' › ')}</h2>
            <div className="test-sub">{test.file}{test.location && test.location !== test.file ? ` · ${test.location}` : ''}</div>
          </div>
          <button className="btn icon" onClick={onClose} aria-label={t('Cerrar')}>✕</button>
        </div>

        <div className="drawer-body">
          <div className="row wrap small text-2">
            <span>{t('Ejecución del {date}', { date: fmtDate(run.date, 'EEE d MMM yyyy') })} · {run.time}</span>
            <span>· {t('Duración total')} {fmtDuration(test.duration)}</span>
            <span className="spacer" style={{ flex: 1 }} />
            <Link className="btn" to={`/test${periodSearch(location.search, { k: test.key })}`}>{t('Historial completo del test')}</Link>
          </div>

          {test.outcome === 'skipped' && (
            <div className="issue solved">
              <b>{STATUS.skipped.label}:</b> {SKIP_REASON[test.skipReason] ?? test.skipReason}
              {test.skipDescription && <> — {test.skipDescription}</>}
            </div>
          )}

          {isReviewable(test.outcome) && <ReviewPanel key={review ? 'on' : 'off'} runId={run.id} testKey={test.key} review={review} />}

          <KnownIssues issues={issues} />

          <section className="stack">
            <h3>{t('Historial')} ({plural(entries.length, 'ejecución', 'ejecuciones')})</h3>
            <HistoryStrip runs={allRuns} cells={cells} testId={test.testId} reviews={reviews} testKey={test.key} />
          </section>

          {test.attempts.length > 0 && (
            <section className="stack" style={{ gap: 12 }}>
              {test.attempts.length > 1 && (
                <div className="tabs">
                  {test.attempts.map((a, i) => (
                    <button key={i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
                      <span style={{ color: a.status === 'passed' ? STATUS.passed.color : a.status === 'skipped' ? STATUS.skipped.color : STATUS.failed.color }}>●</span>{' '}
                      {attemptLabel(a, i)}
                    </button>
                  ))}
                </div>
              )}
              {attempt && <Attempt attempt={attempt} runId={run.id} openShot={setShot} timeZone={summary?.timeZone} />}
            </section>
          )}

          <NoteLinks meta={meta} />
        </div>
      </aside>
      {shot && <Lightbox src={shot} onClose={() => setShot(null)} />}
    </>
  )
}
