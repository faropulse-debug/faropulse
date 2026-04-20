'use client'

import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeeklySaleRow {
  semana:  string   // date ISO "2025-03-10"
  ventas:  number
  tickets: number
}

interface FinancialRow {
  periodo:   string  // "2025-03"
  categoria: string
  concepto:  string
  monto:     number
}

interface PEWeekPoint {
  name:        string   // "10 Mar"
  semana:      string   // ISO date
  periodo:     string   // "2025-03"
  ventas:      number
  peMinimo:    number
  peOperativo: number
  peIdeal:     number
  mc:          number
  status:      'ideal' | 'operativo' | 'minimo' | 'bajo'
  monthChange: boolean  // true if first week of a new month in the filtered set
}

type QuarterFilter = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Año'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

const QUARTER_MONTHS: Record<string, number[]> = {
  Q1: [1, 2, 3],
  Q2: [4, 5, 6],
  Q3: [7, 8, 9],
  Q4: [10, 11, 12],
}

const STATUS_COLOR = {
  bajo:      '#ef4444',
  minimo:    '#f59e0b',
  operativo: '#f5820a',
  ideal:     '#22c55e',
} as const

const STATUS_LABEL = {
  bajo:      'Bajo PE Mínimo',
  minimo:    'Sobre PE Mínimo',
  operativo: 'Sobre PE Operativo',
  ideal:     'Sobre PE Ideal (15% rent.)',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMoney(v: number | null | undefined): string {
  if (v == null) return '-'
  const abs  = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function formatFullMoney(v: number): string {
  const sign = v < 0 ? '-' : ''
  return `${sign}$${Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

/** Semanas calendario en el mes (4 ó 5) */
function weeksInMonth(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate()  // month is 1-based here (Date uses 0-based month)
  return Math.round(days / 7)
}

/** "2025-03-10" → "10 Mar" */
function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const day = d.getDate()
  const mon = MONTH_LABELS[String(d.getMonth() + 1).padStart(2, '0')]
  return `${day} ${mon}`
}

// ── Data Transform ────────────────────────────────────────────────────────────

export function transformPESemanal(
  salesRows:     WeeklySaleRow[],
  financialRows: FinancialRow[],
): PEWeekPoint[] {
  // Build PE lookup by periodo (YYYY-MM) → weekly PE values
  const byPeriod = new Map<string, Record<string, number>>()
  for (const row of financialRows) {
    if (!byPeriod.has(row.periodo)) byPeriod.set(row.periodo, {})
    byPeriod.get(row.periodo)![row.concepto] = row.monto
  }

  const peLookup = new Map<string, { peMinimo: number; peOperativo: number; peIdeal: number; mc: number }>()
  for (const [periodo, d] of byPeriod) {
    const [yr, mo]    = periodo.split('-').map(Number)
    const weeks       = weeksInMonth(yr, mo)

    const ventas      = d['VENTAS_NOCHE']   || 0
    const costos      = d['TOTAL_COSTOS']   || 0
    const totalGastos = d['TOTAL_GASTOS']   || 0
    const sueldos     = d['SUELDOS_CARGAS'] || 0
    const liq         = d['LIQ_FINAL']      || 0
    const alquiler    = d['ALQUILER']       || 0
    const regalias    = d['REGALIAS']       || 0

    const mc          = ventas > 0 ? (ventas - costos) / ventas : 0
    const peMinimo    = mc > 0 ? (sueldos + liq + alquiler) / mc / weeks : 0
    const peOperativo = mc > 0 ? totalGastos / mc / weeks                : 0
    const peIdeal     = mc > 0.15 ? (totalGastos + regalias) / (mc - 0.15) / weeks : 0

    peLookup.set(periodo, { peMinimo, peOperativo, peIdeal, mc })
  }

  // Sort sales chronologically
  const sorted = [...salesRows].sort((a, b) => a.semana.localeCompare(b.semana))

  return sorted.map((row, idx) => {
    // Period = month of the Monday that starts the week
    const periodo = row.semana.substring(0, 7)
    const pe      = peLookup.get(periodo) ?? { peMinimo: 0, peOperativo: 0, peIdeal: 0, mc: 0 }
    const ventas  = Number(row.ventas)

    const status: PEWeekPoint['status'] =
      ventas >= pe.peIdeal       ? 'ideal'
      : ventas >= pe.peOperativo ? 'operativo'
      : ventas >= pe.peMinimo    ? 'minimo'
      : 'bajo'

    // Detect month boundary for reference lines
    const prevPeriodo = idx > 0 ? sorted[idx - 1].semana.substring(0, 7) : null
    const monthChange = prevPeriodo !== null && prevPeriodo !== periodo

    return {
      name:        formatWeekLabel(row.semana),
      semana:      row.semana,
      periodo,
      ventas,
      peMinimo:    pe.peMinimo,
      peOperativo: pe.peOperativo,
      peIdeal:     pe.peIdeal,
      mc:          pe.mc,
      status,
      monthChange,
    }
  })
}

// ── Custom Dot (colored by PE status) ────────────────────────────────────────

function StatusDot(props: any) {
  const { cx, cy, payload } = props
  if (!payload || cx == null || cy == null) return null
  return (
    <circle
      cx={cx} cy={cy} r={4}
      fill={STATUS_COLOR[payload.status as PEWeekPoint['status']]}
      stroke="#0a0a12"
      strokeWidth={2}
    />
  )
}

function StatusActiveDot(props: any) {
  const { cx, cy, payload } = props
  if (!payload || cx == null || cy == null) return null
  return (
    <circle
      cx={cx} cy={cy} r={6}
      fill={STATUS_COLOR[payload.status as PEWeekPoint['status']]}
      stroke="#0a0a12"
      strokeWidth={2}
    />
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as PEWeekPoint
  if (!d) return null

  const [yr, mo] = d.periodo.split('-')
  const mesLabel  = `${MONTH_LABELS[mo] || mo} ${yr.slice(2)}`

  return (
    <div
      className="rounded-xl border p-4 min-w-[260px]"
      style={{
        background:     'rgba(10,10,18,0.97)',
        backdropFilter: 'blur(20px)',
        borderColor:    `${STATUS_COLOR[d.status]}40`,
      }}
    >
      {/* Header */}
      <div className="mb-3">
        <div
          className="text-amber-500 text-xs font-bold tracking-widest uppercase"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          Semana del {d.name}
        </div>
        <div className="text-white/30 text-[10px] mt-0.5">PE basado en {mesLabel}</div>
      </div>

      {/* Facturación */}
      <div
        className="flex justify-between items-center py-1.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[d.status] }} />
          <span className="text-white/60 text-xs">Facturación semanal</span>
        </div>
        <span className="font-mono text-sm font-bold" style={{ color: STATUS_COLOR[d.status] }}>
          {formatFullMoney(d.ventas)}
        </span>
      </div>

      {/* PE lines */}
      {([
        { label: 'PE Ideal (15% rent.)',     value: d.peIdeal,     color: '#22c55e' },
        { label: 'PE Operativo', value: d.peOperativo, color: '#f59e0b' },
        { label: 'PE Mínimo',    value: d.peMinimo,    color: '#ef4444' },
      ] as const).map(({ label, value, color }) => (
        <div
          key={label}
          className="flex justify-between items-center py-1"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-3 h-px" style={{ background: color }} />
            <span className="text-white/50 text-xs">{label}</span>
          </div>
          <span className="font-mono text-xs text-white/65">{formatFullMoney(value)}</span>
        </div>
      ))}

      {/* MC% */}
      <div
        className="flex justify-between items-center py-1.5 mt-1"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span className="text-white/40 text-xs">MC% del mes</span>
        <span className="font-mono text-xs font-bold text-indigo-400">{formatPct(d.mc)}</span>
      </div>

      {/* Status badge */}
      <div
        className="mt-3 px-3 py-2 rounded-lg text-center text-xs font-bold tracking-wide"
        style={{
          background: `${STATUS_COLOR[d.status]}15`,
          border:     `1px solid ${STATUS_COLOR[d.status]}30`,
          color:       STATUS_COLOR[d.status],
        }}
      >
        {STATUS_LABEL[d.status]}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface PESemanalChartProps {
  salesData:     WeeklySaleRow[]
  financialData: FinancialRow[]
  isLoading?:    boolean
}

export default function PESemanalChart({ salesData, financialData, isLoading }: PESemanalChartProps) {
  const [quarter, setQuarter] = useState<QuarterFilter>('Año')

  const allPoints = useMemo(
    () => transformPESemanal(salesData, financialData),
    [salesData, financialData],
  )

  const chartData = useMemo(() => {
    if (quarter === 'Año') return allPoints
    const months = QUARTER_MONTHS[quarter]
    return allPoints.filter(p => months.includes(parseInt(p.periodo.split('-')[1])))
  }, [allPoints, quarter])

  // Month-change x-values for reference lines
  const monthBoundaries = useMemo(
    () => chartData.filter(p => p.monthChange).map(p => p.name),
    [chartData],
  )

  const stats = useMemo(() => {
    const total          = chartData.length
    const sobreOperativo = chartData.filter(p => p.status === 'ideal' || p.status === 'operativo').length
    const avgMc          = total ? chartData.reduce((s, p) => s + p.mc, 0) / total : 0
    const lastPoint      = chartData[chartData.length - 1] ?? null
    return { total, sobreOperativo, avgMc, lastPoint }
  }, [chartData])

  if (isLoading) {
    return <div className="animate-pulse rounded-2xl bg-white/5 h-[480px]" />
  }

  if (!chartData.length) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-white/40">
        Sin datos semanales disponibles
      </div>
    )
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6"
      style={{ background: 'linear-gradient(135deg, #0a0a12 0%, #0d0d1a 50%, #0a0a12 100%)' }}
    >
      {/* Ambient glows */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(245,130,10,0.03) 0%, transparent 60%)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 70% 80%, rgba(99,102,241,0.02) 0%, transparent 60%)' }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div
          className="text-[10px] tracking-[3px] text-white/30 uppercase mb-1.5 font-semibold"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          Punto de Equilibrio
        </div>

        <div className="flex flex-wrap justify-between items-end gap-4 mb-5">
          <h2
            className="font-extrabold text-lg text-white tracking-tight m-0"
            style={{ fontFamily: 'Syne, sans-serif' }}
          >
            PE Semanal Evolutivo
          </h2>
          <div className="flex gap-5 items-end flex-wrap">
            {stats.lastPoint && (
              <>
                <div className="text-right">
                  <div className="text-[10px] text-white/35 tracking-wider uppercase">Última semana</div>
                  <div
                    className="font-mono text-base font-bold"
                    style={{ color: STATUS_COLOR[stats.lastPoint.status] }}
                  >
                    {formatMoney(stats.lastPoint.ventas)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/35 tracking-wider uppercase">MC% prom.</div>
                  <div className="font-mono text-base font-bold text-indigo-400">
                    {formatPct(stats.avgMc)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/35 tracking-wider uppercase">Sobre Op.</div>
                  <div className="font-mono text-base font-bold text-amber-500">
                    {stats.sobreOperativo}/{stats.total}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quarter filter */}
        <div className="flex gap-2 mb-4">
          {(['Q1', 'Q2', 'Q3', 'Q4', 'Año'] as QuarterFilter[]).map(q => (
            <button
              key={q}
              onClick={() => setQuarter(q)}
              className="px-3 py-1 rounded-lg text-xs font-bold tracking-wide border transition-all"
              style={{
                background:  quarter === q ? 'rgba(245,130,10,0.15)' : 'rgba(255,255,255,0.03)',
                borderColor: quarter === q ? 'rgba(245,130,10,0.4)'  : 'rgba(255,255,255,0.08)',
                color:       quarter === q ? '#f5820a'               : 'rgba(255,255,255,0.35)',
                cursor: 'pointer',
              }}
            >
              {q}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div
          className="rounded-xl p-4 pb-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                tickLine={false}
                dy={8}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatMoney}
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                dx={-5}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: 'rgba(245,130,10,0.15)', strokeWidth: 1 }}
              />

              {/* Separadores de mes */}
              {monthBoundaries.map(name => (
                <ReferenceLine
                  key={name}
                  x={name}
                  stroke="rgba(255,255,255,0.08)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              ))}

              {/* PE lines */}
              <Line
                type="stepAfter"
                dataKey="peMinimo"
                name="PE Mínimo"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 4, fill: '#ef4444', stroke: '#0a0a12', strokeWidth: 2 }}
                animationDuration={600}
              />
              <Line
                type="stepAfter"
                dataKey="peOperativo"
                name="PE Operativo"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#f59e0b', stroke: '#0a0a12', strokeWidth: 2 }}
                animationDuration={600}
              />
              <Line
                type="stepAfter"
                dataKey="peIdeal"
                name="PE Ideal (15% rent.)"
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="8 3"
                dot={false}
                activeDot={{ r: 4, fill: '#22c55e', stroke: '#0a0a12', strokeWidth: 2 }}
                animationDuration={600}
              />

              {/* Línea de facturación — dots coloreados por status */}
              <Line
                type="monotone"
                dataKey="ventas"
                name="Facturación"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={2.5}
                dot={<StatusDot />}
                activeDot={<StatusActiveDot />}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center pb-2 pt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.4)' }} />
              <span className="text-[11px] text-white/45">Facturación (dot = estado PE)</span>
            </div>
            {([
              { color: '#ef4444', label: 'PE Mínimo',    dash: true  },
              { color: '#f59e0b', label: 'PE Operativo', dash: false },
              { color: '#22c55e', label: 'PE Ideal (15% rent.)',     dash: true  },
            ] as const).map(({ color, label, dash }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div
                  style={{
                    width:  20,
                    height: 2,
                    background: dash
                      ? `repeating-linear-gradient(90deg, ${color} 0px, ${color} 5px, transparent 5px, transparent 8px)`
                      : color,
                  }}
                />
                <span className="text-[11px] text-white/45">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status summary cards */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {(Object.keys(STATUS_COLOR) as PEWeekPoint['status'][]).map(status => {
            const count = chartData.filter(p => p.status === status).length
            const pct   = stats.total ? Math.round((count / stats.total) * 100) : 0
            return (
              <div
                key={status}
                className="rounded-lg p-2.5 text-center"
                style={{
                  background: `${STATUS_COLOR[status]}08`,
                  border:     `1px solid ${STATUS_COLOR[status]}20`,
                }}
              >
                <div className="text-[9px] text-white/30 tracking-wider uppercase mb-1">
                  {STATUS_LABEL[status]}
                </div>
                <div
                  className="font-mono text-xl font-bold"
                  style={{ color: STATUS_COLOR[status] }}
                >
                  {count}
                </div>
                <div className="text-[10px] text-white/30">{pct}% de semanas</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
