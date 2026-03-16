'use client'

import { useState, useMemo } from 'react'
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useDashboardData } from '@/hooks/useDashboardData'
import { fmtPeso, fmtMillones, fmtPct } from '@/lib/format'
import { SectionLabel }    from '@/components/dashboard/SectionLabel'
import { KpiCard }         from '@/components/dashboard/KpiCard'
import { PulsoCard }       from '@/components/dashboard/PulsoCard'
import { PeriodoSelector, PERIODO_LABELS } from '@/components/dashboard/PeriodoSelector'
import { PEBarChart }      from '@/components/dashboard/PEBarChart'
import { InsightBox }      from '@/components/dashboard/InsightBox'
import { CustomTooltip }   from '@/components/dashboard/CustomTooltip'
import type { Periodo }    from '@/components/dashboard/PeriodoSelector'
import type { SemColor }   from '@/components/dashboard/KpiCard'

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DIAS_ES      = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

const AMBER       = '#f5820a'
const BLUE_GRAY   = '#6b9cc8'
const GRID_STROKE = 'rgba(255,255,255,0.05)'
const AXIS_TICK   = { fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'var(--font-body)' }

// ─── MOCK — SEMÁFORO (Sección 1) ──────────────────────────────────────────────

const mockSem = {
  resultadoNeto: {
    label: 'Resultado Neto', unit: '% sobre ventas',
    valores: [{ mes: 'Oct', valor: 8.2 }, { mes: 'Nov', valor: 6.1 }, { mes: 'Dic', valor: 11.4 }],
    benchmark: 8, meta: 12,
  },
  puntoEquilibrioDiario: {
    label: 'PE Diario', unit: 'ARS $',
    valores: [{ mes: 'Oct', valor: 142000 }, { mes: 'Nov', valor: 156000 }, { mes: 'Dic', valor: 149000 }],
    ventaPromedioReal: [148000, 162000, 198000],
  },
  ticketPromedio: {
    label: 'Ticket Promedio', unit: 'ARS $ por doc.',
    valores: [{ mes: 'Oct', valor: 4200 }, { mes: 'Nov', valor: 4650 }, { mes: 'Dic', valor: 5100 }],
    meta: 5500,
  },
  margenDelivery: {
    label: 'Margen Delivery', unit: '% margen bruto',
    valores: [{ mes: 'Oct', valor: 41 }, { mes: 'Nov', valor: 39 }, { mes: 'Dic', valor: 43 }],
  },
  costoLaboral: {
    label: 'Costo Laboral', unit: '% sobre ventas',
    valores: [{ mes: 'Oct', valor: 28.4 }, { mes: 'Nov', valor: 31.2 }, { mes: 'Dic', valor: 26.8 }],
    alertaMax: 32, benchmark: 28,
  },
}

// ─── PULSO DATA TYPE ──────────────────────────────────────────────────────────

interface PulsoDatos {
  ventas:           number
  resultadoNeto:    number | null
  tickets:          number
  comensalesTotal:  number
  ticketProm:       number
  ticketPorPersona: number | null
  vsAnterior:       { ventas: number; tickets: number }
}

// ─── MOCK — EL PULSO (Sección 2) ─────────────────────────────────────────────

const datosPorPeriodo: Record<Periodo, PulsoDatos> = {
  semana: {
    ventas: 19_800_000, resultadoNeto: null, tickets: 538,
    comensalesTotal: 1_526, ticketProm: 36_800, ticketPorPersona: 12_974,
    vsAnterior: { ventas: 8.2, tickets: 6.4 },
  },
  mes: {
    ventas: 82_100_000, resultadoNeto: null, tickets: 2_290,
    comensalesTotal: 6_780, ticketProm: 35_850, ticketPorPersona: 12_109,
    vsAnterior: { ventas: 57.0, tickets: 46.8 },
  },
  '6m': {
    ventas: 306_700_000, resultadoNeto: null, tickets: 9_870,
    comensalesTotal: 28_400, ticketProm: 31_075, ticketPorPersona: 10_800,
    vsAnterior: { ventas: 22.4, tickets: 19.2 },
  },
}

