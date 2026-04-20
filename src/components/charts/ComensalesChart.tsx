'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawComensalRow {
  fecha:      string   // "2025-03-10"
  comensales: number
}

type Granularity = 'mensual' | 'semanal' | 'diario'

interface MonthPoint { periodo: string; name: string; comensales: number }
interface WeekPoint  { semana:  string; name: string; comensales: number }
interface DayPoint   { fecha: string; name: string; diaSemana: string; comensales: number }

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const AMBER     = '#f5820a'
const INDIGO    = '#6366f1'
const COLOR_AVG = 'rgba(255,255,255,0.22)'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMonthLabel(periodo: string): string {
  const [y, m] = periodo.split('-')
  return `${MONTH_LABELS[m] || m} ${y.slice(2)}`
}

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate()} ${MONTH_LABELS[String(d.getMonth() + 1).padStart(2, '0')]}`
}

function getMondayOfWeek(dateStr: string): string {
  const d    = new Date(dateStr + 'T12:00:00')
  const day  = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function varPct(value: number, avg: number): string {
  if (!avg) return '—'
  const pct = ((value - avg) / avg) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function avgOf(pts: { comensales: number }[]): number {
  if (!pts.length) return 0
  return pts.reduce((s, p) => s + p.comensales, 0) / pts.length
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function buildMonthly(rows: RawComensalRow[]): MonthPoint[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const k = r.fecha.substring(0, 7)
    map.set(k, (map.get(k) ?? 0) + Number(r.comensales))
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, comensales]) => ({ periodo, name: formatMonthLabel(periodo), comensales }))
}

function buildWeekly(rows: RawComensalRow[]): WeekPoint[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const k = getMondayOfWeek(r.fecha)
    map.set(k, (map.get(k) ?? 0) + Number(r.comensales))
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, comensales]) => ({ semana, name: formatWeekLabel(semana), comensales }))
}

function buildDaily(rows: RawComensalRow[], periodo: string): DayPoint[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.fecha.startsWith(periodo)) continue
    map.set(r.fecha, (map.get(r.fecha) ?? 0) + Number(r.comensales))
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, comensales]) => {
      const d = new Date(fecha + 'T12:00:00')
      return { fecha, name: String(d.getDate()), diaSemana: DIAS_SEMANA[d.getDay()], comensales }
    })
}

function availableMonths(rows: RawComensalRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) set.add(r.fecha.substring(0, 7))
  return Array.from(set).sort()
}

// ── Tooltips ──────────────────────────────────────────────────────────────────

function TooltipShell({ borderColor, title, sub, comensales, avg }: {
  borderColor: string; title: string; sub?: string; comensales: number; avg: number
}) {
  const isAbove = comensales >= avg
  return (
    <div
      className="rounded-xl border p-4 min-w-[200px]"
      style={{ background: 'rgba(10,10,18,0.97)', backdropFilter: 'blur(20px)', borderColor }}
    >
      <div className="text-amber-500 text-xs font-bold mb-0.5 tracking-widest uppercase"
        style={{ fontFamily: 'Syne, sans-serif' }}>{title}</div>
      {sub && <div className="text-white/25 text-[10px] mb-2">{sub}</div>}
      <div className="flex justify-between items-center py-1.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-white/50 text-xs">Comensales</span>
        <span className="font-mono text-sm font-bold"
          style={{ color: isAbove ? AMBER : INDIGO }}>
          {comensales.toLocaleString('es-AR')}
        </span>
      </div>
      <div className="flex justify-between items-center pt-1.5">
        <span className="text-white/35 text-xs">vs promedio</span>
        <span className="font-mono text-xs font-bold"
          style={{ color: isAbove ? '#22c55e' : '#ef4444' }}>
          {varPct(comensales, avg)}
        </span>
      </div>
    </div>
  )
}

function MonthTooltip({ active, payload, avg }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as MonthPoint
  if (!d) return null
  return <TooltipShell
    borderColor={`${d.comensales >= avg ? AMBER : INDIGO}40`}
    title={d.name} comensales={d.comensales} avg={avg} />
}

function WeekTooltip({ active, payload, avg }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as WeekPoint
  if (!d) return null
  return <TooltipShell
    borderColor={`${d.comensales >= avg ? AMBER : INDIGO}40`}
    title={`Semana del ${d.name}`} comensales={d.comensales} avg={avg} />
}

function DayTooltip({ active, payload, avg }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as DayPoint
  if (!d) return null
  return <TooltipShell
    borderColor={`${d.comensales >= avg ? AMBER : INDIGO}40`}
    title={`${d.diaSemana} ${d.name}`} sub={d.fecha}
    comensales={d.comensales} avg={avg} />
}

// ── Custom Dots (line charts) ─────────────────────────────────────────────────

function makeDot(avg: number, r = 4) {
  return function Dot(props: any) {
    const { cx, cy, payload } = props
    if (!payload || cx == null || cy == null) return null
    return <circle cx={cx} cy={cy} r={r}
      fill={payload.comensales >= avg ? AMBER : INDIGO}
      stroke="#0a0a12" strokeWidth={2} />
  }
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({ points, unit }: { points: { name: string; comensales: number }[]; unit: string }) {
  if (!points.length) return null
  const total = points.reduce((s, p) => s + p.comensales, 0)
  const avg   = total / points.length
  const best  = points.reduce((a, b) => b.comensales > a.comensales ? b : a)
  const worst = points.reduce((a, b) => b.comensales < a.comensales ? b : a)

  return (
    <div className="grid grid-cols-4 gap-2 mt-4">
      {[
        { label: 'Total',           value: total.toLocaleString('es-AR'),         sub: `${points.length} ${unit}s`, color: AMBER    },
        { label: `Prom. por ${unit}`, value: Math.round(avg).toLocaleString('es-AR'), sub: 'comensales',            color: COLOR_AVG },
        { label: `Mejor ${unit}`,   value: best.comensales.toLocaleString('es-AR'),  sub: best.name,               color: '#22c55e' },
        { label: `Menor ${unit}`,   value: worst.comensales.toLocaleString('es-AR'), sub: worst.name,              color: INDIGO    },
      ].map(c => (
        <div key={c.label} className="rounded-lg p-2.5 text-center"
          style={{ background: `${c.color}08`, border: `1px solid ${c.color}20` }}>
          <div className="text-[9px] text-white/30 tracking-wider uppercase mb-1">{c.label}</div>
          <div className="font-mono text-xl font-bold" style={{ color: c.color }}>{c.value}</div>
          <div className="text-[10px] text-white/30 truncate">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ── Shared chart axes / grid props ────────────────────────────────────────────

const xAxisProps = {
  tick:     { fill: 'rgba(255,255,255,0.4)', fontSize: 11 },
  axisLine: { stroke: 'rgba(255,255,255,0.08)' },
  tickLine: false as const,
  dy:       8,
}
const yAxisProps = {
  tick:     { fill: 'rgba(255,255,255,0.3)', fontSize: 10 },
  axisLine: false as const,
  tickLine: false as const,
  dx:       -5,
}

// ── Main Component ────────────────────────────────────────────────────────────

interface ComensalesChartProps {
  data:       RawComensalRow[]
  isLoading?: boolean
}

export default function ComensalesChart({ data, isLoading }: ComensalesChartProps) {
  const [granularity,   setGranularity]   = useState<Granularity>('mensual')
  const [selectedMonth, setSelectedMonth] = useState<string>('')

  const months       = useMemo(() => availableMonths(data), [data])
  const lastMonth    = months[months.length - 1] ?? ''
  const activePeriod = selectedMonth && months.includes(selectedMonth) ? selectedMonth : lastMonth

  const monthlyPts = useMemo(() => buildMonthly(data),              [data])
  const weeklyPts  = useMemo(() => buildWeekly(data),               [data])
  const dailyPts   = useMemo(() => buildDaily(data, activePeriod),  [data, activePeriod])

  const monthlyAvg = useMemo(() => avgOf(monthlyPts), [monthlyPts])
  const weeklyAvg  = useMemo(() => avgOf(weeklyPts),  [weeklyPts])
  const dailyAvg   = useMemo(() => avgOf(dailyPts),   [dailyPts])

  // Active dataset for header stats + summary cards
  const activePts  = granularity === 'mensual' ? monthlyPts
                   : granularity === 'semanal' ? weeklyPts
                   : dailyPts
  const activeAvg  = granularity === 'mensual' ? monthlyAvg
                   : granularity === 'semanal' ? weeklyAvg
                   : dailyAvg
  const activeUnit = granularity === 'mensual' ? 'mes'
                   : granularity === 'semanal' ? 'semana'
                   : 'día'

  const activeTotal = activePts.reduce((s, p) => s + p.comensales, 0)
  const activeBest  = activePts.length
    ? activePts.reduce((a, b) => b.comensales > a.comensales ? b : a)
    : null

  // Dynamic title
  const chartTitle = granularity === 'mensual' ? 'Comensales por Mes'
                   : granularity === 'semanal' ? 'Comensales por Semana'
                   : `Comensales — ${activePeriod ? formatMonthLabel(activePeriod) : ''}`

  if (isLoading) return <div className="animate-pulse rounded-2xl bg-white/5 h-[520px]" />

  if (!data.length) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-white/40">
        Sin datos de comensales disponibles
      </div>
    )
  }

  const TABS: { key: Granularity; label: string }[] = [
    { key: 'mensual', label: 'Mensual' },
    { key: 'semanal', label: 'Semanal' },
    { key: 'diario',  label: 'Diario'  },
  ]

  return (
    <div className="relative overflow-hidden rounded-2xl p-6"
      style={{ background: 'linear-gradient(135deg, #0a0a12 0%, #0d0d1a 50%, #0a0a12 100%)' }}>

      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 20% 20%, rgba(245,130,10,0.03) 0%, transparent 60%)' }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 80%, rgba(99,102,241,0.02) 0%, transparent 60%)' }} />

      <div className="relative z-10">

        {/* Eyebrow */}
        <div className="text-[10px] tracking-[3px] text-white/30 uppercase mb-1.5 font-semibold"
          style={{ fontFamily: 'Syne, sans-serif' }}>
          Comensales
        </div>

        {/* Title row: title + KPI stats */}
        <div className="flex flex-wrap justify-between items-end gap-4 mb-4">
          <h2 className="font-extrabold text-lg text-white tracking-tight m-0"
            style={{ fontFamily: 'Syne, sans-serif' }}>
            {chartTitle}
          </h2>
          <div className="flex gap-5 items-end">
            {activeBest && (
              <>
                <div className="text-right">
                  <div className="text-[10px] text-white/35 tracking-wider uppercase">Total</div>
                  <div className="font-mono text-base font-bold text-amber-500">
                    {activeTotal.toLocaleString('es-AR')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/35 tracking-wider uppercase">Prom. {activeUnit}</div>
                  <div className="font-mono text-base font-bold text-white/60">
                    {Math.round(activeAvg).toLocaleString('es-AR')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/35 tracking-wider uppercase">Mejor</div>
                  <div className="font-mono text-base font-bold text-green-400">
                    {activeBest.comensales.toLocaleString('es-AR')}
                    <span className="text-[11px] text-white/35 ml-1.5">{activeBest.name}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Granularity tabs */}
        <div className="flex gap-2 mb-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setGranularity(t.key)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide border transition-all"
              style={{
                background:  granularity === t.key ? 'rgba(245,130,10,0.15)' : 'rgba(255,255,255,0.03)',
                borderColor: granularity === t.key ? 'rgba(245,130,10,0.4)'  : 'rgba(255,255,255,0.08)',
                color:       granularity === t.key ? AMBER                   : 'rgba(255,255,255,0.35)',
                cursor: 'pointer',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Month sub-selector — solo visible en Diario */}
        {granularity === 'diario' && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {months.map(m => (
              <button key={m} onClick={() => setSelectedMonth(m)}
                className="px-3 py-1 rounded-lg text-xs font-bold tracking-wide border transition-all flex-shrink-0"
                style={{
                  background:  m === activePeriod ? 'rgba(245,130,10,0.15)' : 'rgba(255,255,255,0.03)',
                  borderColor: m === activePeriod ? 'rgba(245,130,10,0.4)'  : 'rgba(255,255,255,0.08)',
                  color:       m === activePeriod ? AMBER                   : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer',
                }}>
                {formatMonthLabel(m)}
              </button>
            ))}
          </div>
        )}

        {/* Chart area */}
        <div className="rounded-xl p-4 pb-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>

          {/* ── MENSUAL: BarChart amber ── */}
          {granularity === 'mensual' && (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlyPts} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" {...xAxisProps} />
                <YAxis {...yAxisProps} />
                <Tooltip
                  content={<MonthTooltip avg={monthlyAvg} />}
                  cursor={{ fill: 'rgba(245,130,10,0.06)' }}
                />
                <ReferenceLine y={monthlyAvg} stroke={COLOR_AVG} strokeDasharray="6 4" strokeWidth={1.5}
                  label={{ value: 'Prom.', position: 'insideTopRight', fill: 'rgba(255,255,255,0.2)', fontSize: 10 }} />
                <Bar dataKey="comensales" fill={AMBER} fillOpacity={0.8}
                  radius={[4, 4, 0, 0]} maxBarSize={48}
                  animationDuration={700} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* ── SEMANAL: LineChart todas las semanas ── */}
          {granularity === 'semanal' && (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={weeklyPts} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" {...xAxisProps} interval="preserveStartEnd" />
                <YAxis {...yAxisProps} />
                <Tooltip
                  content={<WeekTooltip avg={weeklyAvg} />}
                  cursor={{ stroke: 'rgba(245,130,10,0.15)', strokeWidth: 1 }}
                />
                <ReferenceLine y={weeklyAvg} stroke={COLOR_AVG} strokeDasharray="6 4" strokeWidth={1.5}
                  label={{ value: 'Prom.', position: 'insideTopRight', fill: 'rgba(255,255,255,0.2)', fontSize: 10 }} />
                <Line
                  type="monotone" dataKey="comensales"
                  stroke="rgba(255,255,255,0.45)" strokeWidth={2.5}
                  dot={makeDot(weeklyAvg, 4)}
                  activeDot={makeDot(weeklyAvg, 6)}
                  animationDuration={600} animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* ── DIARIO: LineChart días del mes seleccionado ── */}
          {granularity === 'diario' && (
            dailyPts.length === 0 ? (
              <div className="h-[320px] flex items-center justify-center text-white/30 text-sm">
                Sin datos para {formatMonthLabel(activePeriod)}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={dailyPts} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" {...xAxisProps} interval={4} />
                  <YAxis {...yAxisProps} />
                  <Tooltip
                    content={<DayTooltip avg={dailyAvg} />}
                    cursor={{ stroke: 'rgba(245,130,10,0.15)', strokeWidth: 1 }}
                  />
                  <ReferenceLine y={dailyAvg} stroke={COLOR_AVG} strokeDasharray="6 4" strokeWidth={1.5}
                    label={{ value: 'Prom.', position: 'insideTopRight', fill: 'rgba(255,255,255,0.2)', fontSize: 10 }} />
                  <Line
                    type="monotone" dataKey="comensales"
                    stroke="rgba(255,255,255,0.45)" strokeWidth={2.5}
                    dot={makeDot(dailyAvg, 4)}
                    activeDot={makeDot(dailyAvg, 6)}
                    animationDuration={600} animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            )
          )}

          {/* Legend */}
          <div className="flex gap-5 justify-center pb-2 pt-2">
            {granularity === 'mensual' ? (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: AMBER, opacity: 0.8 }} />
                  <span className="text-[11px] text-white/40">Comensales</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: AMBER }} />
                  <span className="text-[11px] text-white/40">Sobre promedio</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: INDIGO }} />
                  <span className="text-[11px] text-white/40">Bajo promedio</span>
                </div>
              </>
            )}
            <div className="flex items-center gap-1.5">
              <div style={{
                width: 20, height: 2,
                background: `repeating-linear-gradient(90deg, ${COLOR_AVG} 0px, ${COLOR_AVG} 6px, transparent 6px, transparent 10px)`,
              }} />
              <span className="text-[11px] text-white/40">Promedio</span>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <SummaryCards points={activePts} unit={activeUnit} />

      </div>
    </div>
  )
}
