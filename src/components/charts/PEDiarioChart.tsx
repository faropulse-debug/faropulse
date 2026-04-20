'use client'

import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DailySaleRow {
  fecha:       string   // "2025-03-10"
  facturacion: number
  tickets:     number
}

interface FinancialRow {
  periodo:   string    // "2025-03"
  categoria: string
  concepto:  string
  monto:     number
}

interface PEDayPoint {
  name:        string   // "10" (día del mes)
  fecha:       string   // "2025-03-10"
  diaSemana:   string   // "Lun"
  ventas:      number
  peMinimo:    number   // constante para el mes
  peOperativo: number
  peIdeal:     number
  mc:          number
  status:      'ideal' | 'operativo' | 'minimo' | 'bajo'
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

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

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()   // month 1-based
}

function periodLabel(periodo: string): string {
  const [y, m] = periodo.split('-')
  return `${MONTH_LABELS[m] || m} ${y.slice(2)}`
}

// ── Data Transform ────────────────────────────────────────────────────────────

/** Extrae la lista de periodos (YYYY-MM) disponibles en los datos diarios */
export function availableMonths(rows: DailySaleRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) set.add(r.fecha.substring(0, 7))
  return Array.from(set).sort()
}

/** Construye PE diario a partir de financial_results mensual */
function buildPELookup(financialRows: FinancialRow[]) {
  const byPeriod = new Map<string, Record<string, number>>()
  for (const row of financialRows) {
    if (!byPeriod.has(row.periodo)) byPeriod.set(row.periodo, {})
    byPeriod.get(row.periodo)![row.concepto] = row.monto
  }

  const lookup = new Map<string, { peMinimo: number; peOperativo: number; peIdeal: number; mc: number }>()

  for (const [periodo, d] of byPeriod) {
    const [yr, mo]    = periodo.split('-').map(Number)
    const days        = daysInMonth(yr, mo)

    const ventas      = d['VENTAS_NOCHE']   || 0
    const costos      = d['TOTAL_COSTOS']   || 0
    const totalGastos = d['TOTAL_GASTOS']   || 0
    const sueldos     = d['SUELDOS_CARGAS'] || 0
    const liq         = d['LIQ_FINAL']      || 0
    const alquiler    = d['ALQUILER']       || 0
    const regalias    = d['REGALIAS']       || 0

    const mc          = ventas > 0 ? (ventas - costos) / ventas : 0
    const peMinimo    = mc > 0    ? (sueldos + liq + alquiler) / mc / days          : 0
    const peOperativo = mc > 0    ? totalGastos / mc / days                         : 0
    const peIdeal     = mc > 0.15 ? (totalGastos + regalias) / (mc - 0.15) / days  : 0

    lookup.set(periodo, { peMinimo, peOperativo, peIdeal, mc })
  }

  return lookup
}

export function transformPEDiario(
  salesRows:     DailySaleRow[],
  financialRows: FinancialRow[],
  periodo:       string,          // "YYYY-MM"
): PEDayPoint[] {
  const peLookup = buildPELookup(financialRows)

  // Filtrar los días del mes seleccionado y ordenar
  const days = salesRows
    .filter(r => r.fecha.startsWith(periodo))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  const pe = peLookup.get(periodo) ?? { peMinimo: 0, peOperativo: 0, peIdeal: 0, mc: 0 }

  return days.map(row => {
    const ventas = Number(row.facturacion)
    const d      = new Date(row.fecha + 'T12:00:00')
    const dayNum = d.getDate()

    const status: PEDayPoint['status'] =
      ventas >= pe.peIdeal       ? 'ideal'
      : ventas >= pe.peOperativo ? 'operativo'
      : ventas >= pe.peMinimo    ? 'minimo'
      : 'bajo'

    return {
      name:        String(dayNum),
      fecha:       row.fecha,
      diaSemana:   DIAS_SEMANA[d.getDay()],
      ventas,
      peMinimo:    pe.peMinimo,
      peOperativo: pe.peOperativo,
      peIdeal:     pe.peIdeal,
      mc:          pe.mc,
      status,
    }
  })
}

// ── Custom Dots ───────────────────────────────────────────────────────────────

