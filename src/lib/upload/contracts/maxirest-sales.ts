import { generateTicketHash } from '../generate-ticket-hash'
import { extractFromExcel } from '../sources/excel-source'
import {
  toStr, toDate, toMoney, toInt, toHora,
  normalizeTipoZona, normalizeHeader,
  validateFileIdentity,
} from '../helpers'
import type { DataSource, DataSourceContract, ParseContext, ValidationResult } from './types'

/** Typed row produced by the Maxirest sales contract, matching the sales_documents schema. */
export interface MaxirestSalesRow {
  org_id:          string
  location_id:     string
  external_id:     string | null
  fecha:           string | null
  total:           number | null
  comensales:      number | null
  camarero_nombre: string | null
  tipo_zona:       string | null
  zona:            string | null
  punto_venta:     string | null
  tipo_documento:  string | null
  fecha_caja:      string | null
  turno:           string | null
  hora:            string | null
  descuento:       number
  recargo:         number
  cliente:         string | null
  formas_pago:     string | null
  camarero:        string | null
  ticket_hash:     string
}

/** DataSourceContract for Maxirest Excel sales reports → sales_documents table. */
export const maxirestSalesContract: DataSourceContract<MaxirestSalesRow> = {
  id:          'maxirest-sales',
  posName:     'Maxirest',
  datasetType: 'sales',
  sourceType:  'excel',
  table:       'sales_documents',
  version:     '1',

  async validate(source: DataSource, _ctx: ParseContext): Promise<ValidationResult> {
    const file   = source.payload as File
    const result = await validateFileIdentity(file, 'ventas')
    if (result.ok) return { ok: true, errors: [], warnings: [] }
    return { ok: false, errors: [result.message], warnings: [] }
  },

  extract(source: DataSource, _ctx: ParseContext): AsyncIterable<unknown> {
    return extractFromExcel(source)
  },

  parseRow(raw: unknown, ctx: ParseContext): MaxirestSalesRow | null {
    // Normalize headers to match the access pattern used by mapVenta in route.ts
    // (e.g. "Fecha Caja" → "fecha_caja", "Tipo Documento" → "tipo_documento")
    const r = Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).map(([k, v]) => [normalizeHeader(k), v]),
    )

    // Replicate mapVenta() from app/api/upload/sales/route.ts exactly
    const external_id    = toStr(r['numero'])
    const fecha_caja     = toDate(r['fecha_caja'])
    const hora           = toHora(r['hora'])
    const camarero       = toStr(r['camarero'])
    const total          = toMoney(r['total'])
    const comensales     = toInt(r['comensales'])
    const cliente        = toStr(r['cliente'])
    const tipo_documento = toStr(r['tipo_documento'])
    const punto_venta    = toStr(r['punto_venta'])
    const zona           = toStr(r['zona'])
    const descuento      = toMoney(r['descuento']) ?? 0
    const recargo        = toMoney(r['recargo'])   ?? 0

    if (!external_id || !fecha_caja) return null

    return {
      org_id:          ctx.orgId,
      location_id:     ctx.locationId,
      external_id,
      fecha:           toDate(r['fecha']),
      total,
      comensales,
      camarero_nombre: toStr(r['camarero_nombre']),
      tipo_zona:       normalizeTipoZona(r['tipo_zona']),
      zona,
      punto_venta,
      tipo_documento,
      fecha_caja,
      turno:           toStr(r['turno']),
      hora,
      descuento,
      recargo,
      cliente,
      formas_pago:     toStr(r['formas_pago']),
      camarero,
      ticket_hash:     generateTicketHash({
        external_id, fecha_caja, hora, camarero, total,
        comensales, cliente, tipo_documento, punto_venta, zona,
        descuento, recargo,
      }),
    }
  },

  hashColumn:  'ticket_hash',
  dateColumn:  'fecha',

  computeHash(row: MaxirestSalesRow): string {
    return row.ticket_hash
  },

  uiConfig: {
    title:       'Cargar Ventas',
    description: 'Reporte de ventas del POS. Cada carga reemplaza los documentos del período.',
    icon:        'receipt',
    accentColor: '#fb923c',
    order:       2,
  },
}
