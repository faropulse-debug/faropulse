import { describe, it, expect } from 'vitest'
import {
  isPendingReview,
  buildPendingReviewKeys,
  filterIncludedTickets,
  type RawDescuentosRow,
  type TopTicketRow,
} from '@/src/components/widgets/sections/DescuentosSection'

// Invariante (a) de la auditoría de Descuentos: "Suma de la columna PERDIDO
// del detalle = KPI Plata perdida". Hoy (2026-09) no hay ningún canal con
// tasa_efectiva negativa en STG, así que no se puede reproducir con datos
// reales -- pero APLICACIONES SÍ tuvo tasa negativa hasta hace tres semanas
// (ver migración 20260828000003), y kpis.plataTotal ya filtraba esos canales
// mientras el detalle por ticket (get_descuentos_top_tickets) no filtraba
// nada. Mismo patrón que el bug de los $3.540 de la migración
// 20260828000003: dos sumas sobre conjuntos de filas distintos que solo
// coinciden por casualidad de los datos del momento.
//
// Dato sintético: dos canales en el mismo mes, uno normal (SALON) y uno
// pendiente de revisión (APLICACIONES, tasa_efectiva < 0).
function buildFixture() {
  const mes = '2026-07-01'

  const resumen: RawDescuentosRow[] = [
    {
      mes_inicio: mes, tipo_zona: 'SALON',
      plata_perdida: 100_000, bruto_total: 500_000, bruto_total_canal: 2_000_000,
      tickets: 50, tickets_con_descuento: 10, avg_descuento_pct: 20, tasa_efectiva: 0.05,
    },
    {
      mes_inicio: mes, tipo_zona: 'APLICACIONES',
      plata_perdida: -20_000, bruto_total: 180_000, bruto_total_canal: 900_000,
      tickets: 30, tickets_con_descuento: 8, avg_descuento_pct: 15, tasa_efectiva: -0.022,
    },
  ]

  // El detalle por ticket viene de OTRO RPC (get_descuentos_top_tickets):
  // no trae tasa_efectiva ni sabe qué canal está pendiente de revisión.
  const monthTickets: TopTicketRow[] = [
    { external_id: 'A', fecha_caja: `${mes.slice(0, 7)}-10`, tipo_zona: 'SALON', comensales: 2, unidades: 4, bruto: 120_000, total: 60_000, descuento: 50, plata_perdida: 60_000 },
    { external_id: 'B', fecha_caja: `${mes.slice(0, 7)}-15`, tipo_zona: 'SALON', comensales: 3, unidades: 5, bruto: 80_000, total: 40_000, descuento: 50, plata_perdida: 40_000 },
    { external_id: 'C', fecha_caja: `${mes.slice(0, 7)}-12`, tipo_zona: 'APLICACIONES', comensales: 1, unidades: 2, bruto: 30_000, total: 15_000, descuento: 50, plata_perdida: 15_000 },
    { external_id: 'D', fecha_caja: `${mes.slice(0, 7)}-20`, tipo_zona: 'APLICACIONES', comensales: 4, unidades: 6, bruto: 70_000, total: 105_000, descuento: 10, plata_perdida: -35_000 },
  ]

  return { mes, resumen, monthTickets }
}

function kpiPlataTotal(resumen: RawDescuentosRow[], mes: string): number {
  return resumen
    .filter(r => r.mes_inicio === mes && !isPendingReview(r))
    .reduce((sum, r) => sum + r.plata_perdida, 0)
}

function sumPerdido(tickets: TopTicketRow[]): number {
  return tickets.reduce((sum, t) => sum + (t.plata_perdida ?? 0), 0)
}

describe('Invariante — detalle de tickets vs KPI Plata perdida', () => {
  it('APLICACIONES está pendiente de revisión con el dato sintético (precondición del fixture)', () => {
    const { resumen } = buildFixture()
    const aplicaciones = resumen.find(r => r.tipo_zona === 'APLICACIONES')!
    expect(isPendingReview(aplicaciones)).toBe(true)
    expect(isPendingReview(resumen.find(r => r.tipo_zona === 'SALON')!)).toBe(false)
  })

  it('SIN el filtro de canales, el detalle NO coincide con el KPI (reproduce el bug pre-fix)', () => {
    const { mes, resumen, monthTickets } = buildFixture()
    const kpi = kpiPlataTotal(resumen, mes)
    const detalleSinFiltrar = sumPerdido(monthTickets)

    expect(kpi).toBe(100_000)
    expect(detalleSinFiltrar).toBe(80_000) // 60.000 + 40.000 + 15.000 - 35.000
    expect(detalleSinFiltrar).not.toBe(kpi)
  })

  it('CON filterIncludedTickets, la suma de "Perdido" del detalle == KPI Plata perdida', () => {
    const { mes, resumen, monthTickets } = buildFixture()
    const pendingKeys = buildPendingReviewKeys(resumen)
    const included = filterIncludedTickets(monthTickets, pendingKeys)

    // Solo quedan los tickets de SALON -- APLICACIONES queda afuera del
    // detalle igual que queda afuera del KPI.
    expect(included.map(t => t.external_id).sort()).toEqual(['A', 'B'])

    const kpi = kpiPlataTotal(resumen, mes)
    const detalleFiltrado = sumPerdido(included)
    expect(detalleFiltrado).toBe(kpi)
    expect(detalleFiltrado).toBe(100_000)
  })

  it('un canal sin filas en resumen para ese mes (sin match) no se excluye por error', () => {
    // Guard contra falsos positivos: un ticket de un canal/mes que no está
    // en pendingReviewKeys en absoluto (nunca se vio en el resumen) debe
    // pasar el filtro, no quedar afuera por accidente de un Set vacío/mal
    // armado.
    const pendingKeys = buildPendingReviewKeys([])
    const tickets: TopTicketRow[] = [
      { external_id: 'Z', fecha_caja: '2026-07-05', tipo_zona: 'MOSTRADOR', comensales: 1, unidades: 1, bruto: 1000, total: 500, descuento: 50, plata_perdida: 500 },
    ]
    expect(filterIncludedTickets(tickets, pendingKeys)).toHaveLength(1)
  })
})
