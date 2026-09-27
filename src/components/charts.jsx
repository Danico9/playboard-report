import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { STATUS, STATUS_ORDER } from '../config/status'
import { useChartColors } from '../lib/theme'
import { getLang, t } from '../i18n'
import { fmtDate, fmtDateShort, fmtDuration, fmtPct } from '../lib/format'
import { successRate } from '../lib/stats'

const axisPropsFor = (CHART) => ({
  stroke: CHART.axis,
  tick: { fill: CHART.muted, fontSize: 11 },
  tickLine: false,
})

function bucketTitle(b) {
  if (b.week) return t('Semana del {date} · {n} ejecuciones', { date: fmtDate(b.label), n: b.runs.length })
  return `${fmtDate(b.label, "EEE d MMM yyyy")} · ${b.time}`
}

function TooltipBox({ title, rows }) {
  return (
    <div className="chart-tooltip">
      <div className="t">{title}</div>
      {rows.map((r) => (
        <div className="r" key={r.label}>
          <span className="k"><i style={{ background: r.color }} />{r.label}</span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  )
}

function withIndex(buckets) {
  return buckets.map((b, i) => ({ ...b, xi: i, rate: successRate(b) }))
}

function tickFor(data) {
  return (i) => (data[i] ? fmtDateShort(data[i].label) : '')
}

export function RunsChart({ buckets, onPick, height = 260 }) {
  const CHART = useChartColors()
  const axisProps = axisPropsFor(CHART)
  const data = withIndex(buckets)
  const top = [...STATUS_ORDER].reverse()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="25%">
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="xi" {...axisProps} tickFormatter={tickFor(data)} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={44} />
        <Tooltip
          cursor={{ fill: CHART.hover }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const b = payload[0].payload
            return (
              <TooltipBox
                title={bucketTitle(b)}
                rows={[
                  ...top.map((k) => ({ label: STATUS[k].plural, value: b[k], color: STATUS[k].color })),
                  { label: t('% éxito'), value: fmtPct(b.rate), color: 'transparent' },
                ]}
              />
            )
          }}
        />
        {STATUS_ORDER.map((k) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="s"
            fill={STATUS[k].color}
            stroke={CHART.surface}
            strokeWidth={1}
            maxBarSize={24}
            radius={k === 'skipped' ? [4, 4, 0, 0] : 0}
            cursor={onPick ? 'pointer' : undefined}
            onClick={onPick ? (d) => onPick(d.payload ?? d) : undefined}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RateChart({ buckets, onPick, height = 220 }) {
  const CHART = useChartColors()
  const axisProps = axisPropsFor(CHART)
  const data = withIndex(buckets)
  const rates = data.map((d) => d.rate).filter((r) => r != null)
  const min = rates.length ? Math.max(0, Math.floor((Math.min(...rates) * 100 - 5) / 5) * 5) : 0
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
        onClick={onPick ? (e) => e?.activeIndex != null && onPick(data[Number(e.activeIndex)]) : undefined}
      >
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="xi" {...axisProps} tickFormatter={tickFor(data)} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axisProps} axisLine={false} domain={[min, 100]} tickFormatter={(v) => (getLang() === 'en' ? `${v}%` : `${v} %`)} width={52} />
        <Tooltip
          cursor={{ stroke: CHART.muted, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const b = payload[0].payload
            return (
              <TooltipBox
                title={bucketTitle(b)}
                rows={[
                  { label: t('% éxito'), value: fmtPct(b.rate), color: CHART.accent },
                  { label: STATUS.failed.plural, value: b.failed, color: STATUS.failed.color },
                  { label: STATUS.flaky.plural, value: b.flaky, color: STATUS.flaky.color },
                ]}
              />
            )
          }}
        />
        <Line
          dataKey={(d) => (d.rate == null ? null : +(d.rate * 100).toFixed(2))}
          name={t('% éxito')}
          stroke={CHART.accent}
          strokeWidth={2}
          dot={{ r: 4, fill: CHART.accent, stroke: CHART.surface, strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2, cursor: onPick ? 'pointer' : undefined }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function DurationChart({ buckets, onPick, height = 220 }) {
  const CHART = useChartColors()
  const axisProps = axisPropsFor(CHART)
  // Horas si alguna ejecución dura 2 h o más; si no, minutos
  const inHours = buckets.some((b) => b.duration >= 2 * 3600000)
  const data = withIndex(buckets).map((b) => ({ ...b, value: b.duration / (inHours ? 3600000 : 60000) }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="25%">
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="xi" {...axisProps} tickFormatter={tickFor(data)} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => `${v} ${inHours ? 'h' : 'min'}`} width={54} />
        <Tooltip
          cursor={{ fill: CHART.hover }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const b = payload[0].payload
            return (
              <TooltipBox
                title={bucketTitle(b)}
                rows={[
                  { label: b.week ? t('Duración media') : t('Duración'), value: fmtDuration(b.duration), color: CHART.accent },
                  { label: t('Tests'), value: b.total, color: 'transparent' },
                ]}
              />
            )
          }}
        />
        <Bar
          dataKey="value"
          fill={CHART.accent}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          cursor={onPick ? 'pointer' : undefined}
          onClick={onPick ? (d) => onPick(d.payload ?? d) : undefined}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Duración de un test a lo largo de sus ejecuciones
export function TestDurationChart({ points, height = 200 }) {
  const CHART = useChartColors()
  const axisProps = axisPropsFor(CHART)
  const data = points.map((p, i) => ({ ...p, xi: i, secs: p.duration / 1000 }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="xi" {...axisProps} tickFormatter={(i) => (data[i] ? fmtDateShort(data[i].date) : '')} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtDuration(v * 1000)} width={64} />
        <Tooltip
          cursor={{ stroke: CHART.muted, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload
            return (
              <TooltipBox
                title={`${fmtDate(p.date, 'EEE d MMM yyyy')} · ${p.time}`}
                rows={[
                  { label: t('Duración'), value: fmtDuration(p.duration), color: CHART.accent },
                  { label: t('Estado'), value: STATUS[p.outcome]?.label, color: STATUS[p.outcome]?.color },
                ]}
              />
            )
          }}
        />
        <Line
          dataKey="secs"
          stroke={CHART.accent}
          strokeWidth={2}
          isAnimationActive={false}
          dot={(props) => {
            const { cx, cy, payload, index } = props
            if (cx == null || cy == null) return null
            return <circle key={index} cx={cx} cy={cy} r={4} fill={STATUS[payload.outcome]?.color ?? CHART.accent} stroke={CHART.surface} strokeWidth={2} />
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
