import { getSupabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import type { TableType } from '@/lib/validators/uploadValidator'

const BATCH_SIZE         = 200
const BATCH_TIMEOUT_MS   = 30_000
const DELETE_BATCH_DATES = 50   // dates per DELETE call

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} tardó más de ${ms / 1000}s`)), ms)
    ),
  ])
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''))
  return isNaN(n) ? null : n
}

// Parses monetary values with Argentine formatting: "$12.500,00" → 12500.00
// Rule: if a comma is present, dots are thousand separators (remove all), comma is decimal.
// If no comma, parse as-is (standard decimal dot).
export function toMoney(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const s = String(v).trim().replace(/\$/g, '').replace(/\s/g, '')
  if (s === '') return null
  const normalized = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')   // dots=thousands → remove; comma=decimal → dot
    : s
  const n = parseFloat(normalized)
  return isNaN(n) ? null : n
}

// Parses quantities with comma as decimal separator: "1,00" → 1.0
export function toNumComma(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = parseFloat(String(v).trim().replace(/\s/g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

function toStr(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null
  return String(v).trim()
}

function parseFlexDate(v: unknown): Date | null {
  if (v === '' || v === null || v === undefined) return null
  const s = String(v).trim()
  // DD/MM/YYYY or DD/MM/YYYY HH:MM[:SS]  (formato argentino / español)
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/.exec(s)
  if (ddmm) {
    const datePart = `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`
    const timePart = ddmm[4] ?? '00:00:00'
    const d = new Date(`${datePart}T${timePart}`)
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
  onProgress: (inserted: number, failed: number) => void,
  conflictColumns?: string,
): Promise<{ inserted: number; skipped: number; failed: number; firstError?: string }> {
  let inserted   = 0
  let skipped    = 0
  let failed     = 0
  let firstError: string | undefined

  if (rows.length > 0) {
    logger.debug('[insertBatches] First row sample:', rows[0])
    const nullIds = rows.slice(0, BATCH_SIZE).filter(r => r.external_id == null || r.external_id === '').length
    if (nullIds > 0) logger.warn(`[insertBatches] ⚠ ${nullIds} rows have null external_id in first batch`)
  }

  const totalBatches = Math.ceil(rows.length / BATCH_SIZE)

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch      = rows.slice(i, i + BATCH_SIZE)
    const batchNum   = Math.floor(i / BATCH_SIZE) + 1
    const batchLabel = `batch ${batchNum}/${totalBatches}`

    try {
      const q = conflictColumns
        ? getSupabase().from(table)
            .upsert(batch, { onConflict: conflictColumns, ignoreDuplicates: true, count: 'exact' })
        : getSupabase().from(table).insert(batch, { count: 'exact' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error, count } = await withTimeout(q as unknown as Promise<any>, BATCH_TIMEOUT_MS, batchLabel)

      if (error) {
        const msg = `${error.message}${error.details ? ` — ${error.details}` : ''}${error.hint ? ` (hint: ${error.hint})` : ''}`
        logger.error(`[insertBatches] ${batchLabel} error:`, { message: error.message, code: error.code, details: error.details, hint: error.hint, batch_sample: batch[0] })
        failed += batch.length
        if (!firstError) firstError = msg
        onProgress(inserted, failed)
        continue   // skip this batch, keep going
      }
      inserted += count ?? batch.length
      skipped  += batch.length - (count ?? batch.length)
      onProgress(inserted, failed)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[insertBatches] ${batchLabel} exception:`, msg)
      failed += batch.length
      if (!firstError) firstError = msg
      onProgress(inserted, failed)
      // continue with next batch
    }
  }
  return { inserted, skipped, failed, firstError }
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

let _mapVentasLogged = false

export function mapVentas(row: Record<string, unknown>, orgId: string, locationId: string) {
  if (!_mapVentasLogged) {
    logger.debug('[mapVentas] Normalized keys in first row:', Object.keys(row))
    _mapVentasLogged = true
  }
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
    // "Tipo Zona" → normalizeHeader → "tipo_zona" | "Zona" → "zona"
    tipo_zona:      toStr(row.tipo_zona),
    zona:           toStr(row.zona),
    punto_venta:    toStr(row.punto_venta),
    turno:          toStr(row.turno),
    usuario:        toStr(row.usuario),
    tipo_sucursal:  toStr(row.tipo_sucursal),
  }
}

