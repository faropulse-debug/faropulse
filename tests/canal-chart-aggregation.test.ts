import { describe, it, expect } from 'vitest'
import {
  normalizeChannel,
  buildMonthlyFromRpc,
  buildWeeklyFromRpc,
  buildDailyFromRpc,
  buildChannelStats,
  availableMonthsFromCanalRows,
  filterToRecentMonths,
  type VentasPorCanalRow,
  type VentasPorCanalSemanaRow,
  type VentasPorCanalDiaRow,
} from '@/src/lib/canal-chart-helpers'

// ── Validated May 2026 totals (from sales_documents via REST, matches canal RPC) ──
// Salón=$27,603,680/381 docs · Delivery=$8,863,847/218 docs · TakeAway=$3,729,830/92 docs
// Total=$40,197,357 / 691 pedidos
const SALON_TOTAL        = 27603680
const APLICACIONES_TOTAL = 8863847
const MOSTRADOR_TOTAL    = 3729830
const GRAND_TOTAL        = 40197357

// Una fila por canal, mismo mes — espeja get_ventas_por_canal
const MAY26_MONTHLY: VentasPorCanalRow[] = [
  { mes: '2026-05', canal: 'Salón',    ventas: SALON_TOTAL,        pedidos: 381 },
  { mes: '2026-05', canal: 'Delivery', ventas: APLICACIONES_TOTAL, pedidos: 218 },
  { mes: '2026-05', canal: 'TakeAway', ventas: MOSTRADOR_TOTAL,    pedidos: 92  },
]

// Multi-mes para separar/ordenar
const MULTI_MONTH: VentasPorCanalRow[] = [
  ...MAY26_MONTHLY,
  { mes: '2026-04', canal: 'Salón', ventas: 1000000, pedidos: 10 },
]

// Multi-semana — espeja get_ventas_por_canal_semana
const MULTI_WEEK: VentasPorCanalSemanaRow[] = [
  { semana: '2026-04-27', canal: 'Salón',        ventas: 300000, pedidos: 3 },
  { semana: '2026-04-27', canal: 'APLICACIONES', ventas: 100000, pedidos: 1 },
  { semana: '2026-05-04', canal: 'Salón',        ventas: 400000, pedidos: 4 },
  { semana: '2026-05-04', canal: 'MOSTRADOR',    ventas: 150000, pedidos: 2 },
]

// Multi-día, un mes — espeja get_ventas_por_canal_dia
const MULTI_DAY: VentasPorCanalDiaRow[] = [
  { fecha: '2026-05-01', canal: 'Salón',        ventas: 300000, pedidos: 3 },
  { fecha: '2026-05-01', canal: 'APLICACIONES', ventas: 100000, pedidos: 1 },
  { fecha: '2026-05-08', canal: 'Salón',        ventas: 400000, pedidos: 4 },
  { fecha: '2026-05-08', canal: 'MOSTRADOR',    ventas: 150000, pedidos: 2 },
  { fecha: '2026-05-15', canal: 'Salón',        ventas: 200000, pedidos: 2 },
]

// ── normalizeChannel ──────────────────────────────────────────────────────────

describe('normalizeChannel', () => {
  it('maps SALON and SALÓN to SALON', () => {
    expect(normalizeChannel('SALON')).toBe('SALON')
    expect(normalizeChannel('SALÓN')).toBe('SALON')
    expect(normalizeChannel('salon')).toBe('SALON')
  })
  it('maps APLICACIONES, APP, DELIVERY to APLICACIONES', () => {
    expect(normalizeChannel('APLICACIONES')).toBe('APLICACIONES')
    expect(normalizeChannel('APP')).toBe('APLICACIONES')
    expect(normalizeChannel('DELIVERY')).toBe('APLICACIONES')
  })
  it('maps MOSTRADOR and TAKEAWAY to MOSTRADOR', () => {
    expect(normalizeChannel('MOSTRADOR')).toBe('MOSTRADOR')
    expect(normalizeChannel('TakeAway')).toBe('MOSTRADOR')
  })
  it('returns null for unknown channel', () => {
    expect(normalizeChannel('PEDIDOSYA')).toBeNull()
    expect(normalizeChannel('')).toBeNull()
  })
})

// ── buildMonthlyFromRpc ─────────────────────────────────────────────────────────

