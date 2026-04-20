'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Cell,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinancialRow {
  periodo:   string
  categoria: string
  concepto:  string
  monto:     number
}

interface DataPoint {
  periodo:    string
  label:      string
  ventas:     number      // millones ARS
  resultado:  number      // millones ARS
  comensales: number
  ticket:     number      // miles ARS
  tipo:       'real' | 'proy'
  cf?:        number      // millones ARS, sólo real
}

interface RecuperoPoint extends DataPoint {
  acumulado:   number
  pctRecupero: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INVERSION = 210  // millones ARS

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

// JS getDay() → 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
const COMENSALES_POR_DIA = [35, 20, 20, 35, 60, 110, 140]

const INFLACION_MENSUAL = 0.015
const DELIVERY_PCT      = 0.08
const CV_PCT            = 0.34
const CF_CRECIMIENTO    = 0.025
const REGALIAS_PCT      = 0.05
const DIC_ESTACIONAL    = 0.30  // +30% sobre salón en diciembre

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatM(v: number) { return `$${v.toFixed(1)}M` }
function formatK(v: number) { return `$${v.toFixed(1)}K` }

function periodoLabel(periodo: string): string {
  const [y, m] = periodo.split('-')
  return `${MONTH_LABELS[m]} ${y.slice(2)}`
}

function calcComensalesMes(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate()
  let total  = 0
  for (let d = 1; d <= days; d++) {
    total += COMENSALES_POR_DIA[new Date(year, month - 1, d).getDay()]
  }
  return total
}

function addMonths(year: number, month: number, n: number): [number, number] {
  const total = month - 1 + n
  return [year + Math.floor(total / 12), (total % 12) + 1]
}

// ── Data Transform ────────────────────────────────────────────────────────────

function transformRealData(rows: FinancialRow[]): DataPoint[] {
  const byPeriod = new Map<string, Record<string, number>>()
  for (const row of rows) {
    if (!byPeriod.has(row.periodo)) byPeriod.set(row.periodo, {})
    byPeriod.get(row.periodo)![row.concepto] = row.monto
  }

  return Array.from(byPeriod.keys()).sort().map(periodo => {
    const d          = byPeriod.get(periodo)!
    const ventasARS  = d['VENTAS_NOCHE'] || 0
    const cfARS      = d['TOTAL_GASTOS'] || 0
    const [y, m]     = periodo.split('-').map(Number)
    const comensales = calcComensalesMes(y, m)
    return {
      periodo,
      label:      periodoLabel(periodo),
      ventas:     ventasARS / 1_000_000,
      resultado:  (d['LIQ_FINAL'] || 0) / 1_000_000,
      comensales,
      ticket:     comensales > 0 ? ventasARS / comensales / 1_000 : 0,
      tipo:       'real' as const,
      cf:         cfARS / 1_000_000,
    }
  })
}

function buildProjections(realData: DataPoint[]): DataPoint[] {
  if (!realData.length) return []

  const last       = realData[realData.length - 1]
  const lastCF     = last.cf ?? 0
  const lastTicket = last.ticket * 1_000  // volver a ARS

  const [ly, lm] = last.periodo.split('-').map(Number)

  // Proyectar hasta diciembre del año correcto:
  // si real termina en el 1er semestre → proyectar a dic del mismo año;
  // si termina en el 2do semestre → proyectar a dic del año siguiente.
  const projEndYear    = lm <= 6 ? ly : ly + 1
  const monthsToProject = (projEndYear - ly) * 12 + (12 - lm)

  const projected: DataPoint[] = []

  for (let i = 1; i <= monthsToProject; i++) {
    const [year, month] = addMonths(ly, lm, i)
    const comensales    = calcComensalesMes(year, month)
    const ticket        = lastTicket * Math.pow(1 + INFLACION_MENSUAL, i)
    const estacional    = month === 12 ? 1 + DIC_ESTACIONAL : 1
    const ventasSalon   = comensales * ticket * estacional
    const totalVentas   = ventasSalon * (1 + DELIVERY_PCT)
    const cv            = totalVentas * CV_PCT
    const cf            = lastCF * 1_000_000 * Math.pow(1 + CF_CRECIMIENTO, i)
    const regalias      = totalVentas * REGALIAS_PCT
    const resultado     = totalVentas - cv - cf - regalias
    const periodo       = `${year}-${String(month).padStart(2, '0')}`

    projected.push({
      periodo,
      label:      periodoLabel(periodo),
      ventas:     totalVentas / 1_000_000,
      resultado:  resultado   / 1_000_000,
      comensales,
      ticket:     ticket      / 1_000,
      tipo:       'proy',
    })
  }

  return projected
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d      = payload[0]?.payload as DataPoint
  if (!d) return null
  const isProy  = d.tipo === 'proy'
  const margen  = d.ventas ? ((d.resultado / d.ventas) * 100).toFixed(1) : '0'

  return (
    <div style={{
      background: 'rgba(10,10,18,0.95)', border: '1px solid rgba(245,130,10,0.3)',
      borderRadius: 12, padding: '14px 18px', backdropFilter: 'blur(20px)', minWidth: 240,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#f5820a', fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          {d.label}
        </span>
        {isProy && (
          <span style={{ background: 'rgba(168,85,247,0.2)', color: '#a855f7', fontSize: 9, padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
            PROYECCIÓN
          </span>
        )}
      </div>
      {([
        { label: 'Facturación',    value: formatM(d.ventas),    color: '#f5820a' },
        { label: 'Resultado Neto', value: formatM(d.resultado), color: d.resultado >= 0 ? '#22c55e' : '#ef4444' },
        { label: 'Comensales',     value: d.comensales.toLocaleString(), color: '#06b6d4' },
        { label: 'Ticket Promedio',value: formatK(d.ticket),   color: '#fff' },
      ] as const).map(({ label, value, color }, idx, arr) => (
        <div key={label} style={{
          display: 'flex', justifyContent: 'space-between', padding: '4px 0',
          borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{label}</span>
          <span style={{ color, fontSize: 13, fontWeight: 600 }}>{value}</span>
        </div>
      ))}
      <div style={{
        marginTop: 8, padding: '6px 10px', borderRadius: 6,
        background: d.resultado >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        border: `1px solid ${d.resultado >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Margen</span>
        <span style={{ color: d.resultado >= 0 ? '#22c55e' : '#ef4444', fontSize: 14, fontWeight: 800 }}>{margen}%</span>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface ProyeccionEjecutivaChartProps {
  data:       FinancialRow[]
  isLoading?: boolean
}

export default function ProyeccionEjecutivaChart({ data, isLoading }: ProyeccionEjecutivaChartProps) {
  const [view, setView] = useState<'facturacion' | 'recupero' | 'comensales'>('facturacion')

  const realData = useMemo(() => transformRealData(data), [data])
  const projData = useMemo(() => buildProjections(realData), [realData])
  const allData  = useMemo(() => [...realData, ...projData], [realData, projData])

  const recuperoData = useMemo<RecuperoPoint[]>(() => {
    let acum = 0
    return allData.map(d => {
      acum += d.resultado
      return { ...d, acumulado: acum, pctRecupero: (acum / INVERSION) * 100 }
    })
  }, [allData])

  const totalRealVentas = useMemo(() => realData.reduce((s, d) => s + d.ventas,    0), [realData])
  const totalProyVentas = useMemo(() => projData.reduce((s, d) => s + d.ventas,    0), [projData])
  const totalRealRes    = useMemo(() => realData.reduce((s, d) => s + d.resultado, 0), [realData])
  const totalProyRes    = useMemo(() => projData.reduce((s, d) => s + d.resultado, 0), [projData])
  const acumFinal       = totalRealRes + totalProyRes

  const kpis = useMemo(() => {
    const breakEven = recuperoData.find(d => d.acumulado >= INVERSION)
    const mejorMes  = [...projData].sort((a, b) => b.ventas - a.ventas)[0] ?? null
    return { breakEven, mejorMes }
  }, [recuperoData, projData])

  const firstPeriodo = allData[0]?.periodo ?? ''
  const lastPeriodo  = allData[allData.length - 1]?.periodo ?? ''

  if (isLoading) return <div className="animate-pulse rounded-2xl bg-white/5 h-[600px]" />

  if (!allData.length) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-white/40">
        Sin datos financieros disponibles
      </div>
    )
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a0a12 0%, #0d0d1a 50%, #0a0a12 100%)',
      borderRadius: 16, padding: '28px 24px 20px', color: '#fff',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 20% 20%, rgba(245,130,10,0.03) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% 80%, rgba(168,85,247,0.02) 0%, transparent 60%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ fontSize: 10, letterSpacing: 3, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6 }}>
          Proyección Ejecutiva
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "'Syne', sans-serif" }}>
            {firstPeriodo ? `${periodoLabel(firstPeriodo)} → ${periodoLabel(lastPeriodo)}` : 'Proyección'}
          </h2>
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>REAL ({realData.length}M)</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f5820a', fontFamily: "'DM Mono'" }}>{formatM(totalRealVentas)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>PROY ({projData.length}M)</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#a855f7', fontFamily: "'DM Mono'" }}>{formatM(totalProyVentas)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>RECUPERO</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: acumFinal >= INVERSION ? '#22c55e' : '#06b6d4', fontFamily: "'DM Mono'" }}>
                {(acumFinal / INVERSION * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([
            { key: 'facturacion', label: 'Facturación + Resultado' },
            { key: 'recupero',    label: 'Recupero Inversión' },
            { key: 'comensales',  label: 'Comensales' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setView(t.key)} style={{
              padding: '6px 16px', borderRadius: 20, border: '1px solid',
              borderColor: view === t.key ? '#f5820a'                  : 'rgba(255,255,255,0.15)',
              background:  view === t.key ? 'rgba(245,130,10,0.15)'    : 'transparent',
              color:       view === t.key ? '#f5820a'                  : 'rgba(255,255,255,0.5)',
              fontSize: 12, cursor: 'pointer', fontWeight: view === t.key ? 700 : 400,
            }}>{t.label}</button>
          ))}
        </div>

        {/* Chart */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px 12px 8px' }}>
          <ResponsiveContainer width="100%" height={380}>
            {view === 'facturacion' ? (
              <ComposedChart data={allData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                <YAxis tickFormatter={v => `$${v}M`} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="rgba(239,68,68,0.3)" strokeDasharray="6 4" />
                <Bar dataKey="ventas" radius={[4, 4, 0, 0]}>
                  {allData.map((d, i) => (
                    <Cell key={i}
                      fill={d.tipo === 'proy' ? 'rgba(168,85,247,0.5)' : '#f5820a'}
                      stroke={d.tipo === 'proy' ? '#a855f7' : '#f5820a'}
                      strokeWidth={d.tipo === 'proy' ? 1 : 0}
                    />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="resultado" stroke="#22c55e" strokeWidth={2.5}
                  dot={{ r: 4, fill: '#22c55e', stroke: '#0a0a12', strokeWidth: 2 }} />
              </ComposedChart>
            ) : view === 'recupero' ? (
              <ComposedChart data={recuperoData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                <YAxis tickFormatter={v => `$${v}M`} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={INVERSION} stroke="#f5820a" strokeDasharray="8 4" strokeWidth={2}
                  label={{ value: `Inversión $${INVERSION}M`, fill: '#f5820a', fontSize: 11, position: 'right' }} />
                <Bar dataKey="resultado" radius={[3, 3, 0, 0]}>
                  {recuperoData.map((d, i) => (
                    <Cell key={i} fill={d.tipo === 'proy' ? 'rgba(168,85,247,0.4)' : 'rgba(34,197,94,0.6)'} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="acumulado" stroke="#06b6d4" strokeWidth={3}
                  dot={{ r: 4, fill: '#06b6d4', stroke: '#0a0a12', strokeWidth: 2 }} />
              </ComposedChart>
            ) : (
              <ComposedChart data={allData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => `$${v}K`} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="comensales" radius={[4, 4, 0, 0]}>
                  {allData.map((d, i) => (
                    <Cell key={i}
                      fill={d.tipo === 'proy' ? 'rgba(6,182,212,0.4)' : 'rgba(6,182,212,0.7)'}
                      stroke={d.tipo === 'proy' ? '#06b6d4' : 'transparent'}
                    />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="ticket" stroke="#f5820a" strokeWidth={2}
                  dot={{ r: 3, fill: '#f5820a', stroke: '#0a0a12', strokeWidth: 2 }} yAxisId="right" />
              </ComposedChart>
            )}
          </ResponsiveContainer>

          {/* Legend */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, padding: '8px 0', fontSize: 11, color: 'rgba(255,255,255,0.45)', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, background: '#f5820a', borderRadius: 2 }} /> Real
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, background: 'rgba(168,85,247,0.5)', border: '1px dashed #a855f7', borderRadius: 2 }} /> Proyección
            </span>
            {view === 'facturacion' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 3, background: '#22c55e', borderRadius: 2 }} /> Resultado Neto
              </span>
            )}
            {view === 'recupero' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 3, background: '#06b6d4', borderRadius: 2 }} /> Acumulado
              </span>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 16 }}>
          {[
            {
              label: 'FACT. REAL',
              value: formatM(totalRealVentas),
              sub:   `${realData.length} meses`,
              color: '#f5820a',
            },
            {
              label: 'FACT. PROY',
              value: formatM(totalProyVentas),
              sub:   `${projData.length} meses`,
              color: '#a855f7',
            },
            {
              label: 'RES. PROY',
              value: formatM(totalProyRes),
              sub:   `${totalProyVentas > 0 ? (totalProyRes / totalProyVentas * 100).toFixed(1) : '0'}% margen`,
              color: '#22c55e',
            },
            {
              label: 'BREAK-EVEN',
              value: kpis.breakEven?.label ?? 'N/A',
              sub:   `${(acumFinal / INVERSION * 100).toFixed(0)}% a ${periodoLabel(lastPeriodo)}`,
              color: '#06b6d4',
            },
            {
              label: 'MEJOR MES',
              value: kpis.mejorMes?.label ?? 'N/A',
              sub:   kpis.mejorMes ? `${formatM(kpis.mejorMes.ventas)} proy.` : '',
              color: '#f5820a',
            },
          ].map((c, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.color}15`, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.color, fontFamily: "'DM Mono', monospace" }}>{c.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Supuestos */}
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 6 }}>SUPUESTOS DE PROYECCIÓN</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
            Inflación 1.5%/mes · CV 34% · CF crece 2.5%/mes · Regalías 5% · Delivery +8% sobre salón ·
            Diciembre +30% estacional · Comensales/día: Lun-Mar 20 · Mié 35 · Jue 60 · Vie 110 · Sáb 140 · Dom 35
          </div>
        </div>
      </div>
    </div>
  )
}
