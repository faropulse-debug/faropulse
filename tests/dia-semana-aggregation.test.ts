import { describe, it, expect } from 'vitest'
import {
  availableMeses,
  computeDiaSemanaRows,
  buildDiaSemanaInsight,
  DOW_ORDER,
  type VentaDiaSemana,
} from '@/src/lib/dia-semana-helpers'

// ── Validated May 2026 data (from sales_documents REST, script diag-dia-semana.mjs) ──
// Lun=$2,553,369/4d/48p · Mar=$1,451,860/3d/24p · Mié=$3,441,030/4d/57p
// Jue=$2,381,340/4d/43p · Vie=$10,465,628/5d/171p · Sáb=$14,187,538/5d/230p
// Dom=$5,716,592/5d/118p — TOTAL=$40,197,357 / 691 pedidos
const MAY26: VentaDiaSemana[] = [
  { mes: '2026-05', dow: 1, ventas: 2553369,  pedidos: 48,  ocurrencias: 4 },
  { mes: '2026-05', dow: 2, ventas: 1451860,  pedidos: 24,  ocurrencias: 3 },
  { mes: '2026-05', dow: 3, ventas: 3441030,  pedidos: 57,  ocurrencias: 4 },
  { mes: '2026-05', dow: 4, ventas: 2381340,  pedidos: 43,  ocurrencias: 4 },
  { mes: '2026-05', dow: 5, ventas: 10465628, pedidos: 171, ocurrencias: 5 },
  { mes: '2026-05', dow: 6, ventas: 14187538, pedidos: 230, ocurrencias: 5 },
  { mes: '2026-05', dow: 0, ventas: 5716592,  pedidos: 118, ocurrencias: 5 },
]

const GRAND_TOTAL    = 40197357
const GRAND_PEDIDOS  = 691

// ── availableMeses ─────────────────────────────────────────────────────────────

describe('availableMeses', () => {
  it('retorna meses únicos ordenados desc', () => {
    const data: VentaDiaSemana[] = [
      ...MAY26,
      { mes: '2026-04', dow: 1, ventas: 1000, pedidos: 5, ocurrencias: 4 },
    ]
    expect(availableMeses(data)).toEqual(['2026-05', '2026-04'])
  })
  it('retorna [] para array vacío', () => {
    expect(availableMeses([])).toHaveLength(0)
  })
})

// ── computeDiaSemanaRows ───────────────────────────────────────────────────────

describe('computeDiaSemanaRows', () => {
  it('smoke: 7 filas en orden Lun→Dom', () => {
    const rows = computeDiaSemanaRows(MAY26, '2026-05')
    expect(rows).toHaveLength(7)
    expect(rows.map(r => r.dow)).toEqual(DOW_ORDER)
  })

  it('smoke: suma de ventas = $40,197,357', () => {
    const rows  = computeDiaSemanaRows(MAY26, '2026-05')
    const total = rows.reduce((s, r) => s + r.ventas, 0)
    expect(total).toBe(GRAND_TOTAL)
  })

  it('smoke: suma de pedidos = 691', () => {
    const rows  = computeDiaSemanaRows(MAY26, '2026-05')
    const total = rows.reduce((s, r) => s + r.pedidos, 0)
    expect(total).toBe(GRAND_PEDIDOS)
  })

  it('pct suma 100%', () => {
    const rows = computeDiaSemanaRows(MAY26, '2026-05')
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100, 5)
  })

  it('isBest = Sábado (dow=6, mayor promedio: $14,187,538 / 5 = $2,837,508)', () => {
    const rows = computeDiaSemanaRows(MAY26, '2026-05')
    const best = rows.find(r => r.isBest)
    expect(best?.dow).toBe(6)
    expect(best?.promedio).toBeCloseTo(2837507.6, 0)
  })

  it('isWorst = Martes (dow=2, menor promedio: $1,451,860 / 3 = $483,953)', () => {
    const rows  = computeDiaSemanaRows(MAY26, '2026-05')
    const worst = rows.find(r => r.isWorst)
    expect(worst?.dow).toBe(2)
    expect(worst?.promedio).toBeCloseTo(483953.3, 0)
  })

  it('promedio = ventas / ocurrencias para cada fila', () => {
    const rows = computeDiaSemanaRows(MAY26, '2026-05')
    for (const r of rows) {
      if (r.ocurrencias > 0) {
        expect(r.promedio).toBeCloseTo(r.ventas / r.ocurrencias, 5)
      }
    }
  })

  it('retorna [] para mes sin datos', () => {
    expect(computeDiaSemanaRows(MAY26, '2025-01')).toHaveLength(0)
  })

  it('retorna [] para mes vacío', () => {
    expect(computeDiaSemanaRows(MAY26, '')).toHaveLength(0)
  })

  it('filtra solo el mes indicado (ignora otros meses)', () => {
    const mixed: VentaDiaSemana[] = [
      ...MAY26,
      { mes: '2026-04', dow: 1, ventas: 9_999_999, pedidos: 999, ocurrencias: 4 },
    ]
    const rows = computeDiaSemanaRows(mixed, '2026-05')
    expect(rows.reduce((s, r) => s + r.ventas, 0)).toBe(GRAND_TOTAL)
  })

  it('fila con ocurrencias=0 no puede ser isBest ni isWorst', () => {
    const partial: VentaDiaSemana[] = MAY26.filter(r => r.dow !== 0)  // sin domingo
    const rows = computeDiaSemanaRows(partial, '2026-05')
    const dom  = rows.find(r => r.dow === 0)!
    expect(dom.ocurrencias).toBe(0)
    expect(dom.isBest).toBe(false)
    expect(dom.isWorst).toBe(false)
  })

  it('con un solo día con datos: isBest=true, isWorst=false (no se resalta contrario)', () => {
    const solo: VentaDiaSemana[] = [
      { mes: '2026-05', dow: 5, ventas: 5000, pedidos: 3, ocurrencias: 1 },
    ]
    const rows = computeDiaSemanaRows(solo, '2026-05')
    const vie  = rows.find(r => r.dow === 5)!
    // Menos de 2 días con datos → sin resaltado
    expect(vie.isBest).toBe(false)
    expect(vie.isWorst).toBe(false)
  })

  it('labels en orden Lun, Mar, Mié, Jue, Vie, Sáb, Dom', () => {
    const rows   = computeDiaSemanaRows(MAY26, '2026-05')
    const labels = rows.map(r => r.label)
    expect(labels).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'])
  })
})

// ── buildDiaSemanaInsight ──────────────────────────────────────────────────────

describe('buildDiaSemanaInsight', () => {
  it('menciona el día más fuerte y el más flojo', () => {
    const rows    = computeDiaSemanaRows(MAY26, '2026-05')
    const insight = buildDiaSemanaInsight(rows)
    expect(insight).not.toBeNull()
    expect(insight).toContain('Sáb')
    expect(insight).toContain('Mar')
  })

  it('incluye porcentaje de diferencia', () => {
    const rows    = computeDiaSemanaRows(MAY26, '2026-05')
    const insight = buildDiaSemanaInsight(rows)
    expect(insight).toMatch(/\d+%/)
  })

  it('retorna null si no hay datos', () => {
    expect(buildDiaSemanaInsight([])).toBeNull()
  })
})