// ─── MOCK — PUNTO DE EQUILIBRIO (Sección 3) ───────────────────────────────────

const PE_MENSUAL = 11_800_000

const peData = {
  diario: [
    { label: 'Lun', ventas: 2_100_000, pe: 454_000 },
    { label: 'Mar', ventas:   890_000, pe: 454_000 },
    { label: 'Mié', ventas: 3_200_000, pe: 454_000 },
    { label: 'Jue', ventas: 4_100_000, pe: 454_000 },
    { label: 'Vie', ventas: 5_800_000, pe: 454_000 },
    { label: 'Sáb', ventas: 7_200_000, pe: 454_000 },
    { label: 'Dom', ventas:   320_000, pe: 454_000 },
  ],
  semanal: [
    { label: 'S1', ventas: 18_400_000, pe: 3_178_000 },
    { label: 'S2', ventas: 21_200_000, pe: 3_178_000 },
    { label: 'S3', ventas: 19_800_000, pe: 3_178_000 },
    { label: 'S4', ventas: 22_700_000, pe: 3_178_000 },
    { label: 'S5', ventas: 15_100_000, pe: 3_178_000 },
    { label: 'S6', ventas: 23_400_000, pe: 3_178_000 },
  ],
  mensual: [
    { label: 'Jul', ventas:  38_400_000, pe: 11_800_000 },
    { label: 'Ago', ventas:  41_200_000, pe: 11_800_000 },
    { label: 'Sep', ventas:  44_800_000, pe: 11_800_000 },
    { label: 'Oct', ventas:  47_900_000, pe: 11_800_000 },
    { label: 'Nov', ventas:  52_300_000, pe: 11_800_000 },
    { label: 'Dic', ventas:  82_100_000, pe: 11_800_000 },
  ],
  semestral: [
    { label: 'S1 2024', ventas: 198_000_000, pe: 70_800_000 },
    { label: 'S2 2024', ventas: 306_700_000, pe: 70_800_000 },
    { label: 'S1 2025', ventas: 265_000_000, pe: 70_800_000 },
    { label: 'S2 2025', ventas: 341_000_000, pe: 70_800_000 },
  ],
}

const peLineas = {
  diario:    { peMin:  280_000, peOperativo:   454_000, peIdeal:    516_000 },
  semanal:   { peMin: 1_960_000, peOperativo: 3_178_000, peIdeal:  3_610_000 },
  mensual:   { peMin: 8_500_000, peOperativo: 11_800_000, peIdeal: 13_400_000 },
  semestral: { peMin: 51_000_000, peOperativo: 70_800_000, peIdeal: 80_400_000 },
}

// ─── MOCK — EVOLUTIVO 6 MESES (Sección 4) ────────────────────────────────────

const evolutivo6m = [
  { mes: 'Ago', ventas: 52_000_000, resultado: 28_600_000, pe: 11_000_000 },
  { mes: 'Sep', ventas: 60_500_000, resultado: 34_100_000, pe: 11_200_000 },
  { mes: 'Oct', ventas: 55_200_000, resultado: 30_900_000, pe: 11_400_000 },
  { mes: 'Nov', ventas: 68_400_000, resultado: 40_500_000, pe: 11_600_000 },
  { mes: 'Dic', ventas: 78_000_000, resultado: 48_600_000, pe: 11_700_000 },
  { mes: 'Ene', ventas: 82_100_000, resultado: 50_600_000, pe: 11_800_000 },
]

// ─── HELPERS ──────────────────────────────────────────────────────────────────

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

