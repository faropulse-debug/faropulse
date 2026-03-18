import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'

// ── Mock Supabase before importing processor ──────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(), insert: vi.fn(), upsert: vi.fn(), delete: vi.fn() })),
  },
}))

import { toMoney, toNumComma, mapVentas, mapItems } from '@/lib/processors/excelProcessor'
import { validateFile } from '@/lib/validators/uploadValidator'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeXlsx(rows: Record<string, unknown>[], sheetName = 'Sheet1'): File {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buf], 'test.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ─── toMoney ─────────────────────────────────────────────────────────────────

describe('toMoney', () => {
  it('"$12.500,00" → 12500.00', () => {
    expect(toMoney('$12.500,00')).toBe(12500)
  })
  it('"$0,00" → 0', () => {
    expect(toMoney('$0,00')).toBe(0)
  })
  it('"" → null', () => {
    expect(toMoney('')).toBeNull()
  })
  it('undefined → null', () => {
    expect(toMoney(undefined)).toBeNull()
  })
  it('"1500" → 1500 (plain number, no $ or comma)', () => {
    expect(toMoney('1500')).toBe(1500)
  })
  it('"$1.234.567,89" → 1234567.89 (multiple thousand separators)', () => {
    expect(toMoney('$1.234.567,89')).toBe(1234567.89)
  })
  it('"$100,50" → 100.5 (no thousand separator)', () => {
    expect(toMoney('$100,50')).toBe(100.5)
  })
})

// ─── toNumComma ──────────────────────────────────────────────────────────────

describe('toNumComma', () => {
  it('"1,00" → 1.0', () => {
    expect(toNumComma('1,00')).toBe(1)
  })
  it('"0,50" → 0.5', () => {
    expect(toNumComma('0,50')).toBe(0.5)
  })
  it('"" → null', () => {
    expect(toNumComma('')).toBeNull()
  })
  it('undefined → null', () => {
    expect(toNumComma(undefined)).toBeNull()
  })
  it('"3,14" → 3.14', () => {
    expect(toNumComma('3,14')).toBe(3.14)
  })
})

// ─── mapItems ────────────────────────────────────────────────────────────────

describe('mapItems', () => {
  const ORG = 'org-1'
  const LOC = 'loc-1'

  it('maps a complete row correctly', () => {
    const row: Record<string, unknown> = {
      numero:         '42',
      sucursal:       'ITUZAINGO',
      apellidoynombre:'Perez Juan',
      camarero:       '1016',
      camarero_nombre:'Gomez',
      tipo_zona:      'SALON',
      zona:           'INTERIOR',
      zona_id:        '3',
      familia:        'BEBIDAS',
      subfamilia:     'GASEOSAS',
      descripcion:    'Coca Cola 500ml',
      codigo:         '99',
      cantidad:       '1,00',
      precio_unitario:'$250,00',
      precio_total:   '$250,00',
      descuento_item: '$0,00',
      recargo_item:   '$0,00',
      descuento_global:'$0,00',
      recargo_global: '$0,00',
      fecha_documento:'18/02/2026',
      fecha_caja:     '18/02/2026',
      fecha_inicio:   '18/02/2026 20:00',
      fecha_cierre:   '18/02/2026 21:00',
      fecha_item:     '18/02/2026 21:24',
      hora_item:      '21:24',
      'nro._caja':    '5',
    }

    const result = mapItems(row, ORG, LOC)

    expect(result.org_id).toBe(ORG)
    expect(result.location_id).toBe(LOC)
    expect(result.external_id).toBe('42')
    expect(result.numero_ticket).toBe('42')             // same as external_id
    expect(result.sucursal).toBe('ITUZAINGO')
    expect(result.apellido_nombre).toBe('Perez Juan')   // DB col from apellidoynombre key
    expect(result.camarero).toBe('1016')                // text, not number
    expect(result.tipo_zona).toBe('SALON')
    expect(result.zona).toBe('INTERIOR')
    expect(result.zona_id).toBe(3)
    expect(result.codigo).toBe(99)
    expect(result.cantidad).toBe(1.0)
    expect(result.precio_unitario).toBe(250)
    expect(result.precio_total).toBe(250)
    expect(result.descuento_item).toBe(0)
    expect(result.nro_caja).toBe(5)
    expect(result.fecha_documento).toBe('2026-02-18')
    expect(result.fecha_item).not.toBeNull()             // parsed as ISO timestamp
    expect(new Date(result.fecha_item as string).getTime()).not.toBeNaN()
  })

  it('external_id and numero_ticket have the same value', () => {
    const result = mapItems({ numero: 'TICKET-99' }, ORG, LOC)
    expect(result.external_id).toBe('TICKET-99')
    expect(result.numero_ticket).toBe('TICKET-99')
  })

  it('empty optional fields produce null without throwing', () => {
    const result = mapItems({ numero: '1', sucursal: 'X' }, ORG, LOC)
    expect(result.descripcion).toBeNull()
    expect(result.cantidad).toBeNull()
    expect(result.precio_total).toBeNull()
    expect(result.tipo_zona).toBeNull()
    expect(result.fecha_item).toBeNull()
    expect(result.camarero).toBeNull()
  })

  it('camarero numeric code stays as string', () => {
    const result = mapItems({ numero: '1', camarero: '1016' }, ORG, LOC)
    expect(typeof result.camarero).toBe('string')
    expect(result.camarero).toBe('1016')
  })

  it('toMoney handles price with thousands separator', () => {
    const result = mapItems({ numero: '1', precio_total: '$12.500,00' }, ORG, LOC)
    expect(result.precio_total).toBe(12500)
  })
})

