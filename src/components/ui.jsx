import { Link, useLocation } from 'react-router'
import { STATUS, STATUS_ORDER } from '../config/status'
import { moduleName } from '../config/modules'
import { fmtDate } from '../lib/format'
import { periodSearch } from '../lib/usePeriod'
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
export function HistoryStrip({ runs, cells, testId, onPick }) {
  const location = useLocation()
  return (
    <div className="strip">
      {runs.map((r) => {
        const o = cells.get(r.index)
        const title = `${fmtDate(r.date)} ${r.time} · ${o ? STATUS[o].label : t('No ejecutado en esta ejecución')}`
        if (!o) return <span key={r.id} className="cell none" title={title} />
        if (onPick) {
          return <a key={r.id} className={`cell ${o}`} title={title} href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick(r) }} />
        }
        return (
          <Link
            key={r.id}
            className={`cell ${o}`}
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
