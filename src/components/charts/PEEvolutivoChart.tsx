'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinancialRow {
  periodo:   string
  categoria: string
  concepto:  string
  monto:     number
}

interface PEPoint {
  name:        string
  periodo:     string
  ventas:      number
  peMinimo:    number
  peOperativo: number
  peIdeal:     number
  mc:          number
  status:      'ideal' | 'operativo' | 'minimo' | 'bajo'
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
  ideal:     'Sobre PE Ideal',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPeriodo(p: string): string {
  const [y, m] = p.split('-')
  return `${MONTH_LABELS[m] || m} ${y.slice(2)}`
}

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

// ── Data Transform ────────────────────────────────────────────────────────────

export function transformPEData(rows: FinancialRow[]): PEPoint[] {
  const byPeriod = new Map<string, Record<string, number>>()

  for (const row of rows) {
    if (!byPeriod.has(row.periodo)) byPeriod.set(row.periodo, {})
    byPeriod.get(row.periodo)![row.concepto] = row.monto
  }

  return Array.from(byPeriod.keys()).sort().map(periodo => {
    const d = byPeriod.get(periodo)!

    const ventas      = d['VENTAS_NOCHE']   || 0
    const costos      = d['TOTAL_COSTOS']   || 0
    const totalGastos = d['TOTAL_GASTOS']   || 0
    const sueldos     = d['SUELDOS_CARGAS'] || 0
    const liq         = d['LIQ_FINAL']      || 0
    const alquiler    = d['ALQUILER']       || 0
    const regalias    = d['REGALIAS']       || 0

    // MC% = (VENTAS_NOCHE - TOTAL_COSTOS) / VENTAS_NOCHE
    const mc = ventas > 0 ? (ventas - costos) / ventas : 0

    // PE dinámicos por mes
    const peMinimo    = mc > 0 ? (sueldos + liq + alquiler) / mc : 0
    const peOperativo = mc > 0 ? totalGastos / mc               : 0
    const peIdeal     = mc > 0 ? (totalGastos + regalias) / mc  : 0

    const status: PEPoint['status'] =
      ventas >= peIdeal       ? 'ideal'
      : ventas >= peOperativo ? 'operativo'
      : ventas >= peMinimo    ? 'minimo'
      : 'bajo'

    return { name: formatPeriodo(periodo), periodo, ventas, peMinimo, peOperativo, peIdeal, mc, status }
  })
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as PEPoint
  if (!d) return null

  return (
    <div
      className="rounded-xl border p-4 min-w-[260px]"
      style={{
        background:    'rgba(10,10,18,0.97)',
        backdropFilter:'blur(20px)',
        borderColor:   `${STATUS_COLOR[d.status]}40`,
      }}
    >
      {/* Periodo */}
      <div
        className="text-amber-500 text-xs font-bold mb-3 tracking-widest uppercase"
        style={{ fontFamily: 'Syne, sans-serif' }}
      >
        {d.name}
      </div>

      {/* Facturación */}
      <div
        className="flex justify-between items-center py-1.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_COLOR[d.status] }} />
          <span className="text-white/60 text-xs">Facturación</span>
        </div>
        <span className="font-mono text-sm font-bold" style={{ color: STATUS_COLOR[d.status] }}>
          {formatFullMoney(d.ventas)}
        </span>
      </div>

      {/* PE lines */}
      {([
        { label: 'PE Ideal',     value: d.peIdeal,     color: '#22c55e' },
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
        <span className="text-white/40 text-xs">Margen de Contribución</span>
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

interface PEEvolutivoChartProps {
  data:       FinancialRow[]
  isLoading?: boolean
}

export default function PEEvolutivoChart({ data, isLoading }: PEEvolutivoChartProps) {
  const [quarter, setQuarter] = useState<QuarterFilter>('Año')

  const allPoints = useMemo(() => transformPEData(data), [data])

  const chartData = useMemo(() => {
    if (quarter === 'Año') return allPoints
    const months = QUARTER_MONTHS[quarter]
    return allPoints.filter(p => months.includes(parseInt(p.periodo.split('-')[1])))
  }, [allPoints, quarter])

  const stats = useMemo(() => {
    const total          = chartData.length
    const sobreOperativo = chartData.filter(p => p.status === 'ideal' || p.status === 'operativo').length
    const avgMc          = total ? chartData.reduce((s, p) => s + p.mc, 0) / total : 0
    const lastPoint      = chartData[chartData.length - 1] ?? null
    return { total, sobreOperativo, avgMc, lastPoint }
  }, [chartData])

  if (isLoading) {
    return <div className="animate-pulse rounded-2xl bg-white/5 h-[520px]" />
  }

  if (!chartData.length) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-white/40">
        Sin datos financieros disponibles
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
        style={{ background: 'radial-gradient(ellipse at 20% 20%, rgba(245,130,10,0.03) 0%, transparent 60%)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 80%, rgba(34,197,94,0.02) 0%, transparent 60%)' }}
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
            PE Mensual Evolutivo
          </h2>
          <div className="flex gap-5 items-end flex-wrap">
            {stats.lastPoint && (
              <>
                <div className="text-right">
                  <div className="text-[10px] text-white/35 tracking-wider uppercase">Último mes</div>
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
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                tickLine={false}
                dy={8}
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
                cursor={{ fill: 'rgba(245,130,10,0.06)' }}
              />

              {/* Barras de facturación — color refleja estado vs PE */}
              <Bar dataKey="ventas" name="Facturación" radius={[4, 4, 0, 0]} maxBarSize={52}>
                {chartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={STATUS_COLOR[entry.status]}
                    fillOpacity={0.75}
                  />
                ))}
              </Bar>

              {/* Líneas PE dinámicas */}
              <Line
                type="monotone"
                dataKey="peMinimo"
                name="PE Mínimo"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 5, fill: '#ef4444', stroke: '#0a0a12', strokeWidth: 2 }}
                animationDuration={600}
              />
              <Line
                type="monotone"
                dataKey="peOperativo"
                name="PE Operativo"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: '#f59e0b', stroke: '#0a0a12', strokeWidth: 2 }}
                animationDuration={600}
              />
              <Line
                type="monotone"
                dataKey="peIdeal"
                name="PE Ideal"
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="8 3"
                dot={false}
                activeDot={{ r: 5, fill: '#22c55e', stroke: '#0a0a12', strokeWidth: 2 }}
                animationDuration={600}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center pb-2 pt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm opacity-75" style={{ background: '#22c55e' }} />
              <span className="text-[11px] text-white/45">Facturación (color = estado PE)</span>
            </div>
            {([
              { color: '#ef4444', label: 'PE Mínimo',    dash: true  },
              { color: '#f59e0b', label: 'PE Operativo', dash: false },
              { color: '#22c55e', label: 'PE Ideal',     dash: true  },
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
          {(Object.keys(STATUS_COLOR) as PEPoint['status'][]).map(status => {
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
                <div className="text-[10px] text-white/30">{pct}% de meses</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
