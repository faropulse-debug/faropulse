'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { ChartWrapper }             from './ChartWrapper'
import { MonthSelector, currentYM } from '@/src/components/ui/MonthSelector'
import {
  CHANNELS, CHANNEL_COLORS,
  buildMonthly, buildWeekly, buildDaily,
  buildChannelStats, availableMonths,
  formatMonthLabel,
  type RawSaleRow, type ChannelStats,
} from '@/src/lib/canal-chart-helpers'

// Re-export so MixCanalesSection keeps its existing import working
export type { RawSaleRow }

// ── Types ─────────────────────────────────────────────────────────────────────

type Granularity = 'mensual' | 'semanal' | 'diario'

// ── Presentation helpers ──────────────────────────────────────────────────────

function fmtM(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

function yTick(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}K`
  return `$${value}`
}

const xAxisProps = {
  tick:     { fill: 'rgba(255,255,255,0.4)', fontSize: 11 },
  axisLine: { stroke: 'rgba(255,255,255,0.08)' },
  tickLine: false as const,
  dy:       8,
}

const xAxisPropsDaily = {
  ...xAxisProps,
  tick: { fill: 'rgba(255,255,255,0.4)', fontSize: 9 },
}

const yAxisProps = {
  tick:          { fill: 'rgba(255,255,255,0.3)', fontSize: 10 },
  axisLine:      false as const,
  tickLine:      false as const,
  dx:            -5,
  tickFormatter: yTick,
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function MixTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0)
  return (
    <div
      className="rounded-xl border p-4 min-w-[240px]"
      style={{ background: 'rgba(10,10,18,0.97)', backdropFilter: 'blur(20px)', borderColor: 'rgba(245,130,10,0.3)' }}
    >
      <div className="text-amber-500 text-xs font-bold mb-1 tracking-widest uppercase"
        style={{ fontFamily: 'Syne, sans-serif' }}>{label}</div>
      <div className="text-white/30 text-[10px] mb-2.5">
        Total: <span className="text-white/55 font-mono">{fmtM(total)}</span>
      </div>
      {[...payload].reverse().map((p: any) => {
        const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : '0.0'
        return (
          <div key={p.dataKey} className="flex justify-between items-center py-1.5"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
              <span className="text-white/55 text-xs">{p.dataKey}</span>
            </div>
            <div className="text-right">
              <span className="font-mono text-sm font-bold" style={{ color: p.fill }}>{fmtM(p.value)}</span>
              <span className="text-white/30 text-xs ml-2">{pct}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Channel Cards ─────────────────────────────────────────────────────────────

function ChannelCards({ stats }: { stats: ChannelStats[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 mt-4">
      {stats.map(s => (
        <div key={s.channel} className="rounded-lg p-3"
          style={{
            background: `${CHANNEL_COLORS[s.channel]}08`,
            border:     `1px solid ${CHANNEL_COLORS[s.channel]}20`,
          }}>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: CHANNEL_COLORS[s.channel] }} />
            <div className="text-[10px] text-white/50 tracking-wider uppercase font-semibold"
              style={{ fontFamily: 'Syne, sans-serif' }}>{s.channel}</div>
          </div>
          <div className="font-mono text-xl font-bold mb-0.5" style={{ color: CHANNEL_COLORS[s.channel] }}>
            {fmtM(s.total)}
          </div>
          <div className="text-[11px] text-white/35 mb-2">{s.pctOfTotal.toFixed(1)}% del total</div>
          <div className="text-[9px] text-white/25 tracking-wider uppercase mb-0.5">Ticket Prom.</div>
          <div className="font-mono text-sm font-bold text-white/50">{fmtM(s.ticketAvg)}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface MixCanalesChartProps {
  data:       RawSaleRow[]
  isLoading?: boolean
}

const TABS: { key: Granularity; label: string }[] = [
  { key: 'mensual', label: 'Mensual' },
  { key: 'semanal', label: 'Semanal' },
  { key: 'diario',  label: 'Diario'  },
]

export default function MixCanalesChart({ data, isLoading }: MixCanalesChartProps) {
  const [granularity,   setGranularity]   = useState<Granularity>('mensual')
  const [selectedMonth, setSelectedMonth] = useState<string>('')

  // Semestre móvil: last 6 months in the data (descending)
  const semestre = useMemo(() => availableMonths(data).slice(0, 6), [data])

  // Default daily month = last complete month (not the partial current month)
  const activeDailyMonth = useMemo(() => {
    const todayYM = currentYM()
    const closed  = semestre.find(m => m < todayYM)
    const def     = closed ?? semestre[0] ?? ''
    return (selectedMonth && semestre.includes(selectedMonth)) ? selectedMonth : def
  }, [semestre, selectedMonth])

  const monthlyPts   = useMemo(() => buildMonthly(data),                       [data])
  const weeklyPts    = useMemo(() => buildWeekly(data),                        [data])
  const dailyPts     = useMemo(() => buildDaily(data, activeDailyMonth),       [data, activeDailyMonth])
  const channelStats = useMemo(() => buildChannelStats(data),                  [data])

  const activePts = granularity === 'mensual' ? monthlyPts
                  : granularity === 'semanal' ? weeklyPts
                  : dailyPts

  const chartTitle = granularity === 'mensual' ? 'Facturación por Canal — Mensual'
                   : granularity === 'semanal' ? 'Facturación por Canal — Semanal'
                   : `Facturación por Canal — ${activeDailyMonth ? formatMonthLabel(activeDailyMonth) : 'Diario'}`

  if (isLoading) return <div className="animate-pulse rounded-2xl bg-white/5 h-[520px]" />

  if (!data.length) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-white/40">
        Sin datos de canales disponibles
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl p-6"
      style={{ background: 'linear-gradient(135deg, #0a0a12 0%, #0d0d1a 50%, #0a0a12 100%)' }}>

      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 20% 20%, rgba(245,130,10,0.03) 0%, transparent 60%)' }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 80%, rgba(168,85,247,0.02) 0%, transparent 60%)' }} />

      <div className="relative z-10">

        {/* Eyebrow */}
        <div className="text-[10px] tracking-[3px] text-white/30 uppercase mb-1.5 font-semibold"
          style={{ fontFamily: 'Syne, sans-serif' }}>
          Mix de Canales
        </div>

        {/* Title */}
        <h2 className="font-extrabold text-lg text-white tracking-tight mb-4 m-0"
          style={{ fontFamily: 'Syne, sans-serif' }}>
          {chartTitle}
        </h2>

        {/* Granularity tabs */}
        <div className="flex gap-2 mb-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setGranularity(t.key)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide border transition-all"
              style={{
                background:  granularity === t.key ? 'rgba(245,130,10,0.15)' : 'rgba(255,255,255,0.03)',
                borderColor: granularity === t.key ? 'rgba(245,130,10,0.4)'  : 'rgba(255,255,255,0.08)',
                color:       granularity === t.key ? '#f5820a'               : 'rgba(255,255,255,0.35)',
                cursor: 'pointer',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Month chips — solo en Diario */}
        {granularity === 'diario' && (
          <MonthSelector
            months={semestre}
            selected={activeDailyMonth}
            onChange={setSelectedMonth}
          />
        )}

        {/* Chart area */}
        <div className="rounded-xl p-4 pb-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>

          {granularity === 'diario' && dailyPts.length === 0 ? (
            <div className="h-[320px] flex items-center justify-center text-white/30 text-sm">
              Sin datos para {activeDailyMonth ? formatMonthLabel(activeDailyMonth) : 'este mes'}
            </div>
          ) : (
            <>
              <ChartWrapper height={320}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activePts}
                  margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    {...(granularity === 'diario' ? xAxisPropsDaily : xAxisProps)}
                  />
                  <YAxis {...yAxisProps} />
                  <Tooltip
                    content={<MixTooltip />}
                    cursor={{ fill: 'rgba(245,130,10,0.06)' }}
                  />
                  <Bar dataKey="SALON"        stackId="a" fill="#f5820a" fillOpacity={0.85}
                    animationDuration={700} animationEasing="ease-out" />
                  <Bar dataKey="APLICACIONES" stackId="a" fill="#a855f7" fillOpacity={0.85}
                    animationDuration={700} animationEasing="ease-out" />
                  <Bar dataKey="MOSTRADOR"    stackId="a" fill="#06b6d4" fillOpacity={0.85}
                    radius={[4, 4, 0, 0]}
                    animationDuration={700} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
              </ChartWrapper>

              {/* Legend */}
              <div className="flex gap-5 justify-center pb-2 pt-2">
                {CHANNELS.map(ch => (
                  <div key={ch} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ background: CHANNEL_COLORS[ch], opacity: 0.85 }} />
                    <span className="text-[11px] text-white/40">{ch}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Channel summary cards */}
        <ChannelCards stats={channelStats} />

      </div>
    </div>
  )
}
