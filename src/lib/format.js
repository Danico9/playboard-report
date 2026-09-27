import { format, parseISO } from 'date-fns'
import { dateLocale, getLang, numberLocale, t } from '../i18n'

export function fmtDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

export function fmtPct(r, digits = 1) {
  if (r == null || Number.isNaN(r)) return '—'
  const n = (r * 100).toFixed(digits)
  return getLang() === 'en' ? `${n}%` : `${n.replace('.', ',')} %`
}
export const fmtNum = (n) => (n == null ? '—' : n.toLocaleString(numberLocale()))

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
// Los patrones de fecha también pasan por t(): en.js tiene su equivalente en inglés
export const fmtDate = (iso, pattern = 'd MMM yyyy') => cap(format(parseISO(iso), t(pattern), { locale: dateLocale() }))
export const fmtDateLong = (iso) => fmtDate(iso, "EEEE d 'de' MMMM yyyy")
export const fmtDateShort = (iso) => format(parseISO(iso), t('d MMM'), { locale: dateLocale() })

export function fmtSigned(n, unit = '') {
  if (n == null || Number.isNaN(n) || n === 0) return null
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString(numberLocale(), { maximumFractionDigits: 1 })}${unit}`
}

export const plural = (n, one, many) => `${fmtNum(n)} ${n === 1 ? t(one) : t(many)}`
