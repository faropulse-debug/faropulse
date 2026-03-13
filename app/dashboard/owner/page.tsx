'use client'

import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { useAuth } from '@/hooks/useAuth'

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const mockData = {
  kpis: {
    resultadoNeto: {
      label: 'Resultado Neto',
      unit: '% sobre ventas',
      valores: [
        { mes: 'Oct', valor: 8.2 },
        { mes: 'Nov', valor: 6.1 },
        { mes: 'Dic', valor: 11.4 },
      ],
      benchmark: 8,
      meta: 12,
    },
    puntoEquilibrioDiario: {
      label: 'Punto de Equilibrio Diario',
      unit: 'ARS $',
      valores: [
        { mes: 'Oct', valor: 142000 },
        { mes: 'Nov', valor: 156000 },
        { mes: 'Dic', valor: 149000 },
      ],
      ventaPromedioReal: [148000, 162000, 198000],
    },
    ticketPromedio: {
      label: 'Ticket Promedio',
      unit: 'ARS $ por documento',
      valores: [
        { mes: 'Oct', valor: 4200 },
        { mes: 'Nov', valor: 4650 },
        { mes: 'Dic', valor: 5100 },
      ],
      meta: 5500,
    },
    margenBrutoCanal: {
      label: 'Margen Bruto por Canal',
      unit: '%',
      valores: [
        { mes: 'Oct', salon: 68, delivery: 41, takeaway: 55 },
        { mes: 'Nov', salon: 67, delivery: 39, takeaway: 54 },
        { mes: 'Dic', salon: 70, delivery: 43, takeaway: 57 },
      ],
      benchmark: { salon: 65, delivery: 45, takeaway: 55 },
    },
    costoLaboral: {
      label: 'Costo Laboral',
      unit: '% sobre ventas',
      valores: [
        { mes: 'Oct', valor: 28.4 },
        { mes: 'Nov', valor: 31.2 },
        { mes: 'Dic', valor: 26.8 },
      ],
      alertaMax: 32,
      benchmark: 28,
    },
  },
}

// ─── PROJECTION ───────────────────────────────────────────────────────────────

function calcularProyeccion(valores: number[]): number {
  const n = valores.length
  const sumX = (n * (n - 1)) / 2
  const sumY = valores.reduce((a, b) => a + b, 0)
  const sumXY = valores.reduce((acc, v, i) => acc + i * v, 0)
  const sumX2 = valores.reduce((acc, _, i) => acc + i * i, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  return intercept + slope * n
}

// ─── SEMAPHORE ────────────────────────────────────────────────────────────────

type SemColor = 'green' | 'yellow' | 'red'
const SEM_COLORS: Record<SemColor, string> = {
  green:  '#22c55e',
  yellow: '#f59e0b',
  red:    '#ef4444',
}
const SEM_GLOW: Record<SemColor, string> = {
  green:  'rgba(34,197,94,0.18)',
  yellow: 'rgba(245,158,11,0.18)',
  red:    'rgba(239,68,68,0.18)',
}

function semResultadoNeto(v: number): SemColor {
  return v >= 8 ? 'green' : v >= 4 ? 'yellow' : 'red'
}
function semPE(venta: number, pe: number): SemColor {
  return venta > pe * 1.15 ? 'green' : venta >= pe ? 'yellow' : 'red'
}
function semTicket(v: number, meta: number): SemColor {
  return v >= meta ? 'green' : v >= meta * 0.85 ? 'yellow' : 'red'
}
function semDelivery(v: number): SemColor {
  return v >= 45 ? 'green' : v >= 38 ? 'yellow' : 'red'
}
function semLaboral(v: number): SemColor {
  return v <= 28 ? 'green' : v <= 32 ? 'yellow' : 'red'
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function fmtPeso(v: number) {
  return '$' + v.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}
function fmtPct(v: number) {
  return v.toFixed(1) + '%'
}
function delta(curr: number, prev: number) {
  const d = curr - prev
  const sign = d > 0 ? '+' : ''
  return { d, sign }
}

// ─── CHART THEME ──────────────────────────────────────────────────────────────

const GRID_STROKE   = 'rgba(255,255,255,0.05)'
const AXIS_TICK     = { fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'var(--font-body)' }
const AMBER         = '#f5820a'
const AMBER_LIGHT   = '#fba94c'
const BLUE_GRAY     = '#6b9cc8'
const WHITE_SOFT    = 'rgba(255,255,255,0.7)'

const customTooltipStyle: React.CSSProperties = {
  background: 'rgba(10,12,15,0.96)',
  border: `1px solid rgba(245,130,10,0.35)`,
  borderRadius: '10px',
  padding: '10px 14px',
  fontFamily: 'var(--font-body)',
  fontSize: '12px',
  color: 'rgba(255,255,255,0.85)',
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const W = 64, H = 24, PAD = 2
  const pts = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2)
    return `${x},${y}`
  })
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
      {pts.map((p, i) => {
        const [x, y] = p.split(',').map(Number)
        return <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 2.5 : 1.5} fill={color} opacity={i === pts.length - 1 ? 1 : 0.5} />
      })}
    </svg>
  )
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  unit: string
  value: string
  prevValue: number
  currValue: number
  sem: SemColor
  sparkValues: number[]
  formatDelta?: (d: number) => string
}

