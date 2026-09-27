// ─── Periodos de análisis (día, semana, mes, año, rango, todo) ───

import {
  addDays, addMonths, addWeeks, addYears, endOfISOWeek, endOfMonth, endOfYear,
  format, getISOWeek, parseISO, startOfISOWeek, startOfMonth, startOfYear,
} from 'date-fns'
import { dateLocale, t } from '../i18n'

// Las etiquetas se traducen al mostrarlas: t(label)
export const PERIOD_TYPES = [
  ['all', 'Todo'],
  ['year', 'Año'],
  ['month', 'Mes'],
  ['week', 'Semana'],
  ['day', 'Día'],
  ['range', 'Rango'],
]

const iso = (d) => format(d, 'yyyy-MM-dd')

export function periodRange(period) {
  const a = parseISO(period.anchor)
  switch (period.type) {
    case 'day': return { from: period.anchor, to: period.anchor }
    case 'week': return { from: iso(startOfISOWeek(a)), to: iso(endOfISOWeek(a)) }
    case 'month': return { from: iso(startOfMonth(a)), to: iso(endOfMonth(a)) }
    case 'year': return { from: iso(startOfYear(a)), to: iso(endOfYear(a)) }
    case 'range': return { from: period.from ?? period.anchor, to: period.to ?? period.anchor }
    default: return { from: '0000-01-01', to: '9999-12-31' }
  }
}

export function periodLabel(period) {
  const label = rawPeriodLabel(period)
  return label[0].toUpperCase() + label.slice(1)
}

function rawPeriodLabel(period) {
  const a = parseISO(period.anchor)
  const f = (d, p) => format(d, t(p), { locale: dateLocale() })
  switch (period.type) {
    case 'day': return f(a, "EEEE d 'de' MMMM yyyy")
    case 'week': {
      const s = startOfISOWeek(a)
      const e = endOfISOWeek(a)
      return `${t('Semana')} ${getISOWeek(a)} · ${f(s, 'd MMM')} – ${f(e, 'd MMM yyyy')}`
    }
    case 'month': return f(a, "MMMM 'de' yyyy")
    case 'year': return f(a, 'yyyy')
    case 'range': {
      const { from, to } = periodRange(period)
      return `${f(parseISO(from), 'd MMM yyyy')} – ${f(parseISO(to), 'd MMM yyyy')}`
    }
    default: return t('Todas las ejecuciones')
  }
}

export function shiftPeriod(period, dir) {
  const a = parseISO(period.anchor)
  const move = { day: addDays, week: addWeeks, month: addMonths, year: addYears }[period.type]
  if (!move) return period
  return { ...period, anchor: iso(move(a, dir)) }
}

// Periodo inmediatamente anterior de la misma longitud (para comparar KPIs)
export function previousRange(period) {
  if (period.type === 'all') return null
  if (period.type === 'range') {
    const { from, to } = periodRange(period)
    const days = Math.round((parseISO(to) - parseISO(from)) / 864e5) + 1
    return { from: iso(addDays(parseISO(from), -days)), to: iso(addDays(parseISO(from), -1)) }
  }
  return periodRange(shiftPeriod(period, -1))
}

export const PREVIOUS_LABEL = {
  day: 'vs. día anterior', week: 'vs. semana anterior', month: 'vs. mes anterior',
  year: 'vs. año anterior', range: 'vs. periodo anterior',
}

export const inRange = (date, range) => date >= range.from && date <= range.to
