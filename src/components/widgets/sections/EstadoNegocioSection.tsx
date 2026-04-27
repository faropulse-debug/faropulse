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
interface ComensalRow  { fecha: string; comensales: number }

type Filter = 'semana' | 'mes' | 'semestre' | 'año'

interface KpiData { value: number | null; prev: number | null; subtitle: string }

interface KpiSet {
  resultadoNeto:  KpiData
  facturacion:    KpiData
  ventaComensal:  KpiData
  comensalesDia:  KpiData
  cv:             KpiData
  costoLaboral:   KpiData
  peDiario:       KpiData
  diasSobrePE:    KpiData
  recupero:       KpiData
  ticketPromedio: KpiData
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function daysInMonth(yr: number, mo: number): number {
  return new Date(yr, mo, 0).getDate()
}

function monthOffset(offset: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return d.toISOString().slice(0, 7)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function monthEnd(period: string): string {
  const [yr, mo] = period.split('-').map(Number)
  return `${period}-${String(daysInMonth(yr, mo)).padStart(2, '0')}`
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

type FinPivot = Map<string, Record<string, number>>

function buildPivot(rows: FinancialRow[]): FinPivot {
  const map: FinPivot = new Map()
  for (const r of rows) {
    if (!map.has(r.periodo)) map.set(r.periodo, {})
    map.get(r.periodo)![r.concepto] = r.monto
  }
  return map
}

function sumKey(pivot: FinPivot, periods: string[], key: string): number {
  return periods.reduce((s, p) => s + (pivot.get(p)?.[key] ?? 0), 0)
}

function periodsIn(pivot: FinPivot, from: string, to: string): string[] {
  return Array.from(pivot.keys()).filter(p => p >= from && p <= to).sort()
}

function daily(rows: DailySaleRow[], from: string, to: string): DailySaleRow[] {
  return rows.filter(r => r.fecha >= from && r.fecha <= to)
}

function comensales(rows: ComensalRow[], from: string, to: string): ComensalRow[] {
  return rows.filter(r => r.fecha >= from && r.fecha <= to)
}

function finKpis(pivot: FinPivot, periods: string[]) {
  const ventas  = sumKey(pivot, periods, 'VENTAS_NOCHE')
  const costos  = sumKey(pivot, periods, 'TOTAL_COSTOS')
  const sueldos = sumKey(pivot, periods, 'SUELDOS_CARGAS')
  const liq     = sumKey(pivot, periods, 'LIQ_FINAL')
  const rn      = sumKey(pivot, periods, 'RESULTADO_NETO')
  const tg      = sumKey(pivot, periods, 'TOTAL_GASTOS')
  let totalDays = 0
  for (const p of periods) {
    const [yr, mo] = p.split('-').map(Number)
    totalDays += daysInMonth(yr, mo)
  }
  const mc      = ventas > 0 ? (ventas - costos) / ventas : 0
  const peDaily = mc > 0 && totalDays > 0 ? tg / mc / totalDays : 0
  return { ventas, costos, sueldos, liq, rn, tg, mc, peDaily, totalDays }
}

// ─── KPI computation ──────────────────────────────────────────────────────────

function computeKpis(
  pivot:    FinPivot,
  allDaily: DailySaleRow[],
  allCom:   ComensalRow[],
  filter:   Filter,
): KpiSet {
  const today          = todayStr()
  const lastMonth      = monthOffset(-1)
  const twoMonthsAgo   = monthOffset(-2)

  // Period windows
  let currFin: string[], prevFin: string[]
  let cdFrom: string, cdTo: string, pdFrom: string, pdTo: string

  if (filter === 'semana') {
    cdFrom = addDays(today, -6);  cdTo = today
    pdFrom = addDays(today, -13); pdTo = addDays(today, -7)
    currFin = [lastMonth]
    prevFin = [twoMonthsAgo]
  } else if (filter === 'mes') {
    cdFrom = `${lastMonth}-01`;  cdTo = monthEnd(lastMonth)
    pdFrom = `${twoMonthsAgo}-01`; pdTo = monthEnd(twoMonthsAgo)
    currFin = [lastMonth]
    prevFin = [twoMonthsAgo]
  } else if (filter === 'semestre') {
    const s6 = Array.from({ length: 6 }, (_, i) => monthOffset(-1 - i)).reverse()
    const p6 = Array.from({ length: 6 }, (_, i) => monthOffset(-7 - i)).reverse()
    currFin = s6; prevFin = p6
    cdFrom = `${s6[0]}-01`;  cdTo = monthEnd(s6[5])
    pdFrom = `${p6[0]}-01`;  pdTo = monthEnd(p6[5])
  } else {
    const yr   = today.slice(0, 4)
    const prevY = String(Number(yr) - 1)
    currFin = periodsIn(pivot, `${yr}-01`, `${yr}-12`)
    prevFin = periodsIn(pivot, `${prevY}-01`, `${prevY}-12`)
    cdFrom = `${yr}-01-01`;    cdTo = today
    pdFrom = `${prevY}-01-01`; pdTo = `${prevY}-12-31`
  }

  const cf = finKpis(pivot, currFin)
  const pf = finKpis(pivot, prevFin)

  const cDaily = daily(allDaily, cdFrom, cdTo)
  const pDaily = daily(allDaily, pdFrom, pdTo)
  const cCom   = comensales(allCom, cdFrom, cdTo)
  const pCom   = comensales(allCom, pdFrom, pdTo)

  const cFact = cDaily.reduce((s, r) => s + r.facturacion, 0)
  const pFact = pDaily.reduce((s, r) => s + r.facturacion, 0)
  const cTix  = cDaily.reduce((s, r) => s + r.tickets, 0)
  const pTix  = pDaily.reduce((s, r) => s + r.tickets, 0)
  const cComS = cCom.reduce((s, r) => s + r.comensales, 0)
  const pComS = pCom.reduce((s, r) => s + r.comensales, 0)
  const cDays = cDaily.length || 1
  const pDays = pDaily.length || 1

  // KPI 8: Días sobre PE — always last 30 days vs prior 30
  const last30From  = addDays(today, -29)
  const prev30From  = addDays(today, -59)
  const prev30To    = addDays(today, -30)
  const lm = finKpis(pivot, [lastMonth])
  const peRef  = lm.peDaily
  const d30    = daily(allDaily, last30From, today).filter(r => r.facturacion > peRef).length
  const d30p   = daily(allDaily, prev30From, prev30To).filter(r => r.facturacion > peRef).length

  // KPI 9: Recupero Inversión — full historical sum
  const allPeriods = Array.from(pivot.keys()).sort()
  const rnTotal    = sumKey(pivot, allPeriods, 'RESULTADO_NETO')
  const recupero   = (rnTotal / 210_000_000) * 100
  const recuperoPrev = ((rnTotal - cf.rn) / 210_000_000) * 100

  return {
    resultadoNeto:  { value: cf.ventas > 0 ? (cf.rn / cf.ventas) * 100 : null,                 prev: pf.ventas > 0 ? (pf.rn / pf.ventas) * 100 : null,                 subtitle: 'sobre ventas netas' },
    facturacion:    { value: cFact || null,                                                      prev: pFact || null,                                                      subtitle: 'ventas totales período' },
    ventaComensal:  { value: cComS > 0 ? cFact / cComS : null,                                  prev: pComS > 0 ? pFact / pComS : null,                                  subtitle: 'facturación / comensal' },
    comensalesDia:  { value: cComS > 0 ? cComS / cDays : null,                                  prev: pComS > 0 ? pComS / pDays : null,                                  subtitle: 'promedio diario' },
    cv:             { value: cf.ventas > 0 ? (cf.costos / cf.ventas) * 100 : null,              prev: pf.ventas > 0 ? (pf.costos / pf.ventas) * 100 : null,              subtitle: 'costo de ventas' },
    costoLaboral:   { value: cf.ventas > 0 ? ((cf.sueldos + cf.liq) / cf.ventas) * 100 : null, prev: pf.ventas > 0 ? ((pf.sueldos + pf.liq) / pf.ventas) * 100 : null, subtitle: 'sueldos + liquidación' },
    peDiario:       { value: cf.peDaily || null,                                                 prev: pf.peDaily || null,                                                 subtitle: 'punto de equilibrio' },
    diasSobrePE:    { value: d30,                                                                prev: d30p,                                                               subtitle: 'días / últimos 30' },
    recupero:       { value: recupero,                                                           prev: recuperoPrev,                                                       subtitle: 'de $210M invertidos' },
    ticketPromedio: { value: cTix > 0 ? cFact / cTix : null,                                    prev: pTix > 0 ? pFact / pTix : null,                                    subtitle: 'por comprobante' },
  }
}

// ─── Card ─────────────────────────────────────────────────────────────────────

type Fmt = 'peso' | 'millones' | 'pct' | 'count' | 'decimal'

function fmt(v: number | null, f: Fmt): string {
  if (v === null) return '—'
  if (f === 'peso')     return fmtPeso(v)
  if (f === 'millones') return fmtMillones(v)
  if (f === 'pct')      return fmtPct(v)
  if (f === 'count')    return String(Math.round(v))
  return v.toFixed(1)
}

interface CardProps {
  label:      string
  data:       KpiData
  format:     Fmt
  higherGood: boolean   // false → lower is better
  deltaFmt?:  Fmt
}

function KpiStatCard({ label, data, format, higherGood, deltaFmt }: CardProps) {
  const { value, prev, subtitle } = data
  const delta  = value !== null && prev !== null ? value - prev : null
  const isUp   = delta !== null && delta > 0
  const isGood = delta !== null ? (higherGood ? isUp : !isUp) : null
  const arrow  = delta === null ? '' : isUp ? '↑' : '↓'

  const goodColor = '#22c55e'
  const badColor  = '#ef4444'
  const arrowColor = isGood === null ? 'rgba(255,255,255,0.3)' : isGood ? goodColor : badColor
  const glowColor  = isGood === null ? 'rgba(245,130,10,0.12)' : isGood ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.08)'
  const topLine    = isGood === null ? '#f5820a66' : isGood ? '#22c55e55' : '#ef444444'

  const df = deltaFmt ?? format
  const deltaStr = delta === null ? '' : fmt(Math.abs(delta), df)

  return (
    <div style={{
      position: 'relative',
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '14px',
      backdropFilter: 'blur(16px)',
      padding: '18px 16px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      boxShadow: `0 0 18px ${glowColor}`,
      overflow: 'hidden',
      minHeight: '120px',
    }}>
      {/* top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: '12%', right: '12%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${topLine}, transparent)`,
      }} />

      {/* label */}
      <span style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: '0.58rem',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.38)',
      }}>{label}</span>

