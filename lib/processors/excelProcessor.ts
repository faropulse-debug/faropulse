import { supabase } from '@/lib/supabase'
import type { TableType } from '@/lib/validators/uploadValidator'

const DEFAULT_ORG_ID      = process.env.NEXT_PUBLIC_ORG_ID      ?? ''
const DEFAULT_LOCATION_ID = process.env.NEXT_PUBLIC_LOCATION_ID ?? ''
const BATCH_SIZE          = 500

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''))
  return isNaN(n) ? null : n
}

function toStr(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null
  return String(v).trim()
}

function parseFlexDate(v: unknown): Date | null {
  if (v === '' || v === null || v === undefined) return null
  const s = String(v).trim()
  // DD/MM/YYYY  (formato argentino / español)
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (ddmm) {
    const d = new Date(`${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function toDate(v: unknown): string | null {
  const d = parseFlexDate(v)
  return d ? d.toISOString().split('T')[0] : null
}

function toBool(v: unknown): boolean | null {
  if (v === '' || v === null || v === undefined) return null
  const s = String(v).toLowerCase().trim()
  if (s === 's' || s === 'si' || s === 'sí' || s === 'true' || s === '1') return true
  if (s === 'n' || s === 'no' || s === 'false' || s === '0') return false
  return null
}

// Excel stores time as a fraction of a day (0.5 = 12:00).
// With raw:false the cell may arrive as "10:30" (already formatted)
// or as a decimal string like "0.4375". Both cases are handled.
function toHora(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null
  const s = String(v).trim()
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5)   // already "HH:MM[:SS]"
  const n = parseFloat(s.replace(',', '.'))
  if (!isNaN(n) && n >= 0 && n < 1) {
    const mins = Math.round(n * 1440)
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    return `${hh}:${mm}`
  }
  return s   // fallback: return as-is
}

// Returns full ISO-8601 string (with time + Z) for timestamptz columns.
function toTimestamp(v: unknown): string | null {
  const d = parseFlexDate(v)
  return d ? d.toISOString() : null
}

async function insertBatches(
  table: string,
  rows: Record<string, unknown>[],
  onProgress: (inserted: number) => void,
  conflictColumns?: string,
): Promise<{ inserted: number; skipped: number; error?: string }> {
  let inserted = 0
  let skipped  = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    // Pre-flight: log first row and any null external_id/external_id-equivalent fields
    if (i === 0) {
      console.log('[insertBatches] First row of batch:', batch[0])
      const nullIds = batch.filter(r => r.external_id == null || r.external_id === '').length
      if (nullIds > 0) console.warn(`[insertBatches] ⚠ ${nullIds} rows have null external_id in first batch`)
    }

    const { error, count } = conflictColumns
      ? await (supabase.from(table) as ReturnType<typeof supabase.from>)
          .upsert(batch, { onConflict: conflictColumns, ignoreDuplicates: true, count: 'exact' })
      : await supabase.from(table).insert(batch, { count: 'exact' })

    if (error) {
      console.error('[insertBatches] Supabase error:', {
        message: error.message,
        code:    error.code,
        details: error.details,
        hint:    error.hint,
        batch_sample: batch[0],
      })
      return { inserted, skipped, error: `${error.message}${error.details ? ` — ${error.details}` : ''}${error.hint ? ` (hint: ${error.hint})` : ''}` }
    }
    inserted += count ?? batch.length
    skipped  += batch.length - (count ?? batch.length)
    onProgress(inserted)
  }
  return { inserted, skipped }
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function mapVentas(row: Record<string, unknown>, orgId: string, locationId: string) {
  return {
    org_id:         orgId,
    location_id:    locationId,
    // "Numero" header normalizes to "numero" → maps to external_id (PK surrogate)
    external_id:    toStr(row.numero),
    sucursal:       toStr(row.sucursal),
    fecha:          toDate(row.fecha),
    // timestamptz columns — keep full datetime when available
    fecha_inicio:   toTimestamp(row.fecha_inicio),
    fecha_cierre:   toTimestamp(row.fecha_cierre),
    fecha_caja:     toDate(row.fecha_caja),
    // Excel stores time as a day-fraction; toHora converts to "HH:MM"
    hora:           toHora(row.hora),
    total:          toNum(row.total),
    descuento:      toNum(row.descuento) ?? 0,
    recargo:        toNum(row.recargo) ?? 0,
    comensales:     toNum(row.comensales) ?? 0,
    tipo_documento: toStr(row.tipo_documento),
    formas_pago:    toStr(row.formas_pago),
    camarero:       toStr(row.camarero),
    camarero_nombre:toStr(row.camarero_nombre),
    // normalizeHeader strips accents: "Obs. Promoción" → "obs._promocion", "Promoción" → "promocion"
    obs_promocion:  toStr(row['obs._promocion']),
    promocion:      toStr(row.promocion),
    cliente:        toStr(row.cliente),
  }
}

function mapStock(row: Record<string, unknown>, orgId: string, locationId: string) {
  return {
    org_id:         orgId,
    location_id:    locationId,
    external_id:    toStr(row.external_id),
    sucursal:       toStr(row.sucursal),
    numero:         toStr(row.numero),
    tipo_documento: toStr(row.tipo_documento),
    descripcion:    toStr(row.descripcion),
    unidad_medida:  toStr(row.unidad_medida),
    cantidad:       toNum(row.cantidad),
    fecha:          toDate(row.fecha),
    observaciones:  toStr(row.observaciones),
  }
}

function mapPrecios(row: Record<string, unknown>, orgId: string, locationId: string) {
  return {
    org_id:        orgId,
    location_id:   locationId,
    external_id:   toStr(row.external_id),
    codigo:        toStr(row.codigo),
    denominacion:  toStr(row.denominacion),
    familia:       toStr(row.familia),
    subfamilia:    toStr(row.subfamilia),
    marca:         toStr(row.marca),
    unidad_medida: toStr(row.unidad_medida),
    tipo:          toStr(row.tipo),
    tarifa:        toStr(row.tarifa),
    precio_venta:  toNum(row.precio_venta),
    pantalla:      toStr(row.pantalla),
  }
}

function mapFinancial(row: Record<string, unknown>, orgId: string, locationId: string) {
  return {
    org_id:      orgId,
    location_id: locationId,
    periodo:     toStr(row.periodo),
    categoria:   toStr(row.categoria),
    concepto:    toStr(row.concepto),
    monto:       toNum(row.monto),
  }
}

// ─── Duplicate check ──────────────────────────────────────────────────────────

export interface DuplicateInfo {
  hasDuplicates: boolean
  count:         number
  range:         string
}

export async function checkDuplicates(
  tableType:  TableType,
  rows:       Record<string, unknown>[],
  locationId: string = DEFAULT_LOCATION_ID,
): Promise<DuplicateInfo> {
  try {
    if (tableType === 'ventas') {
      const dates = [...new Set(rows.map(r => toDate(r.fecha)).filter(Boolean))] as string[]
      if (!dates.length) return { hasDuplicates: false, count: 0, range: '' }
      const { count } = await supabase
        .from('sales_documents')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', locationId)
        .in('fecha', dates)
      return {
        hasDuplicates: (count ?? 0) > 0,
        count: count ?? 0,
        range: `${dates[0]} – ${dates[dates.length - 1]}`,
      }
    }

    if (tableType === 'stock') {
      const dates = [...new Set(rows.map(r => toDate(r.fecha)).filter(Boolean))] as string[]
      const { count } = await supabase
        .from('stock_movements')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', locationId)
        .in('fecha', dates)
      return {
        hasDuplicates: (count ?? 0) > 0,
        count: count ?? 0,
        range: `${dates[0]} – ${dates[dates.length - 1]}`,
      }
    }

    if (tableType === 'precios') {
      const codigos = [...new Set(rows.map(r => toStr(r.codigo)).filter(Boolean))] as string[]
      const { count } = await supabase
        .from('product_prices')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', locationId)
        .in('codigo', codigos.slice(0, 100))
      return {
        hasDuplicates: (count ?? 0) > 0,
        count: count ?? 0,
        range: `${codigos.length} códigos`,
      }
    }

    if (tableType === 'financial') {
      const periods = [...new Set(rows.map(r => toStr(r.periodo)).filter(Boolean))] as string[]
      const { count } = await supabase
        .from('financial_results')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', locationId)
        .in('periodo', periods)
      return {
        hasDuplicates: (count ?? 0) > 0,
        count: count ?? 0,
        range: periods.join(', '),
      }
    }
  } catch {
    // silently ignore check errors
  }
  return { hasDuplicates: false, count: 0, range: '' }
}

// ─── Main processor ───────────────────────────────────────────────────────────

export type InsertMode = 'replace' | 'add'

export interface ProcessResult {
  inserted: number
  skipped:  number
  error?:   string
}

export async function processUpload(
  tableType:  TableType,
  rows:       Record<string, unknown>[],
  mode:       InsertMode,
  onProgress: (inserted: number, total: number, step: string) => void,
  locationId: string = DEFAULT_LOCATION_ID,
  orgId:      string = DEFAULT_ORG_ID,
): Promise<ProcessResult> {
  const total = rows.length

  // Delete existing records if replace mode
  if (mode === 'replace') {
    onProgress(0, total, 'Eliminando registros existentes…')

    if (tableType === 'ventas') {
      const dates = [...new Set(rows.map(r => toDate(r.fecha)).filter(Boolean))] as string[]
      await supabase.from('sales_documents').delete().eq('location_id', locationId).in('fecha', dates)
    } else if (tableType === 'stock') {
      const dates = [...new Set(rows.map(r => toDate(r.fecha)).filter(Boolean))] as string[]
      await supabase.from('stock_movements').delete().eq('location_id', locationId).in('fecha', dates)
    } else if (tableType === 'precios') {
      const codigos = [...new Set(rows.map(r => toStr(r.codigo)).filter(Boolean))] as string[]
      for (let i = 0; i < codigos.length; i += 500) {
        await supabase.from('product_prices').delete().eq('location_id', locationId).in('codigo', codigos.slice(i, i + 500))
      }
    } else if (tableType === 'financial') {
      const periods = [...new Set(rows.map(r => toStr(r.periodo)).filter(Boolean))] as string[]
      await supabase.from('financial_results').delete().eq('location_id', locationId).in('periodo', periods)
    }
  }

  onProgress(0, total, `Insertando ${total.toLocaleString()} filas…`)

  let mapped: Record<string, unknown>[]
  let table:  string
  let conflict: string | undefined

  switch (tableType) {
    case 'ventas':
      mapped   = rows.map(r => mapVentas(r, orgId, locationId))
      table    = 'sales_documents'
      conflict = 'external_id,location_id'
      break
    case 'stock':
      mapped   = rows.map(r => mapStock(r, orgId, locationId))
      table    = 'stock_movements'
      conflict = 'external_id,location_id'
      break
    case 'precios':
      mapped   = rows.map(r => mapPrecios(r, orgId, locationId))
      table    = 'product_prices'
      conflict = 'external_id,location_id'
      break
    case 'financial':
      mapped   = rows.map(r => mapFinancial(r, orgId, locationId))
      table    = 'financial_results'
      conflict = 'periodo,concepto,location_id'
      break
  }

  const result = await insertBatches(
    table, mapped,
    inserted => onProgress(inserted, total, `Insertando ${inserted.toLocaleString()} / ${total.toLocaleString()}…`),
    conflict,
  )

  if (result.error) return result

  // Register in uploads table
  await supabase.from('uploads').insert({
    org_id:         orgId,
    location_id:    locationId,
    file_name:      `upload_${tableType}_${new Date().toISOString().slice(0, 10)}`,
    file_type:      tableType,
    status:         'done',
    rows_processed: total,
    rows_inserted:  result.inserted,
    rows_skipped:   result.skipped,
    error_detail:   null,
  })

  return result
}
