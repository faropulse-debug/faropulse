'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { AlertTriangle, Download, Gift } from 'lucide-react'
import { getSupabase }            from '@/lib/supabase'
import { fmtMillones, fmtPct }   from '@/lib/format'
import { SectionLabel }           from '@/components/dashboard/SectionLabel'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RawDescuentosRow = {
  mes_inicio:            string
  tipo_zona:             string
  plata_perdida:         number
  bruto_total:           number | null
  bruto_total_canal:     number | null
  tickets:               number
  tickets_con_descuento: number
  avg_descuento_pct:     number | null
  tasa_efectiva:         number | null
}

export type TopTicketRow = {
  external_id:   string
  fecha_caja:    string
  tipo_zona:     string
  comensales:    number | null
  unidades:      number | null
  bruto:         number | null
  total:         number
  descuento:     number
  plata_perdida: number | null
}

type CanalSummaryRow = Pick<RawDescuentosRow, 'tipo_zona' | 'plata_perdida'>
type TicketSortKey = keyof Pick<
  TopTicketRow,
  | 'external_id'
  | 'fecha_caja'
  | 'tipo_zona'
  | 'comensales'
  | 'unidades'
  | 'bruto'
  | 'total'
  | 'descuento'
  | 'plata_perdida'
>
type SortDirection = 'asc' | 'desc'
type TicketSort = { key: TicketSortKey; direction: SortDirection }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}
const MONTH_NAMES: Record<string, string> = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
  '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
}
const CANAL_LABELS: Record<string, string> = {
  SALON: 'Salón', APLICACIONES: 'Apps', MOSTRADOR: 'Mostrador',
}
const POSTGREST_ROW_LIMIT = 1000
const DEFAULT_TICKET_SORT: TicketSort = { key: 'plata_perdida', direction: 'desc' }
const TICKET_COLUMNS: Array<{ key: TicketSortKey; label: string; align: 'left' | 'right' }> = [
  { key: 'external_id', label: 'Número',     align: 'left' },
  { key: 'fecha_caja',  label: 'Fecha',      align: 'left' },
  { key: 'tipo_zona',   label: 'Canal',      align: 'left' },
  { key: 'comensales',  label: 'Comensales', align: 'right' },
  { key: 'unidades',    label: 'Ítems',      align: 'right' },
  { key: 'bruto',       label: 'Bruto',      align: 'right' },
  { key: 'total',       label: 'Cobrado',    align: 'right' },
  { key: 'descuento',   label: 'Desc %',     align: 'right' },
  { key: 'plata_perdida', label: 'Perdido',  align: 'right' },
]

function fmtMonth(iso: string): string {
  const [y, m] = iso.slice(0, 7).split('-')
  return `${MONTH_LABELS[m] ?? m} ${y.slice(2)}`
}

function fmtMonthLong(iso: string): string {
  const [y, m] = iso.slice(0, 7).split('-')
  return `${MONTH_NAMES[m] ?? m} ${y}`
}

function fmtCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return '$' + value.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtUnits(value: number | null): string {
  if (value == null) return '—'
  return value.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function fmtEffectiveRate(value: number | null): string {
  if (value == null) return '—'
  return `${(value * 100).toLocaleString('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function isPendingReview(row: RawDescuentosRow): boolean {
  return row.tasa_efectiva != null && row.tasa_efectiva < 0
}

function sortTickets(rows: TopTicketRow[], sort: TicketSort): TopTicketRow[] {
  return [...rows].sort((a, b) => {
    const aValue = a[sort.key]
    const bValue = b[sort.key]
    if (aValue == null && bValue == null) return 0
    if (aValue == null) return 1
    if (bValue == null) return -1

    const comparison = typeof aValue === 'number' && typeof bValue === 'number'
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), 'es', { numeric: true })
    return sort.direction === 'asc' ? comparison : -comparison
  })
}

export function firstDayOfMonth(iso: string): string {
  return iso.slice(0, 7) + '-01'
}

// Aritmética en UTC puro — nunca pasar por new Date(isoString) + getters/setters
// locales: en timezones negativos (UTC-3, Uruguay/Argentina) eso corrompe el
// mes calculado y "hasta" termina apuntando al día 1 en vez del último día.
export function lastDayOfMonth(iso: string): string {
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${iso.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
}

function currentMonthISO(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

type BarPayload = { mes_label: string; plata_perdida: number }

function BarTooltip({ active, payload }: { active?: boolean; payload?: { payload: BarPayload }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8, padding: '10px 14px',
      fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.7rem',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>{d.mes_label}</div>
      <div style={{ color: '#ef4444', fontWeight: 700 }}>{fmtMillones(d.plata_perdida)}</div>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = '#f5820a' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
    }}>
      <span style={{
        fontFamily: 'var(--font-dm-mono), monospace',
        fontSize: '0.55rem', letterSpacing: '0.18em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
      }}>{label}</span>
      <span style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: '1.45rem', fontWeight: 700, color, lineHeight: 1,
      }}>{value}</span>
      {sub && (
        <span style={{
          fontFamily: 'var(--font-dm-mono), monospace',
          fontSize: '0.6rem', lineHeight: 1.45, overflowWrap: 'anywhere',
          color: 'rgba(255,255,255,0.28)',
        }}>{sub}</span>
      )}
    </div>
  )
}

// ─── Canal Breakdown ──────────────────────────────────────────────────────────

function CanalBreakdown({ rows }: { rows: CanalSummaryRow[] }) {
  const totalLost = rows.reduce((s, r) => s + r.plata_perdida, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(r => {
        const pct = totalLost > 0 ? (r.plata_perdida / totalLost) * 100 : 0
        return (
          <div key={r.tipo_zona} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem',
              letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)',
              width: 76, flexShrink: 0,
            }}>
              {CANAL_LABELS[r.tipo_zona] ?? r.tipo_zona}
            </span>
            <div style={{
              flex: 1, height: 6, borderRadius: 3,
              background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
            }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: '#f5820a', borderRadius: 3, transition: 'width 0.4s',
              }} />
            </div>
            <span style={{
              fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem',
              color: '#f5820a', width: 58, textAlign: 'right',
            }}>
              {fmtMillones(r.plata_perdida)}
            </span>
            <span style={{
              fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem',
              color: 'rgba(255,255,255,0.3)', width: 36, textAlign: 'right',
            }}>
              {pct.toFixed(1)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Pending review ───────────────────────────────────────────────────────────

function PendingReviewChannels({ rows }: { rows: RawDescuentosRow[] }) {
  return (
    <div style={{
      background: 'rgba(245,158,11,0.055)',
      border: '1px solid rgba(245,158,11,0.2)',
      borderRadius: 12, padding: '18px 20px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <AlertTriangle size={18} strokeWidth={1.8} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{
            margin: 0, fontFamily: 'var(--font-body)', fontSize: '0.78rem',
            lineHeight: 1.55, color: 'rgba(255,255,255,0.66)',
          }}>
            <strong style={{ color: '#f59e0b' }}>Pendiente de revisión</strong> — el descuento de este canal
            parece ser comisión de la plataforma, no plata regalada. No suma al total.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {rows.map(row => (
              <div key={row.tipo_zona} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 6,
                background: 'rgba(15,23,42,0.55)',
                border: '1px solid rgba(245,158,11,0.14)',
                fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.61rem',
              }}>
                <span style={{ color: 'rgba(255,255,255,0.62)' }}>
                  {CANAL_LABELS[row.tipo_zona] ?? row.tipo_zona}
                </span>
                <span style={{ color: '#f59e0b' }}>{fmtEffectiveRate(row.tasa_efectiva)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DataLimitWarning({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'flex-start', gap: 9,
      marginBottom: 14, padding: '10px 12px', borderRadius: 6,
      border: '1px solid rgba(245,158,11,0.24)', background: 'rgba(245,158,11,0.07)',
      color: '#fbbf24', fontFamily: 'var(--font-dm-mono), monospace',
      fontSize: '0.61rem', lineHeight: 1.5,
    }}>
      <AlertTriangle size={15} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  )
}

// ─── Tickets Table ────────────────────────────────────────────────────────────

function TopTicketsTable({ rows, sort, onSort }: {
  rows: TopTicketRow[]
  sort: TicketSort
  onSort: (key: TicketSortKey) => void
}) {
  if (rows.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '20px 0',
        fontFamily: 'var(--font-dm-mono), monospace',
        fontSize: '0.62rem', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.1em',
      }}>
        sin datos para el período
      </div>
    )
  }
  return (
    <div style={{ maxHeight: 400, overflow: 'auto', scrollbarGutter: 'stable' }}>
      <table style={{
        width: '100%', minWidth: 1060, borderCollapse: 'separate', borderSpacing: 0,
        fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.63rem',
      }}>
        <thead>
          <tr>
            {TICKET_COLUMNS.map(column => {
              const isActive = sort.key === column.key
              return (
              <th
                key={column.key}
                aria-sort={isActive ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                style={{
                position: 'sticky', top: 0, zIndex: 1,
                padding: 0, textAlign: column.align,
                color: 'rgba(255,255,255,0.28)', fontWeight: 400,
                letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.52rem',
                background: '#101722', borderBottom: '1px solid rgba(255,255,255,0.09)',
                whiteSpace: 'nowrap',
              }}>
                <button
                  type="button"
                  onClick={() => onSort(column.key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: column.align === 'right' ? 'flex-end' : 'flex-start',
                    gap: 5, padding: '9px 10px', border: 0, background: 'transparent',
                    color: isActive ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.28)',
                    font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  <span>{column.label}</span>
                  <span aria-hidden="true" style={{ width: 9, color: '#f5820a' }}>
                    {isActive ? (sort.direction === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.external_id}-${r.fecha_caja}`}>
              <td style={{
                padding: '8px 10px', color: 'rgba(255,255,255,0.68)',
                borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
              }}>{r.external_id}</td>
              <td style={{
                padding: '8px 10px', color: 'rgba(255,255,255,0.5)',
                borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
              }}>{r.fecha_caja}</td>
              <td style={{
                padding: '8px 10px', color: 'rgba(255,255,255,0.4)',
                borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
              }}>
                {CANAL_LABELS[r.tipo_zona] ?? r.tipo_zona}
              </td>
              <td style={{
                padding: '8px 10px', color: 'rgba(255,255,255,0.5)', textAlign: 'right',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                {r.comensales ?? '—'}
              </td>
              <td style={{
                padding: '8px 10px', color: 'rgba(255,255,255,0.5)', textAlign: 'right',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                {fmtUnits(r.unidades)}
              </td>
              <td style={{
                padding: '8px 10px', color: 'rgba(255,255,255,0.56)', textAlign: 'right',
                borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
              }}>
                {fmtCurrency(r.bruto)}
              </td>
              <td style={{
                padding: '8px 10px', color: 'rgba(255,255,255,0.56)', textAlign: 'right',
                borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
              }}>
                {fmtCurrency(r.total)}
              </td>
              <td style={{
                padding: '8px 10px', color: '#f59e0b', fontWeight: 600, textAlign: 'right',
                borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
              }}>
                {fmtPct(r.descuento)}
              </td>
              <td style={{
                padding: '8px 10px', color: r.bruto == null ? 'rgba(255,255,255,0.35)' : '#ef4444',
                fontWeight: 600, textAlign: 'right',
                borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
              }}>
                {r.bruto == null ? '—' : fmtCurrency(r.plata_perdida)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HistoricalSummary({ firstMonth, lastMonth, total, canalRows }: {
  firstMonth: string
  lastMonth: string
  total: number
  canalRows: CanalSummaryRow[]
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: 20, marginBottom: 16,
    }}>
      <div style={{
        fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem',
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.38)', marginBottom: 18,
      }}>
        Acumulado — {fmtMonth(firstMonth)} a {fmtMonth(lastMonth)}
      </div>
      <div className="discount-history-grid" style={{ display: 'grid', gap: 24, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem',
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)', marginBottom: 8,
          }}>
            Plata perdida en el período
          </div>
          <div style={{
            fontFamily: "'Syne', sans-serif", fontSize: '1.75rem',
            fontWeight: 700, lineHeight: 1, color: '#ef4444',
          }}>
            {fmtMillones(total)}
          </div>
        </div>
        <CanalBreakdown rows={canalRows} />
      </div>
    </div>
  )
}

function CourtesyTable({ rows, excludedCount }: { rows: TopTicketRow[]; excludedCount: number }) {
  if (rows.length === 0) {
    return (
      <div style={{
        padding: '24px 0 8px', textAlign: 'center',
        fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.64rem',
        letterSpacing: '0.08em', color: 'rgba(255,255,255,0.28)',
      }}>
        sin cortesías este mes
      </div>
    )
  }

  const headers = [
    { label: 'Número', align: 'left' as const },
    { label: 'Fecha', align: 'left' as const },
    { label: 'Canal', align: 'left' as const },
    { label: 'Comensales', align: 'right' as const },
    { label: 'Ítems', align: 'right' as const },
    { label: 'Regalado', align: 'right' as const },
  ]

  return (
    <>
      <div style={{ maxHeight: 300, overflow: 'auto', scrollbarGutter: 'stable' }}>
        <table style={{
          width: '100%', minWidth: 760, borderCollapse: 'separate', borderSpacing: 0,
          fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.63rem',
        }}>
          <thead>
            <tr>
              {headers.map(header => (
                <th key={header.label} style={{
                  position: 'sticky', top: 0, zIndex: 1,
                  padding: '9px 10px', textAlign: header.align,
                  background: '#101722', borderBottom: '1px solid rgba(255,255,255,0.09)',
                  color: 'rgba(255,255,255,0.28)', fontWeight: 400,
                  letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.52rem',
                  whiteSpace: 'nowrap',
                }}>
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.external_id}-${row.fecha_caja}-${index}`}>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.68)', whiteSpace: 'nowrap' }}>{row.external_id}</td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{row.fecha_caja}</td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{CANAL_LABELS[row.tipo_zona] ?? row.tipo_zona}</td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>{row.comensales ?? '—'}</td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>{fmtUnits(row.unidades)}</td>
                <td style={{
                  padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  color: row.bruto == null ? 'rgba(255,255,255,0.35)' : '#ef4444',
                  fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap',
                }}>
                  {fmtCurrency(row.bruto)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {excludedCount > 0 && (
        <p style={{
          margin: '10px 0 0', fontFamily: 'var(--font-dm-mono), monospace',
          fontSize: '0.58rem', color: 'rgba(255,255,255,0.32)', lineHeight: 1.5,
        }}>
          {excludedCount} {excludedCount === 1 ? 'ticket quedó' : 'tickets quedaron'} fuera del total porque no tiene bruto cargado; se muestra con “—”.
        </p>
      )}
    </>
  )
}

function CourtesyWidget({ historicalRows, monthRows, month, historicalIncomplete, monthIncomplete }: {
  historicalRows: TopTicketRow[]
  monthRows: TopTicketRow[]
  month: string
  historicalIncomplete: boolean
  monthIncomplete: boolean
}) {
  const historicalKnown = historicalRows.filter(row => row.bruto != null)
  const monthKnown = monthRows.filter(row => row.bruto != null)
  const historicalExcluded = historicalRows.length - historicalKnown.length
  const monthExcluded = monthRows.length - monthKnown.length
  const historicalTotal = historicalKnown.reduce((sum, row) => sum + row.bruto!, 0)
  const monthTotal = monthKnown.reduce((sum, row) => sum + row.bruto!, 0)
  const historicalValue = historicalRows.length > 0 && historicalKnown.length === 0
    ? '—'
    : `${historicalIncomplete ? '≥ ' : ''}${fmtMillones(historicalTotal)}`
  const monthValue = monthRows.length > 0 && monthKnown.length === 0
    ? '—'
    : `${monthIncomplete ? '≥ ' : ''}${fmtMillones(monthTotal)}`

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: 20, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <Gift size={18} strokeWidth={1.8} color="#f5820a" style={{ flexShrink: 0 }} />
        <div>
          <div style={{
            fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem',
            letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)',
          }}>
            Cortesías — corte del total de descuentos
          </div>
          <p style={{
            margin: '6px 0 0', fontFamily: 'var(--font-body)', fontSize: '0.76rem',
            lineHeight: 1.45, color: 'rgba(255,255,255,0.52)',
          }}>
            ¿A quién le regalamos la cena sin cobrar un peso?
          </p>
        </div>
      </div>
      <p style={{
        margin: '0 0 18px 28px', fontFamily: 'var(--font-dm-mono), monospace',
        fontSize: '0.58rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.3)',
      }}>
        Estos montos ya están incluidos en “Plata perdida”; son un corte para entenderla, no un total adicional.
      </p>

      {historicalIncomplete && (
        <DataLimitWarning>
          Acumulado histórico potencialmente incompleto: la consulta alcanzó el límite de 1.000 cortesías. El valor mostrado es un mínimo conocido.
        </DataLimitWarning>
      )}
      {monthIncomplete && (
        <DataLimitWarning>
          Cortesías del mes potencialmente incompletas: el detalle mensual alcanzó el límite de 1.000 tickets. El valor mostrado es un mínimo conocido.
        </DataLimitWarning>
      )}

      <div className="discount-courtesy-grid" style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
        <div style={{ padding: '14px 16px', borderLeft: '2px solid rgba(245,130,10,0.5)', background: 'rgba(245,130,10,0.035)' }}>
          <div style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.54rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)', marginBottom: 7 }}>Acumulado histórico regalado al 100%</div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.35rem', fontWeight: 700, color: '#ef4444' }}>{historicalValue}</div>
          {historicalExcluded > 0 && (
            <div style={{ marginTop: 6, fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.56rem', color: 'rgba(255,255,255,0.28)' }}>
              {historicalExcluded} sin bruto, fuera del total
            </div>
          )}
        </div>
        <div style={{ padding: '14px 16px', borderLeft: '2px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.035)' }}>
          <div style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.54rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)', marginBottom: 7 }}>{fmtMonthLong(month)} · regalado al 100%</div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.35rem', fontWeight: 700, color: '#ef4444' }}>{monthValue}</div>
        </div>
      </div>

      <CourtesyTable rows={monthRows} excludedCount={monthExcluded} />
    </div>
  )
}

async function exportTicketsXlsx(rows: TopTicketRow[], locationId: string, month: string) {
  const XLSX = await import('xlsx')
  const exportRows = rows.map(row => ({
    'NÚMERO':     row.external_id,
    'FECHA':      row.fecha_caja,
    'CANAL':      CANAL_LABELS[row.tipo_zona] ?? row.tipo_zona,
    'COMENSALES': row.comensales ?? '—',
    'ÍTEMS':      row.unidades ?? '—',
    'BRUTO':      row.bruto ?? '—',
    'COBRADO':    row.total,
    'DESC %':     row.descuento / 100,
    'PERDIDO':    row.bruto == null || row.plata_perdida == null ? '—' : row.plata_perdida,
  }))
  const sheet = XLSX.utils.json_to_sheet(exportRows)
  sheet['!cols'] = [
    { wch: 22 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 },
    { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 },
  ]

  if (sheet['!ref']) {
    const range = XLSX.utils.decode_range(sheet['!ref'])
    for (let row = 1; row <= range.e.r; row += 1) {
      for (const col of [5, 6, 8]) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })]
        if (cell?.t === 'n') cell.z = '$#,##0.00'
      }
      const percentCell = sheet[XLSX.utils.encode_cell({ r: row, c: 7 })]
      if (percentCell?.t === 'n') percentCell.z = '0.0%'
    }
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Descuentos')
  const safeLocation = locationId.replace(/[^a-zA-Z0-9_-]/g, '-')
  XLSX.writeFile(workbook, `descuentos-${safeLocation}-${month.slice(0, 7)}.xlsx`, { compression: true })
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skel({ h = 16 }: { h?: number }) {
  return (
    <div style={{
      height: h, borderRadius: 4,
      background: 'rgba(255,255,255,0.05)',
      animation: 'pulse 1.4s ease-in-out infinite',
    }} />
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { locationId: string }

export function DescuentosSection({ locationId }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthISO)
  const [resumen, setResumen] = useState<RawDescuentosRow[]>([])
  const [monthTickets, setMonthTickets] = useState<TopTicketRow[]>([])
  const [historicalCourtesyRows, setHistoricalCourtesyRows] = useState<TopTicketRow[]>([])
  const [loadedMonthScope, setLoadedMonthScope] = useState<string | null>(null)
  const [loadedCourtesyLocation, setLoadedCourtesyLocation] = useState<string | null>(null)
  const [ticketSort, setTicketSort] = useState<TicketSort>({ ...DEFAULT_TICKET_SORT })
  const [isLoading,    setIsLoading]    = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTicketsLoading, setIsTicketsLoading] = useState(true)
  const [isCourtesyLoading, setIsCourtesyLoading] = useState(true)
  const [isMonthIncomplete, setIsMonthIncomplete] = useState(false)
  const [isCourtesyIncomplete, setIsCourtesyIncomplete] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const hasDataRef = useRef(false)
  const monthTicketRequestRef = useRef(0)
  const courtesyRequestRef = useRef(0)

  const loadResumen = useCallback(async () => {
    if (hasDataRef.current) setIsRefreshing(true)
    else                    setIsLoading(true)
    const { data, error } = await getSupabase().rpc('get_descuentos_resumen', {
      p_location_id: locationId,
    })
    if (!error && Array.isArray(data)) {
      setResumen(data as RawDescuentosRow[])
      hasDataRef.current = true
    }
    setIsLoading(false)
    setIsRefreshing(false)
  }, [locationId])

  const loadMonthTickets = useCallback(async (month: string) => {
    const requestId = ++monthTicketRequestRef.current
    setIsTicketsLoading(true)
    setMonthTickets([])
    setIsMonthIncomplete(false)
    const { data, error } = await getSupabase().rpc('get_descuentos_top_tickets', {
      p_location_id: locationId,
      p_desde:       firstDayOfMonth(month),
      p_hasta:       lastDayOfMonth(month),
    })
    if (requestId !== monthTicketRequestRef.current) return
    if (!error && Array.isArray(data)) {
      const rows = data as TopTicketRow[]
      setMonthTickets(rows)
      setIsMonthIncomplete(rows.length === POSTGREST_ROW_LIMIT)
    }
    setLoadedMonthScope(`${locationId}:${month.slice(0, 7)}`)
    setIsTicketsLoading(false)
  }, [locationId])

  const loadHistoricalCourtesies = useCallback(async () => {
    const requestId = ++courtesyRequestRef.current
    setIsCourtesyLoading(true)
    setHistoricalCourtesyRows([])
    setIsCourtesyIncomplete(false)
    const { data, error } = await getSupabase()
      .rpc('get_descuentos_top_tickets', {
        p_location_id: locationId,
        p_desde:       null,
        p_hasta:       null,
      })
      .gte('descuento', 100)
    if (requestId !== courtesyRequestRef.current) return
    if (!error && Array.isArray(data)) {
      const rows = data as TopTicketRow[]
      setHistoricalCourtesyRows(rows.filter(row => row.descuento >= 100))
      setIsCourtesyIncomplete(rows.length === POSTGREST_ROW_LIMIT)
    }
    setLoadedCourtesyLocation(locationId)
    setIsCourtesyLoading(false)
  }, [locationId])

  // PostgREST caps function results at 1,000 rows. Exactly 1,000 is therefore
  // treated as truncated: accepting it silently made detail exports disagree
  // with summary KPIs. Keep month detail date-bounded, filter courtesies on the
  // server, and preserve both guards so partial data can never look complete.
  useEffect(() => { loadResumen() }, [loadResumen])
  useEffect(() => { loadHistoricalCourtesies() }, [loadHistoricalCourtesies])

  // ── Derived ──────────────────────────────────────────────────────────────────

  const availableMonths = useMemo(
    () => [...new Set(resumen.map(r => r.mes_inicio))].sort(),
    [resumen]
  )

  const effectiveMonth = useMemo(() => {
    if (availableMonths.length === 0) return selectedMonth
    return availableMonths.includes(selectedMonth)
      ? selectedMonth
      : availableMonths[availableMonths.length - 1]
  }, [availableMonths, selectedMonth])

  useEffect(() => {
    if (!isLoading) loadMonthTickets(effectiveMonth)
  }, [effectiveMonth, isLoading, loadMonthTickets])

  const monthRows = useMemo(
    () => resumen.filter(r => r.mes_inicio === effectiveMonth),
    [resumen, effectiveMonth]
  )

  const includedMonthRows = useMemo(
    () => monthRows.filter(row => !isPendingReview(row)),
    [monthRows]
  )

  const pendingReviewRows = useMemo(
    () => monthRows.filter(isPendingReview).sort((a, b) => a.tasa_efectiva! - b.tasa_efectiva!),
    [monthRows]
  )

  const kpis = useMemo(() => {
    const plataTotal     = includedMonthRows.reduce((s, r) => s + r.plata_perdida, 0)
    const ticketsTotal   = monthRows.reduce((s, r) => s + r.tickets, 0)
    const ticketsConDesc = monthRows.reduce((s, r) => s + r.tickets_con_descuento, 0)
    const pctTickets     = ticketsTotal > 0 ? (ticketsConDesc / ticketsTotal) * 100 : 0
    const brutoTotal     = includedMonthRows.reduce((s, r) => s + (r.bruto_total_canal ?? 0), 0)
    const hasUnknownBruto = includedMonthRows.some(r => r.bruto_total_canal == null)
    const effectiveRate = !hasUnknownBruto && brutoTotal > 0 ? plataTotal / brutoTotal : null
    const hasUnknownAverage = monthRows.some(r => r.tickets_con_descuento > 0 && r.avg_descuento_pct == null)
    const weightedDiscount = monthRows.reduce(
      (sum, row) => sum + (row.avg_descuento_pct ?? 0) * row.tickets_con_descuento,
      0,
    )
    const avgDiscount = !hasUnknownAverage && ticketsConDesc > 0
      ? weightedDiscount / ticketsConDesc
      : null
    return { plataTotal, ticketsTotal, ticketsConDesc, pctTickets, effectiveRate, avgDiscount }
  }, [includedMonthRows, monthRows])

  const barData = useMemo(() => {
    const byMonth: Record<string, number> = {}
    for (const r of resumen.filter(row => !isPendingReview(row))) {
      byMonth[r.mes_inicio] = (byMonth[r.mes_inicio] ?? 0) + r.plata_perdida
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes_inicio, plata_perdida]) => ({
        mes_inicio, plata_perdida,
        mes_label:  fmtMonth(mes_inicio),
        isSelected: mes_inicio === effectiveMonth,
      }))
  }, [resumen, effectiveMonth])

  const canalRows = useMemo(
    () => [...includedMonthRows].sort((a, b) => b.plata_perdida - a.plata_perdida),
    [includedMonthRows]
  )

  const historicalIncludedRows = useMemo(
    () => resumen.filter(row => !isPendingReview(row)),
    [resumen]
  )

  const historicalTotal = useMemo(
    () => historicalIncludedRows.reduce((sum, row) => sum + row.plata_perdida, 0),
    [historicalIncludedRows]
  )

  const historicalCanalRows = useMemo(() => {
    const byChannel = new Map<string, number>()
    for (const row of historicalIncludedRows) {
      byChannel.set(row.tipo_zona, (byChannel.get(row.tipo_zona) ?? 0) + row.plata_perdida)
    }
    return [...byChannel.entries()]
      .map(([tipo_zona, plata_perdida]) => ({ tipo_zona, plata_perdida }))
      .sort((a, b) => b.plata_perdida - a.plata_perdida)
  }, [historicalIncludedRows])

  const visibleTickets = useMemo(
    () => sortTickets(monthTickets, ticketSort),
    [monthTickets, ticketSort]
  )

  const monthCourtesyRows = useMemo(
    () => sortTickets(
      monthTickets.filter(row => row.descuento >= 100),
      { key: 'bruto', direction: 'desc' },
    ),
    [monthTickets]
  )

  const handleMonthSelect = useCallback((month: string) => {
    setSelectedMonth(month)
    setTicketSort({ ...DEFAULT_TICKET_SORT })
  }, [])

  const handleTicketSort = useCallback((key: TicketSortKey) => {
    setTicketSort(previous => previous.key === key
      ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' }
    )
  }, [])

  const handleExport = useCallback(async () => {
    if (isMonthIncomplete) {
      setExportError('El detalle alcanzó el límite de 1.000 filas. La exportación queda deshabilitada para no generar un archivo incompleto.')
      return
    }
    setIsExporting(true)
    setExportError(null)
    try {
      await exportTicketsXlsx(visibleTickets, locationId, effectiveMonth)
    } catch {
      setExportError('No pudimos generar el archivo. Probá de nuevo.')
    } finally {
      setIsExporting(false)
    }
  }, [effectiveMonth, isMonthIncomplete, locationId, visibleTickets])

  const isMonthDetailLoading = isTicketsLoading
    || loadedMonthScope !== `${locationId}:${effectiveMonth.slice(0, 7)}`
  const isHistoricalCourtesyLoading = isCourtesyLoading
    || loadedCourtesyLocation !== locationId

  const isExportDisabled = isLoading
    || isMonthDetailLoading
    || isExporting
    || isMonthIncomplete
    || visibleTickets.length === 0

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ marginBottom: '52px', opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.3s' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }
        .discount-kpi-grid,
        .discount-history-grid,
        .discount-courtesy-grid { grid-template-columns: minmax(0, 1fr); }
        @media (min-width: 520px) {
          .discount-kpi-grid,
          .discount-courtesy-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 768px) {
          .discount-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .discount-history-grid { grid-template-columns: minmax(180px, .7fr) minmax(280px, 1.3fr); }
        }
        @media (min-width: 1280px) {
          .discount-kpi-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        }
      `}</style>
      <SectionLabel>Análisis de Descuentos</SectionLabel>

      {/* Month selector */}
      {!isLoading && availableMonths.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
          {availableMonths.map(m => {
            const active = m === effectiveMonth
            return (
              <button
                key={m}
                onClick={() => handleMonthSelect(m)}
                style={{
                  padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontSize: '0.62rem', letterSpacing: '0.1em',
                  background: active ? '#f5820a' : 'rgba(255,255,255,0.04)',
                  color:      active ? '#0f172a' : 'rgba(255,255,255,0.45)',
                  border:     active ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  fontWeight: active ? 700 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {fmtMonth(m)}
              </button>
            )
          })}
        </div>
      )}

      {/* KPI cards */}
      <div className="discount-kpi-grid" style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
              <Skel h={8} /><div style={{ height: 10 }} /><Skel h={28} />
            </div>
          ))
        ) : (
          <>
            <KpiCard label="Plata perdida"          value={fmtMillones(kpis.plataTotal)}    sub={fmtMonth(effectiveMonth)} color="#ef4444" />
            <KpiCard label="Tickets c/ descuento"   value={String(kpis.ticketsConDesc)}      sub={`de ${kpis.ticketsTotal} totales`} />
            <KpiCard label="% Tickets c/ descuento" value={fmtPct(kpis.pctTickets)} />
            <KpiCard label="Tasa efectiva"           value={fmtEffectiveRate(kpis.effectiveRate)} sub="de cada $100 de lista, cuánto no cobré" />
            <KpiCard
              label="Descuento promedio"
              value={kpis.avgDiscount == null ? '—' : fmtPct(kpis.avgDiscount)}
              sub="qué tan fuerte descuento cuando descuento"
            />
          </>
        )}
      </div>

      {/* Bar chart */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, padding: '20px', marginBottom: 16,
      }}>
        <div style={{
          fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem',
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.28)', marginBottom: 16,
        }}>
          Plata perdida por mes
        </div>
        {isLoading ? <Skel h={160} /> : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData} barSize={22} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="mes_label"
                tick={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                axisLine={false} tickLine={false}
              />
              <YAxis hide />
              <RechartsTooltip
                content={<BarTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="plata_perdida" radius={[4, 4, 0, 0]}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.isSelected ? '#ef4444' : 'rgba(245,130,10,0.35)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {!isLoading && availableMonths.length > 0 && (
        <HistoricalSummary
          firstMonth={availableMonths[0]}
          lastMonth={availableMonths[availableMonths.length - 1]}
          total={historicalTotal}
          canalRows={historicalCanalRows}
        />
      )}

      {/* Canal breakdown */}
      {!isLoading && canalRows.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, padding: '20px', marginBottom: 16,
        }}>
          <div style={{
            fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem',
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.28)', marginBottom: 16,
          }}>
            Por canal — {fmtMonth(effectiveMonth)}
          </div>
          <CanalBreakdown rows={canalRows} />
        </div>
      )}

      {/* Channels whose header discount behaves like a platform fee */}
      {!isLoading && pendingReviewRows.length > 0 && (
        <PendingReviewChannels rows={pendingReviewRows} />
      )}

      {/* Courtesy tickets are a cut of the discount total, not an additional amount. */}
      {isLoading || isMonthDetailLoading || isHistoricalCourtesyLoading ? (
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, padding: 20, marginBottom: 16,
        }}>
          <Skel h={180} />
        </div>
      ) : (
        <CourtesyWidget
          historicalRows={historicalCourtesyRows}
          monthRows={monthCourtesyRows}
          month={effectiveMonth}
          historicalIncomplete={isCourtesyIncomplete}
          monthIncomplete={isMonthIncomplete}
        />
      )}

      {/* Discounted tickets */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, padding: '20px', marginBottom: 16,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem',
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.38)',
            }}>
              Tickets con descuento — {isLoading ? '…' : fmtMonthLong(effectiveMonth)}
            </span>
            {!isLoading && !isMonthDetailLoading && (
              <span style={{
                padding: '3px 7px', borderRadius: 4,
                background: 'rgba(245,130,10,0.1)', color: '#f5820a',
                fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.56rem',
                letterSpacing: '0.08em', whiteSpace: 'nowrap',
              }}>
                {isMonthIncomplete ? `${visibleTickets.length}+` : visibleTickets.length}{' '}
                {visibleTickets.length === 1 ? 'ticket' : 'tickets'}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExportDisabled}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              minHeight: 32, padding: '6px 10px', borderRadius: 6,
              border: '1px solid rgba(245,130,10,0.3)',
              background: 'rgba(245,130,10,0.08)', color: '#f5820a',
              fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem',
              letterSpacing: '0.06em', cursor: isExportDisabled ? 'not-allowed' : 'pointer',
              opacity: isExportDisabled ? 0.45 : 1,
            }}
          >
            <Download size={14} strokeWidth={1.8} />
            {isExporting ? 'Exportando…' : 'Exportar'}
          </button>
        </div>
        {isMonthIncomplete && (
          <DataLimitWarning>
            Detalle potencialmente incompleto: la consulta alcanzó el límite de 1.000 filas de PostgREST. La tabla puede omitir tickets y la exportación está deshabilitada para evitar un archivo engañoso.
          </DataLimitWarning>
        )}
        {exportError && (
          <p role="alert" style={{
            margin: '0 0 12px', color: '#fca5a5',
            fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem',
          }}>
            {exportError}
          </p>
        )}
        {isLoading || isMonthDetailLoading
          ? <Skel h={180} />
          : <TopTicketsTable rows={visibleTickets} sort={ticketSort} onSort={handleTicketSort} />}
      </div>

      {/* Auto insight */}
      {!isLoading && kpis.plataTotal > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.05)',
          border: '1px solid rgba(239,68,68,0.14)',
          borderLeft: '3px solid #ef4444',
          borderRadius: '0 12px 12px 0',
          padding: '14px 18px',
        }}>
          <p style={{
            margin: 0, fontFamily: 'var(--font-body)',
            fontSize: '0.78rem', lineHeight: 1.55,
            color: 'rgba(255,255,255,0.62)',
          }}>
            En <strong style={{ color: '#f5820a' }}>{fmtMonth(effectiveMonth)}</strong> perdiste{' '}
            <strong style={{ color: '#ef4444' }}>{fmtMillones(kpis.plataTotal)}</strong> en descuentos —{' '}
            <strong style={{ color: '#f5820a' }}>{fmtPct(kpis.pctTickets)}</strong> de tus tickets
            tuvieron algún tipo de descuento. La tasa efectiva fue{' '}
            <strong style={{ color: '#f5820a' }}>{fmtEffectiveRate(kpis.effectiveRate)}</strong> sobre el precio de lista.{' '}
            {kpis.pctTickets > 20
              ? 'El nivel de descuentos es alto — revisá si están generando retorno real en volumen.'
              : 'El nivel es moderado — controlá que se estén aplicando con criterio.'}
          </p>
        </div>
      )}
    </div>
  )
}
