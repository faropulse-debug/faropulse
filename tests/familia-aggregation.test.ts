import { describe, it, expect } from 'vitest'
import {
  computeFamiliaRows,
  buildFamiliaDisplay,
  buildFamiliaInsight,
  prevMonthOf,
  type VentaFamilia,
} from '@/src/lib/familia-helpers'

// ── Datos reales mayo 2026 (validados scripts/diag-familias-mayo.mjs) ──────────
// Total: $40.197.357 en 3721 unidades — misma tabla sales_items que canales.
const MAY26: VentaFamilia[] = [
  { mes: '2026-05', familia: 'PIZZAS',              ventas: 11859770, cantidad: 381  },
  { mes: '2026-05', familia: 'VARIOS',              ventas:  9073314, cantidad: 466  },
  { mes: '2026-05', familia: 'BEBIDAS SIN ALCOHOL', ventas:  3737195, cantidad: 650  },
  { mes: '2026-05', familia: 'CERVEZAS',            ventas:  3227686, cantidad: 305  },
  { mes: '2026-05', familia: 'ENTRADAS',            ventas:  2674505, cantidad: 723  },
  { mes: '2026-05', familia: 'PIZZAS PEQUEÑAS',     ventas:  2647405, cantidad: 114  },
  { mes: '2026-05', familia: 'POSTRES',             ventas:  1306531, cantidad: 166  },
  { mes: '2026-05', familia: 'PASTAS',              ventas:  1150017, cantidad:  89  },
  { mes: '2026-05', familia: 'TRAGOS',              ventas:  1139850, cantidad: 111  },
  { mes: '2026-05', familia: 'RELLENAS',            ventas:   987460, cantidad:  29  },
  { mes: '2026-05', familia: 'MILANESAS',           ventas:   755400, cantidad:  29  },
  { mes: '2026-05', familia: 'VINOS Y ESPUMANTES',  ventas:   413810, cantidad:  30  },
  { mes: '2026-05', familia: 'WRAPS',               ventas:   401705, cantidad:  20  },
  { mes: '2026-05', familia: 'SANDWICHES',          ventas:   330623, cantidad:  17  },
  { mes: '2026-05', familia: 'NIÑOS',               ventas:   217960, cantidad:  13  },
  { mes: '2026-05', familia: 'ENSALADAS',           ventas:   133393, cantidad:   8  },
  { mes: '2026-05', familia: 'LINEA VERDE',         ventas:    91233, cantidad:   9  },
  { mes: '2026-05', familia: 'SOPAS',               ventas:    49500, cantidad:   3  },
  { mes: '2026-05', familia: 'PIZZAS MITAD',        ventas:        0, cantidad: 536  },
  { mes: '2026-05', familia: 'SALSAS POPULARES',    ventas:        0, cantidad:   6  },
  { mes: '2026-05', familia: '(sin familia)',        ventas:        0, cantidad:  15  },
  { mes: '2026-05', familia: 'MERCADERIA',          ventas:        0, cantidad:   1  },
]

const TOTAL_MAY26 = 40197357

