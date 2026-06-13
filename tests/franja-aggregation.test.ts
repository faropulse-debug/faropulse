import { describe, it, expect } from 'vitest'
import {
  availableMeses,
  computeFranjaRows,
  buildFranjaInsight,
  prevMonthOf,
  FRANJA_ORDER,
  type VentaFranja,
} from '@/src/lib/franja-helpers'

// ── Validated May 2026 data (from sales_documents via diag-franja-horaria.mjs) ──
// Campo hora (text, 100% cobertura). fecha_inicio/fecha_cierre 100% NULL.
// Tarde=$3,288,780/61p · Noche=$36,814,477/626p · Madrugada=$94,100/4p
// Mediodía: sin datos en mayo 2026 (restaurante opera tarde-noche).
// TOTAL: $40,197,357 / 691 pedidos
const MAY26: VentaFranja[] = [
  { mes: '2026-05', franja: 'Tarde',     ventas: 3288780,  pedidos: 61  },
  { mes: '2026-05', franja: 'Noche',     ventas: 36814477, pedidos: 626 },
  { mes: '2026-05', franja: 'Madrugada', ventas: 94100,    pedidos: 4   },
]
const GRAND_TOTAL   = 40197357
const GRAND_PEDIDOS = 691

// April data for varPct tests
const APR26: VentaFranja[] = [
  { mes: '2026-04', franja: 'Tarde',     ventas: 2500000,  pedidos: 50  },
  { mes: '2026-04', franja: 'Noche',     ventas: 30000000, pedidos: 550 },
  { mes: '2026-04', franja: 'Madrugada', ventas: 100000,   pedidos: 5   },
]

const MIXED = [...MAY26, ...APR26]

// ── prevMonthOf ────────────────────────────────────────────────────────────────

describe('prevMonthOf', () => {
  it('mes normal', () => expect(prevMonthOf('2026-05')).toBe('2026-04'))
  it('enero → diciembre del año anterior', () => expect(prevMonthOf('2026-01')).toBe('2025-12'))
})

// ── availableMeses ─────────────────────────────────────────────────────────────

describe('availableMeses', () => {
  it('retorna meses únicos ordenados desc', () => {
    expect(availableMeses(MIXED)).toEqual(['2026-05', '2026-04'])
  })
  it('retorna [] para array vacío', () => {
    expect(availableMeses([])).toHaveLength(0)
  })
})

// ── computeFranjaRows ──────────────────────────────────────────────────────────

