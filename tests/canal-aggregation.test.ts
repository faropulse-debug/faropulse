import { describe, it, expect } from 'vitest'
import {
  computeCanalRows,
  buildCanalInsight,
  type VentaCanal,
} from '@/src/lib/canal-helpers'

// ── Datos reales mayo 2026 (validados scripts/diag-canal-mayo.mjs) ─────────────
const MAY26: VentaCanal[] = [
  { mes: '2026-05', canal: 'Salón',    ventas: 27603680, pedidos: 381 },
  { mes: '2026-05', canal: 'Delivery', ventas: 8863847,  pedidos: 218 },
  { mes: '2026-05', canal: 'TakeAway', ventas: 3729830,  pedidos: 92  },
]

describe('computeCanalRows', () => {
  it('smoke: suma de los 3 canales = total validado mayo 2026', () => {
    const rows        = computeCanalRows(MAY26, '2026-05', '2026-04')
    const totalPedidos = rows.reduce((s, r) => s + r.pedidos, 0)
    const totalVentas  = rows.reduce((s, r) => s + r.ventas,  0)
    expect(totalPedidos).toBe(691)
    expect(totalVentas).toBe(40197357)
  })

  it('ordena por ventas desc — Salón > Delivery > TakeAway', () => {
    const rows = computeCanalRows(MAY26, '2026-05', '2026-04')
    expect(rows[0].canal).toBe('Salón')
    expect(rows[1].canal).toBe('Delivery')
    expect(rows[2].canal).toBe('TakeAway')
  })

  it('pct suma exactamente 100', () => {
    const rows     = computeCanalRows(MAY26, '2026-05', '2026-04')
    const totalPct = rows.reduce((s, r) => s + r.pct, 0)
    expect(totalPct).toBeCloseTo(100, 5)
  })

  it('Salón representa ~68.7% de la facturación de mayo 2026', () => {
    const rows = computeCanalRows(MAY26, '2026-05', '2026-04')
    expect(rows[0].pct).toBeCloseTo(68.7, 0)
  })

  it('varPct es null cuando no hay datos del mes anterior', () => {
    const rows = computeCanalRows(MAY26, '2026-05', '2026-04')
    rows.forEach(r => expect(r.varPct).toBeNull())
  })

  it('calcula varPct correctamente cuando hay datos del mes anterior', () => {
    const data: VentaCanal[] = [
      ...MAY26,
      { mes: '2026-04', canal: 'Salón',    ventas: 25000000, pedidos: 350 },
      { mes: '2026-04', canal: 'Delivery', ventas: 9000000,  pedidos: 220 },
      { mes: '2026-04', canal: 'TakeAway', ventas: 3500000,  pedidos: 85  },
    ]
    const rows = computeCanalRows(data, '2026-05', '2026-04')
    // Salón: (27603680 - 25000000) / 25000000 * 100 ≈ +10.4%
    expect(rows.find(r => r.canal === 'Salón')?.varPct).toBeCloseTo(10.4, 0)
    // Delivery: (8863847 - 9000000) / 9000000 * 100 ≈ -1.5%
    expect(rows.find(r => r.canal === 'Delivery')?.varPct).toBeCloseTo(-1.5, 0)
    // TakeAway: (3729830 - 3500000) / 3500000 * 100 ≈ +6.6%
    expect(rows.find(r => r.canal === 'TakeAway')?.varPct).toBeCloseTo(6.6, 0)
  })

  it('retorna array vacío si no hay datos para el mes', () => {
    const rows = computeCanalRows(MAY26, '2025-01', '2024-12')
    expect(rows).toHaveLength(0)
  })
})

describe('buildCanalInsight', () => {
  it('menciona el canal líder y su porcentaje', () => {
    const rows    = computeCanalRows(MAY26, '2026-05', '2026-04')
    const insight = buildCanalInsight(rows)
    expect(insight).not.toBeNull()
    expect(insight).toContain('Salón')
    expect(insight).toContain('69%')
  })

  it('retorna null para array vacío', () => {
    expect(buildCanalInsight([])).toBeNull()
  })

  it('agrega observación del canal con mayor variación cuando |Δ| ≥ 3%', () => {
    const data: VentaCanal[] = [
      ...MAY26,
      // Delivery sube ~10.8% → mayor mover absoluto
      { mes: '2026-04', canal: 'Salón',    ventas: 30000000, pedidos: 400 },
      { mes: '2026-04', canal: 'Delivery', ventas: 8000000,  pedidos: 200 },
      { mes: '2026-04', canal: 'TakeAway', ventas: 4000000,  pedidos: 100 },
    ]
    const rows    = computeCanalRows(data, '2026-05', '2026-04')
    const insight = buildCanalInsight(rows)
    expect(insight).toContain('Salón')   // líder del mes
    expect(insight).toContain('Delivery') // mayor mover (~+10.8%)
    expect(insight).toContain('subió')
  })
})
