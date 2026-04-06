'use client'

import { useMemo }                        from 'react'
import { SectionLabel }                   from '@/components/dashboard/SectionLabel'
import { KpiCard }                        from '@/components/dashboard/KpiCard'
import type { SemColor }                  from '@/components/dashboard/KpiCard'
import { fmtPct, fmtPeso }               from '@/lib/format'

// ─── Semáforos ────────────────────────────────────────────────────────────────

function semResultadoNeto(v: number):               SemColor { return v >= 8 ? 'green' : v >= 4 ? 'yellow' : 'red' }
function semPE(venta: number, pe: number):          SemColor { return venta > pe * 1.15 ? 'green' : venta >= pe ? 'yellow' : 'red' }
function semTicket(v: number, meta: number):        SemColor { return v >= meta ? 'green' : v >= meta * 0.85 ? 'yellow' : 'red' }
function semDelivery(v: number):                    SemColor { return v >= 45 ? 'green' : v >= 38 ? 'yellow' : 'red' }
function semLaboral(v: number):                     SemColor { return v <= 28 ? 'green' : v <= 32 ? 'yellow' : 'red' }

// ─── Mock fallback ────────────────────────────────────────────────────────────

const mockSem = {
  resultadoNeto: {
    label: 'Resultado Neto', unit: '% sobre ventas',
    valores: [{ mes: 'Oct', valor: 8.2 }, { mes: 'Nov', valor: 6.1 }, { mes: 'Dic', valor: 11.4 }],
    benchmark: 8, meta: 12,
  },
  puntoEquilibrioDiario: {
    label: 'PE Diario', unit: 'ARS $',
    valores: [{ mes: 'Oct', valor: 142_000 }, { mes: 'Nov', valor: 156_000 }, { mes: 'Dic', valor: 149_000 }],
    ventaPromedioReal: [148_000, 162_000, 198_000],
  },
  ticketPromedio: {
    label: 'Ticket Promedio', unit: 'ARS $ por doc.',
    valores: [{ mes: 'Oct', valor: 4_200 }, { mes: 'Nov', valor: 4_650 }, { mes: 'Dic', valor: 5_100 }],
    meta: 5_500,
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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  locationId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EstadoNegocioSection({ locationId: _locationId }: Props) {
  const { rn, pe, tp, md, cl, derived } = useMemo(() => {
    const rn = mockSem.resultadoNeto
    const pe = mockSem.puntoEquilibrioDiario
    const tp = mockSem.ticketPromedio
    const md = mockSem.margenDelivery
    const cl = mockSem.costoLaboral

    const rnValues  = rn.valores.map(v => v.valor)
    const peValues  = pe.valores.map(v => v.valor)
    const tpValues  = tp.valores.map(v => v.valor)
    const mdValues  = md.valores.map(v => v.valor)
    const clValues  = cl.valores.map(v => v.valor)

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

    return {
      rn, pe, tp, md, cl,
      derived: {
        rnValues, rnLast, rnPrev,
        peValues, peLast, pePrev, ventaLast,
        tpValues, tpLast, tpPrev,
        mdValues, mdLast, mdPrev,
        clValues, clLast, clPrev,
      },
    }
  }, [])

  const { rnValues, rnLast, rnPrev, peValues, peLast, pePrev, ventaLast,
          tpValues, tpLast, tpPrev, mdValues, mdLast, mdPrev,
          clValues, clLast, clPrev } = derived

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Estado del negocio</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        <KpiCard
          label={rn.label} unit={rn.unit}
          value={fmtPct(rnLast)}
          prevValue={rnPrev} currValue={rnLast}
          sem={semResultadoNeto(rnLast)}
          sparkValues={rnValues}
          formatDelta={v => v.toFixed(1) + ' pp'}
        />
        <KpiCard
          label={pe.label} unit={pe.unit}
          value={fmtPeso(peLast)}
          prevValue={pePrev} currValue={peLast}
          sem={semPE(ventaLast, peLast)}
          sparkValues={peValues}
          formatDelta={v => fmtPeso(v)}
        />
        <KpiCard
          label={tp.label} unit={tp.unit}
          value={fmtPeso(tpLast)}
          prevValue={tpPrev} currValue={tpLast}
          sem={semTicket(tpLast, tp.meta)}
          sparkValues={tpValues}
          formatDelta={v => fmtPeso(v)}
        />
        <KpiCard
          label={md.label} unit={md.unit}
          value={fmtPct(mdLast)}
          prevValue={mdPrev} currValue={mdLast}
          sem={semDelivery(mdLast)}
          sparkValues={mdValues}
          formatDelta={v => v.toFixed(1) + ' pp'}
        />
        <KpiCard
          label={cl.label} unit={cl.unit}
          value={fmtPct(clLast)}
          prevValue={clPrev} currValue={clLast}
          sem={semLaboral(clLast)}
          sparkValues={clValues}
          formatDelta={v => v.toFixed(1) + ' pp'}
        />
      </div>
    </div>
  )
}