export function mapItems(row: Record<string, unknown>, orgId: string, locationId: string) {
  return {
    org_id:                  orgId,
    location_id:             locationId,
    // "Numero" → external_id (UNIQUE key) AND numero_ticket (JOIN with sales_documents)
    external_id:             toStr(row.numero),
    numero_ticket:           toStr(row.numero),
    sucursal:                toStr(row.sucursal),
    punto_venta:             toStr(row.punto_venta),
    // Camarero is a numeric code ("1016") stored as text — use toStr, not toNum
    camarero:                toStr(row.camarero),
    camarero_nombre:         toStr(row.camarero_nombre),
    // "Apellidoynombre" (no spaces) → normalizeHeader → "apellidoynombre"
    apellido_nombre:         toStr(row.apellidoynombre),
    tipo_documento:          toStr(row.tipo_documento),
    tipo_sucursal:           toStr(row.tipo_sucursal),
    tipo_zona:               toStr(row.tipo_zona),
    zona:                    toStr(row.zona),
    zona_id:                 toNum(row.zona_id),
    turno:                   toStr(row.turno),
    familia:                 toStr(row.familia),
    subfamilia:              toStr(row.subfamilia),
    descripcion:             toStr(row.descripcion),
    marca:                   toStr(row.marca),
    codigo:                  toNum(row.codigo),
    es_variacion:            toStr(row.es_variacion),
    dia_caja:                toStr(row.dia_caja),
    mes_caja:                toStr(row.mes_caja),
    anio_caja:               toStr(row.anio_caja),
    // "Nro. Caja" → normalizeHeader preserves dot → "nro._caja"
    nro_caja:                toNum(row['nro._caja']),
    hora_item:               toHora(row.hora_item),
    fecha_documento:         toDate(row.fecha_documento),
    fecha_caja:              toDate(row.fecha_caja),
    fecha_inicio:            toTimestamp(row.fecha_inicio),
    fecha_cierre:            toTimestamp(row.fecha_cierre),
    fecha_item:              toTimestamp(row.fecha_item),
    // Quantities come with comma decimal: "1,00" → 1.0
    cantidad:                toNumComma(row.cantidad),
    // Prices come with $ and Argentine formatting: "$12.500,00" → 12500.0
    precio_unitario:         toMoney(row.precio_unitario),
    precio_total:            toMoney(row.precio_total),
    descuento_item:          toMoney(row.descuento_item),
    recargo_item:            toMoney(row.recargo_item),
    descuento_global:        toMoney(row.descuento_global),
    recargo_global:          toMoney(row.recargo_global),
    promocion:               toStr(row.promocion),
    observaciones_promocion: toStr(row.observaciones_promocion),
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
  error?:        string
}

export async function checkDuplicates(
  tableType:  TableType,
  rows:       Record<string, unknown>[],
  locationId: string,
): Promise<DuplicateInfo> {
  const supabase = getSupabase()
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

    if (tableType === 'items') {
      const dates = [...new Set(rows.map(r => toDate(r.fecha_documento)).filter(Boolean))] as string[]
      if (!dates.length) return { hasDuplicates: false, count: 0, range: '' }
      const { count } = await supabase
        .from('sales_items')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', locationId)
        .in('fecha_documento', dates)
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('[checkDuplicates] error:', msg)
    return { hasDuplicates: false, count: 0, range: '', error: msg }
  }
  return { hasDuplicates: false, count: 0, range: '' }
}

// ─── Main processor ───────────────────────────────────────────────────────────

export type InsertMode = 'replace' | 'add'

export interface ProcessResult {
  inserted:    number
  skipped:     number
  failed:      number
  firstError?: string
  error?:      string
}

export async function processUpload(
  tableType:  TableType,
  rows:       Record<string, unknown>[],
  mode:       InsertMode,
  onProgress: (inserted: number, total: number, step: string) => void,
  locationId: string,
  orgId:      string,
): Promise<ProcessResult> {
  const total = rows.length

  // Delete existing records if replace mode — batched to avoid large IN clauses
  if (mode === 'replace') {
    if (tableType === 'ventas') {
      const dates = [...new Set(rows.map(r => toDate(r.fecha)).filter(Boolean))] as string[]
      const totalDateBatches = Math.ceil(dates.length / DELETE_BATCH_DATES)
      for (let i = 0; i < dates.length; i += DELETE_BATCH_DATES) {
        const batchNum = Math.floor(i / DELETE_BATCH_DATES) + 1
        onProgress(0, total, `Eliminando registros (${batchNum}/${totalDateBatches})…`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await withTimeout(getSupabase().from('sales_documents').delete().eq('location_id', locationId).in('fecha', dates.slice(i, i + DELETE_BATCH_DATES)) as unknown as Promise<any>, BATCH_TIMEOUT_MS, `DELETE ventas batch ${batchNum}/${totalDateBatches}`)
      }
    } else if (tableType === 'items') {
      const dates = [...new Set(rows.map(r => toDate(r.fecha_documento)).filter(Boolean))] as string[]
      const totalDateBatches = Math.ceil(dates.length / DELETE_BATCH_DATES)
      for (let i = 0; i < dates.length; i += DELETE_BATCH_DATES) {
        const batchNum = Math.floor(i / DELETE_BATCH_DATES) + 1
        onProgress(0, total, `Eliminando registros (${batchNum}/${totalDateBatches})…`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await withTimeout(getSupabase().from('sales_items').delete().eq('location_id', locationId).in('fecha_documento', dates.slice(i, i + DELETE_BATCH_DATES)) as unknown as Promise<any>, BATCH_TIMEOUT_MS, `DELETE items batch ${batchNum}/${totalDateBatches}`)
      }
    } else if (tableType === 'stock') {
      const dates = [...new Set(rows.map(r => toDate(r.fecha)).filter(Boolean))] as string[]
      const totalDateBatches = Math.ceil(dates.length / DELETE_BATCH_DATES)
      for (let i = 0; i < dates.length; i += DELETE_BATCH_DATES) {
        const batchNum = Math.floor(i / DELETE_BATCH_DATES) + 1
        onProgress(0, total, `Eliminando registros (${batchNum}/${totalDateBatches})…`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await withTimeout(getSupabase().from('stock_movements').delete().eq('location_id', locationId).in('fecha', dates.slice(i, i + DELETE_BATCH_DATES)) as unknown as Promise<any>, BATCH_TIMEOUT_MS, `DELETE stock batch ${batchNum}/${totalDateBatches}`)
      }
    } else if (tableType === 'precios') {
      const codigos = [...new Set(rows.map(r => toStr(r.codigo)).filter(Boolean))] as string[]
      const totalBatches = Math.ceil(codigos.length / DELETE_BATCH_DATES)
      for (let i = 0; i < codigos.length; i += DELETE_BATCH_DATES) {
        const batchNum = Math.floor(i / DELETE_BATCH_DATES) + 1
        onProgress(0, total, `Eliminando registros (${batchNum}/${totalBatches})…`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await withTimeout(getSupabase().from('product_prices').delete().eq('location_id', locationId).in('codigo', codigos.slice(i, i + DELETE_BATCH_DATES)) as unknown as Promise<any>, BATCH_TIMEOUT_MS, `DELETE precios batch ${batchNum}/${totalBatches}`)
      }
    } else if (tableType === 'financial') {
      const periods = [...new Set(rows.map(r => toStr(r.periodo)).filter(Boolean))] as string[]
      onProgress(0, total, 'Eliminando registros existentes…')
      await getSupabase().from('financial_results').delete().eq('location_id', locationId).in('periodo', periods)
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
      conflict = 'external_id,location_id,total,fecha'
      break
    case 'items':
      mapped   = rows.map(r => mapItems(r, orgId, locationId))
      table    = 'sales_items'
      conflict = 'external_id,location_id,codigo,fecha_item'
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
    (inserted, failed) => {
      const suffix = failed > 0 ? ` · ${failed.toLocaleString()} fallidos` : ''
      onProgress(inserted, total, `Insertando ${inserted.toLocaleString()} / ${total.toLocaleString()}…${suffix}`)
    },
    conflict,
  )

  // Register in uploads table (even on partial failure)
  await getSupabase().from('uploads').insert({
    org_id:         orgId,
    location_id:    locationId,
    file_name:      `upload_${tableType}_${new Date().toISOString().slice(0, 10)}`,
    file_type:      tableType,
    status:         result.failed > 0 ? 'partial' : 'done',
    rows_processed: total,
    rows_inserted:  result.inserted,
    rows_skipped:   result.skipped,
    error_detail:   result.firstError ?? null,
  })

  return {
    inserted:   result.inserted,
    skipped:    result.skipped,
    failed:     result.failed,
    firstError: result.firstError,
    // Surface error only if nothing was inserted at all
    error: result.inserted === 0 && result.failed > 0 ? result.firstError : undefined,
  }
}
