import { describe, it, expect } from 'vitest'
import {
  normalizeChannel,
  buildMonthly,
  buildWeekly,
  buildDaily,
  buildChannelStats,
  availableMonths,
  type RawSaleRow,
  type ChannelSummaryRow,
} from '@/src/lib/canal-chart-helpers'

// ── Validated May 2026 totals (from sales_documents via REST, matches canal RPC) ──
// Salón=$27,603,680/381 docs · Delivery=$8,863,847/218 docs · TakeAway=$3,729,830/92 docs
// Total=$40,197,357 / 691 pedidos
const SALON_TOTAL        = 27603680
const APLICACIONES_TOTAL = 8863847
const MOSTRADOR_TOTAL    = 3729830
const GRAND_TOTAL        = 40197357

// Three rows = one per channel, same-day, validated totals
const MAY26_ONE_PER_CH: RawSaleRow[] = [
  { fecha: '2026-05-15', total: SALON_TOTAL,        tipo_zona: 'SALON'        },
  { fecha: '2026-05-15', total: APLICACIONES_TOTAL, tipo_zona: 'APLICACIONES' },
  { fecha: '2026-05-15', total: MOSTRADOR_TOTAL,    tipo_zona: 'MOSTRADOR'    },
]

// Multi-day data for daily/weekly tests
const MULTI_DAY: RawSaleRow[] = [
  { fecha: '2026-05-01', total: 300000, tipo_zona: 'SALON'        },
  { fecha: '2026-05-01', total: 100000, tipo_zona: 'APLICACIONES' },
  { fecha: '2026-05-08', total: 400000, tipo_zona: 'SALON'        },
  { fecha: '2026-05-08', total: 150000, tipo_zona: 'MOSTRADOR'    },
  { fecha: '2026-05-15', total: 200000, tipo_zona: 'SALON'        },
  // April row — must be excluded from daily May filter
  { fecha: '2026-04-30', total: 999999, tipo_zona: 'SALON'        },
]

