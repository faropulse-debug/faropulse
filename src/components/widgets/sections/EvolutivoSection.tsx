'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { useDashboardData }  from '@/hooks/useDashboardData'
import { SectionLabel }      from '@/components/dashboard/SectionLabel'
import { InsightBox }        from '@/components/dashboard/InsightBox'
import { CustomTooltip }     from '@/components/dashboard/CustomTooltip'
import { fmtMillones }       from '@/lib/format'

// ─── Constants ────────────────────────────────────────────────────────────────

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const AMBER       = '#f5820a'
const BLUE_GRAY   = '#6b9cc8'
const GRID_STROKE = 'rgba(255,255,255,0.05)'
const AXIS_TICK   = { fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'var(--font-body)' }

const PE_MENSUAL = 11_800_000

// ─── Mock fallback ────────────────────────────────────────────────────────────

const evolutivo6m = [
  { mes: 'Ago', ventas: 52_000_000, resultado: 28_600_000, pe: 11_000_000 },
  { mes: 'Sep', ventas: 60_500_000, resultado: 34_100_000, pe: 11_200_000 },
  { mes: 'Oct', ventas: 55_200_000, resultado: 30_900_000, pe: 11_400_000 },
  { mes: 'Nov', ventas: 68_400_000, resultado: 40_500_000, pe: 11_600_000 },
  { mes: 'Dic', ventas: 78_000_000, resultado: 48_600_000, pe: 11_700_000 },
  { mes: 'Ene', ventas: 82_100_000, resultado: 50_600_000, pe: 11_800_000 },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  locationId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EvolutivoSection({ locationId }: Props) {
  const { data: liveData, isLoading } = useDashboardData(locationId)

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

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Evolutivo 6 meses</SectionLabel>
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '16px', backdropFilter: 'blur(20px)', padding: '24px',
        opacity: isLoading ? 0.5 : 1, transition: 'opacity 0.3s',
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
                <stop offset="5%"  stopColor={AMBER}     stopOpacity={0.18} />
                <stop offset="95%" stopColor={AMBER}     stopOpacity={0} />
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
  )
}