describe('buildMonthlyFromRpc', () => {
  it('smoke: 3 canales mayo 2026 suman $40.197.357 (total validado)', () => {
    const pts = buildMonthlyFromRpc(MAY26_MONTHLY)
    expect(pts).toHaveLength(1)
    expect(pts[0].total).toBe(GRAND_TOTAL)
  })
  it('SALON + APLICACIONES + MOSTRADOR suman el total del mes', () => {
    const pts = buildMonthlyFromRpc(MAY26_MONTHLY)
    expect(pts[0].SALON + pts[0].APLICACIONES + pts[0].MOSTRADOR).toBe(GRAND_TOTAL)
  })
  it('nombre del punto = "May 26"', () => {
    const pts = buildMonthlyFromRpc(MAY26_MONTHLY)
    expect(pts[0].name).toBe('May 26')
  })
  it('separa meses distintos correctamente', () => {
    const pts = buildMonthlyFromRpc(MULTI_MONTH)
    expect(pts).toHaveLength(2)
    expect(pts[0].name).toBe('Abr 26')   // sorted asc
    expect(pts[1].name).toBe('May 26')
  })
  it('ignora filas con canal desconocido', () => {
    const rows: VentasPorCanalRow[] = [
      { mes: '2026-05', canal: 'RAPPI', ventas: 999, pedidos: 1 },
      { mes: '2026-05', canal: 'Salón', ventas: 100, pedidos: 1 },
    ]
    const pts = buildMonthlyFromRpc(rows)
    expect(pts[0].SALON).toBe(100)
    expect(pts[0].total).toBe(100)
  })
})

// ── buildWeeklyFromRpc ───────────────────────────────────────────────────────────

describe('buildWeeklyFromRpc', () => {
  it('agrupa por semana (ya viene agrupado en SQL, acá solo pivotea por canal)', () => {
    const pts = buildWeeklyFromRpc(MULTI_WEEK)
    expect(pts).toHaveLength(2)
  })
  it('suma total = suma de todos los ventas individuales', () => {
    const pts = buildWeeklyFromRpc(MULTI_WEEK)
    const sum = pts.reduce((s, p) => s + p.total, 0)
    const expected = MULTI_WEEK.reduce((s, r) => s + r.ventas, 0)
    expect(sum).toBe(expected)
  })
  it('cada canal aterriza en su columna', () => {
    const pts = buildWeeklyFromRpc(MULTI_WEEK)
    expect(pts[0].SALON).toBe(300000)
    expect(pts[0].APLICACIONES).toBe(100000)
    expect(pts[1].MOSTRADOR).toBe(150000)
  })
})

// ── buildDailyFromRpc ──────────────────────────────────────────────────────────

describe('buildDailyFromRpc', () => {
  it('retorna una entrada por día con datos (no por canal)', () => {
    const pts = buildDailyFromRpc(MULTI_DAY)
    expect(pts).toHaveLength(3)
  })
  it('agrega correctamente múltiples canales en el mismo día', () => {
    const pts  = buildDailyFromRpc(MULTI_DAY)
    const day1 = pts[0]   // 01: SALON 300k + APLICACIONES 100k
    expect(day1.SALON).toBe(300000)
    expect(day1.APLICACIONES).toBe(100000)
    expect(day1.MOSTRADOR).toBe(0)
    expect(day1.total).toBe(400000)
  })
  it('nombre del punto = número de día sin cero inicial', () => {
    const pts = buildDailyFromRpc(MULTI_DAY)
    expect(pts[0].name).toBe('1')
    expect(pts[1].name).toBe('8')
  })
  it('retorna [] para array vacío', () => {
    expect(buildDailyFromRpc([])).toHaveLength(0)
  })
})

// ── buildChannelStats ─────────────────────────────────────────────────────────
// Consume filas de get_ventas_por_canal (RPC neteada con documento_peso en SQL),
// no sales_documents crudo — por eso pedidos viene ya restado de la Nota de
// Crédito y acá solo se suma entre meses, sin volver a contar filas.

