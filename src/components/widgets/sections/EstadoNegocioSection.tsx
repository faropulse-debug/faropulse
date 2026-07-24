'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { useDashboardDataCtx } from '@/providers/DashboardDataProvider'
import {
  Bar,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fmtMillones, fmtPeso } from '@/lib/format'
import { getSupabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { ChartWrapper } from '@/src/components/charts/ChartWrapper'
import { SectionLabel } from '@/components/dashboard/SectionLabel'
import {
  type CanalRow,
  computeCanalRows,
  buildCanalInsight,
} from '@/src/lib/canal-helpers'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiResult {
  vsPrev:     number | null
  vsYearAgo:  number | null
  higherGood: boolean
}

interface PeriodData {
  desde:      string
  hasta:      string | null
  ventas:     number
  pedidos:    number
  comensales: number
}

interface WeeklyData {
  semana:     string
  ventas:     number
  pedidos:    number
  comensales: number
}

interface FreshnessData {
  dataset:       string
  last_upload:   string
  rows_affected: number
}

interface ExecutiveData {
  current:          PeriodData
  previous:         PeriodData
  yearAgo:          PeriodData
  weekly:           WeeklyData[]
  latestDataDate:   string | null
  lastUpload:       string | null
  isCurrentPartial: boolean
}

interface CmpRow {
  label:        string
  pedidos:      number | null
  cubiertos:    number | null
  facturacion:  number | null
  porPedido:    number | null
  porCubierto:  number | null
  cubPorPedido: number | null
  isHighlight:  boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GREEN = '#5a8a3c'
const RED   = '#b0413a'
const AMBER = '#f5820a'
const MUTED = 'rgba(255,255,255,0.25)'
const MONTHS_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const MONTHS_FULL = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]

const CANAL_LETTER: Record<string, string> = {
  'Salón':    'S',
  'Delivery': 'D',
  'TakeAway': 'T',
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function pct(a: number, b: number): number | null {
  if (!b) return null
  return ((a - b) / b) * 100
}

function prevMonthKey(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`
}

function yearAgoKey(month: string): string {
  return `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`
}

function monthBounds(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

function equivalentEnd(month: string, day: number): string {
  const bounds = monthBounds(month)
  const lastDay = Number(bounds.end.slice(-2))
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

function monthLabel(mo: string): string {
  const [y, m] = mo.split('-').map(Number)
  const short = MONTHS_SHORT[m - 1]
  return `${short.charAt(0).toUpperCase()}${short.slice(1)} ${y}`
}

function formatPeriod(period: PeriodData): string {
  if (!period.hasta) return 'Sin datos para el período'
  const [startYear, startMonth, startDay] = period.desde.split('-').map(Number)
  const [endYear, endMonth, endDay] = period.hasta.split('-').map(Number)
  if (startYear === endYear && startMonth === endMonth) {
    return `${startDay}–${endDay} ${MONTHS_SHORT[startMonth - 1]} ${startYear}`
  }
  return (
    `${startDay} ${MONTHS_SHORT[startMonth - 1]} ${startYear} – ` +
    `${endDay} ${MONTHS_SHORT[endMonth - 1]} ${endYear}`
  )
}

function formatCutoff(date: string | null): string {
  if (!date) return '—'
  const [, month, day] = date.split('-').map(Number)
  return `${day}/${MONTHS_SHORT[month - 1]}`
}

function formatUploadDate(date: string | null): string | null {
  if (!date) return null
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).replace('.', '')
}

function normalizePeriod(row: PeriodData): PeriodData {
  return {
    desde: row.desde,
    hasta: row.hasta,
    ventas: Number(row.ventas ?? 0),
    pedidos: Number(row.pedidos ?? 0),
    comensales: Number(row.comensales ?? 0),
  }
}

function normalizeWeekly(row: WeeklyData): WeeklyData {
  return {
    semana: row.semana,
    ventas: Number(row.ventas ?? 0),
    pedidos: Number(row.pedidos ?? 0),
    comensales: Number(row.comensales ?? 0),
  }
}

function pendingDaysSince(date: string | null): number {
  if (!date) return 0
  const [year, month, day] = date.split('-').map(Number)
  const cutoff = Date.UTC(year, month - 1, day)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.floor((today - cutoff) / 86_400_000) - 1)
}

function periodMonthName(period: PeriodData): string {
  const month = Number(period.desde.slice(5, 7))
  return MONTHS_FULL[month - 1]
}

function buildPlainConclusion(
  current: PeriodData,
  previous: PeriodData,
  ticketCurrent: number | null,
  ticketPrevious: number | null,
): string | null {
  const ordersPct = pct(current.pedidos, previous.pedidos)
  if (ordersPct == null || ticketCurrent == null || ticketPrevious == null) return null

  const magnitude = Math.abs(ordersPct)
  const direction = ordersPct >= 0 ? 'arriba' : 'abajo'
  const percentage = magnitude.toFixed(1).replace('.', ',')
  const ticketDelta = ticketCurrent - ticketPrevious
  const ticketText = Math.abs(ticketDelta) < 1
    ? 'cada pedido deja prácticamente lo mismo.'
    : `cada pedido deja ${fmtPeso(Math.round(Math.abs(ticketDelta)))} ${ticketDelta >= 0 ? 'más' : 'menos'}.`
  const comparisonMonth = periodMonthName(previous)

  if (magnitude <= 7) {
    return `Vas parejo con ${comparisonMonth}: apenas ${percentage}% ${direction} en ritmo de pedidos, y ${ticketText}`
  }
  if (magnitude <= 15) {
    return `Hay una diferencia moderada frente a ${comparisonMonth}: ${percentage}% ${direction} en pedidos, y ${ticketText}`
  }
  return ordersPct < 0
    ? `El ritmo de pedidos cayó ${percentage}% frente a ${comparisonMonth}. ${ticketText.charAt(0).toUpperCase()}${ticketText.slice(1)}`
    : `El ritmo de pedidos subió ${percentage}% frente a ${comparisonMonth}. ${ticketText.charAt(0).toUpperCase()}${ticketText.slice(1)}`
}

function weekRangeLabel(week: string): string {
  const [year, month, day] = week.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1, day))
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  const startMonth = MONTHS_SHORT[start.getUTCMonth()]
  const endMonth = MONTHS_SHORT[end.getUTCMonth()]

  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${endMonth}`
  }
  return `${start.getUTCDate()} ${startMonth} – ${end.getUTCDate()} ${endMonth}`
}

function isIncompleteWeek(week: string, cutoff: string | null): boolean {
  if (!cutoff) return false
  const [year, month, day] = week.split('-').map(Number)
  const end = new Date(Date.UTC(year, month - 1, day + 6)).toISOString().slice(0, 10)
  return cutoff < end
}

function loadedDaysInWeek(week: string, cutoff: string | null): number {
  if (!cutoff) return 7
  const [year, month, day] = week.split('-').map(Number)
  const start = Date.UTC(year, month - 1, day)
  const [cutoffYear, cutoffMonth, cutoffDay] = cutoff.split('-').map(Number)
  const lastLoadedDay = Date.UTC(cutoffYear, cutoffMonth - 1, cutoffDay)
  return Math.max(0, Math.min(7, Math.floor((lastLoadedDay - start) / 86_400_000) + 1))
}

function makeKpi(
  curr: number | null,
  prev: number | null,
  yo:   number | null,
  higherGood: boolean,
): KpiResult {
  return {
    vsPrev:     curr != null && prev != null ? pct(curr, prev) : null,
    vsYearAgo:  curr != null && yo   != null ? pct(curr, yo)   : null,
    higherGood,
  }
}

function safeDiv(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null
  return a / b
}

// ── Task 1: ±2% amber zone ──
function cardSemColor(vsPrev: number | null, higherGood: boolean): string {
  if (vsPrev === null)       return AMBER
  if (Math.abs(vsPrev) < 2) return AMBER
  return (higherGood ? vsPrev > 0 : vsPrev < 0) ? GREEN : RED
}

// ─── Delta badge ──────────────────────────────────────────────────────────────

function deltaColor(pctChange: number, higherGood: boolean): string {
  return (higherGood ? pctChange >= 0 : pctChange <= 0) ? GREEN : RED
}

// ── Task 4: optional note for "(nominal)" on year-ago monetary deltas ──
function DeltaBadge({
  label, pctChange, higherGood, note,
}: {
  label: string; pctChange: number | null; higherGood: boolean; note?: string
}) {
  const labelNode = (
    <span style={{ fontSize: '0.64rem', color: MUTED }}>
      {label}
      {note && (
        <span style={{ marginLeft: '3px', fontSize: '0.56rem', color: 'rgba(255,255,255,0.18)' }}>
          {note}
        </span>
      )}
    </span>
  )
  if (pctChange === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {labelNode}
        <span style={{ fontSize: '0.65rem', color: MUTED }}>—</span>
      </div>
    )
  }
  const color = deltaColor(pctChange, higherGood)
  const arrow = pctChange >= 0 ? '↑' : '↓'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {labelNode}
      <span style={{ fontSize: '0.72rem', color, fontWeight: 600 }}>{arrow}{Math.abs(pctChange).toFixed(1)}%</span>
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

// ── Task 1: semantic border + value color; Task 4: isMonetary for nominal note ──
function EjecutivoKpiCard({
  label, value, kpi, currentPeriod, comparisonPeriod, yearAgoPeriod, isMonetary,
}: {
  label: string
  value: string | null
  kpi: KpiResult
  currentPeriod: PeriodData
  comparisonPeriod: PeriodData
  yearAgoPeriod: PeriodData
  isMonetary?: boolean
}) {
  const color = cardSemColor(kpi.vsPrev, kpi.higherGood)
  const GLOW: Record<string, string> = {
    [GREEN]: 'rgba(90,138,60,0.10)',
    [RED]:   'rgba(176,65,58,0.10)',
    [AMBER]: 'rgba(245,130,10,0.07)',
  }
  return (
    <div style={{
      position: 'relative',
      background: 'rgba(255,255,255,0.025)',
      border: `1px solid ${color}44`,
      borderRadius: '8px',
      backdropFilter: 'blur(16px)',
      padding: '20px 18px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      boxShadow: `0 0 20px ${GLOW[color] ?? GLOW[AMBER]}`,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '12%', right: '12%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${color}55, transparent)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.58rem',
          letterSpacing: 0, textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)',
        }}>{label}</span>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: color, boxShadow: `0 0 6px ${color}`,
        }} />
      </div>

      <div style={{
        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '1.8rem',
        lineHeight: 1, color: 'rgba(255,255,255,0.92)', letterSpacing: 0,
      }}>
        {value ?? '—'}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        alignItems: 'center',
        gap: '7px',
        padding: '9px 10px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '6px',
        fontFamily: 'var(--font-display)',
      }}>
        <span style={{
          fontSize: '0.72rem',
          lineHeight: 1.3,
          fontWeight: 650,
          color: 'rgba(255,255,255,0.88)',
        }}>
          {formatPeriod(currentPeriod)}
        </span>
        <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>vs</span>
        <span style={{
          fontSize: '0.72rem',
          lineHeight: 1.3,
          fontWeight: 650,
          color: 'rgba(255,255,255,0.68)',
          textAlign: 'right',
        }}>
          {formatPeriod(comparisonPeriod)}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: 'auto' }}>
        <DeltaBadge label="Diferencia del tramo" pctChange={kpi.vsPrev} higherGood={kpi.higherGood} />
        <DeltaBadge label={`vs ${formatPeriod(yearAgoPeriod)}`} pctChange={kpi.vsYearAgo} higherGood={kpi.higherGood}
          note={isMonetary ? '(nominal)' : undefined} />
      </div>
    </div>
  )
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: '8px', padding: '20px 18px', minHeight: '210px',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      {[55, 70, 38, 38].map((w, i) => (
        <div key={i} style={{
          width: `${w}%`, height: i === 1 ? '28px' : '8px', borderRadius: i === 1 ? '6px' : '4px',
          background: i === 1 ? 'rgba(245,130,10,0.07)' : i === 0 ? 'rgba(245,130,10,0.10)' : 'rgba(255,255,255,0.03)',
          animation: 'pulse 1.4s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}

// ─── Month selector ───────────────────────────────────────────────────────────

function MonthSelector({ months, value, onChange }: {
  months:   string[]
  value:    string | null
  onChange: (m: string) => void
}) {
  const visible = [...months].sort().slice(-6)
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {visible.map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em',
            textTransform: 'uppercase', padding: '4px 10px', borderRadius: '6px',
            border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            background: value === m ? 'rgba(245,130,10,0.18)' : 'rgba(255,255,255,0.04)',
            color:      value === m ? AMBER : 'rgba(255,255,255,0.35)',
            boxShadow:  value === m ? '0 0 8px rgba(245,130,10,0.15)' : 'none',
          }}
        >
          {monthLabel(m)}
        </button>
      ))}
    </div>
  )
}

