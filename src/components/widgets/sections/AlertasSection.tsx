'use client'

import { useState, useEffect, useMemo } from 'react'
import { SectionLabel }                  from '@/components/dashboard/SectionLabel'
import { fmtPeso, fmtPct, fmtMillones } from '@/lib/format'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const HEADERS = {
  'Content-Type':  'application/json',
  'apikey':        ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinancialRow { periodo: string; categoria: string; concepto: string; monto: number }
interface DailySaleRow { fecha: string; facturacion: number; tickets: number }

type FinPivot = Map<string, Record<string, number>>

interface Insight {
  color:  string
  bg:     string
  icon:   React.ReactNode
  title:  string
  body:   string
  action: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function fmtPeriodo(p: string): string {
  const [y, m] = p.split('-')
  return `${MONTH_LABELS[m] || m} ${y.slice(2)}`
}

function buildPivot(rows: FinancialRow[]): FinPivot {
  const map: FinPivot = new Map()
  for (const r of rows) {
    if (!map.has(r.periodo)) map.set(r.periodo, {})
    map.get(r.periodo)![r.concepto] = r.monto
  }
  return map
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconScissors({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <line x1="20" y1="4" x2="8.12" y2="15.88"/>
      <line x1="14.47" y1="14.48" x2="20" y2="20"/>
      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
    </svg>
  )
}
function IconCalendar({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      <line x1="8" y1="14" x2="8" y2="14" strokeWidth="2.5"/><line x1="12" y1="14" x2="12" y2="14" strokeWidth="2.5"/>
      <line x1="16" y1="14" x2="16" y2="14" strokeWidth="2.5"/>
    </svg>
  )
}
function IconPercent({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="5" y2="19"/>
      <circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
    </svg>
  )
}
function IconUsers({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  )
}
function IconStar({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  )
}
function IconTrend({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  )
}

// ─── Compute insights ─────────────────────────────────────────────────────────

function computeInsights(pivot: FinPivot, daily: DailySaleRow[]): Insight[] {
  const periods = Array.from(pivot.keys()).sort()
  if (periods.length === 0) return []

  const get = (p: string, k: string) => pivot.get(p)?.[k] ?? 0

  // ── 1. TIJERA ───────────────────────────────────────────────────────────────
  const tijera = (() => {
    if (periods.length < 6) return null
    const first3 = periods.slice(0, 3)
    const last3  = periods.slice(-3)
    const avgVF  = avg(first3.map(p => get(p, 'VENTAS_NOCHE')))
    const avgVL  = avg(last3.map(p => get(p, 'VENTAS_NOCHE')))
    const avgTGF = avg(first3.map(p => get(p, 'TOTAL_GASTOS')))
    const avgTGL = avg(last3.map(p => get(p, 'TOTAL_GASTOS')))
    const gV  = avgVF > 0 ? ((avgVL - avgVF) / avgVF) * 100 : 0
    const gTG = avgTGF > 0 ? ((avgTGL - avgTGF) / avgTGF) * 100 : 0
    const isBad = gTG > gV
    const color = '#ef4444'
    return {
      color,
      bg: 'rgba(239,68,68,0.05)',
      icon: <IconScissors color={color} />,
      title: 'EFECTO TIJERA',
      body: isBad
        ? `Costos fijos crecieron ${gTG.toFixed(1)}% mientras ventas crecieron ${gV.toFixed(1)}% en los últimos 3 meses. La brecha comprime márgenes.`
        : `Ventas crecen ${gV.toFixed(1)}% vs costos fijos ${gTG.toFixed(1)}% — el negocio escala con eficiencia.`,
      action: isBad
        ? `Auditá los rubros de ${fmtPeriodo(last3[0])}–${fmtPeriodo(last3[2])} con mayor alza y cotizá alternativas.`
        : `Mantené el mix de costos actual y usá el margen adicional para reforzar reservas.`,
    } satisfies Insight
  })()

  // ── 2. DÍAS FLOJOS ─────────────────────────────────────────────────────────
  const diasFlojos = (() => {
    const byDay: Record<number, number[]> = {}
    for (const r of daily) {
      const d = new Date(r.fecha + 'T12:00:00').getDay()
      if (!byDay[d]) byDay[d] = []
      byDay[d].push(r.facturacion)
    }
    const ranked = Object.entries(byDay)
      .filter(([, vs]) => vs.length >= 4)
      .map(([d, vs]) => ({ day: Number(d), avg: avg(vs) }))
      .sort((a, b) => a.avg - b.avg)
    const bottom2 = ranked.slice(0, 2)
    const color = '#f59e0b'
    const names = bottom2.map(x => DIAS_SEMANA[x.day]).join(' y ')
    const avgs  = bottom2.map(x => fmtMillones(x.avg)).join(' / ')
    return {
      color,
      bg: 'rgba(245,158,11,0.05)',
      icon: <IconCalendar color={color} />,
      title: 'DÍAS FLOJOS',
      body: bottom2.length >= 2
        ? `${names} concentran la menor facturación promedio del negocio (${avgs}). Representan capacidad ociosa no capturada.`
        : 'No hay suficientes datos para detectar días débiles aún.',
      action: bottom2.length >= 2
        ? `Diseñá una promoción específica para ${names}: menú ejecutivo, 2×1 bebidas o descuento grupal.`
        : `Acumulá más historial para identificar patrones semanales con precisión.`,
    } satisfies Insight
  })()

  // ── 3. CV% ─────────────────────────────────────────────────────────────────
  const cvInsight = (() => {
    const lastP  = periods[periods.length - 1]
    const lastV  = get(lastP, 'VENTAS_NOCHE')
    const lastC  = get(lastP, 'TOTAL_COSTOS')
    const lastCV = lastV > 0 ? (lastC / lastV) * 100 : 0
    const histCV = avg(
      periods
        .map(p => {
          const v = get(p, 'VENTAS_NOCHE')
          const c = get(p, 'TOTAL_COSTOS')
          return v > 0 ? (c / v) * 100 : 0
        })
        .filter(x => x > 0)
    )
    const color = lastCV < 37 ? '#22c55e' : lastCV < 40 ? '#f59e0b' : '#ef4444'
    const bg    = lastCV < 37 ? 'rgba(34,197,94,0.05)' : lastCV < 40 ? 'rgba(245,158,11,0.05)' : 'rgba(239,68,68,0.05)'
    const status = lastCV < 37 ? 'saludable' : lastCV < 40 ? 'en zona de atención' : 'elevado'
    return {
      color, bg,
      icon: <IconPercent color={color} />,
      title: 'COSTO DE VENTAS',
      body: `CV% actual: ${fmtPct(lastCV)} (${fmtPeriodo(lastP)}) vs promedio histórico ${fmtPct(histCV)}. Nivel ${status}.`,
      action: lastCV < 37
        ? `Aprovechá el margen para negociar volumen con proveedores y asegurar el precio.`
        : lastCV < 40
        ? `Revisá las recetas con mayor desvío de costo y ajustá porciones o proveedores.`
        : `Auditá el menú completo: priorizá platos con MC > 60% y evaluá eliminar los deficitarios.`,
    } satisfies Insight
  })()

  // ── 4. COSTO LABORAL ───────────────────────────────────────────────────────
  const laboralInsight = (() => {
    const lastP  = periods[periods.length - 1]
    const lastV  = get(lastP, 'VENTAS_NOCHE')
    const lastCL = lastV > 0
      ? ((get(lastP, 'SUELDOS_CARGAS') + get(lastP, 'LIQ_FINAL')) / lastV) * 100
      : 0
    const isBad  = lastCL > 30
    const color  = isBad ? '#ef4444' : '#22c55e'
    const bg     = isBad ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)'
    return {
      color, bg,
      icon: <IconUsers color={color} />,
      title: 'COSTO LABORAL',
      body: `${fmtPct(lastCL)} sobre ventas en ${fmtPeriodo(lastP)}. Benchmark del sector: 30%. Incluye sueldos, cargas y liquidaciones.`,
      action: isBad
        ? `Analizá la dotación por turno vs demanda real. Evaluá reducir horas extras o redistribuir carga.`
        : `Eficiencia dentro del rango óptimo. Documentá la estructura para escalarla a nuevas aperturas.`,
    } satisfies Insight
  })()

  // ── 5. MEJOR MES ──────────────────────────────────────────────────────────
  const mejorMes = (() => {
    let bestP = periods[0]
    let bestV = 0
    let totalV = 0
    for (const p of periods) {
      const v = get(p, 'VENTAS_NOCHE')
      totalV += v
      if (v > bestV) { bestV = v; bestP = p }
    }
    const pct   = totalV > 0 ? (bestV / totalV) * 100 : 0
    const color = '#06b6d4'
    return {
      color,
      bg: 'rgba(6,182,212,0.05)',
      icon: <IconStar color={color} />,
      title: 'MEJOR MES',
      body: `${fmtPeriodo(bestP)} fue el mes pico con ${fmtMillones(bestV)} en ventas — representa el ${pct.toFixed(1)}% del total histórico registrado.`,
      action: `Identificá qué acciones o eventos impulsaron ese mes y replicálos en los meses de menor rendimiento.`,
    } satisfies Insight
  })()

  // ── 6. RECUPERO ───────────────────────────────────────────────────────────
  const recupero = (() => {
    const INVERSION    = 210_000_000
    const rnTotal      = periods.reduce((s, p) => s + get(p, 'RESULTADO_NETO'), 0)
    const recuperoPct  = (rnTotal / INVERSION) * 100
    const faltante     = INVERSION - rnTotal
    const avgMensual   = periods.length > 0 ? rnTotal / periods.length : 0
    const mesesRest    = avgMensual > 0 && faltante > 0 ? Math.ceil(faltante / avgMensual) : null
    const color = '#22c55e'
    return {
      color,
      bg: 'rgba(34,197,94,0.05)',
      icon: <IconTrend color={color} />,
      title: 'RECUPERO INVERSIÓN',
      body: `${fmtPct(recuperoPct)} recuperado de los $210M invertidos (${fmtMillones(rnTotal)} acumulado). Promedio mensual: ${fmtMillones(avgMensual)}.`,
      action: mesesRest && mesesRest > 0
        ? `Al ritmo actual, el recupero completo se alcanza en ~${mesesRest} meses. Priorizá meses de alta demanda para acortar el plazo.`
        : rnTotal >= INVERSION
        ? `¡Inversión recuperada! El negocio opera en ganancia neta pura. Reinvertí los excedentes estratégicamente.`
        : `Acelerá el recupero incrementando el resultado neto mensual por encima del promedio histórico.`,
    } satisfies Insight
  })()

  return [tijera, diasFlojos, cvInsight, laboralInsight, mejorMes, recupero].filter(Boolean) as Insight[]
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      background: insight.bg,
      border: '1px solid rgba(255,255,255,0.06)',
      borderLeft: `3px solid ${insight.color}`,
      borderRadius: '0 12px 12px 0',
      padding: '16px 18px',
      minHeight: '130px',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flexShrink: 0 }}>{insight.icon}</div>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '0.62rem',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: insight.color,
        }}>{insight.title}</span>
      </div>

      {/* body */}
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.78rem',
        lineHeight: 1.55,
        color: 'rgba(255,255,255,0.62)',
        margin: 0,
      }}>{insight.body}</p>

      {/* action */}
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.72rem',
        fontStyle: 'italic',
        lineHeight: 1.45,
        color: 'rgba(255,255,255,0.35)',
        margin: 0,
        marginTop: 'auto',
        paddingTop: '4px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>{insight.action}</p>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderLeft: '3px solid rgba(245,130,10,0.25)',
      borderRadius: '0 12px 12px 0',
      padding: '16px 18px',
      minHeight: '130px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      <div style={{ width: '35%', height: '9px', borderRadius: '4px', background: 'rgba(245,130,10,0.15)', animation: 'pulse 1.4s ease-in-out infinite' }} />
      <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.4s ease-in-out infinite' }} />
      <div style={{ width: '85%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />
      <div style={{ width: '65%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', animation: 'pulse 1.4s ease-in-out infinite', marginTop: 'auto' }} />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { locationId: string }

export function AlertasSection({ locationId }: Props) {
  const [financial,  setFinancial]  = useState<FinancialRow[]>([])
  const [dailySales, setDailySales] = useState<DailySaleRow[]>([])
  const [isLoading,  setIsLoading]  = useState(true)

  useEffect(() => {
    if (!locationId) return
    setIsLoading(true)
    const body = JSON.stringify({ p_location_id: locationId })

    Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_financial_results`, { method: 'POST', headers: HEADERS, body })
        .then(r => r.json()).then(r => Array.isArray(r) ? r : []).catch(() => []),
      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_daily_sales_full`, { method: 'POST', headers: HEADERS, body })
        .then(r => r.json()).then(r => Array.isArray(r) ? r : []).catch(() => []),
    ]).then(([fin, dly]) => {
      setFinancial(fin)
      setDailySales(dly)
    }).finally(() => setIsLoading(false))
  }, [locationId])

  const pivot    = useMemo(() => buildPivot(financial), [financial])
  const insights = useMemo(() => computeInsights(pivot, dailySales), [pivot, dailySales])

  return (
    <div style={{ marginBottom: '52px' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }`}</style>
      <SectionLabel>Alertas e Insights</SectionLabel>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
      }}>
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : insights.map((ins, i) => <InsightCard key={i} insight={ins} />)
        }
      </div>
    </div>
  )
}
