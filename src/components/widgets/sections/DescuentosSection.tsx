'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { getSupabase }            from '@/lib/supabase'
import { fmtMillones, fmtPct }   from '@/lib/format'
import { SectionLabel }           from '@/components/dashboard/SectionLabel'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RawDescuentosRow = {
  mes_inicio:            string
  tipo_zona:             string
  plata_perdida:         number
  tickets:               number
  tickets_con_descuento: number
  avg_descuento_pct:     number
}

export type TopTicketRow = {
  fecha_caja:    string
  tipo_zona:     string
  comensales:    number | null
  total:         number
  descuento:     number
  plata_perdida: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}
const CANAL_LABELS: Record<string, string> = {
  SALON: 'Salón', APLICACIONES: 'Apps', MOSTRADOR: 'Mostrador',
}

function fmtMonth(iso: string): string {
  const [y, m] = iso.slice(0, 7).split('-')
  return `${MONTH_LABELS[m] ?? m} ${y.slice(2)}`
}

function firstDayOfMonth(iso: string): string {
  return iso.slice(0, 7) + '-01'
}

function lastDayOfMonth(iso: string): string {
  const d = new Date(firstDayOfMonth(iso))
  d.setMonth(d.getMonth() + 1)
  d.setDate(0)
  return d.toISOString().slice(0, 10)
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
      display: 'flex', flexDirection: 'column', gap: 6,
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
          fontSize: '0.6rem', color: 'rgba(255,255,255,0.28)',
        }}>{sub}</span>
      )}
    </div>
  )
}

// ─── Canal Breakdown ──────────────────────────────────────────────────────────

function CanalBreakdown({ rows }: { rows: RawDescuentosRow[] }) {
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

// ─── Top Tickets Table ────────────────────────────────────────────────────────

function TopTicketsTable({ rows }: { rows: TopTicketRow[] }) {
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
  const headers = ['Fecha', 'Canal', 'Comensales', 'Total', 'Desc %', 'Perdido']
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.63rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {headers.map(h => (
              <th key={h} style={{
                padding: '7px 10px', textAlign: h === 'Fecha' || h === 'Canal' ? 'left' : 'right',
                color: 'rgba(255,255,255,0.28)', fontWeight: 400,
                letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.52rem',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.5)' }}>{r.fecha_caja}</td>
              <td style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.4)' }}>
                {CANAL_LABELS[r.tipo_zona] ?? r.tipo_zona}
              </td>
              <td style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>
                {r.comensales ?? '—'}
              </td>
              <td style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>
                {fmtMillones(r.total)}
              </td>
              <td style={{ padding: '7px 10px', color: '#f59e0b', fontWeight: 600, textAlign: 'right' }}>
                {fmtPct(r.descuento)}
              </td>
              <td style={{ padding: '7px 10px', color: '#ef4444', fontWeight: 600, textAlign: 'right' }}>
                {fmtMillones(r.plata_perdida)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
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
  const [resumen,    setResumen]    = useState<RawDescuentosRow[]>([])
  const [topTickets, setTopTickets] = useState<TopTicketRow[]>([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const hasDataRef = useRef(false)

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

  const loadTopTickets = useCallback(async () => {
    const { data, error } = await getSupabase().rpc('get_descuentos_top_tickets', {
      p_location_id: locationId,
      p_desde:       firstDayOfMonth(selectedMonth),
      p_hasta:       lastDayOfMonth(selectedMonth),
    })
    if (!error && Array.isArray(data)) {
      setTopTickets(data as TopTicketRow[])
    }
  }, [locationId, selectedMonth])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadResumen() }, [loadResumen])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadTopTickets() }, [loadTopTickets])

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

  const monthRows = useMemo(
    () => resumen.filter(r => r.mes_inicio === effectiveMonth),
    [resumen, effectiveMonth]
  )

  const kpis = useMemo(() => {
    const plataTotal     = monthRows.reduce((s, r) => s + r.plata_perdida, 0)
    const ticketsTotal   = monthRows.reduce((s, r) => s + r.tickets, 0)
    const ticketsConDesc = monthRows.reduce((s, r) => s + r.tickets_con_descuento, 0)
    const pctTickets     = ticketsTotal > 0 ? (ticketsConDesc / ticketsTotal) * 100 : 0
    const sumWeighted    = monthRows.reduce((s, r) => s + r.avg_descuento_pct * r.tickets_con_descuento, 0)
    const avgDescPct     = ticketsConDesc > 0 ? sumWeighted / ticketsConDesc : 0
    return { plataTotal, ticketsTotal, ticketsConDesc, pctTickets, avgDescPct }
  }, [monthRows])

  const barData = useMemo(() => {
    const byMonth: Record<string, number> = {}
    for (const r of resumen) {
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
    () => [...monthRows].sort((a, b) => b.plata_perdida - a.plata_perdida),
    [monthRows]
  )

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ marginBottom: '52px', opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.3s' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }`}</style>
      <SectionLabel>Análisis de Descuentos</SectionLabel>

      {/* Month selector */}
      {!isLoading && availableMonths.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
          {availableMonths.map(m => {
            const active = m === effectiveMonth
            return (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
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
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 24,
      }}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
              <Skel h={8} /><div style={{ height: 10 }} /><Skel h={28} />
            </div>
          ))
        ) : (
          <>
            <KpiCard label="Plata perdida"          value={fmtMillones(kpis.plataTotal)}    sub={fmtMonth(effectiveMonth)} color="#ef4444" />
            <KpiCard label="Tickets c/ descuento"   value={String(kpis.ticketsConDesc)}      sub={`de ${kpis.ticketsTotal} totales`} />
            <KpiCard label="% Tickets c/ descuento" value={fmtPct(kpis.pctTickets)} />
            <KpiCard label="Descuento promedio"      value={fmtPct(kpis.avgDescPct)}          sub="en tickets con desc." />
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

      {/* Top tickets */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, padding: '20px', marginBottom: 16,
      }}>
        <div style={{
          fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem',
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.28)', marginBottom: 16,
        }}>
          Top 10 tickets con mayor pérdida — {isLoading ? '…' : fmtMonth(effectiveMonth)}
        </div>
        {isLoading ? <Skel h={120} /> : <TopTicketsTable rows={topTickets} />}
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
            tuvieron algún tipo de descuento, con un promedio de{' '}
            <strong style={{ color: '#f5820a' }}>{fmtPct(kpis.avgDescPct)}</strong> por ticket.{' '}
            {kpis.pctTickets > 20
              ? 'El nivel de descuentos es alto — revisá si están generando retorno real en volumen.'
              : 'El nivel es moderado — controlá que se estén aplicando con criterio.'}
          </p>
        </div>
      )}
    </div>
  )
}
