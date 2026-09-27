import { PERIOD_TYPES, periodLabel, periodRange, shiftPeriod } from '../lib/period'
import { plural } from '../lib/format'
import { t } from '../i18n'

export default function PeriodToolbar({ period, setPeriod, latestDate, runCount, children }) {
  const navigable = !['all', 'range'].includes(period.type)
  const pick = (type) => {
    if (type === 'range') {
      const r = period.type === 'all' ? { from: latestDate, to: latestDate } : periodRange(period)
      setPeriod({ type, from: r.from, to: r.to, anchor: period.anchor })
    } else {
      setPeriod({ ...period, type })
    }
  }
  return (
    <div className="toolbar">
      <div className="seg" role="group" aria-label={t('Periodo')}>
        {PERIOD_TYPES.map(([type, label]) => (
          <button key={type} className={period.type === type ? 'on' : ''} onClick={() => pick(type)}>{t(label)}</button>
        ))}
      </div>
      {navigable && (
        <>
          <button className="btn icon" onClick={() => setPeriod(shiftPeriod(period, -1))} aria-label={t('Periodo anterior')}>◀</button>
          <span className="period-label">{periodLabel(period)}</span>
          <button className="btn icon" onClick={() => setPeriod(shiftPeriod(period, 1))} aria-label={t('Periodo siguiente')}>▶</button>
          <button className="btn" onClick={() => setPeriod({ ...period, anchor: latestDate })} disabled={!latestDate}>{t('Última ejecución')}</button>
        </>
      )}
      {period.type === 'range' && (
        <>
          <input className="input" type="date" value={period.from ?? ''} max={period.to} onChange={(e) => setPeriod({ ...period, from: e.target.value })} aria-label={t('Desde')} />
          <span className="muted">→</span>
          <input className="input" type="date" value={period.to ?? ''} min={period.from} onChange={(e) => setPeriod({ ...period, to: e.target.value })} aria-label={t('Hasta')} />
        </>
      )}
      {period.type === 'all' && <span className="period-label" style={{ textAlign: 'left' }}>{periodLabel(period)}</span>}
      <span className="spacer" />
      {children}
      {runCount != null && <span className="muted small">{t('{runs} en el periodo', { runs: plural(runCount, 'ejecución', 'ejecuciones') })}</span>}
    </div>
  )
}