      {/* value */}
      <div style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 700,
        fontSize: '1.65rem',
        lineHeight: 1,
        color: 'rgba(255,255,255,0.92)',
        letterSpacing: '-0.02em',
      }}>
        {fmt(value, format)}
      </div>

      {/* delta + subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.7rem',
          color: arrowColor,
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
        }}>
          {arrow && <span style={{ fontSize: '0.82rem' }}>{arrow}</span>}
          {deltaStr && `${deltaStr}`}
          {!deltaStr && !arrow && <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
        </span>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.6rem',
          color: 'rgba(255,255,255,0.22)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>{subtitle}</span>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: '14px',
      padding: '18px 16px 14px',
      minHeight: '120px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      <div style={{ width: '55%', height: '8px', borderRadius: '4px', background: 'rgba(245,130,10,0.12)', animation: 'pulse 1.4s ease-in-out infinite' }} />
      <div style={{ width: '70%', height: '26px', borderRadius: '6px', background: 'rgba(245,130,10,0.08)', animation: 'pulse 1.4s ease-in-out infinite' }} />
      <div style={{ width: '40%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.4s ease-in-out infinite' }} />
    </div>
  )
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'semana',   label: 'Semana' },
  { id: 'mes',      label: 'Mes' },
  { id: 'semestre', label: 'Semestre' },
  { id: 'año',      label: 'Año' },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { locationId: string }

export function EstadoNegocioSection({ locationId }: Props) {
  const [filter,    setFilter]    = useState<Filter>('mes')
  const [financial, setFinancial] = useState<FinancialRow[]>([])
  const [dailySales, setDailySales] = useState<DailySaleRow[]>([])
  const [comensalesData, setComensalesData] = useState<ComensalRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!locationId) return
    setIsLoading(true)
    const body = JSON.stringify({ p_location_id: locationId })

    Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_financial_results`, { method: 'POST', headers: HEADERS, body })
        .then(r => r.json()).then(r => Array.isArray(r) ? r : []).catch(() => []),
      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_daily_sales_full`, { method: 'POST', headers: HEADERS, body })
        .then(r => r.json()).then(r => Array.isArray(r) ? r : []).catch(() => []),
      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_comensales_full`, { method: 'POST', headers: HEADERS, body })
        .then(r => r.json()).then(r => Array.isArray(r) ? r : []).catch(() => []),
    ]).then(([fin, dly, com]) => {
      setFinancial(fin)
      setDailySales(dly)
      setComensalesData(com)
    }).finally(() => setIsLoading(false))
  }, [locationId])

  const pivot = useMemo(() => buildPivot(financial), [financial])

  const kpis = useMemo(
    () => computeKpis(pivot, dailySales, comensalesData, filter),
    [pivot, dailySales, comensalesData, filter],
  )

  return (
    <div style={{ marginBottom: '52px' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <SectionLabel>Estado del negocio</SectionLabel>

        {/* Filter tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '10px',
          padding: '4px',
        }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.62rem',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '5px 12px',
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: filter === f.id ? 'rgba(245,130,10,0.18)' : 'transparent',
                color: filter === f.id ? '#f5820a' : 'rgba(255,255,255,0.35)',
                boxShadow: filter === f.id ? '0 0 10px rgba(245,130,10,0.15)' : 'none',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5×2 KPI grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '12px',
      }}>
        {isLoading ? (
          Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KpiStatCard label="Resultado Neto"     data={kpis.resultadoNeto}  format="pct"      higherGood={true}  deltaFmt="decimal" />
            <KpiStatCard label="Facturación"         data={kpis.facturacion}    format="millones"  higherGood={true}  />
            <KpiStatCard label="Venta / Comensal"    data={kpis.ventaComensal}  format="peso"      higherGood={true}  />
            <KpiStatCard label="Comensales / Día"    data={kpis.comensalesDia}  format="decimal"   higherGood={true}  />
            <KpiStatCard label="CV%"                 data={kpis.cv}             format="pct"       higherGood={false} deltaFmt="decimal" />
            <KpiStatCard label="Costo Laboral"       data={kpis.costoLaboral}   format="pct"       higherGood={false} deltaFmt="decimal" />
            <KpiStatCard label="PE Diario"           data={kpis.peDiario}       format="millones"  higherGood={false} />
            <KpiStatCard label="Días sobre PE"       data={kpis.diasSobrePE}    format="count"     higherGood={true}  />
            <KpiStatCard label="Recupero Inversión"  data={kpis.recupero}       format="pct"       higherGood={true}  deltaFmt="decimal" />
            <KpiStatCard label="Ticket Promedio"     data={kpis.ticketPromedio} format="peso"      higherGood={true}  />
          </>
        )}
      </div>
    </div>
  )
}
