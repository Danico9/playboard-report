import { addDays, format, parseISO } from 'date-fns'
import { PERIOD_TYPES, periodLabel, periodRange, shiftPeriod } from '../lib/period'
import { plural } from '../lib/format'
import { t } from '../i18n'
import { EnvironmentFilter } from './Environments'

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
      <EnvironmentFilter />
      {children}
      {runCount != null && <span className="muted small">{t('{runs} en el periodo', { runs: plural(runCount, 'ejecución', 'ejecuciones') })}</span>}
    </div>
  )
}

// Rango de fechas siempre visible (p. ej. en la barra de filtros de Tests). Muestra el rango efectivo del periodo
// actual y, al tocarlo, cambia el periodo a «Rango». Los atajos cuentan hacia atrás desde la última ejecución.
const PRESETS = [[7, 'Últimos 7 días'], [30, 'Últimos 30 días'], [90, 'Últimos 90 días']]

export function DateRangeFilter({ period, setPeriod, range, firstDate, latestDate }) {
  const from = range.from < (firstDate ?? '') ? firstDate : range.from
  const to = range.to > (latestDate ?? '9999') ? latestDate : range.to
  const set = (next) => setPeriod({ type: 'range', anchor: period.anchor, from, to, ...next })
  const preset = (days) => {
    const d = parseISO(latestDate)
    set({ from: format(addDays(d, 1 - days), 'yyyy-MM-dd'), to: latestDate })
  }
  return (
    <div className="row wrap date-range" role="group" aria-label={t('Rango de fechas')}>
      <span className="muted small">{t('Fechas')}</span>
      <input className="input" type="date" value={from ?? ''} max={to} onChange={(e) => e.target.value && set({ from: e.target.value })} aria-label={t('Desde')} />
      <span className="muted">→</span>
      <input className="input" type="date" value={to ?? ''} min={from} onChange={(e) => e.target.value && set({ to: e.target.value })} aria-label={t('Hasta')} />
      {latestDate && PRESETS.map(([days, label]) => (
        <button key={days} className="btn" onClick={() => preset(days)} title={t('Hasta la última ejecución')}>{t(label)}</button>
      ))}
      {period.type !== 'all' && <button className="btn" onClick={() => setPeriod({ type: 'all', anchor: period.anchor })}>{t('Todas las fechas')}</button>}
    </div>
  )
}