function KpiCard({ label, unit, value, prevValue, currValue, sem, sparkValues, formatDelta }: KpiCardProps) {
  const { d, sign } = delta(currValue, prevValue)
  const semColor = SEM_COLORS[sem]
  const semGlow  = SEM_GLOW[sem]
  const dStr = formatDelta ? formatDelta(Math.abs(d)) : (Math.abs(d) < 1 ? Math.abs(d).toFixed(1) + '%' : fmtPeso(Math.abs(d)))
  const isUp = d >= 0

  return (
    <div style={{
      position: 'relative',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '16px',
      backdropFilter: 'blur(20px)',
      padding: '22px 20px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      boxShadow: `0 0 20px ${semGlow}`,
      overflow: 'hidden',
    }}>
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${semColor}66, transparent)`,
      }} />

      {/* Semaphore badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '0.6rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.4)',
        }}>{label}</span>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%',
          background: semColor,
          boxShadow: `0 0 8px ${semColor}, 0 0 16px ${semColor}55`,
        }} />
      </div>

      {/* Value */}
      <div style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 700,
        fontSize: '1.75rem',
        lineHeight: 1,
        color: 'rgba(255,255,255,0.92)',
        letterSpacing: '-0.02em',
      }}>{value}</div>

      {/* Delta + unit */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.72rem',
          color: isUp ? '#22c55e' : '#ef4444',
          display: 'flex', alignItems: 'center', gap: '3px',
        }}>
          <span style={{ fontSize: '0.85rem' }}>{isUp ? '↑' : '↓'}</span>
          {sign}{dStr}
        </span>
        <Sparkline values={sparkValues} color={semColor} />
      </div>

      {/* Unit */}
      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.63rem',
        color: 'rgba(255,255,255,0.28)',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
      }}>{unit}</div>
    </div>
  )
}

// ─── INSIGHT BOX ─────────────────────────────────────────────────────────────

function InsightBox({ text }: { text: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      background: 'rgba(245,130,10,0.06)',
      borderLeft: '2px solid #f5820a',
      borderRadius: '0 8px 8px 0',
      padding: '10px 14px',
      marginTop: '12px',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: '1px' }}>
        <path d="M9 18h6M10 22h4M12 2a7 7 0 017 7c0 2.5-1.3 4.7-3.3 6L15 17H9l-.7-2C6.3 13.7 5 11.5 5 9a7 7 0 017-7z" stroke="#f5820a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.78rem',
        color: 'rgba(255,255,255,0.55)',
        lineHeight: 1.5,
      }}>{text}</span>
    </div>
  )
}

// ─── CHART CARD ───────────────────────────────────────────────────────────────

function ChartCard({ title, children, insight }: { title: string; children: React.ReactNode; insight: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '16px',
      backdropFilter: 'blur(20px)',
      padding: '24px',
    }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: '0.68rem',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.5)',
        marginBottom: '20px',
      }}>{title}</div>
      {children}
      <InsightBox text={insight} />
    </div>
  )
}

// ─── CUSTOM TOOLTIP ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={customTooltipStyle}>
      <div style={{ color: AMBER, fontFamily: 'var(--font-display)', letterSpacing: '0.1em', marginBottom: '6px', fontSize: '11px' }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '2px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color || AMBER }} />
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{formatter ? formatter(p.value, p.name) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function OwnerDashboard() {
  const { user } = useAuth()
  const nombre = user?.profile.full_name?.split(' ')[0] ?? 'Propietario'

  const today = new Date()
  const hora  = today.getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'
  const fechaStr = today.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // ── Derived data ────────────────────────────────────────────────────────────

  const rn = mockData.kpis.resultadoNeto
  const rnValues = rn.valores.map(v => v.valor)
  const rnProj   = calcularProyeccion(rnValues)
  const rnLast   = rnValues[rnValues.length - 1]
  const rnPrev   = rnValues[rnValues.length - 2]
  const rnChartData = [
    ...rn.valores.map(v => ({ mes: v.mes, valor: v.valor, proj: null as number | null })),
    { mes: 'Ene', valor: null as number | null, proj: parseFloat(rnProj.toFixed(1)) },
  ]

  const pe = mockData.kpis.puntoEquilibrioDiario
  const peValues = pe.valores.map(v => v.valor)
  const peLast   = peValues[peValues.length - 1]
  const pePrev   = peValues[peValues.length - 2]
  const ventaLast = pe.ventaPromedioReal[pe.ventaPromedioReal.length - 1]
  const ventaPrev = pe.ventaPromedioReal[pe.ventaPromedioReal.length - 2]
  const peProjPE   = calcularProyeccion(peValues)
  const peProjVenta = calcularProyeccion(pe.ventaPromedioReal)
  const peChartData = [
    ...pe.valores.map((v, i) => ({ mes: v.mes, pe: v.valor, venta: pe.ventaPromedioReal[i], projPE: null as number | null, projVenta: null as number | null })),
    { mes: 'Ene', pe: null, venta: null, projPE: Math.round(peProjPE), projVenta: Math.round(peProjVenta) },
  ]

  const tp = mockData.kpis.ticketPromedio
  const tpValues = tp.valores.map(v => v.valor)
  const tpLast   = tpValues[tpValues.length - 1]
  const tpPrev   = tpValues[tpValues.length - 2]
  const tpProj   = calcularProyeccion(tpValues)
  const tpChartData = [
    ...tp.valores.map(v => ({ mes: v.mes, valor: v.valor, proj: null as number | null })),
    { mes: 'Ene', valor: null as number | null, proj: Math.round(tpProj) },
  ]

  const mc = mockData.kpis.margenBrutoCanal
  const mcDeliveryLast = mc.valores[mc.valores.length - 1].delivery
  const mcSalonLast    = mc.valores[mc.valores.length - 1].salon
  const mcTakeawayLast = mc.valores[mc.valores.length - 1].takeaway
  const mcProjSalon    = calcularProyeccion(mc.valores.map(v => v.salon))
  const mcProjDelivery = calcularProyeccion(mc.valores.map(v => v.delivery))
  const mcProjTakeaway = calcularProyeccion(mc.valores.map(v => v.takeaway))
  const mcChartData = [
    ...mc.valores.map(v => ({
      mes: v.mes, salon: v.salon, delivery: v.delivery, takeaway: v.takeaway,
      pSalon: null as number | null, pDelivery: null as number | null, pTakeaway: null as number | null,
    })),
    {
      mes: 'Ene', salon: null, delivery: null, takeaway: null,
      pSalon: parseFloat(mcProjSalon.toFixed(1)),
      pDelivery: parseFloat(mcProjDelivery.toFixed(1)),
      pTakeaway: parseFloat(mcProjTakeaway.toFixed(1)),
    },
  ]

  const cl = mockData.kpis.costoLaboral
  const clValues = cl.valores.map(v => v.valor)
  const clLast   = clValues[clValues.length - 1]
  const clPrev   = clValues[clValues.length - 2]
  const clProj   = calcularProyeccion(clValues)
  const clChartData = [
    ...cl.valores.map(v => ({ mes: v.mes, valor: v.valor, proj: null as number | null })),
    { mes: 'Ene', valor: null as number | null, proj: parseFloat(clProj.toFixed(1)) },
  ]

  // ── Semaphores ────────────────────────────────────────────────────────────────
  const semRN  = semResultadoNeto(rnLast)
  const semPEv = semPE(ventaLast, peLast)
  const semTP  = semTicket(tpLast, tp.meta)
  const semMC  = semDelivery(mcDeliveryLast)
  const semCL  = semLaboral(clLast)

  // ── Insights ─────────────────────────────────────────────────────────────────
  const insRN  = rnProj > rnLast
    ? `Tendencia positiva: proyectás cerrar Enero en ${rnProj.toFixed(1)}%`
    : 'Atención: la tendencia indica compresión de margen en Enero'

  const colchon = ventaLast - peLast
  const insPE   = ventaLast > peLast * 1.2
    ? `Operás con colchón saludable. Margen de seguridad: ${fmtPeso(colchon)}/día`
    : `Márgenes ajustados. Revisá costos fijos antes de Enero`

  const tpPctGrowth = (((tpLast - tpValues[0]) / tpValues[0]) * 100).toFixed(1)
  const insTP   = tpLast > tpPrev
    ? `El ticket creció ${tpPctGrowth}% en 3 meses. Proyección: ${fmtPeso(Math.round(tpProj))} en Enero`
    : 'Ticket estancado. Considerá mix de productos o precio'

  const insMC   = mcDeliveryLast < 40
    ? `Delivery por debajo del umbral rentable (40%). Revisá comisión de app`
    : `Canal delivery operando en zona saludable (${mcDeliveryLast}%)`

  const insCL   = clLast > 30
    ? `Costo laboral elevado. Revisá dotación vs demanda real por turno`
    : `Eficiencia laboral dentro del benchmark del sector (${clLast}%)`

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0c0f',
      fontFamily: 'var(--font-body)',
      padding: '0',
    }}>
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(10,12,15,0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          {/* Left: logo + local name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '7px', height: '7px', borderRadius: '50%', background: '#f5820a',
                boxShadow: '0 0 8px rgba(245,130,10,0.8)',
              }} />
              <span style={{
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
                letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)',
              }}>FARO<span style={{ color: '#f5820a' }}>PULSE</span></span>
            </div>
            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)',
            }}>Pizzería Popular Ituzaingó</span>
          </div>

          {/* Right: period selector + export + user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <select style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '8px', padding: '6px 12px', color: 'rgba(255,255,255,0.6)',
              fontFamily: 'var(--font-body)', fontSize: '0.75rem', cursor: 'pointer', outline: 'none',
            }}>
              <option>Oct — Dic 2024</option>
              <option>Jul — Sep 2024</option>
            </select>

            <button style={{
              background: 'transparent', border: '1px solid rgba(245,130,10,0.4)',
              borderRadius: '8px', padding: '6px 14px', color: '#f5820a',
              fontFamily: 'var(--font-display)', fontSize: '0.62rem', letterSpacing: '0.15em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>
              Exportar resumen
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'rgba(245,130,10,0.15)', border: '1px solid rgba(245,130,10,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.75rem', color: '#f5820a',
              }}>
                {nombre[0]?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.2 }}>{nombre}</div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: '0.55rem', letterSpacing: '0.15em',
                  textTransform: 'uppercase', color: '#f5820a', lineHeight: 1,
                }}>Propietario</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 32px' }}>

        {/* Page title */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 600,
              fontSize: 'clamp(1.4rem, 2.5vw, 1.9rem)', letterSpacing: '0.04em',
              color: 'rgba(255,255,255,0.9)', margin: 0,
            }}>
              {saludo}, {nombre}
            </h1>
            <span style={{
              background: 'rgba(245,130,10,0.12)', border: '1px solid rgba(245,130,10,0.3)',
              borderRadius: '6px', padding: '3px 10px',
              fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.2em',
              textTransform: 'uppercase', color: '#f5820a',
            }}>Vista Dueño</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)' }}>
              {fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1)}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)' }}>
              Resumen estratégico · Últimos 3 meses
            </span>
          </div>
        </div>

        {/* ── SECTION LABEL ─── */}
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.25em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)',
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span>Indicadores clave</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
        </div>

        {/* ── KPI CARDS ──────────────────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '48px',
        }}>
          <KpiCard
            label={rn.label}
            unit={rn.unit}
            value={fmtPct(rnLast)}
            prevValue={rnPrev}
            currValue={rnLast}
            sem={semRN}
            sparkValues={rnValues}
            formatDelta={v => v.toFixed(1) + ' pp'}
          />
          <KpiCard
            label={pe.label}
            unit={pe.unit}
            value={fmtPeso(peLast)}
            prevValue={pePrev}
            currValue={peLast}
            sem={semPEv}
            sparkValues={peValues}
            formatDelta={v => fmtPeso(v)}
          />
          <KpiCard
            label={tp.label}
            unit={tp.unit}
            value={fmtPeso(tpLast)}
            prevValue={tpPrev}
            currValue={tpLast}
            sem={semTP}
            sparkValues={tpValues}
            formatDelta={v => fmtPeso(v)}
          />
          <KpiCard
            label="Margen Delivery"
            unit="% margen bruto canal"
            value={fmtPct(mcDeliveryLast)}
            prevValue={mc.valores[mc.valores.length - 2].delivery}
            currValue={mcDeliveryLast}
            sem={semMC}
            sparkValues={mc.valores.map(v => v.delivery)}
            formatDelta={v => v.toFixed(1) + ' pp'}
          />
          <KpiCard
            label={cl.label}
            unit={cl.unit}
            value={fmtPct(clLast)}
            prevValue={clPrev}
            currValue={clLast}
            sem={semCL}
            sparkValues={clValues}
            formatDelta={v => v.toFixed(1) + ' pp'}
          />
        </div>

        {/* ── SECTION LABEL ─── */}
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.25em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)',
          marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span>Tendencias + proyección Enero</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
        </div>

        {/* ── CHARTS GRID ─────────────────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(540px, 1fr))',
          gap: '20px',
        }}>

          {/* CHART 1 — Resultado Neto */}
          <ChartCard title="Resultado Neto (%)" insight={insRN}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={rnChartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRN" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={AMBER} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={AMBER} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="mes" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip formatter={(v: number) => v?.toFixed(1) + '%'} />} />
                <ReferenceLine y={rn.benchmark} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 3"
                  label={{ value: `bench ${rn.benchmark}%`, fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'var(--font-body)' }} />
                <Area type="monotone" dataKey="valor" name="Resultado neto" stroke={AMBER} strokeWidth={2} fill="url(#gradRN)" dot={{ fill: AMBER, r: 3, strokeWidth: 0 }} connectNulls={false} />
                <Area type="monotone" dataKey="proj"  name="Proyección" stroke={AMBER_LIGHT} strokeWidth={2} strokeDasharray="5 3" fill="none"
                  dot={{ fill: AMBER_LIGHT, r: 4, strokeWidth: 0 }} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* CHART 2 — PE vs Venta Real */}
          <ChartCard title="Punto de Equilibrio vs Venta Real" insight={insPE}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={peChartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="mes" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                <Tooltip content={<CustomTooltip formatter={(v: number) => v ? fmtPeso(v) : '-'} />} />
                <Bar dataKey="pe"      name="PE diario"       fill={BLUE_GRAY}             radius={[4,4,0,0]} opacity={0.8} />
                <Bar dataKey="venta"   name="Venta promedio"  fill={AMBER}                 radius={[4,4,0,0]} />
                <Bar dataKey="projPE"    name="Proy. PE"      fill={BLUE_GRAY}             radius={[4,4,0,0]} opacity={0.4} />
                <Bar dataKey="projVenta" name="Proy. Venta"   fill={AMBER_LIGHT}           radius={[4,4,0,0]} opacity={0.5} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'rgba(255,255,255,0.45)', paddingTop: '8px' }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* CHART 3 — Ticket Promedio */}
          <ChartCard title="Ticket Promedio (ARS $)" insight={insTP}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={tpChartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradTP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={AMBER} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={AMBER} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="mes" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v / 1000).toFixed(1) + 'k'} domain={[3000, 7000]} />
                <Tooltip content={<CustomTooltip formatter={(v: number) => v ? fmtPeso(v) : '-'} />} />
                <ReferenceLine y={tp.meta} stroke="rgba(34,197,94,0.3)" strokeDasharray="4 3"
                  label={{ value: `meta ${fmtPeso(tp.meta)}`, fill: 'rgba(34,197,94,0.5)', fontSize: 10, fontFamily: 'var(--font-body)' }} />
                <Area type="monotone" dataKey="valor" name="Ticket promedio" stroke={AMBER} strokeWidth={2} fill="url(#gradTP)" dot={{ fill: AMBER, r: 3, strokeWidth: 0 }} connectNulls={false} />
                <Area type="monotone" dataKey="proj"  name="Proyección" stroke={AMBER_LIGHT} strokeWidth={2} strokeDasharray="5 3" fill="none"
                  dot={<ProjDot />} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* CHART 4 — Margen por Canal */}
          <ChartCard title="Margen Bruto por Canal (%)" insight={insMC}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={mcChartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="mes" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} domain={[30, 80]} />
                <Tooltip content={<CustomTooltip formatter={(v: number) => v?.toFixed(1) + '%'} />} />
                <Line type="monotone" dataKey="salon"    name="Salón"    stroke={AMBER}      strokeWidth={2} dot={{ r: 3, fill: AMBER,      strokeWidth: 0 }} connectNulls={false} />
                <Line type="monotone" dataKey="delivery" name="Delivery" stroke={BLUE_GRAY}  strokeWidth={2} dot={{ r: 3, fill: BLUE_GRAY,  strokeWidth: 0 }} connectNulls={false} />
                <Line type="monotone" dataKey="takeaway" name="Takeaway" stroke={WHITE_SOFT} strokeWidth={2} dot={{ r: 3, fill: WHITE_SOFT, strokeWidth: 0 }} connectNulls={false} />
                <Line type="monotone" dataKey="pSalon"    name="Proy. Salón"    stroke={AMBER}      strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3, fill: AMBER,      strokeWidth: 0 }} connectNulls={false} />
                <Line type="monotone" dataKey="pDelivery" name="Proy. Delivery" stroke={BLUE_GRAY}  strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3, fill: BLUE_GRAY,  strokeWidth: 0 }} connectNulls={false} />
                <Line type="monotone" dataKey="pTakeaway" name="Proy. Takeaway" stroke={WHITE_SOFT} strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3, fill: WHITE_SOFT, strokeWidth: 0 }} connectNulls={false} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'rgba(255,255,255,0.45)', paddingTop: '8px' }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* CHART 5 — Costo Laboral (full width) */}
          <div style={{ gridColumn: '1 / -1' }}>
            <ChartCard title="Costo Laboral (% sobre ventas)" insight={insCL}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={clChartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCL" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={clLast <= 28 ? '#22c55e' : clLast <= 32 ? '#f59e0b' : '#ef4444'} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={clLast <= 28 ? '#22c55e' : clLast <= 32 ? '#f59e0b' : '#ef4444'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="mes" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} domain={[20, 38]} />
                  <Tooltip content={<CustomTooltip formatter={(v: number) => v?.toFixed(1) + '%'} />} />
                  <ReferenceLine y={cl.alertaMax}  stroke="rgba(239,68,68,0.35)"  strokeDasharray="4 3"
                    label={{ value: `max ${cl.alertaMax}%`, fill: 'rgba(239,68,68,0.55)', fontSize: 10, fontFamily: 'var(--font-body)' }} />
                  <ReferenceLine y={cl.benchmark}  stroke="rgba(34,197,94,0.3)"   strokeDasharray="4 3"
                    label={{ value: `bench ${cl.benchmark}%`, fill: 'rgba(34,197,94,0.45)', fontSize: 10, fontFamily: 'var(--font-body)' }} />
                  <Area type="monotone" dataKey="valor" name="Costo laboral"
                    stroke={clLast <= 28 ? '#22c55e' : clLast <= 32 ? '#f59e0b' : '#ef4444'}
                    strokeWidth={2} fill="url(#gradCL)"
                    dot={{ fill: clLast <= 28 ? '#22c55e' : clLast <= 32 ? '#f59e0b' : '#ef4444', r: 3, strokeWidth: 0 }}
                    connectNulls={false} />
                  <Area type="monotone" dataKey="proj" name="Proyección"
                    stroke={clProj <= 28 ? '#22c55e' : clProj <= 32 ? '#f59e0b' : '#ef4444'}
                    strokeWidth={2} strokeDasharray="5 3" fill="none"
                    dot={{ fill: clProj <= 28 ? '#22c55e' : clProj <= 32 ? '#f59e0b' : '#ef4444', r: 4, strokeWidth: 0 }}
                    connectNulls={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── PULSING DOT FOR PROJECTION ───────────────────────────────────────────────

function ProjDot(props: any) {
  const { cx, cy, value } = props
  if (!value && value !== 0) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill="none" stroke={AMBER_LIGHT} strokeWidth={1.5} opacity={0.4}>
        <animate attributeName="r" values="6;10;6" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={4} fill={AMBER_LIGHT} />
    </g>
  )
}