describe('computeFamiliaRows', () => {
  it('smoke: suma de familias = total validado sales_items mayo 2026', () => {
    const rows = computeFamiliaRows(MAY26, '2026-05', '2026-04')
    expect(rows.reduce((s, r) => s + r.ventas, 0)).toBe(TOTAL_MAY26)
  })

  it('ordena por ventas desc — PIZZAS lidera', () => {
    const rows = computeFamiliaRows(MAY26, '2026-05', '2026-04')
    expect(rows[0].familia).toBe('PIZZAS')
  })

  it('pct suma exactamente 100', () => {
    const rows = computeFamiliaRows(MAY26, '2026-05', '2026-04')
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100, 5)
  })

  it('PIZZAS representa ~29.5% de la facturación', () => {
    const rows = computeFamiliaRows(MAY26, '2026-05', '2026-04')
    expect(rows[0].pct).toBeCloseTo(29.5, 0)
  })

  it('varPct es null cuando no hay datos del mes anterior', () => {
    const rows = computeFamiliaRows(MAY26, '2026-05', '2026-04')
    rows.forEach(r => expect(r.varPct).toBeNull())
  })

  it('calcula varPct correctamente cuando hay datos del mes anterior', () => {
    const data: VentaFamilia[] = [
      ...MAY26,
      { mes: '2026-04', familia: 'PIZZAS', ventas: 10000000, cantidad: 350 },
      { mes: '2026-04', familia: 'VARIOS', ventas:  8000000, cantidad: 400 },
    ]
    const rows = computeFamiliaRows(data, '2026-05', '2026-04')
    // PIZZAS: (11859770 - 10000000) / 10000000 ≈ +18.6%
    expect(rows.find(r => r.familia === 'PIZZAS')?.varPct).toBeCloseTo(18.6, 0)
    // VARIOS: (9073314 - 8000000) / 8000000 ≈ +13.4%
    expect(rows.find(r => r.familia === 'VARIOS')?.varPct).toBeCloseTo(13.4, 0)
    // Sin datos previos → null
    expect(rows.find(r => r.familia === 'CERVEZAS')?.varPct).toBeNull()
  })

  it('retorna array vacío para mes sin datos', () => {
    expect(computeFamiliaRows(MAY26, '2025-01', '2024-12')).toHaveLength(0)
  })
})

describe('buildFamiliaDisplay', () => {
  it('top 7 + otras con 15 familias', () => {
    const rows    = computeFamiliaRows(MAY26, '2026-05', '2026-04')
    const display = buildFamiliaDisplay(rows, 7)
    expect(display.top).toHaveLength(7)
    expect(display.otras).not.toBeNull()
    expect(display.otrasCount).toBe(15)
  })

  it('total = top + otras = total validado PASO 0', () => {
    const rows    = computeFamiliaRows(MAY26, '2026-05', '2026-04')
    const display = buildFamiliaDisplay(rows, 7)
    const sumTop  = display.top.reduce((s, r) => s + r.ventas, 0)
    expect(sumTop + (display.otras?.ventas ?? 0)).toBe(display.total)
    expect(display.total).toBe(TOTAL_MAY26)
  })

  it('otras.varPct es siempre null', () => {
    const rows    = computeFamiliaRows(MAY26, '2026-05', '2026-04')
    const display = buildFamiliaDisplay(rows, 7)
    expect(display.otras?.varPct).toBeNull()
  })

  it('sin otras cuando topN >= total familias', () => {
    const rows    = computeFamiliaRows(MAY26, '2026-05', '2026-04')
    const display = buildFamiliaDisplay(rows, 100)
    expect(display.otras).toBeNull()
    expect(display.otrasCount).toBe(0)
  })
})

describe('buildFamiliaInsight', () => {
  it('menciona la familia líder y su porcentaje', () => {
    const { top } = buildFamiliaDisplay(computeFamiliaRows(MAY26, '2026-05', '2026-04'), 7)
    const insight = buildFamiliaInsight(top)
    expect(insight).not.toBeNull()
    expect(insight).toContain('PIZZAS')
    expect(insight).toContain('30%')
  })

  it('retorna null para array vacío', () => {
    expect(buildFamiliaInsight([])).toBeNull()
  })

  it('agrega observación del mayor mover cuando |Δ| ≥ 3%', () => {
    const data: VentaFamilia[] = [
      ...MAY26,
      { mes: '2026-04', familia: 'PIZZAS', ventas: 10000000, cantidad: 350 },
      { mes: '2026-04', familia: 'VARIOS', ventas:  9100000, cantidad: 466 },
    ]
    const { top } = buildFamiliaDisplay(computeFamiliaRows(data, '2026-05', '2026-04'), 7)
    const insight = buildFamiliaInsight(top)
    expect(insight).toContain('PIZZAS')
    expect(insight).toContain('subió')
  })
})

describe('prevMonthOf', () => {
  it('retorna mes anterior en YYYY-MM', () => {
    expect(prevMonthOf('2026-05')).toBe('2026-04')
    expect(prevMonthOf('2026-01')).toBe('2025-12')
    expect(prevMonthOf('2025-12')).toBe('2025-11')
  })
})