function StatusDot(props: any) {
  const { cx, cy, payload } = props
  if (!payload || cx == null || cy == null) return null
  return (
    <circle
      cx={cx} cy={cy} r={4}
      fill={STATUS_COLOR[payload.status as PEDayPoint['status']]}
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
      fill={STATUS_COLOR[payload.status as PEDayPoint['status']]}
      stroke="#0a0a12"
      strokeWidth={2}
    />
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as PEDayPoint
  if (!d) return null

  return (
    <div
      className="rounded-xl border p-4 min-w-[250px]"
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
          {d.diaSemana} {d.name}
        </div>
        <div className="text-white/30 text-[10px] mt-0.5">{d.fecha}</div>
      </div>

      {/* Facturación */}
      <div
        className="flex justify-between items-center py-1.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[d.status] }} />
          <span className="text-white/60 text-xs">Facturación</span>
        </div>
        <span className="font-mono text-sm font-bold" style={{ color: STATUS_COLOR[d.status] }}>
          {formatFullMoney(d.ventas)}
        </span>
      </div>

      {/* PE lines */}
      {([
        { label: 'PE Ideal (15% rent.)', value: d.peIdeal,     color: '#22c55e' },
        { label: 'PE Operativo',         value: d.peOperativo, color: '#f59e0b' },
        { label: 'PE Mínimo',            value: d.peMinimo,    color: '#ef4444' },
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

interface PEDiarioChartProps {
  salesData:     DailySaleRow[]
  financialData: FinancialRow[]
  isLoading?:    boolean
}

export default function PEDiarioChart({ salesData, financialData, isLoading }: PEDiarioChartProps) {
  const months = useMemo(() => availableMonths(salesData), [salesData])

  // Arranca en el último mes disponible
  const [selectedMonth, setSelectedMonth] = useState<string>('')

  const activePeriod = useMemo(() => {
    if (selectedMonth && months.includes(selectedMonth)) return selectedMonth
    return months[months.length - 1] ?? ''
  }, [selectedMonth, months])

  const chartData = useMemo(
    () => activePeriod ? transformPEDiario(salesData, financialData, activePeriod) : [],
    [salesData, financialData, activePeriod],
  )

  const stats = useMemo(() => {
    const total          = chartData.length
    const sobreOperativo = chartData.filter(p => p.status === 'ideal' || p.status === 'operativo').length
    const totalVentas    = chartData.reduce((s, p) => s + p.ventas, 0)
    const avgDiario      = total ? totalVentas / total : 0
    const lastPoint      = chartData[chartData.length - 1] ?? null
    return { total, sobreOperativo, totalVentas, avgDiario, lastPoint }
  }, [chartData])

  if (isLoading) {
    return <div className="animate-pulse rounded-2xl bg-white/5 h-[480px]" />
  }

  if (!months.length) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-white/40">
        Sin datos diarios disponibles
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
        style={{ background: 'radial-gradient(ellipse at 25% 25%, rgba(245,130,10,0.03) 0%, transparent 60%)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 75% 75%, rgba(99,102,241,0.02) 0%, transparent 60%)' }}
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
            PE Diario — {activePeriod ? periodLabel(activePeriod) : ''}
          </h2>
          <div className="flex gap-5 items-end flex-wrap">
            {stats.lastPoint && (
              <>
                <div className="text-right">
                  <div className="text-[10px] text-white/35 tracking-wider uppercase">Total mes</div>
                  <div className="font-mono text-base font-bold text-amber-500">
                    {formatMoney(stats.totalVentas)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/35 tracking-wider uppercase">Prom. diario</div>
                  <div
                    className="font-mono text-base font-bold"
                    style={{ color: STATUS_COLOR[stats.lastPoint.status] }}
                  >
                    {formatMoney(stats.avgDiario)}
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

        {/* Month selector */}
        <div
          className="flex gap-2 mb-4 overflow-x-auto pb-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {months.map(m => (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              className="px-3 py-1 rounded-lg text-xs font-bold tracking-wide border transition-all flex-shrink-0"
              style={{
                background:  m === activePeriod ? 'rgba(245,130,10,0.15)' : 'rgba(255,255,255,0.03)',
                borderColor: m === activePeriod ? 'rgba(245,130,10,0.4)'  : 'rgba(255,255,255,0.08)',
                color:       m === activePeriod ? '#f5820a'               : 'rgba(255,255,255,0.35)',
                cursor: 'pointer',
              }}
            >
              {periodLabel(m)}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div
          className="rounded-xl p-4 pb-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {chartData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-white/30 text-sm">
              Sin datos para {activePeriod ? periodLabel(activePeriod) : 'este mes'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  tickLine={false}
                  dy={8}
                  interval={4}
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

                {/* PE lines — constantes para el mes, se muestran como horizontales */}
                <Line
                  type="monotone"
                  dataKey="peMinimo"
                  name="PE Mínimo"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={{ r: 4, fill: '#ef4444', stroke: '#0a0a12', strokeWidth: 2 }}
                  animationDuration={400}
                />
                <Line
                  type="monotone"
                  dataKey="peOperativo"
                  name="PE Operativo"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#f59e0b', stroke: '#0a0a12', strokeWidth: 2 }}
                  animationDuration={400}
                />
                <Line
                  type="monotone"
                  dataKey="peIdeal"
                  name="PE Ideal (15% rent.)"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="8 3"
                  dot={false}
                  activeDot={{ r: 4, fill: '#22c55e', stroke: '#0a0a12', strokeWidth: 2 }}
                  animationDuration={400}
                />

                {/* Línea de facturación diaria con dots coloreados por estado */}
                <Line
                  type="monotone"
                  dataKey="ventas"
                  name="Facturación"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={2.5}
                  dot={<StatusDot />}
                  activeDot={<StatusActiveDot />}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center pb-2 pt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.4)' }} />
              <span className="text-[11px] text-white/45">Facturación (dot = estado PE)</span>
            </div>
            {([
              { color: '#ef4444', label: 'PE Mínimo',            dash: true  },
              { color: '#f59e0b', label: 'PE Operativo',         dash: false },
              { color: '#22c55e', label: 'PE Ideal (15% rent.)', dash: true  },
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
          {(Object.keys(STATUS_COLOR) as PEDayPoint['status'][]).map(status => {
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
                <div className="text-[10px] text-white/30">{pct}% de días</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
