import { generateItemHash } from '../generate-item-hash'
import { extractFromExcel } from '../sources/excel-source'
import {
  toStr, toDate, toTimestamp, toMoney, toInt,
  normalizeTipoZona, normalizeHeader,
  validateFileIdentity,
} from '../helpers'
import type { DataSource, DataSourceContract, ParseContext, ValidationResult } from './types'

/** Typed row produced by the Maxirest items contract, matching the sales_items schema. */
export interface MaxirestItemsRow {
  org_id:          string
  location_id:     string
  external_id:     string | null
  descripcion:     string | null
  cantidad:        number | null
  precio_unitario: number | null
  precio_total:    number | null
  codigo:          number | null
  familia:         string | null
  subfamilia:      string | null
  es_variacion:    string | null
  tipo_zona:       string | null
  camarero_nombre: string | null
  fecha_caja:      string | null
  fecha_documento: string | null
  fecha_item:      string | null
  turno:           string | null
  zona:            string | null
  numero_ticket:   string | null
  item_hash:       string | null  // set by enrichRows before commit; null after parseRow
}

/** DataSourceContract for Maxirest Excel items reports → sales_items table. */
export const maxirestItemsContract: DataSourceContract<MaxirestItemsRow> = {
  id:          'maxirest-items',
  posName:     'Maxirest',
  datasetType: 'items',
  sourceType:  'excel',
  table:       'sales_items',
  version:     '1',

  async validate(source: DataSource, _ctx: ParseContext): Promise<ValidationResult> {
    const file   = source.payload as File
    const result = await validateFileIdentity(file, 'items')
    if (result.ok) return { ok: true, errors: [], warnings: [] }
    return { ok: false, errors: [result.message], warnings: [] }
  },

  extract(source: DataSource, _ctx: ParseContext): AsyncIterable<unknown> {
    return extractFromExcel(source)
  },

  parseRow(raw: unknown, ctx: ParseContext): MaxirestItemsRow | null {
    // Normalize headers to match the access pattern used by mapItem in route.ts
    const r = Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).map(([k, v]) => [normalizeHeader(k), v]),
    )

    // Replicate mapItem() from app/api/upload/sales/route.ts exactly
    const external_id = toStr(r['numero'])

    if (!external_id) return null

    return {
      org_id:          ctx.orgId,
      location_id:     ctx.locationId,
      external_id,
      descripcion:     toStr(r['descripcion']),
      cantidad:        toInt(r['cantidad']),
      precio_unitario: toMoney(r['precio_unitario']),
      precio_total:    toMoney(r['precio_total']),
      codigo:          toInt(r['codigo']),
      familia:         toStr(r['familia']),
      subfamilia:      toStr(r['subfamilia']),
      es_variacion:    toStr(r['es_variacion']),
      tipo_zona:       normalizeTipoZona(r['tipo_zona']),
      camarero_nombre: toStr(r['camarero_nombre']),
      fecha_caja:      toDate(r['fecha_caja']),
      fecha_documento: toDate(r['fecha_documento']),
      fecha_item:      toTimestamp(r['fecha_item']),
      turno:           toStr(r['turno']),
      zona:            toStr(r['zona']),
      numero_ticket:   toStr(r['numero']),
      item_hash:       null,  // populated by enrichRows before hashes are computed
    }
  },

  /**
   * Assigns item_hash to every row using only portable business fields.
   * `occurrence` is a 0-indexed counter per content group
   * (numero_ticket, fecha_caja, descripcion, cantidad, precio_total)
   * within this file. The resulting hash SET is invariant to row
   * reordering: two files with the same items in different order
   * produce identical sets of hashes.
   */
  enrichRows(rows: MaxirestItemsRow[]): void {
    const counter = new Map<string, number>()
    for (const row of rows) {
      const key = [
        row.numero_ticket,
        row.fecha_caja,
        row.descripcion,
        row.cantidad,
        row.precio_total,
      ].join('|')
      const occ = counter.get(key) ?? 0
      counter.set(key, occ + 1)
      row.item_hash = generateItemHash({ ...row, occurrence: occ })
    }
  },

  hashColumn:  'item_hash',
  dateColumn:  'fecha_caja',

  computeHash(row: MaxirestItemsRow): string {
    return row.item_hash!  // enrichRows is always called before computeHash
  },

  uiConfig: {
    title:       'Cargar Ítems',
    description: 'Detalle de ítems por orden del POS. Puede cargarse independientemente de las ventas.',
    icon:        'spreadsheet',
    accentColor: '#a78bfa',
    order:       3,
  },
}
