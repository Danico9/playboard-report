import { useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { REMOVED, STATUS, STATUS_ORDER } from '../config/status'
import { moduleName } from '../config/modules'
import { fmtDate, fmtNum } from '../lib/format'
import { periodSearch } from '../lib/usePeriod'
import { removedTitle } from '../lib/stats'
import { PAGE_SIZES } from '../lib/usePagination'
import { t } from '../i18n'

export function StatusChip({ outcome, children }) {
  const s = STATUS[outcome]
  if (!s) return null
  return (
    <span className={`chip ${outcome}`} title={s.label}>
      <span aria-hidden>{s.icon}</span>
      {children ?? s.label}
    </span>
  )
}

export function StatusBar({ stats, tall }) {
  const total = STATUS_ORDER.reduce((a, k) => a + (stats[k] ?? 0), 0)
  const title = STATUS_ORDER.map((k) => `${STATUS[k].plural}: ${stats[k] ?? 0}`).join(' · ')
  return (
    <div className={`statusbar${tall ? ' tall' : ''}`} title={title} role="img" aria-label={title}>
      {total > 0 && STATUS_ORDER.map((k) => (stats[k] ? (
        <span key={k} style={{ width: `${(stats[k] / total) * 100}%`, background: STATUS[k].color }} />
      ) : null))}
    </div>
  )
}

export function StatusLegend({ items = STATUS_ORDER }) {
  return (
    <div className="legend">
      {items.map((k) => (
        <span key={k}><i style={{ background: STATUS[k].color }} />{STATUS[k].plural}</span>
      ))}
    </div>
  )
}

// Un cuadrado por ejecución; enlaza a la ficha del test en esa ejecución
// Con `reviews` y `testKey`, marca las ejecuciones en las que el usuario comprobó el fallo (ver lib/reviews.js):
// raya de acento si está OK y raya del color del texto si sigue fallando
export function HistoryStrip({ runs, cells, testId, onPick, reviews, testKey }) {
  const location = useLocation()
  return (
    <div className="strip">
      {runs.map((r) => {
        const o = cells.get(r.index)
        const reviewed = o && reviews?.[r.id]?.[testKey]
        const failing = reviewed?.verdict === 'failing'
        const title = `${fmtDate(r.date)} ${r.time} · ${o ? STATUS[o].label : t('No ejecutado en esta ejecución')}${reviewed ? ` · ${t(failing ? 'Sigue fallando' : 'Comprobado: OK')}` : ''}`
        const cls = `cell ${o}${reviewed ? ' reviewed' : ''}${failing ? ' failing' : ''}`
        if (!o) return <span key={r.id} className="cell none" title={title} />
        if (onPick) {
          return <a key={r.id} className={cls} title={title} href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick(r) }} />
        }
        return (
          <Link
            key={r.id}
            className={cls}
            title={title}
            onClick={(e) => e.stopPropagation()}
            to={`/ejecucion/${encodeURIComponent(r.id)}${periodSearch(location.search, testId ? { t: testId } : {})}`}
          />
        )
      })}
    </div>
  )
}

export function Kpi({ label, value, sub, delta, hero, icon }) {
  return (
    <div className={`card kpi${hero ? ' hero' : ''}`}>
      <div className="label">{icon}{label}</div>
      <div className="value">{value}</div>
      {(delta || sub) && (
        <div className="row wrap small">
          {delta && <span className={`delta ${delta.tone}`}>{delta.text}</span>}
          {sub && <span className="sub">{sub}</span>}
        </div>
      )}
    </div>
  )
}

export function Loading({ what = 'datos' }) {
  return <div className="loading">{t('Cargando {what}…', { what: t(what) })}</div>
}

export function ErrorBox({ error }) {
  return <div className="error-box">{t('No se pudieron cargar los datos:')} {String(error?.message ?? error)}</div>
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function ModuleTag({ id }) {
  return <span className="chip neutral" title={moduleName(id)}>{id}</span>
}

export function TestLink({ testKey, meta, sub = true }) {
  const location = useLocation()
  return (
    <div className="stack" style={{ gap: 0, minWidth: 0 }}>
      <Link className="test-title" to={`/test${periodSearch(location.search, { k: testKey })}`} onClick={(e) => e.stopPropagation()}>
        {[...(meta.path ?? []), meta.title].join(' › ')}
      </Link>
      {sub && <span className="test-sub truncate" title={meta.file}>{meta.file} · {meta.project}</span>}
    </div>
  )
}

// Test que ya no aparece en los reportes (ver removedTests en lib/stats.js)
export function RemovedChip({ info }) {
  if (!info) return null
  return <span className="chip removed" title={removedTitle(info)}><span aria-hidden>{REMOVED.icon}</span>{REMOVED.label}</span>
}

// Números de página que se enseñan: la primera, la última y las cercanas a la actual («…» en los huecos)
function pageNumbers(page, pageCount) {
  const out = []
  for (let n = 1; n <= pageCount; n++) {
    if (n === 1 || n === pageCount || Math.abs(n - page) <= 2) out.push(n)
    else if (out.at(-1) !== '…') out.push('…')
  }
  return out
}

// Controles de paginación. `pager` es lo que devuelve usePagination(); `info`, lo que devuelve paginate().
// Al cambiar de página se sube al principio de la lista (el elemento con data-pager-top o la tarjeta que la contiene).
export function Pagination({ pager, info, unit = 'tests' }) {
  const ref = useRef(null)
  if (info.total <= PAGE_SIZES[0]) return null
  const go = (n) => {
    pager.setPage(n)
    const el = ref.current
    const top = el?.closest('[data-pager-top]') ?? el?.closest('.card') ?? el?.closest('.page')
    top?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  return (
    <nav ref={ref} className="pager" aria-label={t('Paginación')}>
      <span className="muted small">{t('{from}–{to} de {total} {unit}', { from: fmtNum(info.from + 1), to: fmtNum(info.to), total: fmtNum(info.total), unit: t(unit) })}</span>
      {info.pageCount > 1 && (
        <div className="row" style={{ gap: 4 }}>
          <button className="btn" disabled={info.page <= 1} onClick={() => go(info.page - 1)} aria-label={t('Página anterior')}>‹</button>
          {pageNumbers(info.page, info.pageCount).map((n, i) => (n === '…'
            ? <span key={`gap${i}`} className="muted small">…</span>
            : (
              <button key={n} className={`btn${n === info.page ? ' primary' : ''}`} aria-current={n === info.page ? 'page' : undefined} onClick={() => go(n)}>
                {n}
              </button>
            )))}
          <button className="btn" disabled={info.page >= info.pageCount} onClick={() => go(info.page + 1)} aria-label={t('Página siguiente')}>›</button>
        </div>
      )}
      <select className="select" value={pager.size} onChange={(e) => pager.setSize(Number(e.target.value))} aria-label={t('Elementos por página')}>
        {PAGE_SIZES.map((n) => <option key={n} value={n}>{t('{n} por página', { n })}</option>)}
      </select>
    </nav>
  )
}