// Simulate timestamps returned by Supabase when fecha is timestamptz
const TIMESTAMPS: RawSaleRow[] = [
  { fecha: '2026-05-15T00:00:00+00:00', total: 500000, tipo_zona: 'SALON'        },
  { fecha: '2026-05-15T00:00:00+00:00', total: 200000, tipo_zona: 'APLICACIONES' },
  { fecha: '2026-05-22T00:00:00+00:00', total: 300000, tipo_zona: 'SALON'        },
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

// ── buildMonthly — smoke test ──────────────────────────────────────────────────

describe('buildMonthly', () => {
  it('smoke: 3 canales mayo 2026 suman $40.197.357 (total validado)', () => {
    const pts = buildMonthly(MAY26_ONE_PER_CH)
    expect(pts).toHaveLength(1)
    expect(pts[0].total).toBe(GRAND_TOTAL)
  })
  it('SALON + APLICACIONES + MOSTRADOR suman el total del mes', () => {
    const pts = buildMonthly(MAY26_ONE_PER_CH)
    expect(pts[0].SALON + pts[0].APLICACIONES + pts[0].MOSTRADOR).toBe(GRAND_TOTAL)
  })
  it('nombre del punto = "May 26"', () => {
    const pts = buildMonthly(MAY26_ONE_PER_CH)
    expect(pts[0].name).toBe('May 26')
  })
  it('separa meses distintos correctamente', () => {
    const mixed: RawSaleRow[] = [
      ...MAY26_ONE_PER_CH,
      { fecha: '2026-04-15', total: 1000000, tipo_zona: 'SALON' },
    ]
    const pts = buildMonthly(mixed)
    expect(pts).toHaveLength(2)
    expect(pts[0].name).toBe('Abr 26')   // sorted asc
    expect(pts[1].name).toBe('May 26')
  })
  it('ignora filas con tipo_zona desconocido', () => {
    const rows: RawSaleRow[] = [
      { fecha: '2026-05-01', total: 999, tipo_zona: 'RAPPI' },
      { fecha: '2026-05-01', total: 100, tipo_zona: 'SALON' },
    ]
    const pts = buildMonthly(rows)
    expect(pts[0].SALON).toBe(100)
    expect(pts[0].total).toBe(100)
  })
})

// ── buildWeekly — Semanal bug fix ─────────────────────────────────────────────

describe('buildWeekly', () => {
  it('agrupa correctamente con fechas en formato date (YYYY-MM-DD)', () => {
    const pts = buildWeekly(MULTI_DAY)
    // May 1 = Friday → Monday 2026-04-27 (same week as Apr 30)
    // May 8 = Friday → Monday 2026-05-05
    // May 15 = Friday → Monday 2026-05-11 (same week as May 8 from prev)
    // Apr 30 = Thursday → Monday 2026-04-27
    expect(pts.length).toBeGreaterThan(0)
    const weekTotals = pts.map(p => p.total)
    expect(weekTotals.every(t => t > 0)).toBe(true)
  })
  it('agrupa correctamente con timestamps ISO (bug de Semanal — fix de isoDate())', () => {
    // Before the fix, getMondayOfWeek("2026-05-15T00:00:00+00:00") returned NaN
    // making all weekly points land in the same "NaN" bucket.
    const pts = buildWeekly(TIMESTAMPS)
    expect(pts.length).toBeGreaterThan(0)
    // Both dates should be in DIFFERENT weeks
    // May 15 (Fri) → Mon 2026-05-11; May 22 (Fri) → Mon 2026-05-18
    expect(pts.length).toBe(2)
  })
  it('suma total = suma de todos los totales individuales', () => {
    const rows: RawSaleRow[] = MULTI_DAY.filter(r => r.fecha.startsWith('2026-05'))
    const pts  = buildWeekly(rows)
    const sum  = pts.reduce((s, p) => s + p.total, 0)
    const expected = rows.reduce((s, r) => s + r.total, 0)
    expect(sum).toBe(expected)
  })
})

// ── buildDaily ────────────────────────────────────────────────────────────────

describe('buildDaily', () => {
  it('filtra sólo las filas del mes indicado', () => {
    const pts = buildDaily(MULTI_DAY, '2026-05')
    // Must not include the April row (total=999999)
    const total = pts.reduce((s, p) => s + p.total, 0)
    const mayOnly = MULTI_DAY.filter(r => r.fecha.startsWith('2026-05'))
      .reduce((s, r) => s + r.total, 0)
    expect(total).toBe(mayOnly)
  })
  it('retorna una entrada por día con datos (no por canal)', () => {
    const pts = buildDaily(MULTI_DAY, '2026-05')
    // 3 distinct days in May: 01, 08, 15
    expect(pts).toHaveLength(3)
  })
  it('agrega correctamente múltiples canales en el mismo día', () => {
    const pts  = buildDaily(MULTI_DAY, '2026-05')
    const day1 = pts[0]   // May 01: SALON 300k + APLICACIONES 100k
    expect(day1.SALON).toBe(300000)
    expect(day1.APLICACIONES).toBe(100000)
    expect(day1.MOSTRADOR).toBe(0)
    expect(day1.total).toBe(400000)
  })
  it('nombre del punto = número de día sin cero inicial', () => {
    const pts = buildDaily(MULTI_DAY, '2026-05')
    expect(pts[0].name).toBe('1')
    expect(pts[1].name).toBe('8')
  })
  it('funciona con timestamps ISO (bug de Semanal aplicado a Diario)', () => {
    const pts = buildDaily(TIMESTAMPS, '2026-05')
    expect(pts.length).toBe(2)  // days 15 and 22
    expect(pts[0].SALON).toBe(500000)
    expect(pts[0].APLICACIONES).toBe(200000)
  })
  it('retorna [] para mes sin datos', () => {
    expect(buildDaily(MULTI_DAY, '2025-01')).toHaveLength(0)
  })
  it('retorna [] para month vacío', () => {
    expect(buildDaily(MULTI_DAY, '')).toHaveLength(0)
  })
})

// ── buildChannelStats ─────────────────────────────────────────────────────────
// Consume filas de get_ventas_por_canal (RPC neteada con documento_peso en SQL),
// no sales_documents crudo — por eso pedidos viene ya restado de la Nota de
// Crédito y acá solo se suma entre meses, sin volver a contar filas.

const MAY26_SUMMARY: ChannelSummaryRow[] = [
  { canal: 'Salón',    ventas: SALON_TOTAL,        pedidos: 381 },
  { canal: 'Delivery', ventas: APLICACIONES_TOTAL, pedidos: 218 },
  { canal: 'TakeAway', ventas: MOSTRADOR_TOTAL,    pedidos: 92  },
]

describe('buildChannelStats', () => {
  it('smoke: totales validados mayo 2026', () => {
    const stats = buildChannelStats(MAY26_SUMMARY)
    const salon = stats.find(s => s.channel === 'SALON')!
    expect(salon.total).toBe(SALON_TOTAL)
    expect(stats.find(s => s.channel === 'APLICACIONES')!.total).toBe(APLICACIONES_TOTAL)
    expect(stats.find(s => s.channel === 'MOSTRADOR')!.total).toBe(MOSTRADOR_TOTAL)
  })
  it('pctOfTotal suma 100%', () => {
    const stats = buildChannelStats(MAY26_SUMMARY)
    expect(stats.reduce((s, r) => s + r.pctOfTotal, 0)).toBeCloseTo(100, 5)
  })
  it('SALON representa ~68.7%', () => {
    const stats = buildChannelStats(MAY26_SUMMARY)
    expect(stats.find(s => s.channel === 'SALON')!.pctOfTotal).toBeCloseTo(68.7, 0)
  })
  it('count (pedidos) viene de la RPC, sumado entre meses — no cuenta filas', () => {
    const rows: ChannelSummaryRow[] = [
      { canal: 'Salón',    ventas: 3000, pedidos: 2 },
      { canal: 'Salón',    ventas: 1000, pedidos: 1 },   // segundo mes, mismo canal
      { canal: 'Delivery', ventas: 1500, pedidos: 1 },
    ]
    const stats = buildChannelStats(rows)
    expect(stats.find(s => s.channel === 'SALON')!.count).toBe(3)
    expect(stats.find(s => s.channel === 'APLICACIONES')!.count).toBe(1)
    expect(stats.find(s => s.channel === 'MOSTRADOR')!.count).toBe(0)
  })
  it('ticketAvg = ventas / pedidos (division simple sobre valores ya neteados, no re-implementa documento_peso)', () => {
    const stats = buildChannelStats(MAY26_SUMMARY)
    const salon = stats.find(s => s.channel === 'SALON')!
    expect(salon.ticketAvg).toBeCloseTo(SALON_TOTAL / 381, 5)
  })
})

// ── availableMonths ────────────────────────────────────────────────────────────

describe('availableMonths', () => {
  it('retorna meses únicos ordenados desc (más reciente primero)', () => {
    const rows: RawSaleRow[] = [
      { fecha: '2026-03-15', total: 1, tipo_zona: 'SALON' },
      { fecha: '2026-05-01', total: 1, tipo_zona: 'SALON' },
      { fecha: '2026-05-20', total: 1, tipo_zona: 'SALON' },
      { fecha: '2026-04-10', total: 1, tipo_zona: 'SALON' },
    ]
    const months = availableMonths(rows)
    expect(months).toEqual(['2026-05', '2026-04', '2026-03'])
  })
  it('funciona con timestamps ISO', () => {
    const rows: RawSaleRow[] = [
      { fecha: '2026-05-15T00:00:00+00:00', total: 1, tipo_zona: 'SALON' },
      { fecha: '2026-04-10T00:00:00+00:00', total: 1, tipo_zona: 'SALON' },
    ]
    const months = availableMonths(rows)
    expect(months).toEqual(['2026-05', '2026-04'])
  })
  it('retorna [] para array vacío', () => {
    expect(availableMonths([])).toHaveLength(0)
  })
})