describe('buildChannelStats', () => {
  it('smoke: totales validados mayo 2026', () => {
    const stats = buildChannelStats(MAY26_MONTHLY)
    const salon = stats.find(s => s.channel === 'SALON')!
    expect(salon.total).toBe(SALON_TOTAL)
    expect(stats.find(s => s.channel === 'APLICACIONES')!.total).toBe(APLICACIONES_TOTAL)
    expect(stats.find(s => s.channel === 'MOSTRADOR')!.total).toBe(MOSTRADOR_TOTAL)
  })
  it('pctOfTotal suma 100%', () => {
    const stats = buildChannelStats(MAY26_MONTHLY)
    expect(stats.reduce((s, r) => s + r.pctOfTotal, 0)).toBeCloseTo(100, 5)
  })
  it('SALON representa ~68.7%', () => {
    const stats = buildChannelStats(MAY26_MONTHLY)
    expect(stats.find(s => s.channel === 'SALON')!.pctOfTotal).toBeCloseTo(68.7, 0)
  })
  it('count (pedidos) viene de la RPC, sumado entre meses — no cuenta filas', () => {
    const rows: VentasPorCanalRow[] = [
      { mes: '2026-05', canal: 'Salón',    ventas: 3000, pedidos: 2 },
      { mes: '2026-04', canal: 'Salón',    ventas: 1000, pedidos: 1 },
      { mes: '2026-05', canal: 'Delivery', ventas: 1500, pedidos: 1 },
    ]
    const stats = buildChannelStats(rows)
    expect(stats.find(s => s.channel === 'SALON')!.count).toBe(3)
    expect(stats.find(s => s.channel === 'APLICACIONES')!.count).toBe(1)
    expect(stats.find(s => s.channel === 'MOSTRADOR')!.count).toBe(0)
  })
  it('ticketAvg = ventas / pedidos (division simple sobre valores ya neteados, no re-implementa documento_peso)', () => {
    const stats = buildChannelStats(MAY26_MONTHLY)
    const salon = stats.find(s => s.channel === 'SALON')!
    expect(salon.ticketAvg).toBeCloseTo(SALON_TOTAL / 381, 5)
  })
})

// ── availableMonthsFromCanalRows ───────────────────────────────────────────────

describe('availableMonthsFromCanalRows', () => {
  it('retorna meses únicos ordenados desc (más reciente primero)', () => {
    const rows: VentasPorCanalRow[] = [
      { mes: '2026-03', canal: 'Salón', ventas: 1, pedidos: 1 },
      { mes: '2026-05', canal: 'Salón', ventas: 1, pedidos: 1 },
      { mes: '2026-05', canal: 'Delivery', ventas: 1, pedidos: 1 },
      { mes: '2026-04', canal: 'Salón', ventas: 1, pedidos: 1 },
    ]
    expect(availableMonthsFromCanalRows(rows)).toEqual(['2026-05', '2026-04', '2026-03'])
  })
  it('retorna [] para array vacío', () => {
    expect(availableMonthsFromCanalRows([])).toHaveLength(0)
  })
})

// ── filterToRecentMonths ─────────────────────────────────────────────────────
// Semestre móvil restaurado: Mensual y el selector de Diario se acotan a los
// últimos n meses con datos, no a todo el histórico.

describe('filterToRecentMonths', () => {
  const NINE_MONTHS: VentasPorCanalRow[] = [
    '2025-09', '2025-10', '2025-11', '2025-12',
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
  ].map(mes => ({ mes, canal: 'Salón', ventas: 100, pedidos: 1 }))

  it('se queda solo con los últimos n meses presentes en el dataset', () => {
    const result = filterToRecentMonths(NINE_MONTHS, 6)
    const months = [...new Set(result.map(r => r.mes))].sort()
    expect(months).toEqual(['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'])
  })
  it('no rompe si hay menos meses que n', () => {
    const rows: VentasPorCanalRow[] = [{ mes: '2026-05', canal: 'Salón', ventas: 100, pedidos: 1 }]
    expect(filterToRecentMonths(rows, 6)).toHaveLength(1)
  })
  it('preserva todas las filas (todos los canales) de los meses elegidos', () => {
    const rows: VentasPorCanalRow[] = [
      { mes: '2026-05', canal: 'Salón',    ventas: 100, pedidos: 1 },
      { mes: '2026-05', canal: 'Delivery', ventas: 200, pedidos: 2 },
    ]
    expect(filterToRecentMonths(rows, 1)).toHaveLength(2)
  })
})