function semResultadoNeto(v: number): SemColor { return v >= 8 ? 'green' : v >= 4 ? 'yellow' : 'red' }
function semPE(venta: number, pe: number): SemColor { return venta > pe * 1.15 ? 'green' : venta >= pe ? 'yellow' : 'red' }
function semTicket(v: number, meta: number): SemColor { return v >= meta ? 'green' : v >= meta * 0.85 ? 'yellow' : 'red' }
function semDelivery(v: number): SemColor { return v >= 45 ? 'green' : v >= 38 ? 'yellow' : 'red' }
function semLaboral(v: number): SemColor { return v <= 28 ? 'green' : v <= 32 ? 'yellow' : 'red' }

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function OwnerDashboard() {
  const { user } = useAuth()
  const [periodo, setPeriodo] = useState<Periodo>('mes')

  const locationId = user?.activeMembership?.location_id
    ?? user?.activeMembership?.org_id
    ?? process.env.NEXT_PUBLIC_LOCATION_ID
    ?? ''
  const orgName = user?.activeMembership?.organization?.name ?? 'Dashboard'

  const { data: liveData, isLoading: dataLoading, error: dataError, lastUpdated, refetch } =
    useDashboardData(locationId)

  const nombre   = user?.profile.full_name?.split(' ')[0] ?? 'Propietario'
  const today    = new Date()
  const hora     = today.getHours()
  const saludo   = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'
  const fechaStr = today.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // ── Live data derivations ─────────────────────────────────────────────────

  const peDataLive = useMemo(() => {
    if (!liveData) return peData

    const diario = liveData.ventasDiarias.length > 0
      ? liveData.ventasDiarias.map(d => ({
          label: DIAS_ES[new Date(d.fecha + 'T12:00:00').getDay()],
          ventas: Number(d.ventas),
          pe: peLineas.diario.peOperativo,
        }))
      : peData.diario

    const semanal = liveData.ventasSemanales.length > 0
      ? liveData.ventasSemanales.map((d, i) => ({
          label: `S${i + 1}`,
          ventas: Number(d.ventas),
          pe: peLineas.semanal.peOperativo,
        }))
      : peData.semanal

    const mensual = liveData.financialResults.filter(r => r.concepto === 'VENTAS_NOCHE').length > 0
      ? liveData.financialResults
          .filter(r => r.concepto === 'VENTAS_NOCHE')
          .slice(-6)
          .map(r => ({
            label: MESES_CORTOS[parseInt(r.periodo.split('-')[1]) - 1],
            ventas: r.monto,
            pe: peLineas.mensual.peOperativo,
          }))
      : peData.mensual

    return { ...peData, diario, semanal, mensual }
  }, [liveData])

  const evolutivoLive = useMemo(() => {
    if (!liveData?.financialResults.length) return evolutivo6m

    const ventasMap:    Record<string, number> = {}
    const resultadoMap: Record<string, number> = {}
    for (const r of liveData.financialResults) {
      if (r.concepto === 'VENTAS_NOCHE')   ventasMap[r.periodo]    = r.monto
      if (r.concepto === 'RESULTADO_NETO') resultadoMap[r.periodo] = r.monto
    }
    const periods = [...new Set(liveData.financialResults.map(r => r.periodo))].sort().slice(-6)
    if (!periods.length) return evolutivo6m

    return periods.map(p => ({
      mes:       MESES_CORTOS[parseInt(p.split('-')[1]) - 1],
      ventas:    ventasMap[p]    ?? 0,
      resultado: resultadoMap[p] ?? 0,
      pe:        PE_MENSUAL,
    }))
  }, [liveData])

  const datosPorPeriodoLive = useMemo((): Record<Periodo, PulsoDatos> => {
    if (!liveData) return datosPorPeriodo

    const pct = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : 0
    const n   = (v: number | string) => Number(v)

    const semV = liveData.ventasDiarias.reduce((s, d) => s + n(d.ventas), 0)
    const semT = liveData.ventasDiarias.reduce((s, d) => s + n(d.tickets), 0)
    const semC = liveData.ventasDiarias.reduce((s, d) => s + n(d.comensales), 0)

    const mes     = liveData.ventasMensuales.at(-1)
    const prevMes = liveData.ventasMensuales.at(-2)
    const mesV = mes     ? n(mes.ventas)     : datosPorPeriodo.mes.ventas
    const mesT = mes     ? n(mes.tickets)    : datosPorPeriodo.mes.tickets
    const mesC = mes     ? n(mes.comensales) : datosPorPeriodo.mes.comensalesTotal
    const prevMesV = prevMes ? n(prevMes.ventas)  : 0
    const prevMesT = prevMes ? n(prevMes.tickets) : 0

    const s6V = liveData.ventasMensuales.reduce((s, d) => s + n(d.ventas), 0)
    const s6T = liveData.ventasMensuales.reduce((s, d) => s + n(d.tickets), 0)
    const s6C = liveData.ventasMensuales.reduce((s, d) => s + n(d.comensales), 0)
    const half = Math.floor(liveData.ventasMensuales.length / 2)
    const secondHalfV = liveData.ventasMensuales.slice(half).reduce((s, d) => s + n(d.ventas), 0)
    const firstHalfV  = liveData.ventasMensuales.slice(0, half).reduce((s, d) => s + n(d.ventas), 0)
    const secondHalfT = liveData.ventasMensuales.slice(half).reduce((s, d) => s + n(d.tickets), 0)
    const firstHalfT  = liveData.ventasMensuales.slice(0, half).reduce((s, d) => s + n(d.tickets), 0)

    return {
      semana: {
        ventas:           semV > 0 ? semV : datosPorPeriodo.semana.ventas,
        resultadoNeto:    null,
        tickets:          semT > 0 ? semT : datosPorPeriodo.semana.tickets,
        comensalesTotal:  semC,
        ticketProm:       semT > 0 ? semV / semT : datosPorPeriodo.semana.ticketProm,
        ticketPorPersona: semC > 0 ? semV / semC : null,
        vsAnterior:       { ventas: datosPorPeriodo.semana.vsAnterior.ventas, tickets: datosPorPeriodo.semana.vsAnterior.tickets },
      },
      mes: {
        ventas:           mesV,
        resultadoNeto:    null,
        tickets:          mesT,
        comensalesTotal:  mesC,
        ticketProm:       mesT > 0 ? mesV / mesT : datosPorPeriodo.mes.ticketProm,
        ticketPorPersona: mesC > 0 ? mesV / mesC : null,
        vsAnterior: {
          ventas:  prevMesV > 0 ? pct(mesV, prevMesV) : datosPorPeriodo.mes.vsAnterior.ventas,
          tickets: prevMesT > 0 ? pct(mesT, prevMesT) : datosPorPeriodo.mes.vsAnterior.tickets,
        },
      },
      '6m': {
        ventas:           s6V > 0 ? s6V : datosPorPeriodo['6m'].ventas,
        resultadoNeto:    null,
        tickets:          s6T > 0 ? s6T : datosPorPeriodo['6m'].tickets,
        comensalesTotal:  s6C,
        ticketProm:       s6T > 0 ? s6V / s6T : datosPorPeriodo['6m'].ticketProm,
        ticketPorPersona: s6C > 0 ? s6V / s6C : null,
        vsAnterior: {
          ventas:  firstHalfV > 0 ? pct(secondHalfV, firstHalfV) : datosPorPeriodo['6m'].vsAnterior.ventas,
          tickets: firstHalfT > 0 ? pct(secondHalfT, firstHalfT) : datosPorPeriodo['6m'].vsAnterior.tickets,
        },
      },
    }
  }, [liveData])

  // ── Sección 1: Semáforo ───────────────────────────────────────────────────

  const rn = mockSem.resultadoNeto
  const pe = mockSem.puntoEquilibrioDiario
  const tp = mockSem.ticketPromedio
  const md = mockSem.margenDelivery
  const cl = mockSem.costoLaboral

  const rnValues = rn.valores.map(v => v.valor)
  const peValues = pe.valores.map(v => v.valor)
  const tpValues = tp.valores.map(v => v.valor)
  const mdValues = md.valores.map(v => v.valor)
  const clValues = cl.valores.map(v => v.valor)

  const rnLast    = rnValues[rnValues.length - 1]
  const rnPrev    = rnValues[rnValues.length - 2]
  const peLast    = peValues[peValues.length - 1]
  const pePrev    = peValues[peValues.length - 2]
  const ventaLast = pe.ventaPromedioReal[pe.ventaPromedioReal.length - 1]
  const tpLast    = tpValues[tpValues.length - 1]
  const tpPrev    = tpValues[tpValues.length - 2]
  const mdLast    = mdValues[mdValues.length - 1]
  const mdPrev    = mdValues[mdValues.length - 2]
  const clLast    = clValues[clValues.length - 1]
  const clPrev    = clValues[clValues.length - 2]

  const semRN  = semResultadoNeto(rnLast)
  const semPEv = semPE(ventaLast, peLast)
  const semTP  = semTicket(tpLast, tp.meta)
  const semMD  = semDelivery(mdLast)
  const semCL  = semLaboral(clLast)

  // ── Sección 2: El Pulso ───────────────────────────────────────────────────

  const datos = datosPorPeriodoLive[periodo]

  // ── Sección 5: Insights ───────────────────────────────────────────────────

  const rnProj        = calcularProyeccion(rnValues)
  const colchonPE     = ventaLast - peLast
  const tpPctGrowth   = (((tpLast - tpValues[0]) / tpValues[0]) * 100).toFixed(1)

  const insights: Array<{ text: string; type: 'info' | 'warning' | 'positive' }> = [
    {
      text: rnProj > rnLast
        ? `Tendencia positiva en resultado neto: proyectás cerrar el mes siguiente en ${rnProj.toFixed(1)}%`
        : 'Atención: la tendencia indica compresión de margen en el próximo mes',
      type: rnProj > rnLast ? 'positive' : 'warning',
    },
    {
      text: ventaLast > peLast * 1.2
        ? `Operás con colchón saludable sobre el PE diario. Margen de seguridad: ${fmtPeso(colchonPE)}/día`
        : 'Márgenes ajustados sobre el PE. Revisá costos fijos',
      type: ventaLast > peLast * 1.2 ? 'positive' : 'warning',
    },
    {
      text: tpLast > tpPrev
        ? `El ticket promedio creció ${tpPctGrowth}% en 3 meses. Proyección: ${fmtPeso(Math.round(calcularProyeccion(tpValues)))} próximo mes`
        : 'Ticket promedio estancado. Considerá mix de productos o ajuste de precios',
      type: tpLast > tpPrev ? 'positive' : 'info',
    },
    {
      text: mdLast < 40
        ? `Margen delivery por debajo del umbral rentable (40%). Revisá comisión de la plataforma`
        : `Canal delivery operando en zona saludable (${mdLast}%)`,
      type: mdLast < 40 ? 'warning' : 'positive',
    },
    {
      text: clLast > 30
        ? `Costo laboral elevado (${fmtPct(clLast)}). Revisá dotación vs demanda real por turno`
        : `Eficiencia laboral dentro del benchmark del sector (${fmtPct(clLast)})`,
      type: clLast > 30 ? 'warning' : 'positive',
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c0f', fontFamily: 'var(--font-body)' }}>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(10,12,15,0.9)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          {/* Left */}
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
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
              {orgName}
            </span>
          </div>

          {/* Right: period selector + actions + user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <PeriodoSelector value={periodo} onChange={setPeriodo} />

            {/* Refetch + timestamp */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {lastUpdated && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)' }}>
                  {lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {dataError && (
                <span style={{
                  fontFamily: 'var(--font-display)', fontSize: '0.55rem', letterSpacing: '0.1em',
                  color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: '4px', padding: '2px 6px',
                }}>mock</span>
              )}
              <button
                onClick={refetch}
                disabled={dataLoading}
                title="Actualizar datos"
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px', padding: '5px 8px', cursor: dataLoading ? 'default' : 'pointer',
                  color: 'rgba(255,255,255,0.35)', opacity: dataLoading ? 0.5 : 1, transition: 'all 0.15s',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ display: 'block', animation: dataLoading ? 'fp-spin 1s linear infinite' : 'none' }}>
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
              </button>
            </div>

            <Link href="/dashboard/owner/upload" style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px', padding: '6px 12px', color: 'rgba(255,255,255,0.55)',
              fontFamily: 'var(--font-display)', fontSize: '0.62rem', letterSpacing: '0.15em',
              textTransform: 'uppercase', cursor: 'pointer', textDecoration: 'none', transition: 'all 0.15s',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Cargar datos
            </Link>

            <button
              disabled
              title="Próximamente"
              style={{
                background: 'transparent', border: '1px solid rgba(245,130,10,0.25)',
                borderRadius: '8px', padding: '6px 14px', color: 'rgba(245,130,10,0.4)',
                fontFamily: 'var(--font-display)', fontSize: '0.62rem', letterSpacing: '0.15em',
                textTransform: 'uppercase', cursor: 'not-allowed', opacity: 0.6,
              }}
            >
              Exportar
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'rgba(245,130,10,0.15)', border: '1px solid rgba(245,130,10,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.75rem', color: '#f5820a',
              }}>{nombre[0]?.toUpperCase()}</div>
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

      {/* ── CONTENT ─────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 32px' }}>

        {/* Page title */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 600,
              fontSize: 'clamp(1.4rem, 2.5vw, 1.9rem)', letterSpacing: '0.04em',
              color: 'rgba(255,255,255,0.9)', margin: 0,
            }}>{saludo}, {nombre}</h1>
            <span style={{
              background: 'rgba(245,130,10,0.12)', border: '1px solid rgba(245,130,10,0.3)',
              borderRadius: '6px', padding: '3px 10px',
              fontFamily: 'var(--font-display)', fontSize: '0.6rem', letterSpacing: '0.2em',
              textTransform: 'uppercase', color: '#f5820a',
            }}>Vista Dueño</span>
          </div>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'rgba(255,255,255,0.32)' }}>
            {fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1)}
          </span>
        </div>

        {/* ══ SECCIÓN 1 — SEMÁFORO HERO ════════════════════════════════════════ */}
        <div style={{ marginBottom: '52px' }}>
          <SectionLabel>Estado del negocio</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            <KpiCard label={rn.label} unit={rn.unit} value={fmtPct(rnLast)}
              prevValue={rnPrev} currValue={rnLast} sem={semRN} sparkValues={rnValues}
              formatDelta={v => v.toFixed(1) + ' pp'} />
            <KpiCard label={pe.label} unit={pe.unit} value={fmtPeso(peLast)}
              prevValue={pePrev} currValue={peLast} sem={semPEv} sparkValues={peValues}
              formatDelta={v => fmtPeso(v)} />
            <KpiCard label={tp.label} unit={tp.unit} value={fmtPeso(tpLast)}
              prevValue={tpPrev} currValue={tpLast} sem={semTP} sparkValues={tpValues}
              formatDelta={v => fmtPeso(v)} />
            <KpiCard label={md.label} unit={md.unit} value={fmtPct(mdLast)}
              prevValue={mdPrev} currValue={mdLast} sem={semMD} sparkValues={mdValues}
              formatDelta={v => v.toFixed(1) + ' pp'} />
            <KpiCard label={cl.label} unit={cl.unit} value={fmtPct(clLast)}
              prevValue={clPrev} currValue={clLast} sem={semCL} sparkValues={clValues}
              formatDelta={v => v.toFixed(1) + ' pp'} />
          </div>
        </div>

        {/* ══ SECCIÓN 2 — EL PULSO ══════════════════════════════════════════════ */}
        <div style={{ marginBottom: '52px' }}>
          <SectionLabel>
            El Pulso —{' '}
            <span style={{ color: AMBER, marginLeft: '4px' }}>{PERIODO_LABELS[periodo]}</span>
          </SectionLabel>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(188px, 1fr))', gap: '16px',
            opacity: dataLoading ? 0.5 : 1, transition: 'opacity 0.3s',
          }}>
            <PulsoCard label="Ventas" value={fmtMillones(datos.ventas)} vsAnterior={datos.vsAnterior.ventas} subtitle="Facturación del período" />
            <PulsoCard label="Resultado Neto" value="" vsAnterior={0} tbd={true} subtitle="Disponible al cargar P&L 2026" />
            <PulsoCard label="Tickets (docs.)" value={datos.tickets.toLocaleString('es-AR')} vsAnterior={datos.vsAnterior.tickets} subtitle="Documentos facturados" />
            <PulsoCard label="Comensales Total" value={datos.comensalesTotal.toLocaleString('es-AR')} vsAnterior={0} subtitle="Personas en el período" />
            <PulsoCard label="Ticket Promedio" value={fmtPeso(Math.round(datos.ticketProm))} vsAnterior={0} subtitle="Facturación / documentos" />
            <PulsoCard label="Ticket por Persona" value={datos.ticketPorPersona ? fmtPeso(Math.round(datos.ticketPorPersona)) : '—'} vsAnterior={0} subtitle="Facturación / personas" accentOverride={AMBER} />
          </div>
        </div>

        {/* ══ SECCIÓN 3 — PUNTO DE EQUILIBRIO VISUAL ═══════════════════════════ */}
        <div style={{ marginBottom: '52px' }}>
          <SectionLabel>Punto de Equilibrio</SectionLabel>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '16px',
            opacity: dataLoading ? 0.5 : 1, transition: 'opacity 0.3s',
          }}>
            <PEBarChart title="PE DIARIO — última semana"       data={peDataLive.diario}    lineas={peLineas.diario}    />
            <PEBarChart title="PE SEMANAL — últimas 6 semanas"  data={peDataLive.semanal}   lineas={peLineas.semanal}   />
            <PEBarChart title="PE MENSUAL — últimos 6 meses"    data={peDataLive.mensual}   lineas={peLineas.mensual}   />
            <PEBarChart title="PE SEMESTRAL — histórico"        data={peDataLive.semestral} lineas={peLineas.semestral} />
          </div>
        </div>

        {/* ══ SECCIÓN 4 — EVOLUTIVO 6 MESES ════════════════════════════════════ */}
        <div style={{ marginBottom: '52px' }}>
          <SectionLabel>Evolutivo 6 meses</SectionLabel>
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '16px', backdropFilter: 'blur(20px)', padding: '24px',
            opacity: dataLoading ? 0.5 : 1, transition: 'opacity 0.3s',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.68rem',
              letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)',
              marginBottom: '20px',
            }}>Ventas · Resultado Neto · Punto de Equilibrio</div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={evolutivoLive} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={AMBER}    stopOpacity={0.18} />
                    <stop offset="95%" stopColor={AMBER}    stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradResultado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={BLUE_GRAY} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={BLUE_GRAY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="mes" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false}
                  tickFormatter={v => '$' + (v / 1_000_000).toFixed(0) + 'M'}
                  domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip formatter={(v: number) => fmtMillones(v)} />} />
                <ReferenceLine y={PE_MENSUAL} stroke="rgba(239,68,68,0.4)" strokeDasharray="4 3"
                  label={{ value: 'PE', fill: 'rgba(239,68,68,0.6)', fontSize: 10, fontFamily: 'var(--font-body)' }} />
                <Area type="monotone" dataKey="ventas"    name="Ventas"         stroke={AMBER}     strokeWidth={2} fill="url(#gradVentas)"    dot={{ fill: AMBER,     r: 3, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="resultado" name="Resultado Neto" stroke={BLUE_GRAY} strokeWidth={2} fill="url(#gradResultado)" dot={{ fill: BLUE_GRAY, r: 3, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="pe"        name="PE mensual"     stroke="rgba(239,68,68,0.55)" strokeWidth={1.5} strokeDasharray="4 3" fill="none" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            {evolutivoLive.length >= 2 && evolutivoLive[0].ventas > 0 && (
              <InsightBox
                text={`Ventas crecieron ${(((evolutivoLive[evolutivoLive.length - 1].ventas - evolutivoLive[0].ventas) / evolutivoLive[0].ventas) * 100).toFixed(1)}% en 6 meses. Resultado neto se mantiene por encima del PE en todo el período.`}
                type="positive"
              />
            )}
          </div>
        </div>

        {/* ══ SECCIÓN 5 — ALERTAS E INSIGHTS ══════════════════════════════════ */}
        <div style={{ marginBottom: '52px' }}>
          <SectionLabel>Alertas e Insights</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '10px' }}>
            {insights.map((ins, i) => (
              <InsightBox key={i} text={ins.text} type={ins.type} />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