describe('computeFranjaRows', () => {
  it('smoke: suma de ventas = $40,197,357', () => {
    const rows = computeFranjaRows(MAY26, '2026-05', '2026-04')
    expect(rows.reduce((s, r) => s + r.ventas, 0)).toBe(GRAND_TOTAL)
  })

  it('smoke: suma de pedidos = 691', () => {
    const rows = computeFranjaRows(MAY26, '2026-05', '2026-04')
    expect(rows.reduce((s, r) => s + r.pedidos, 0)).toBe(GRAND_PEDIDOS)
  })

  it('pct suma 100%', () => {
    const rows = computeFranjaRows(MAY26, '2026-05', '2026-04')
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100, 5)
  })

  it('orden respeta FRANJA_ORDER (sólo franjas con datos)', () => {
    const rows   = computeFranjaRows(MAY26, '2026-05', '2026-04')
    const labels = rows.map(r => r.franja)
    // Mediodía ausente en mayo → sólo Tarde, Noche, Madrugada en ese orden
    expect(labels).toEqual(['Tarde', 'Noche', 'Madrugada'])
  })

  it('isBest = Noche (mayor ventas $36,814,477)', () => {
    const rows = computeFranjaRows(MAY26, '2026-05', '2026-04')
    expect(rows.find(r => r.isBest)?.franja).toBe('Noche')
  })

  it('isWorst = Madrugada (menor ventas $94,100)', () => {
    const rows = computeFranjaRows(MAY26, '2026-05', '2026-04')
    expect(rows.find(r => r.isWorst)?.franja).toBe('Madrugada')
  })

  it('varPct calculada correctamente vs mes anterior', () => {
    const rows  = computeFranjaRows(MIXED, '2026-05', '2026-04')
    const tarde = rows.find(r => r.franja === 'Tarde')!
    // (3,288,780 - 2,500,000) / 2,500,000 * 100 = 31.551...%
    expect(tarde.varPct).not.toBeNull()
    expect(tarde.varPct!).toBeCloseTo(31.551, 1)
  })

  it('varPct = null cuando no hay datos del mes anterior', () => {
    const rows  = computeFranjaRows(MAY26, '2026-05', '2026-04')  // sin datos prev
    const tarde = rows.find(r => r.franja === 'Tarde')!
    expect(tarde.varPct).toBeNull()
  })

  it('Mediodía excluido cuando no tiene datos en el mes', () => {
    const rows = computeFranjaRows(MAY26, '2026-05', '2026-04')
    expect(rows.find(r => r.franja === 'Mediodía')).toBeUndefined()
  })

  it('incluye Mediodía cuando tiene datos', () => {
    const withMed: VentaFranja[] = [
      ...MAY26,
      { mes: '2026-05', franja: 'Mediodía', ventas: 500000, pedidos: 10 },
    ]
    const rows = computeFranjaRows(withMed, '2026-05', '2026-04')
    expect(rows.find(r => r.franja === 'Mediodía')).toBeDefined()
    // Mediodía debe aparecer antes que Tarde en el orden
    expect(rows[0].franja).toBe('Mediodía')
  })

  it('retorna [] para mes sin datos', () => {
    expect(computeFranjaRows(MAY26, '2025-01', '2024-12')).toHaveLength(0)
  })

  it('retorna [] para mes vacío', () => {
    expect(computeFranjaRows(MAY26, '', '')).toHaveLength(0)
  })

  it('con un solo franja: ni isBest ni isWorst (requiere ≥2)', () => {
    const solo: VentaFranja[] = [
      { mes: '2026-05', franja: 'Noche', ventas: 1000, pedidos: 5 },
    ]
    const rows = computeFranjaRows(solo, '2026-05', '2026-04')
    expect(rows[0].isBest).toBe(false)
    expect(rows[0].isWorst).toBe(false)
  })
})

// ── buildFranjaInsight ─────────────────────────────────────────────────────────

describe('buildFranjaInsight', () => {
  it('menciona la franja más fuerte y la más floja', () => {
    const rows    = computeFranjaRows(MAY26, '2026-05', '2026-04')
    const insight = buildFranjaInsight(rows)
    expect(insight).not.toBeNull()
    expect(insight).toContain('Noche')
    expect(insight).toContain('Madrugada')
  })

  it('incluye porcentaje de diferencia', () => {
    const rows = computeFranjaRows(MAY26, '2026-05', '2026-04')
    expect(buildFranjaInsight(rows)).toMatch(/\d+%/)
  })

  it('retorna null para array vacío', () => {
    expect(buildFranjaInsight([])).toBeNull()
  })

  it('frase alternativa cuando sólo hay una franja', () => {
    const solo: VentaFranja[] = [
      { mes: '2026-05', franja: 'Noche', ventas: 1000, pedidos: 5 },
    ]
    const rows    = computeFranjaRows(solo, '2026-05', '2026-04')
    // Una sola franja → no puede haber best/worst → null
    expect(buildFranjaInsight(rows)).toBeNull()
  })
})

// ── FRANJA_ORDER ───────────────────────────────────────────────────────────────

describe('FRANJA_ORDER', () => {
  it('contiene las 4 franjas canónicas', () => {
    expect(FRANJA_ORDER).toContain('Mediodía')
    expect(FRANJA_ORDER).toContain('Tarde')
    expect(FRANJA_ORDER).toContain('Noche')
    expect(FRANJA_ORDER).toContain('Madrugada')
  })
})
