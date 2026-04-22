'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawSaleRow {
  fecha:     string   // "2025-03-10"
  total:     number
  tipo_zona: string   // "SALON" | "APLICACIONES" | "MOSTRADOR" | ...
}

type Granularity = 'mensual' | 'semanal'

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNELS = ['SALON', 'APLICACIONES', 'MOSTRADOR'] as const
type Channel = typeof CHANNELS[number]

const CHANNEL_COLORS: Record<Channel, string> = {
  SALON:        '#f5820a',
  APLICACIONES: '#a855f7',
  MOSTRADOR:    '#06b6d4',
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeChannel(raw: string): Channel | null {
  const up = (raw ?? '').toUpperCase().trim()
  if (up === 'SALON' || up === 'SALÓN') return 'SALON'
  if (up === 'APLICACIONES' || up === 'APP' || up === 'DELIVERY') return 'APLICACIONES'
  if (up === 'MOSTRADOR') return 'MOSTRADOR'
  return null
}

function formatMonthLabel(periodo: string): string {
  const [y, m] = periodo.split('-')
  return `${MONTH_LABELS[m] || m} ${y.slice(2)}`
}

function getMondayOfWeek(dateStr: string): string {
  const d    = new Date(dateStr + 'T12:00:00')
  const day  = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate()} ${MONTH_LABELS[String(d.getMonth() + 1).padStart(2, '0')]}`
}

function fmtM(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

// ── Aggregation ───────────────────────────────────────────────────────────────

interface PeriodPoint {
  name:         string
  SALON:        number
  APLICACIONES: number
  MOSTRADOR:    number
  total:        number
}

interface ChannelStats {
  channel:    Channel
  total:      number
  count:      number
  pctOfTotal: number
  ticketAvg:  number
}

type Accum = { SALON: number; APLICACIONES: number; MOSTRADOR: number }

function buildMonthly(rows: RawSaleRow[]): PeriodPoint[] {
  const map = new Map<string, Accum>()
  for (const r of rows) {
    const ch = normalizeChannel(r.tipo_zona)
    if (!ch) continue
    const k = r.fecha.substring(0, 7)
    if (!map.has(k)) map.set(k, { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 })
    map.get(k)![ch] += Number(r.total)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, v]) => ({
      name: formatMonthLabel(periodo),
      SALON:        v.SALON,
      APLICACIONES: v.APLICACIONES,
      MOSTRADOR:    v.MOSTRADOR,
      total:        v.SALON + v.APLICACIONES + v.MOSTRADOR,
    }))
}

function buildWeekly(rows: RawSaleRow[]): PeriodPoint[] {
  const map = new Map<string, Accum>()
  for (const r of rows) {
    const ch = normalizeChannel(r.tipo_zona)
    if (!ch) continue
    const k = getMondayOfWeek(r.fecha)
    if (!map.has(k)) map.set(k, { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 })
    map.get(k)![ch] += Number(r.total)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, v]) => ({
      name: formatWeekLabel(semana),
      SALON:        v.SALON,
      APLICACIONES: v.APLICACIONES,
      MOSTRADOR:    v.MOSTRADOR,
      total:        v.SALON + v.APLICACIONES + v.MOSTRADOR,
    }))
}

function buildChannelStats(rows: RawSaleRow[]): ChannelStats[] {
  const totals: Record<Channel, number> = { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 }
  const counts: Record<Channel, number> = { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 }
  for (const r of rows) {
    const ch = normalizeChannel(r.tipo_zona)
    if (!ch) continue
    totals[ch] += Number(r.total)
    counts[ch] += 1
  }
  const grandTotal = CHANNELS.reduce((s, ch) => s + totals[ch], 0)
  return CHANNELS.map(ch => ({
    channel:    ch,
    total:      totals[ch],
    count:      counts[ch],
    pctOfTotal: grandTotal > 0 ? (totals[ch] / grandTotal) * 100 : 0,
    ticketAvg:  counts[ch] > 0 ? totals[ch] / counts[ch] : 0,
  }))
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
      <div className="text-white/30 text-[10px] mb-2.5">Total: <span className="text-white/55 font-mono">{fmtM(total)}</span></div>
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

// ── Y Axis formatter ──────────────────────────────────────────────────────────

function yTick(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}K`
  return `$${value}`
}

// ── Shared axis props ─────────────────────────────────────────────────────────

const xAxisProps = {
  tick:     { fill: 'rgba(255,255,255,0.4)', fontSize: 11 },
  axisLine: { stroke: 'rgba(255,255,255,0.08)' },
  tickLine: false as const,
  dy:       8,
}

const yAxisProps = {
  tick:          { fill: 'rgba(255,255,255,0.3)', fontSize: 10 },
  axisLine:      false as const,
  tickLine:      false as const,
  dx:            -5,
  tickFormatter: yTick,
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

export default function MixCanalesChart({ data, isLoading }: MixCanalesChartProps) {
  const [granularity, setGranularity] = useState<Granularity>('mensual')

  const monthlyPts   = useMemo(() => buildMonthly(data),      [data])
  const weeklyPts    = useMemo(() => buildWeekly(data),       [data])
  const channelStats = useMemo(() => buildChannelStats(data), [data])

  const activePts = granularity === 'mensual' ? monthlyPts : weeklyPts

  const TABS: { key: Granularity; label: string }[] = [
    { key: 'mensual', label: 'Mensual' },
    { key: 'semanal', label: 'Semanal' },
  ]

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
          {granularity === 'mensual' ? 'Facturación por Canal — Mensual' : 'Facturación por Canal — Semanal'}
        </h2>

        {/* Tabs */}
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

        {/* Chart area */}
        <div className="rounded-xl p-4 pb-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={activePts} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="name" {...xAxisProps} />
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

          {/* Legend */}
          <div className="flex gap-5 justify-center pb-2 pt-2">
            {CHANNELS.map(ch => (
              <div key={ch} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: CHANNEL_COLORS[ch], opacity: 0.85 }} />
                <span className="text-[11px] text-white/40">{ch}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Channel summary cards */}
        <ChannelCards stats={channelStats} />

      </div>
    </div>
  )
}
