'use client'

import { useMemo }       from 'react'
import { SectionLabel }  from '@/components/dashboard/SectionLabel'
import { InsightBox }    from '@/components/dashboard/InsightBox'
import { fmtPeso, fmtPct } from '@/lib/format'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcularProyeccion(valores: number[]): number {
  const n       = valores.length
  const sumX    = (n * (n - 1)) / 2
  const sumY    = valores.reduce((a, b) => a + b, 0)
  const sumXY   = valores.reduce((acc, v, i) => acc + i * v, 0)
  const sumX2   = valores.reduce((acc, _, i) => acc + i * i, 0)
  const slope   = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  return intercept + slope * n
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

const mockSem = {
  resultadoNeto: {
    valores: [{ mes: 'Oct', valor: 8.2 }, { mes: 'Nov', valor: 6.1 }, { mes: 'Dic', valor: 11.4 }],
  },
  puntoEquilibrioDiario: {
    valores: [{ mes: 'Oct', valor: 142_000 }, { mes: 'Nov', valor: 156_000 }, { mes: 'Dic', valor: 149_000 }],
    ventaPromedioReal: [148_000, 162_000, 198_000],
  },
  ticketPromedio: {
    valores: [{ mes: 'Oct', valor: 4_200 }, { mes: 'Nov', valor: 4_650 }, { mes: 'Dic', valor: 5_100 }],
    meta: 5_500,
  },
  margenDelivery: {
    valores: [{ mes: 'Oct', valor: 41 }, { mes: 'Nov', valor: 39 }, { mes: 'Dic', valor: 43 }],
  },
  costoLaboral: {
    valores: [{ mes: 'Oct', valor: 28.4 }, { mes: 'Nov', valor: 31.2 }, { mes: 'Dic', valor: 26.8 }],
  },
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  locationId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AlertasSection({ locationId: _locationId }: Props) {
  const insights = useMemo(() => {
    const rnValues = mockSem.resultadoNeto.valores.map(v => v.valor)
    const peValues = mockSem.puntoEquilibrioDiario.valores.map(v => v.valor)
    const tpValues = mockSem.ticketPromedio.valores.map(v => v.valor)
    const mdValues = mockSem.margenDelivery.valores.map(v => v.valor)
    const clValues = mockSem.costoLaboral.valores.map(v => v.valor)

    const rnLast    = rnValues[rnValues.length - 1]
    const peLast    = peValues[peValues.length - 1]
    const ventaLast = mockSem.puntoEquilibrioDiario.ventaPromedioReal[mockSem.puntoEquilibrioDiario.ventaPromedioReal.length - 1]
    const tpLast    = tpValues[tpValues.length - 1]
    const tpPrev    = tpValues[tpValues.length - 2]
    const mdLast    = mdValues[mdValues.length - 1]
    const clLast    = clValues[clValues.length - 1]

    const rnProj      = calcularProyeccion(rnValues)
    const colchonPE   = ventaLast - peLast
    const tpPctGrowth = (((tpLast - tpValues[0]) / tpValues[0]) * 100).toFixed(1)

    return [
      {
        text: rnProj > rnLast
          ? `Tendencia positiva en resultado neto: proyectás cerrar el mes siguiente en ${rnProj.toFixed(1)}%`
          : 'Atención: la tendencia indica compresión de margen en el próximo mes',
        type: (rnProj > rnLast ? 'positive' : 'warning') as 'positive' | 'warning',
      },
      {
        text: ventaLast > peLast * 1.2
          ? `Operás con colchón saludable sobre el PE diario. Margen de seguridad: ${fmtPeso(colchonPE)}/día`
          : 'Márgenes ajustados sobre el PE. Revisá costos fijos',
        type: (ventaLast > peLast * 1.2 ? 'positive' : 'warning') as 'positive' | 'warning',
      },
      {
        text: tpLast > tpPrev
          ? `El ticket promedio creció ${tpPctGrowth}% en 3 meses. Proyección: ${fmtPeso(Math.round(calcularProyeccion(tpValues)))} próximo mes`
          : 'Ticket promedio estancado. Considerá mix de productos o ajuste de precios',
        type: (tpLast > tpPrev ? 'positive' : 'info') as 'positive' | 'info',
      },
      {
        text: mdLast < 40
          ? `Margen delivery por debajo del umbral rentable (40%). Revisá comisión de la plataforma`
          : `Canal delivery operando en zona saludable (${mdLast}%)`,
        type: (mdLast < 40 ? 'warning' : 'positive') as 'warning' | 'positive',
      },
      {
        text: clLast > 30
          ? `Costo laboral elevado (${fmtPct(clLast)}). Revisá dotación vs demanda real por turno`
          : `Eficiencia laboral dentro del benchmark del sector (${fmtPct(clLast)})`,
        type: (clLast > 30 ? 'warning' : 'positive') as 'warning' | 'positive',
      },
    ]
  }, [])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Alertas e Insights</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '10px' }}>
        {insights.map((ins, i) => (
          <InsightBox key={i} text={ins.text} type={ins.type} />
        ))}
      </div>
    </div>
  )
}
