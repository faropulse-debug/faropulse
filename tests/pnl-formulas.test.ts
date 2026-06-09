import { describe, it, expect } from 'vitest'
import { computePnL, type PnLInputs } from '@/lib/pnl/formulas'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInputs(overrides: Partial<PnLInputs> = {}): PnLInputs {
  return {
    ventas_salon: 0, ventas_dely: 0,
    tickets_salon: 0, tickets_takeaway: 0, tickets_dely: 0,
    proteinas: 0, lacteos_fiambres: 0, almacen: 0, postres_cafe: 0,
    pastas_empanadas: 0, verduras: 0, bollos: 0, porcion_muzza: 0,
    descartable: 0, bebidas: 0, quilmes: 0, limpieza: 0,
    sueldos_cargas: 0, liq_final: 0, alquiler: 0, servicios: 0,
    honorarios: 0, gastos_varios: 0, mantenimiento: 0, impuestos: 0,
    tarjetas: 0, app_dely: 0, gs_bancarios: 0,
    regalias_pct: 5,
    ...overrides,
  }
}

// ── total_ventas ──────────────────────────────────────────────────────────────

describe('computePnL — total_ventas', () => {
  it('suma salón + delivery', () => {
    const r = computePnL(makeInputs({ ventas_salon: 1_000_000, ventas_dely: 500_000 }))
    expect(r.total_ventas).toBe(1_500_000)
  })

  it('zero cuando no hay ventas', () => {
    expect(computePnL(makeInputs()).total_ventas).toBe(0)
  })
})

// ── total_costos ──────────────────────────────────────────────────────────────

describe('computePnL — total_costos', () => {
  it('suma los 12 ítems de costos variables', () => {
    const r = computePnL(makeInputs({
      proteinas: 100, lacteos_fiambres: 200, almacen: 300, postres_cafe: 400,
      pastas_empanadas: 500, verduras: 600, bollos: 700, porcion_muzza: 800,
      descartable: 900, bebidas: 1000, quilmes: 1100, limpieza: 1200,
    }))
    expect(r.total_costos).toBe(7800)
  })
})

// ── total_gastos ──────────────────────────────────────────────────────────────

describe('computePnL — total_gastos', () => {
  it('suma los 11 ítems de costos fijos', () => {
    const r = computePnL(makeInputs({
      sueldos_cargas: 1000, liq_final: 200, alquiler: 300, servicios: 400,
      honorarios: 500, gastos_varios: 600, mantenimiento: 700, impuestos: 800,
      tarjetas: 900, app_dely: 1000, gs_bancarios: 1100,
    }))
    expect(r.total_gastos).toBe(7500)
  })
})

// ── regalias ──────────────────────────────────────────────────────────────────

describe('computePnL — regalias', () => {
  it('5% del total de ventas', () => {
    const r = computePnL(makeInputs({ ventas_salon: 1_000_000, regalias_pct: 5 }))
    expect(r.regalias).toBe(50_000)
  })

  it('porcentaje no entero (5.5%) redondeado a 2 decimales', () => {
    // 100_001 × 5.5% = 5500.055 → 5500.06
    const r = computePnL(makeInputs({ ventas_salon: 100_001, regalias_pct: 5.5 }))
    expect(r.regalias).toBe(5500.06)
  })
})

// ── resultado_neto ────────────────────────────────────────────────────────────

describe('computePnL — resultado_neto', () => {
  it('TV − TC − TG − Regalías', () => {
    const r = computePnL(makeInputs({
      ventas_salon: 1_000_000,
      proteinas: 100_000,
      sueldos_cargas: 200_000,
      regalias_pct: 5,
    }))
    // TV=1_000_000, TC=100_000, TG=200_000, R=50_000 → 650_000
    expect(r.resultado_neto).toBe(650_000)
  })

  it('puede ser negativo cuando costos superan ventas', () => {
    const r = computePnL(makeInputs({
      ventas_salon: 500_000,
      proteinas: 600_000,
      regalias_pct: 5,
    }))
    expect(r.resultado_neto).toBeLessThan(0)
  })
})

// ── % sobre ventas ────────────────────────────────────────────────────────────

describe('computePnL — porcentajes', () => {
  it('pct_costos = total_costos / total_ventas × 100', () => {
    const r = computePnL(makeInputs({ ventas_salon: 1_000_000, proteinas: 300_000, regalias_pct: 5 }))
    expect(r.pct_costos).toBe(30)
  })

  it('retorna 0 cuando no hay ventas (evita división por cero)', () => {
    const r = computePnL(makeInputs())
    expect(r.pct_costos).toBe(0)
    expect(r.pct_gastos).toBe(0)
  })
})

// ── $ x ticket / $ x pedido ──────────────────────────────────────────────────

describe('computePnL — métricas por ticket', () => {
  it('pesos_x_ticket = ventas_salon / tickets_salon', () => {
    const r = computePnL(makeInputs({ ventas_salon: 1_800_000, tickets_salon: 1200 }))
    expect(r.pesos_x_ticket).toBe(1500)
  })

  it('pesos_x_pedido = ventas_dely / tickets_dely', () => {
    const r = computePnL(makeInputs({ ventas_dely: 900_000, tickets_dely: 150 }))
    expect(r.pesos_x_pedido).toBe(6000)
  })

  it('pesos_x_ticket = 0 cuando tickets_salon = 0', () => {
    const r = computePnL(makeInputs({ ventas_salon: 1_000_000 }))
    expect(r.pesos_x_ticket).toBe(0)
  })
})

// ── Caso conocido: resultado neto = 2.223.573 ─────────────────────────────────

describe('computePnL — caso conocido: resultado neto 2.223.573', () => {
  it('inputs específicos → resultado_neto = 2.223.573', () => {
    const r = computePnL({
      ventas_salon:     45_000_000,
      ventas_dely:       7_000_000,
      tickets_salon:         1_600,
      tickets_takeaway:        120,
      tickets_dely:            200,
      // CV — 12 ítems → total 18.000.000
      proteinas:         1_000_000,
      lacteos_fiambres:  2_000_000,
      almacen:             800_000,
      postres_cafe:        700_000,
      pastas_empanadas:  1_000_000,
      verduras:          1_200_000,
      bollos:            1_800_000,
      porcion_muzza:     3_000_000,
      descartable:       1_200_000,
      bebidas:             800_000,
      quilmes:           2_300_000,
      limpieza:          2_200_000,
      // CF — 11 ítems → total 29.176.427
      sueldos_cargas:   15_000_000,
      liq_final:                 0,
      alquiler:          1_600_000,
      servicios:         3_400_000,
      honorarios:          250_000,
      gastos_varios:        50_000,
      mantenimiento:     1_200_000,
      impuestos:         2_900_000,
      tarjetas:          1_300_000,
      app_dely:          1_700_000,
      gs_bancarios:      1_776_427,
      regalias_pct:              5,
    })

    // TV=52.000.000, TC=18.000.000, TG=29.176.427, R=2.600.000
    expect(r.total_ventas).toBe(52_000_000)
    expect(r.total_costos).toBe(18_000_000)
    expect(r.total_gastos).toBe(29_176_427)
    expect(r.regalias).toBe(2_600_000)
    expect(r.resultado_neto).toBe(2_223_573)
  })
})
