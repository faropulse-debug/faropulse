import { describe, it, expect } from 'vitest'
import { groupByComprobante, reconcile } from '@/src/lib/reconcile/compare'
import type { CucinaGoRawItem } from '@/src/lib/reconcile/cucinago-source'

function item(numero: string, precio_total: number, es_variacion = 'N'): CucinaGoRawItem {
  return {
    numero, precio_total, es_variacion,
    fecha_caja: '15-04-2026', tipo_documento: 'Factura Venta',
    tipo_zona: 'SALON', documento_id: 1, id_item: 1,
  }
}

describe('groupByComprobante', () => {
  it('sums lines from the same comprobante', () => {
    const items = [
      item('B 00002-00001', 10000),
      item('B 00002-00001', 5000),
      item('B 00002-00002', 20000),
    ]
    const map = groupByComprobante(items)
    expect(map.get('B 00002-00001')?.total).toBe(15000)
    expect(map.get('B 00002-00001')?.lineas).toBe(2)
    expect(map.get('B 00002-00002')?.total).toBe(20000)
  })

  it('includes es_variacion=S lines (precio_total=0) without filtering', () => {
    const items = [
      item('B 00002-00001', 34400, 'N'),
      item('B 00002-00001', 0,     'S'),
      item('B 00002-00001', 0,     'S'),
    ]
    const map = groupByComprobante(items)
    expect(map.get('B 00002-00001')?.total).toBe(34400)
    expect(map.get('B 00002-00001')?.lineas).toBe(3)
  })

  it('skips items with empty numero', () => {
    const items = [item('', 5000), item('B 00002-00003', 3000)]
    const map = groupByComprobante(items)
    expect(map.size).toBe(1)
    expect(map.has('')).toBe(false)
  })
})

describe('reconcile', () => {
  it('classifies exact matches', () => {
    const cg = new Map([['B-001', { total: 10000, lineas: 2 }]])
    const mx = new Map([['B-001', { total: 10000 }]])
    const { resumen } = reconcile(cg, mx)
    expect(resumen.coincidenCount).toBe(1)
    expect(resumen.discrepanciasCount).toBe(0)
    expect(resumen.soloCucinagoCount).toBe(0)
    expect(resumen.soloMaxirestCount).toBe(0)
  })

  it('classifies total discrepancies', () => {
    const cg = new Map([['B-001', { total: 10000, lineas: 2 }]])
    const mx = new Map([['B-001', { total: 9000 }]])
    const { resumen, discrepancias } = reconcile(cg, mx)
    expect(resumen.discrepanciasCount).toBe(1)
    expect(discrepancias[0]).toMatchObject({
      numero: 'B-001', totalCucinago: 10000, totalMaxirest: 9000, diff: 1000,
    })
  })

  it('classifies soloCucinago (POS has it, Maxirest missing)', () => {
    const cg = new Map([['B-002', { total: 5000, lineas: 1 }]])
    const mx = new Map<string, { total: number }>()
    const { resumen, soloCucinago } = reconcile(cg, mx)
    expect(resumen.soloCucinagoCount).toBe(1)
    expect(soloCucinago[0]).toEqual({ numero: 'B-002', total: 5000 })
  })

  it('classifies soloMaxirest (uploaded but not in POS for this period)', () => {
    const cg = new Map<string, { total: number; lineas: number }>()
    const mx = new Map([['B-003', { total: 8000 }]])
    const { resumen, soloMaxirest } = reconcile(cg, mx)
    expect(resumen.soloMaxirestCount).toBe(1)
    expect(soloMaxirest[0]).toEqual({ external_id: 'B-003', total: 8000 })
  })

  it('computes correct totals and diffTotal', () => {
    const cg = new Map([
      ['B-001', { total: 10000, lineas: 1 }],
      ['B-002', { total: 5000,  lineas: 1 }],
    ])
    const mx = new Map([
      ['B-001', { total: 10000 }],
      ['B-003', { total: 3000  }],
    ])
    const { resumen } = reconcile(cg, mx)
    expect(resumen.totalCucinago).toBe(15000)
    expect(resumen.totalMaxirest).toBe(13000)
    expect(resumen.diffTotal).toBe(2000)
    expect(resumen.coincidenCount).toBe(1)
    expect(resumen.soloCucinagoCount).toBe(1)
    expect(resumen.soloMaxirestCount).toBe(1)
  })
})