// ─── Weekly chart ─────────────────────────────────────────────────────────────

interface WeeklyChartEntry extends WeeklyData {
  label:        string
  axisLabel:    string
  isIncomplete: boolean
  loadedDays:   number
  trendVentas:  number | null
  ticket:       number | null
}

interface WeeklyPayload { payload: WeeklyChartEntry }
function WeeklyTooltip({ active, payload }: { active?: boolean; payload?: WeeklyPayload[] }) {
  if (!active || !payload?.length) return null
  const entry = payload[0].payload
  return (
    <div style={{
      background: 'rgba(10,10,15,0.95)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', padding: '8px 12px',
      fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', marginBottom: '5px' }}>
        {entry.label}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700 }}>{fmtMillones(entry.ventas)}</div>
      <div style={{ color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>
        {entry.pedidos.toLocaleString('es-AR')} pedidos
        {entry.ticket != null ? ` · ${fmtPeso(Math.round(entry.ticket))} por pedido` : ''}
      </div>
      {entry.isIncomplete && (
        <div style={{ color: AMBER, fontWeight: 700, marginTop: '5px' }}>
          Semana en curso · {entry.loadedDays} de 7 días cargados
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WeeklyTick({ x, y, payload }: any) {
  const [label, status, coverage] = String(payload?.value ?? '').split('|')
  if (!label) return <g />
  const [rangeStart, rangeEnd] = label.split(' – ')
  const crossesMonth = Boolean(rangeEnd)
  const statusY = crossesMonth ? 40 : 29
  const coverageY = statusY + 13

  return (
    <g transform={`translate(${Number(x ?? 0)},${Number(y ?? 0)})`}>
      <text
        x={0}
        y={13}
        textAnchor="middle"
        fill="rgba(255,255,255,0.42)"
        fontSize={10}
        fontFamily="var(--font-display)"
      >
        {crossesMonth ? `${rangeStart} –` : label}
      </text>
      {crossesMonth && (
        <text
          x={0}
          y={25}
          textAnchor="middle"
          fill="rgba(255,255,255,0.42)"
          fontSize={10}
          fontFamily="var(--font-display)"
        >
          {rangeEnd}
        </text>
      )}
      {status === 'en curso' && (
        <>
          <text
            x={0}
            y={statusY}
            textAnchor="middle"
            fill={AMBER}
            fontSize={9}
            fontWeight={700}
            fontFamily="var(--font-display)"
          >
            en curso
          </text>
          <text
            x={0}
            y={coverageY}
            textAnchor="middle"
            fill="rgba(255,255,255,0.46)"
            fontSize={8.5}
            fontWeight={650}
            fontFamily="var(--font-display)"
          >
            {coverage}
          </text>
        </>
      )}
    </g>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WeeklyValueLabel(props: any) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const value = Number(props.value ?? 0)
  if (width < 20) return <g />
  return (
    <text
      x={x + width / 2}
      y={y - 7}
      textAnchor="middle"
      fill="rgba(255,255,255,0.72)"
      fontSize={10}
      fontFamily="var(--font-display)"
      fontWeight={650}
    >
      {fmtMillones(value)}
    </text>
  )
}

// ─── Comparative table ────────────────────────────────────────────────────────

const CMP_COLS: { key: string; align: 'left' | 'right' }[] = [
  { key: 'Período',       align: 'left'  },
  { key: 'Pedidos',       align: 'right' },
  { key: 'Cubiertos',     align: 'right' },
  { key: 'Facturación',   align: 'right' },
  { key: '$/pedido',      align: 'right' },
  { key: '$/cubierto',    align: 'right' },
  { key: 'Cub./pedido',   align: 'right' },
]

function fmtCmp(row: CmpRow, key: string): string {
  switch (key) {
    case 'Período':      return row.label
    case 'Pedidos':      return row.pedidos      != null ? row.pedidos.toLocaleString('es-AR')      : '—'
    case 'Cubiertos':    return row.cubiertos    != null ? row.cubiertos.toLocaleString('es-AR')    : '—'
    case 'Facturación':  return fmtMillones(row.facturacion)
    case '$/pedido':     return row.porPedido    != null ? fmtPeso(Math.round(row.porPedido))       : '—'
    case '$/cubierto':   return row.porCubierto  != null ? fmtPeso(Math.round(row.porCubierto))     : '—'
    case 'Cub./pedido':  return row.cubPorPedido != null ? row.cubPorPedido.toFixed(1)              : '—'
    default:             return '—'
  }
}

function buildPeriodCmpRow(label: string, d: PeriodData, isHighlight = false): CmpRow {
  const fact = d.ventas
  const ped  = d.pedidos
  const cub  = d.comensales
  return {
    label, isHighlight,
    pedidos:      ped,
    cubiertos:    cub,
    facturacion:  fact,
    porPedido:    safeDiv(fact, ped),
    porCubierto:  safeDiv(fact, cub),
    cubPorPedido: safeDiv(cub, ped),
  }
}

function ComparativeTable({ rows }: { rows: CmpRow[] }) {
  return (
    <div style={{
      marginTop: '20px',
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '12px',
      overflow: 'hidden',
      overflowX: 'auto',
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: 'var(--font-display)',
        minWidth: '560px',
      }}>
        <thead>
          <tr>
            {CMP_COLS.map(col => (
              <th key={col.key} style={{
                padding: '10px 14px',
                textAlign: col.align,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontSize: '0.54rem',
                color: 'rgba(255,255,255,0.28)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                whiteSpace: 'nowrap',
              }}>
                {col.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{
              background: row.isHighlight ? 'rgba(245,130,10,0.05)' : 'transparent',
            }}>
              {CMP_COLS.map((col, ci) => (
                <td key={col.key} style={{
                  padding: '9px 14px',
                  textAlign: col.align,
                  fontSize: '0.72rem',
                  color: ci === 0
                    ? (row.isHighlight ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.48)')
                    : (row.isHighlight ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.52)'),
                  fontWeight: ci === 0 || row.isHighlight ? 600 : 400,
                  borderBottom: ri < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  whiteSpace: 'nowrap',
                }}>
                  {fmtCmp(row, col.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Canal analysis ───────────────────────────────────────────────────────────

function CanalesSection({ rows, insight }: { rows: CanalRow[]; insight: string | null }) {
  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '0.55rem', letterSpacing: '0.2em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.22)', marginBottom: '10px',
      }}>
        Análisis por canal
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '12px', overflow: 'hidden',
      }}>
        {rows.map((row, i) => (
          <div key={row.canal} style={{
            padding: '12px 16px',
            borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '5px',
                background: 'rgba(245,130,10,0.12)',
                border: '1px solid rgba(245,130,10,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)', fontSize: '0.58rem', fontWeight: 700,
                color: AMBER, flexShrink: 0,
              }}>
                {CANAL_LETTER[row.canal] ?? '?'}
              </div>
              <span style={{
                fontFamily: 'var(--font-display)', fontSize: '0.72rem', fontWeight: 600,
                color: 'rgba(255,255,255,0.72)', minWidth: '72px', flexShrink: 0,
              }}>
                {row.canal}
              </span>
              <div style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center',
                gap: '14px', flexShrink: 0,
                fontFamily: 'var(--font-display)', fontSize: '0.68rem',
              }}>
                <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, minWidth: '50px', textAlign: 'right' }}>
                  {fmtMillones(row.ventas)}
                </span>
                <span style={{ color: AMBER, fontWeight: 700, minWidth: '30px', textAlign: 'right' }}>
                  {row.pct.toFixed(0)}%
                </span>
                <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: '52px', textAlign: 'right' }}>
                  {row.pedidos} ped.
                </span>
                <span style={{
                  color: row.varPct === null ? 'rgba(255,255,255,0.25)' : deltaColor(row.varPct, true),
                  fontWeight: 600, minWidth: '46px', textAlign: 'right',
                }}>
                  {row.varPct === null
                    ? '—'
                    : `${row.varPct >= 0 ? '↑' : '↓'}${Math.abs(row.varPct).toFixed(1)}%`}
                </span>
              </div>
            </div>
            <div style={{
              height: '3px', background: 'rgba(255,255,255,0.05)',
              borderRadius: '2px', overflow: 'hidden',
            }}>
              <div style={{
                width: `${row.pct}%`, height: '100%', background: AMBER,
                borderRadius: '2px', transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        ))}
      </div>
      {insight && (
        <div style={{
          marginTop: '10px', padding: '10px 14px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '8px',
          fontFamily: 'var(--font-body)', fontSize: '0.72rem',
          lineHeight: 1.5, color: 'rgba(255,255,255,0.48)',
        }}>
          {insight}
        </div>
      )}
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface Props { locationId: string }

export function EstadoNegocioSection({ locationId }: Props) {
  const { data, isLoading, isRefreshing } = useDashboardDataCtx()

  const months = useMemo(
    () => (data?.ventasMensuales ?? []).map(m => m.mes).sort(),
    [data],
  )

  const latestMonth = months.at(-1) ?? null
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const currentMonth = selectedMonth ?? latestMonth
  const [executiveData, setExecutiveData] = useState<ExecutiveData | null>(null)
  const [executiveLoading, setExecutiveLoading] = useState(false)
  const [executiveError, setExecutiveError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentMonth || !latestMonth || !locationId) return
    let cancelled = false

    async function loadExecutiveData() {
      setExecutiveLoading(true)
      setExecutiveError(null)
      setExecutiveData(null)
      const supabase = getSupabase()
      const currentBounds = monthBounds(currentMonth!)
      const latestBounds = monthBounds(latestMonth!)

      try {
        const currentPromise = supabase.rpc('get_ventas_periodo', {
          p_location_id: locationId,
          p_desde: currentBounds.start,
          p_hasta: currentBounds.end,
        })
        const freshnessPromise = supabase.rpc('get_data_freshness', {
          p_location_id: locationId,
        })
        const weeklyPromise = supabase.rpc('get_ventas_cascada_semanal', {
          p_location_id: locationId,
        })
        const latestPromise = currentMonth === latestMonth
          ? currentPromise
          : supabase.rpc('get_ventas_periodo', {
              p_location_id: locationId,
              p_desde: latestBounds.start,
              p_hasta: latestBounds.end,
            })

        const [currentResult, freshnessResult, weeklyResult, latestResult] = await Promise.all([
          currentPromise,
          freshnessPromise,
          weeklyPromise,
          latestPromise,
        ])

        if (currentResult.error) throw currentResult.error
        if (freshnessResult.error) throw freshnessResult.error
        if (weeklyResult.error) throw weeklyResult.error
        if (latestResult.error) throw latestResult.error

        const currentRow = (currentResult.data as PeriodData[] | null)?.[0]
        const latestRow = (latestResult.data as PeriodData[] | null)?.[0]
        if (!currentRow?.hasta || !latestRow) throw new Error('El período no devolvió datos')

        const current = normalizePeriod(currentRow)
        const isCurrentPartial = current.hasta! < currentBounds.end
        const comparisonDay = Number(current.hasta!.slice(-2))
        const previousMonth = prevMonthKey(currentMonth!)
        const previousBounds = monthBounds(previousMonth)
        const previousEnd = isCurrentPartial
          ? equivalentEnd(previousMonth, comparisonDay)
          : previousBounds.end
        const yearAgoMonth = yearAgoKey(currentMonth!)
        const yearAgoBounds = monthBounds(yearAgoMonth)
        const yearAgoEnd = isCurrentPartial
          ? equivalentEnd(yearAgoMonth, comparisonDay)
          : yearAgoBounds.end

        const [previousResult, yearAgoResult] = await Promise.all([
          supabase.rpc('get_ventas_periodo', {
            p_location_id: locationId,
            p_desde: previousBounds.start,
            p_hasta: previousEnd,
          }),
          supabase.rpc('get_ventas_periodo', {
            p_location_id: locationId,
            p_desde: yearAgoBounds.start,
            p_hasta: yearAgoEnd,
          }),
        ])

        if (previousResult.error) throw previousResult.error
        if (yearAgoResult.error) throw yearAgoResult.error
        const previousRow = (previousResult.data as PeriodData[] | null)?.[0]
        const yearAgoRow = (yearAgoResult.data as PeriodData[] | null)?.[0]
        if (!previousRow || !yearAgoRow) throw new Error('Faltan períodos comparables')

        const freshnessRows = (freshnessResult.data as FreshnessData[] | null) ?? []
        const salesFreshness = freshnessRows.find(row => row.dataset === 'sales_documents')
          ?? freshnessRows[0]

        if (!cancelled) {
          setExecutiveData({
            current,
            previous: normalizePeriod(previousRow),
            yearAgo: normalizePeriod(yearAgoRow),
            weekly: ((weeklyResult.data as WeeklyData[] | null) ?? []).map(normalizeWeekly),
            latestDataDate: normalizePeriod(latestRow).hasta,
            lastUpload: salesFreshness?.last_upload ?? null,
            isCurrentPartial,
          })
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'No pudimos cargar la comparación'
        logger.error('[EstadoNegocioSection] equivalent period failed:', message)
        if (!cancelled) {
          setExecutiveData(null)
          setExecutiveError(message)
        }
      } finally {
        if (!cancelled) setExecutiveLoading(false)
      }
    }

    void loadExecutiveData()
    return () => { cancelled = true }
  }, [currentMonth, latestMonth, locationId])

  const current = executiveData?.current ?? null
  const previous = executiveData?.previous ?? null
  const yearAgo = executiveData?.yearAgo ?? null

  const facturacion = current?.ventas ?? null
  const pedidos = current?.pedidos ?? null
  const cubiertos = current?.comensales ?? null
  const ticket = safeDiv(facturacion, pedidos)
  const prevFact = previous?.ventas ?? null
  const prevPed = previous?.pedidos ?? null
  const prevCub = previous?.comensales ?? null
  const prevTick = safeDiv(prevFact, prevPed)
  const yoFact = yearAgo?.ventas ?? null
  const yoPed = yearAgo?.pedidos ?? null
  const yoCub = yearAgo?.comensales ?? null
  const yoTick = safeDiv(yoFact, yoPed)

  const kpiFact = makeKpi(facturacion, prevFact, yoFact, true)
  const kpiPed  = makeKpi(pedidos,     prevPed,  yoPed,  true)
  const kpiCub  = makeKpi(cubiertos,   prevCub,  yoCub,  true)
  const kpiTick = makeKpi(ticket,      prevTick, yoTick, true)

  const conclusion = useMemo(
    () => current && previous
      ? buildPlainConclusion(current, previous, ticket, prevTick)
      : null,
    [current, previous, ticket, prevTick],
  )

  const orderDriver = useMemo(() => {
    if (pedidos == null || prevPed == null) return null
    const delta = pedidos - prevPed
    if (delta === 0) return { text: 'Vinieron los mismos pedidos', color: AMBER }
    return {
      text: `Vinieron ${Math.abs(delta).toLocaleString('es-AR')} pedidos ${delta > 0 ? 'más' : 'menos'}`,
      color: delta > 0 ? GREEN : RED,
    }
  }, [pedidos, prevPed])

  const ticketDriver = useMemo(() => {
    if (ticket == null || prevTick == null) return null
    const delta = ticket - prevTick
    if (Math.abs(delta) < 1) return { text: 'Cada pedido dejó prácticamente lo mismo', color: AMBER }
    return {
      text: `Cada pedido dejó ${fmtPeso(Math.round(Math.abs(delta)))} ${delta > 0 ? 'más' : 'menos'}`,
      color: delta > 0 ? GREEN : RED,
    }
  }, [ticket, prevTick])

  const weeklyChartData = useMemo((): WeeklyChartEntry[] => (
    (executiveData?.weekly ?? []).slice(-6).map(row => {
      const cutoff = executiveData?.latestDataDate ?? null
      const isIncomplete = isIncompleteWeek(row.semana, cutoff)
      const loadedDays = loadedDaysInWeek(row.semana, cutoff)
      const label = weekRangeLabel(row.semana)

      return {
        ...row,
        label,
        axisLabel: `${label}${isIncomplete ? `|en curso|${loadedDays}/7 días` : ''}`,
        isIncomplete,
        loadedDays,
        trendVentas: isIncomplete ? null : row.ventas,
        ticket: safeDiv(row.ventas, row.pedidos),
      }
    })
  ), [executiveData?.weekly, executiveData?.latestDataDate])

  const incompleteWeek = useMemo(
    () => weeklyChartData.find(entry => entry.isIncomplete) ?? null,
    [weeklyChartData],
  )

  const estadoColor = useMemo(() => {
    if (kpiFact.vsPrev === null) return `${AMBER}aa`
    if (kpiFact.vsPrev >= 0 && (kpiTick.vsPrev ?? 0) >= 0) return GREEN
    if (kpiFact.vsPrev < -10) return RED
    return '#f59e0b'
  }, [kpiFact.vsPrev, kpiTick.vsPrev])

  const canalRows = useMemo(
    () => currentMonth
      ? computeCanalRows(
          data?.ventasPorCanal ?? [],
          currentMonth,
          executiveData?.isCurrentPartial ? '__sin_comparacion_parcial__' : prevMonthKey(currentMonth),
        )
      : [],
    [data?.ventasPorCanal, currentMonth, executiveData?.isCurrentPartial],
  )

  const canalInsight = useMemo(() => buildCanalInsight(canalRows), [canalRows])

  const cmpRows = useMemo((): CmpRow[] => {
    if (!current || !previous || !yearAgo) return []
    return [
      buildPeriodCmpRow(formatPeriod(current), current, true),
      buildPeriodCmpRow(formatPeriod(previous), previous, false),
      buildPeriodCmpRow(formatPeriod(yearAgo), yearAgo, false),
    ]
  }, [current, previous, yearAgo])

  const pendingDays = pendingDaysSince(executiveData?.latestDataDate ?? null)
  const uploadDate = formatUploadDate(executiveData?.lastUpload ?? null)
  const showSkeleton = isLoading || executiveLoading
  const hasPeriods = Boolean(current && previous && yearAgo)

  return (
    <div style={{ marginBottom: '52px' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }
        .executive-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .executive-freshness { display:flex; align-items:center; gap:10px; min-width:250px; }
        .executive-drivers { display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
        @media (max-width: 700px) {
          .executive-header { flex-direction:column; }
          .executive-freshness { width:100%; min-width:0; }
          .executive-drivers { align-items:flex-start; flex-direction:column; gap:9px; }
        }
      `}</style>

      <div className="executive-header" style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <SectionLabel>Resumen Ejecutivo</SectionLabel>
          {currentMonth && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontFamily: 'var(--font-dm-mono)', fontSize: '0.65rem',
              color: 'rgba(255,255,255,0.5)',
            }}>
              <div style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: estadoColor, boxShadow: `0 0 6px ${estadoColor}`,
              }} />
              {monthLabel(currentMonth)}
            </div>
          )}
        </div>
        <div
          className="executive-freshness"
          title={uploadDate ? `Última carga recibida: ${uploadDate}` : undefined}
          style={{
            padding: '10px 13px',
            background: pendingDays > 0 ? 'rgba(245,130,10,0.08)' : 'rgba(90,138,60,0.08)',
            border: `1px solid ${pendingDays > 0 ? 'rgba(245,130,10,0.3)' : 'rgba(90,138,60,0.3)'}`,
            borderRadius: '8px',
          }}
        >
          <CalendarClock size={18} color={pendingDays > 0 ? AMBER : GREEN} aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.82rem',
              lineHeight: 1.25,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.9)',
            }}>
              {executiveLoading
                ? 'Consultando última carga...'
                : executiveData?.latestDataDate
                  ? `Datos actualizados al ${formatCutoff(executiveData.latestDataDate)}`
                  : 'Corte de datos no disponible'}
            </div>
            <div style={{
              marginTop: '2px',
              fontFamily: 'var(--font-body)',
              fontSize: '0.68rem',
              color: pendingDays > 0 ? 'rgba(245,130,10,0.82)' : 'rgba(255,255,255,0.42)',
            }}>
              {executiveLoading
                ? 'Validando el corte operativo'
                : pendingDays > 0
                ? `${pendingDays} ${pendingDays === 1 ? 'día pendiente' : 'días pendientes'} de carga`
                : uploadDate ? `Última carga recibida: ${uploadDate}` : 'Carga al día'}
            </div>
          </div>
        </div>
      </div>

      {months.length > 0 && (
        <div style={{ marginBottom: '18px' }}>
          <MonthSelector months={months} value={currentMonth} onChange={setSelectedMonth} />
        </div>
      )}

      {executiveError && !showSkeleton && (
        <div role="alert" style={{
          marginBottom: '16px',
          padding: '12px 14px',
          border: '1px solid rgba(176,65,58,0.35)',
          borderRadius: '8px',
          background: 'rgba(176,65,58,0.08)',
          color: 'rgba(255,255,255,0.72)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.78rem',
        }}>
          No pudimos cargar la comparación equivalente. {executiveError}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))',
        gap: '12px',
        marginBottom: '22px',
        opacity: isRefreshing ? 0.6 : 1,
        transition: 'opacity 0.3s',
      }}>
        {showSkeleton ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : hasPeriods ? (
          <>
            <EjecutivoKpiCard
              label="Facturación"
              value={facturacion != null ? fmtMillones(facturacion) : null}
              kpi={kpiFact}
              currentPeriod={current!}
              comparisonPeriod={previous!}
              yearAgoPeriod={yearAgo!}
              isMonetary
            />
            <EjecutivoKpiCard
              label="Pedidos (documentos)"
              value={pedidos != null ? pedidos.toLocaleString('es-AR') : null}
              kpi={kpiPed}
              currentPeriod={current!}
              comparisonPeriod={previous!}
              yearAgoPeriod={yearAgo!}
            />
            <EjecutivoKpiCard
              label="Cubiertos (salón)"
              value={cubiertos != null ? cubiertos.toLocaleString('es-AR') : null}
              kpi={kpiCub}
              currentPeriod={current!}
              comparisonPeriod={previous!}
              yearAgoPeriod={yearAgo!}
            />
            <EjecutivoKpiCard
              label="Ticket Promedio"
              value={ticket != null ? fmtPeso(Math.round(ticket)) : null}
              kpi={kpiTick}
              currentPeriod={current!}
              comparisonPeriod={previous!}
              yearAgoPeriod={yearAgo!}
              isMonetary
            />
          </>
        ) : null}
      </div>

      {conclusion && (
        <div style={{
          padding: '18px 0',
          marginBottom: '4px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontFamily: 'var(--font-body)',
          fontSize: '1.12rem',
          lineHeight: 1.45,
          fontWeight: 650,
          color: 'rgba(255,255,255,0.9)',
        }}>
          {conclusion}
        </div>
      )}

      {weeklyChartData.length > 0 && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: '20px',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.88)',
            marginBottom: '5px',
          }}>
            ¿Por qué cambió la facturación?
          </div>
          {current && previous && (
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.72rem',
              color: 'rgba(255,255,255,0.42)',
              marginBottom: '14px',
            }}>
              {formatPeriod(current)} vs {formatPeriod(previous)}
            </div>
          )}

          <div className="executive-drivers" style={{ marginBottom: '16px' }}>
            {orderDriver && (
              <div style={{
                borderLeft: `3px solid ${orderDriver.color}`,
                paddingLeft: '10px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.84rem',
                fontWeight: 650,
                color: 'rgba(255,255,255,0.78)',
              }}>
                {orderDriver.text}
              </div>
            )}
            {ticketDriver && (
              <div style={{
                borderLeft: `3px solid ${ticketDriver.color}`,
                paddingLeft: '10px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.84rem',
                fontWeight: 650,
                color: 'rgba(255,255,255,0.78)',
              }}>
                {ticketDriver.text}
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '5px',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.92rem',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.82)',
            }}>
              Tendencia de las últimas 6 semanas
            </div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              color: 'rgba(255,255,255,0.42)',
            }}>
              Semanas completas · lunes a domingo
            </div>
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.72rem',
            lineHeight: 1.45,
            color: 'rgba(255,255,255,0.48)',
            marginBottom: incompleteWeek ? '10px' : '2px',
          }}>
            Esta vista muestra la tendencia reciente; no es un desglose del mes.
          </div>
          {incompleteWeek && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              marginBottom: '4px',
              borderLeft: `3px solid ${AMBER}`,
              background: 'rgba(245,130,10,0.07)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.74rem',
              lineHeight: 1.4,
              color: 'rgba(255,255,255,0.7)',
            }}>
              <span style={{ color: AMBER, fontWeight: 750 }}>{incompleteWeek.label} en curso:</span>
              <span>
                {incompleteWeek.loadedDays} de 7 días cargados. No se compara con las semanas cerradas.
              </span>
            </div>
          )}

          <ChartWrapper height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={weeklyChartData}
                barCategoryGap="34%"
                margin={{ top: 30, right: 12, bottom: 22, left: 12 }}
              >
                <defs>
                  <pattern id="weeklyCurrentHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="rgba(245,130,10,0.08)" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(245,130,10,0.38)" strokeWidth="3" />
                  </pattern>
                </defs>
                <XAxis
                  dataKey="axisLabel"
                  axisLine={false}
                  tickLine={false}
                  tick={<WeeklyTick />}
                  interval={0}
                  height={60}
                />
                <YAxis hide domain={[0, 'dataMax']} />
                <Tooltip
                  content={<WeeklyTooltip />}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="ventas" radius={[4, 4, 0, 0]} maxBarSize={62} isAnimationActive={false}>
                  {weeklyChartData.map(entry => (
                    <Cell
                      key={entry.semana}
                      fill={entry.isIncomplete ? 'url(#weeklyCurrentHatch)' : 'rgba(245,130,10,0.72)'}
                      stroke={entry.isIncomplete ? 'rgba(245,130,10,0.5)' : 'rgba(245,130,10,0.9)'}
                      strokeWidth={1}
                    />
                  ))}
                  <LabelList dataKey="ventas" content={<WeeklyValueLabel />} />
                </Bar>
                <Line
                  type="linear"
                  dataKey="trendVentas"
                  stroke="rgba(255,255,255,0.52)"
                  strokeWidth={1.5}
                  dot={{ r: 2.5, fill: '#0b0b0f', stroke: 'rgba(255,255,255,0.68)', strokeWidth: 1.5 }}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </div>
      )}

      {cmpRows.length > 0 && !showSkeleton && (
        <ComparativeTable rows={cmpRows} />
      )}

      {canalRows.length > 0 && !showSkeleton && (
        <CanalesSection rows={canalRows} insight={canalInsight} />
      )}
    </div>
  )
}
