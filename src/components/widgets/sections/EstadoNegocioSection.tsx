'use client'

import { useState, useMemo }    from 'react'
import { useDashboardData }      from '@/hooks/useDashboardData'
import {
  BarChart, Bar, Cell, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { fmtMillones, fmtPeso }  from '@/lib/format'
import { SectionLabel }          from '@/components/dashboard/SectionLabel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthData { mes: string; ventas: number; tickets: number; comensales: number }

interface KpiResult {
  vsPrev:     number | null
  vsYearAgo:  number | null
  higherGood: boolean
}

interface WaterfallEntry {
  name:    string
  spacer:  number
  value:   number
  color:   string
  isTotal: boolean
  raw:     number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GREEN   = '#22c55e'
const RED     = '#ef4444'
const AMBER   = '#f5820a'
const NEUTRAL = 'rgba(255,255,255,0.22)'
const MUTED   = 'rgba(255,255,255,0.25)'

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

function lastCompleteMonth(months: string[]): string | null {
  if (!months.length) return null
  const sorted  = [...months].sort()
  const todayMo = new Date().toISOString().slice(0, 7)
  const last    = sorted.at(-1)!
  return last === todayMo ? (sorted.at(-2) ?? null) : last
}

function monthLabel(mo: string): string {
  const [y, m] = mo.split('-').map(Number)
  const names  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[m - 1]} ${y}`
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

function buildDiagnostico(efV: number, efT: number, varTotal: number, prevFact: number): string {
  const fmtP = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
  const pctV = prevFact > 0 ? (efV / prevFact) * 100 : 0
  const pctT = prevFact > 0 ? (efT / prevFact) * 100 : 0
  const dominaVol = Math.abs(efV) >= Math.abs(efT)

  if (varTotal >= 0) {
    return (
      `La facturación sube ${fmtMillones(Math.abs(varTotal))} vs mes anterior. ` +
      `Driver principal: ${dominaVol ? 'volumen' : 'ticket'} — ` +
      `volumen aportó ${fmtP(pctV)}, ticket ${fmtP(pctT)}.`
    )
  }
  const dominaLabel  = dominaVol ? 'volumen' : 'ticket'
  const segundoLabel = dominaVol ? 'ticket'   : 'volumen'
  return (
    `La caída es mayormente ${dominaLabel} (${fmtP(dominaVol ? pctV : pctT)}); ` +
    `${segundoLabel} aportó ${fmtP(dominaVol ? pctT : pctV)}.`
  )
}

function buildWaterfall(
  prevFact: number,
  efV:      number,
  efT:      number,
  curFact:  number,
): WaterfallEntry[] {
  const running2 = prevFact + efV
  return [
    { name: 'Mes ant.', spacer: 0,                                   value: prevFact,      color: NEUTRAL, isTotal: true,  raw: prevFact },
    { name: 'Volumen',  spacer: efV >= 0 ? prevFact : running2,      value: Math.abs(efV), color: efV >= 0 ? GREEN : RED,  isTotal: false, raw: efV  },
    { name: 'Ticket',   spacer: efT >= 0 ? running2 : curFact,       value: Math.abs(efT), color: efT >= 0 ? GREEN : RED,  isTotal: false, raw: efT  },
    { name: 'Mes act.', spacer: 0,                                   value: curFact,       color: NEUTRAL, isTotal: true,  raw: curFact  },
  ]
}

// ─── Delta badge ──────────────────────────────────────────────────────────────

function deltaColor(pctChange: number, higherGood: boolean): string {
  return (higherGood ? pctChange >= 0 : pctChange <= 0) ? GREEN : RED
}

function DeltaBadge({ label, pctChange, higherGood }: { label: string; pctChange: number | null; higherGood: boolean }) {
  if (pctChange === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: '0.6rem', color: MUTED, letterSpacing: '0.08em' }}>{label}</span>
        <span style={{ fontSize: '0.65rem', color: MUTED }}>—</span>
      </div>
    )
  }
  const color = deltaColor(pctChange, higherGood)
  const arrow = pctChange >= 0 ? '↑' : '↓'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontSize: '0.6rem', color: MUTED, letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: '0.72rem', color, fontWeight: 600 }}>{arrow}{Math.abs(pctChange).toFixed(1)}%</span>
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function EjecutivoKpiCard({ label, value, kpi }: { label: string; value: string | null; kpi: KpiResult }) {
  const semColor =
    kpi.vsPrev === null ? `${AMBER}88`
    : deltaColor(kpi.vsPrev, kpi.higherGood)
  const glowColor =
    kpi.vsPrev === null ? 'rgba(245,130,10,0.06)'
    : kpi.vsPrev >= 0 === kpi.higherGood ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.08)'

  return (
    <div style={{
      position: 'relative',
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '16px',
      backdropFilter: 'blur(16px)',
      padding: '20px 18px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      boxShadow: `0 0 20px ${glowColor}`,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '12%', right: '12%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${semColor}55, transparent)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.58rem',
          letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)',
        }}>{label}</span>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: semColor, boxShadow: `0 0 6px ${semColor}`,
        }} />
      </div>

      <div style={{
        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '1.8rem',
        lineHeight: 1, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.02em',
      }}>
        {value ?? '—'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: 'auto' }}>
        <DeltaBadge label="vs mes ant." pctChange={kpi.vsPrev}    higherGood={kpi.higherGood} />
        <DeltaBadge label="vs año ant." pctChange={kpi.vsYearAgo} higherGood={kpi.higherGood} />
      </div>
    </div>
  )
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: '16px', padding: '20px 18px', minHeight: '140px',
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
  // Show the most recent 6 months
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

// ─── Waterfall tooltip ────────────────────────────────────────────────────────

interface WFPayload { payload: WaterfallEntry }
function WFTooltip({ active, payload }: { active?: boolean; payload?: WFPayload[] }) {
  if (!active || !payload?.length) return null
  const entry = payload[0].payload
  const sign  = entry.isTotal ? '' : entry.raw >= 0 ? '+' : '−'
  return (
    <div style={{
      background: 'rgba(10,10,15,0.95)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', padding: '8px 12px',
      fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.62rem', marginBottom: '2px' }}>{entry.name}</div>
      <div style={{ color: entry.color, fontWeight: 700 }}>{sign}{fmtMillones(Math.abs(entry.raw))}</div>
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface Props { locationId: string }

export function EstadoNegocioSection({ locationId }: Props) {
  const { data, isLoading } = useDashboardData(locationId)

  // ── Available months ──
  const months = useMemo(
    () => (data?.ventasMensuales ?? []).map(m => m.mes).sort(),
    [data],
  )

  const defaultMonth = useMemo(() => lastCompleteMonth(months), [months])
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const currentMonth = selectedMonth ?? defaultMonth

  // ── Month lookup ──
  const byMonth = useMemo((): Map<string, MonthData> => {
    const map = new Map<string, MonthData>()
    for (const m of data?.ventasMensuales ?? []) map.set(m.mes, m)
    return map
  }, [data])

  const mes     = currentMonth ? byMonth.get(currentMonth)                ?? null : null
  const prevMes = currentMonth ? byMonth.get(prevMonthKey(currentMonth))  ?? null : null
  const yearAgo = currentMonth ? byMonth.get(yearAgoKey(currentMonth))    ?? null : null

  // ── KPI values (validated definitions) ──
  // Facturación = SUM(total) → ventasMensuales.ventas
  // Pedidos     = COUNT(*)   → ventasMensuales.tickets
  // Cubiertos   = SUM(comensales) salón → ventasMensuales.comensales (null outside salón already excluded)
  // Ticket      = Facturación / Pedidos (NOT avg of column)
  const facturacion = mes?.ventas      ?? null
  const pedidos     = mes?.tickets     ?? null
  const cubiertos   = mes?.comensales  ?? null
  const ticket      = pedidos && pedidos > 0 && facturacion != null ? facturacion / pedidos : null

  const prevFact  = prevMes?.ventas     ?? null
  const prevPed   = prevMes?.tickets    ?? null
  const prevCub   = prevMes?.comensales ?? null
  const prevTick  = prevPed && prevPed > 0 && prevFact != null ? prevFact / prevPed : null

  const yoFact    = yearAgo?.ventas     ?? null
  const yoPed     = yearAgo?.tickets    ?? null
  const yoCub     = yearAgo?.comensales ?? null
  const yoTick    = yoPed && yoPed > 0 && yoFact != null ? yoFact / yoPed : null

  const kpiFact = makeKpi(facturacion, prevFact, yoFact, true)
  const kpiPed  = makeKpi(pedidos,     prevPed,  yoPed,  true)
  const kpiCub  = makeKpi(cubiertos,   prevCub,  yoCub,  true)
  const kpiTick = makeKpi(ticket,      prevTick, yoTick, true)

  // ── Waterfall decomposition ──
  // efecto_volumen = (pedidos_mes − pedidos_prev) × ticket_prev
  // efecto_ticket  = (ticket_mes − ticket_prev)   × pedidos_mes
  // These sum EXACTLY to (facturacion − prevFact)
  const waterfall = useMemo((): WaterfallEntry[] | null => {
    if (
      facturacion == null || prevFact == null ||
      pedidos == null     || prevPed  == null ||
      ticket  == null     || prevTick == null
    ) return null
    const efV = (pedidos - prevPed) * prevTick
    const efT = (ticket  - prevTick) * pedidos
    return buildWaterfall(prevFact, efV, efT, facturacion)
  }, [facturacion, prevFact, pedidos, prevPed, ticket, prevTick])

  // ── Diagnóstico text ──
  const diagnostico = useMemo(() => {
    if (!waterfall || facturacion == null || prevFact == null) return null
    return buildDiagnostico(waterfall[1].raw, waterfall[2].raw, facturacion - prevFact, prevFact)
  }, [waterfall, facturacion, prevFact])

  // ── Estado global (semáforo header) ──
  const estadoColor = useMemo(() => {
    if (kpiFact.vsPrev === null) return `${AMBER}aa`
    if (kpiFact.vsPrev >= 0 && (kpiTick.vsPrev ?? 0) >= 0) return GREEN
    if (kpiFact.vsPrev < -10) return RED
    return '#f59e0b'
  }, [kpiFact.vsPrev, kpiTick.vsPrev])

  return (
    <div style={{ marginBottom: '52px' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }`}</style>

      {/* ── Header: título + semáforo + selector de mes ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: '20px', gap: '16px', flexWrap: 'wrap',
      }}>
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
        {months.length > 0 && (
          <MonthSelector months={months} value={currentMonth} onChange={setSelectedMonth} />
        )}
      </div>

      {/* ── 4 KPI cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
      }}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <EjecutivoKpiCard
              label="Facturación"
              value={facturacion != null ? fmtMillones(facturacion) : null}
              kpi={kpiFact}
            />
            <EjecutivoKpiCard
              label="Pedidos (documentos)"
              value={pedidos != null ? pedidos.toLocaleString('es-AR') : null}
              kpi={kpiPed}
            />
            <EjecutivoKpiCard
              label="Cubiertos (salón)"
              value={cubiertos != null ? cubiertos.toLocaleString('es-AR') : null}
              kpi={kpiCub}
            />
            <EjecutivoKpiCard
              label="Ticket Promedio"
              value={ticket != null ? fmtPeso(Math.round(ticket)) : null}
              kpi={kpiTick}
            />
          </>
        )}
      </div>

      {/* ── Diagnóstico ── */}
      {diagnostico && (
        <div style={{
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '20px',
          fontFamily: 'var(--font-body)',
          fontSize: '0.78rem',
          lineHeight: 1.55,
          color: 'rgba(255,255,255,0.65)',
        }}>
          <span style={{
            display: 'inline-block',
            fontFamily: 'var(--font-display)',
            fontSize: '0.55rem', letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.28)', marginRight: '8px',
          }}>Diagnóstico</span>
          {diagnostico}
        </div>
      )}

      {/* ── Waterfall: variación de facturación descompuesta ── */}
      {waterfall && (
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.55rem', letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.22)', marginBottom: '10px',
          }}>
            Variación vs mes anterior
          </div>
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={waterfall}
                barCategoryGap="30%"
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 10,
                    fill: 'rgba(255,255,255,0.35)',
                    letterSpacing: '0.08em',
                  }}
                />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip
                  content={<WFTooltip />}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                {/* invisible spacer positions each bar at the correct baseline */}
                <Bar dataKey="spacer" stackId="wf" fill="transparent" isAnimationActive={false} />
                {/* visible value bar, colored by sign */}
                <Bar dataKey="value" stackId="wf" radius={[4, 4, 0, 0]}>
                  {waterfall.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