// ─── mapVentas ───────────────────────────────────────────────────────────────

describe('mapVentas', () => {
  const ORG = 'org-1'
  const LOC = 'loc-1'

  it('"Numero" header → external_id', () => {
    const result = mapVentas({ numero: 'V-001' }, ORG, LOC)
    expect(result.external_id).toBe('V-001')
  })

  it('tipo_zona and zona map correctly from normalized keys', () => {
    const result = mapVentas({ numero: '1', tipo_zona: 'MOSTRADOR', zona: 'BAR' }, ORG, LOC)
    expect(result.tipo_zona).toBe('MOSTRADOR')
    expect(result.zona).toBe('BAR')
  })

  it('empty tipo_zona produces null', () => {
    const result = mapVentas({ numero: '1' }, ORG, LOC)
    expect(result.tipo_zona).toBeNull()
    expect(result.zona).toBeNull()
  })

  it('org_id and location_id are injected correctly', () => {
    const result = mapVentas({ numero: '1' }, 'MY-ORG', 'MY-LOC')
    expect(result.org_id).toBe('MY-ORG')
    expect(result.location_id).toBe('MY-LOC')
  })
})

// ─── validateFile — items ────────────────────────────────────────────────────

describe('validateFile (items)', () => {
  it('passes with only numero and sucursal present', async () => {
    const file = makeXlsx([{ Numero: '1', Sucursal: 'ITUZAINGO' }])
    const result = await validateFile(file, 'items')
    expect(result.ok).toBe(true)
    expect(result.rows).toHaveLength(1)
  })

  it('fails when numero column is missing', async () => {
    const file = makeXlsx([{ Sucursal: 'ITUZAINGO', Descripcion: 'Item 1' }])
    const result = await validateFile(file, 'items')
    expect(result.ok).toBe(false)
    expect(result.missingColumns).toContain('numero')
  })

  it('fails when sucursal column is missing', async () => {
    const file = makeXlsx([{ Numero: '1', Descripcion: 'Item 1' }])
    const result = await validateFile(file, 'items')
    expect(result.ok).toBe(false)
    expect(result.missingColumns).toContain('sucursal')
  })

  it('passes with "Fecha Item" value "18/02/2026 21:24" (timestamp with time)', async () => {
    const file = makeXlsx([{
      Numero:       '1',
      Sucursal:     'ITUZAINGO',
      'Fecha Item': '18/02/2026 21:24',
    }])
    const result = await validateFile(file, 'items')
    expect(result.ok).toBe(true)
    expect(result.dataErrors).toHaveLength(0)
  })

  it('normalizes "Tipo Zona" header to "tipo_zona" key', async () => {
    const file = makeXlsx([{
      Numero:      '1',
      Sucursal:    'X',
      'Tipo Zona': 'SALON',
    }])
    const result = await validateFile(file, 'items')
    expect(result.ok).toBe(true)
    expect(result.rows[0]['tipo_zona']).toBe('SALON')
  })

  it('empty optional cells produce empty string (passed to mapper as null by toStr)', async () => {
    const file = makeXlsx([{ Numero: '1', Sucursal: 'X', Descripcion: '' }])
    const result = await validateFile(file, 'items')
    expect(result.ok).toBe(true)
    // defval:'' means empty cells are '' — mapper converts to null
    expect(result.rows[0]['descripcion']).toBe('')
  })
})
