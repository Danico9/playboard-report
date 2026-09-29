import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import {
  addDays, eachDayOfInterval, endOfISOWeek, endOfMonth, endOfYear, format, getISOWeek,
  parseISO, startOfISOWeek, startOfMonth, startOfYear,
} from 'date-fns'
import { dateLocale, getLang, t } from '../i18n'
import PeriodToolbar from '../components/PeriodToolbar'
import { ErrorBox, Loading, StatusBar } from '../components/ui'
import { useReport } from '../lib/useReport'
import { ENV_PARAM } from '../lib/environments'
import { successRate, sumStats } from '../lib/stats'
import { HEALTH_LABEL, STATUS, healthOf } from '../config/status'
import { fmtDate, fmtPct, plural } from '../lib/format'

const iso = (d) => format(d, 'yyyy-MM-dd')
const DOW = { es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] }

function HealthLegend() {
  return (
    <div className="legend">
      {['passed', 'flaky', 'failed'].map((k) => (
        <span key={k}><i style={{ background: STATUS[k].color }} />{t('% éxito')} {HEALTH_LABEL[k]}</span>
      ))}
      <span><i style={{ background: 'var(--surface-2)' }} />{t('Sin ejecución')}</span>
    </div>
  )
}

export default function Calendar() {
  const { res, summary, period, setPeriod, env } = useReport()
  // Ejecuciones del entorno elegido (todas si no hay filtro)
  const envRuns = useMemo(() => (summary?.runs ?? []).filter((r) => !env || r.env === env), [summary, env])
  const navigate = useNavigate()

  const byDay = useMemo(() => {
    const map = new Map()
    for (const r of envRuns) {
      const d = map.get(r.date) ?? { runs: [] }
      d.runs.push(r)
      map.set(r.date, d)
    }
    for (const d of map.values()) {
      d.stats = sumStats(d.runs.map((r) => r.stats))
      d.rate = successRate(d.stats)
      d.health = healthOf(d.rate)
    }
    return map
  }, [envRuns])

  if (res.status === 'error' && !summary) return <ErrorBox error={res.error} />
  if (!summary) return <Loading />

  const anchor = parseISO(period.anchor)
  const envQuery = env ? `&${ENV_PARAM}=${encodeURIComponent(env)}` : ''
  const openDay = (date) => {
    const day = byDay.get(date)
    if (!day) return
    if (day.runs.length === 1) navigate(`/ejecucion/${encodeURIComponent(day.runs[0].id)}?p=day&d=${date}${envQuery}`)
    else navigate(`/ejecuciones?p=day&d=${date}${envQuery}`)
  }
  const dayTitle = (date) => {
    const day = byDay.get(date)
    if (!day) return `${fmtDate(date)} · ${t('sin ejecuciones')}`
    return `${fmtDate(date, 'EEE d MMM yyyy')} · ${plural(day.runs.length, 'ejecución', 'ejecuciones')} · ${t('% éxito')} ${fmtPct(day.rate)} · ${day.stats.failed} ${t('fallidos')} · ${day.stats.flaky} ${t('flaky')}`
  }

  // Heatmap anual: columnas = semanas ISO, filas = lunes…domingo
  const yStart = startOfYear(anchor)
  const yEnd = endOfYear(anchor)
  const weeks = []
  for (let w = startOfISOWeek(yStart); w <= yEnd; w = addDays(w, 7)) weeks.push(w)
  const yearRuns = envRuns.filter((r) => r.date.startsWith(format(anchor, 'yyyy')))

  // Calendario mensual
  const mStart = startOfMonth(anchor)
  const mEnd = endOfMonth(anchor)
  const monthDays = eachDayOfInterval({ start: startOfISOWeek(mStart), end: endOfISOWeek(mEnd) })
  const monthRuns = envRuns.filter((r) => r.date.startsWith(format(anchor, 'yyyy-MM')))
  const today = iso(new Date())

  return (
    <div className="page">
      <PeriodToolbar period={period} setPeriod={setPeriod} latestDate={summary.runs.at(-1)?.date} />
      <div className="page-head">
        <div>
          <h1>{t('Calendario')}</h1>
          <p>{t('Cada día se colorea según su % de éxito. Clic en un día para ver sus ejecuciones; clic en «S» para ver la semana.')}</p>
        </div>
        <HealthLegend />
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>{t('Año')} {format(anchor, 'yyyy')}</h2><p>{plural(yearRuns.length, 'ejecución', 'ejecuciones')}</p></div>
        </div>
        <div className="heatmap">
          <div className="daylabels">{DOW[getLang()].map((d, i) => <span key={i}>{i % 2 === 0 ? d : ''}</span>)}</div>
          {weeks.map((w) => {
            const monthStart = Array.from({ length: 7 }, (_, i) => addDays(w, i)).find((d) => d.getDate() === 1 && d >= yStart && d <= yEnd)
            return (
              <div className="col" key={iso(w)}>
                <div className="months" style={{ width: 14 }}>{monthStart ? format(monthStart, 'MMM', { locale: dateLocale() }) : ''}</div>
                {Array.from({ length: 7 }, (_, i) => {
                  const d = addDays(w, i)
                  const date = iso(d)
                  const out = d < yStart || d > yEnd
                  const day = byDay.get(date)
                  const cls = ['hm', out && 'out', day && 'has', day?.health, date === period.anchor && period.type === 'day' && 'sel'].filter(Boolean).join(' ')
                  return (
                    <button key={date} className={cls} title={out ? '' : dayTitle(date)} onClick={() => openDay(date)} disabled={!day} aria-label={dayTitle(date)} />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{fmtDate(format(anchor, "yyyy-MM-dd"), "MMMM 'de' yyyy")}</h2>
            <p>{plural(monthRuns.length, 'ejecución', 'ejecuciones')}</p>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setPeriod({ type: 'month', anchor: iso(addDays(mStart, -1)) })}>◀ {t('Mes anterior')}</button>
            <button className="btn" onClick={() => setPeriod({ type: 'month', anchor: iso(addDays(mEnd, 1)) })}>{t('Mes siguiente')} ▶</button>
          </div>
        </div>
        <div className="month-grid">
          {DOW[getLang()].map((d, i) => <div key={i} className="dow">{d}</div>)}
          {monthDays.map((d) => {
            const date = iso(d)
            const day = byDay.get(date)
            const out = d < mStart || d > mEnd
            const isMonday = d.getDay() === 1
            return (
              <div
                key={date}
                className={['day', out && 'out', day && 'has', date === today && 'today'].filter(Boolean).join(' ')}
                onClick={() => openDay(date)}
                role={day ? 'button' : undefined}
                tabIndex={day ? 0 : undefined}
                onKeyDown={(e) => e.key === 'Enter' && openDay(date)}
                title={dayTitle(date)}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="n">{d.getDate()}</span>
                  {isMonday && (
                    <button
                      className="chip neutral"
                      style={{ cursor: 'pointer', border: 0 }}
                      title={t('Ver esta semana')}
                      onClick={(e) => { e.stopPropagation(); navigate(`/?p=week&d=${date}`) }}
                    >{t('S')}{getISOWeek(d)}</button>
                  )}
                </div>
                {day && (
                  <>
                    <span className="rate">{fmtPct(day.rate, 0)}</span>
                    <StatusBar stats={day.stats} />
                    <span className="meta">
                      {day.runs.length > 1 ? `${plural(day.runs.length, 'ejecución', 'ejecuciones')} · ` : `${day.runs[0].time} · `}
                      {day.stats.failed} ✕ · {day.stats.flaky} ↻
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
