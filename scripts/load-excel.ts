/**
 * scripts/load-excel.ts
 *
 * Lee un Excel de Ventas o de Detalle de Ventas (Items) y carga directo
 * en Supabase STG usando DELETE+INSERT por rango de fechas, sin pasar por la web.
 *
 * Estrategia DELETE+INSERT:
 *   Ventas → DELETE WHERE fecha BETWEEN min y max del Excel, luego INSERT
 *   Items  → DELETE WHERE fecha_caja BETWEEN min y max del Excel, luego INSERT
 *
 * Detección automática por headers:
 *   • headers contienen "familia"  → Items   (sales_items)
 *   • de lo contrario              → Ventas  (sales_documents)
 *
 * Mapeo idéntico a lib/processors/excelProcessor.ts: mapVentas() / mapItems().
 *
 * Uso:
 *   npx tsx scripts/load-excel.ts --file path/to/Ventas.xlsx
 *   npx tsx scripts/load-excel.ts --file path/to/Detalle.xlsx
 *
 * Env vars:
 *   SUPABASE_SERVICE_ROLE_KEY  (requerida)
 *   INGEST_LOCATION_ID         (opcional, default STG seed)
 *   INGEST_ORG_ID              (opcional, default STG seed)
 */

import * as XLSX    from 'xlsx'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// ─── Config ───────────────────────────────────────────────────────────────────

const STG_URL     = 'https://egjxyskqhnmuqwkrbshu.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SERVICE_KEY) {
  console.error('[load-excel] ERROR: SUPABASE_SERVICE_ROLE_KEY no definida.')
  console.error('  export SUPABASE_SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.staging | cut -d= -f2)')
  process.exit(1)
}

const LOCATION_ID = process.env.INGEST_LOCATION_ID ?? 'bbbbbbbb-0000-0000-0000-000000000001'
const ORG_ID      = process.env.INGEST_ORG_ID      ?? 'aaaaaaaa-0000-0000-0000-000000000001'
const BATCH_SIZE  = 500

// ─── Logger ───────────────────────────────────────────────────────────────────

function ts() { return new Date().toISOString().replace('T', ' ').slice(0, 23) }
const log = {
  info:  (...a: unknown[]) => console.log( `[${ts()}] INFO  `, ...a),
  warn:  (...a: unknown[]) => console.warn(`[${ts()}] WARN  `, ...a),
  error: (...a: unknown[]) => console.error(`[${ts()}] ERROR `, ...a),
  step:  (...a: unknown[]) => console.log( `[${ts()}] ──►   `, ...a),
  ok:    (...a: unknown[]) => console.log( `[${ts()}] ✓     `, ...a),
}

// ─── Header normalizer (idéntico a uploadValidator.ts) ────────────────────────

function normalizeHeader(h: string): string {
  return h
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
}

// ─── Value coercers (idénticos a excelProcessor.ts) ──────────────────────────

function toStr(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null
  return String(v).trim()
}

function toNum(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''))
  return isNaN(n) ? null : n
}

function toMoney(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const s = String(v).trim().replace(/\$/g, '').replace(/\s/g, '')
  if (s === '') return null
  const normalized = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s
  const n = parseFloat(normalized)
  return isNaN(n) ? null : n
}

function toNumComma(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = parseFloat(String(v).trim().replace(/\s/g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

function parseFlexDate(v: unknown): Date | null {
  if (v === '' || v === null || v === undefined) return null
  const s = String(v).trim()
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/.exec(s)
  if (ddmm) {
    const datePart = `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`
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

function toTimestamp(v: unknown): string | null {
  const d = parseFlexDate(v)
  return d ? d.toISOString() : null
}

function toHora(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null
  const s = String(v).trim()
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5)
  const n = parseFloat(s.replace(',', '.'))
  if (!isNaN(n) && n >= 0 && n < 1) {
    const mins = Math.round(n * 1440)
    const hh   = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm   = String(mins % 60).padStart(2, '0')
    return `${hh}:${mm}`
  }
  return s
}

// ─── Row mappers (idénticos a excelProcessor.ts) ─────────────────────────────

function mapVentas(row: Record<string, unknown>) {
  return {
    org_id:          ORG_ID,
    location_id:     LOCATION_ID,
    external_id:     toStr(row.numero),
    sucursal:        toStr(row.sucursal),
    fecha:           toDate(row.fecha),
    fecha_inicio:    toTimestamp(row.fecha_inicio),
    fecha_cierre:    toTimestamp(row.fecha_cierre),
    fecha_caja:      toDate(row.fecha_caja),
    hora:            toHora(row.hora),
    total:           toNum(row.total),
    descuento:       toNum(row.descuento)  ?? 0,
    recargo:         toNum(row.recargo)    ?? 0,
    comensales:      toNum(row.comensales) ?? 0,
    tipo_documento:  toStr(row.tipo_documento),
    formas_pago:     toStr(row.formas_pago),
    camarero:        toStr(row.camarero),
    camarero_nombre: toStr(row.camarero_nombre),
    obs_promocion:   toStr(row['obs._promocion']),
    promocion:       toStr(row.promocion),
    cliente:         toStr(row.cliente),
    tipo_zona:       toStr(row.tipo_zona),
    zona:            toStr(row.zona),
    punto_venta:     toStr(row.punto_venta),
    turno:           toStr(row.turno),
    usuario:         toStr(row.usuario),
    tipo_sucursal:   toStr(row.tipo_sucursal),
  }
}

function mapItems(row: Record<string, unknown>) {
  return {
    org_id:                  ORG_ID,
    location_id:             LOCATION_ID,
    external_id:             toStr(row.numero),
    numero_ticket:           toStr(row.numero),
    sucursal:                toStr(row.sucursal),
    punto_venta:             toStr(row.punto_venta),
    camarero:                toStr(row.camarero),
    camarero_nombre:         toStr(row.camarero_nombre),
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
    nro_caja:                toNum(row['nro._caja']),
    hora_item:               toHora(row.hora_item),
    fecha_documento:         toDate(row.fecha_documento),
    fecha_caja:              toDate(row.fecha_caja),
    fecha_inicio:            toTimestamp(row.fecha_inicio),
    fecha_cierre:            toTimestamp(row.fecha_cierre),
    fecha_item:              toTimestamp(row.fecha_item),
    cantidad:                toNumComma(row.cantidad),
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

// ─── Date range helpers ───────────────────────────────────────────────────────

function dateRangeOf(rows: Record<string, unknown>[], field: string): { min: string; max: string } | null {
  const dates = rows
    .map(r => r[field])
    .filter((v): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
  if (dates.length === 0) return null
  dates.sort()
  return { min: dates[0], max: dates[dates.length - 1] }
}

// ─── DELETE + INSERT ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteRange(
  supabase:  ReturnType<typeof createClient<any>>,
  table:     string,
  dateField: string,
  min:       string,
  max:       string,
): Promise<void> {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq('location_id', LOCATION_ID)
    .gte(dateField, min)
    .lte(dateField, max)

  if (error) throw new Error(`DELETE ${table}: ${error.message}`)
  log.ok(`DELETE ${table} WHERE ${dateField} BETWEEN ${min} AND ${max}: ${count ?? '?'} filas eliminadas`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertBatches(
  supabase: ReturnType<typeof createClient<any>>,
  table:    string,
  rows:     Record<string, unknown>[],
): Promise<{ inserted: number; failed: number; firstError?: string }> {
  let inserted   = 0
  let failed     = 0
  let firstError: string | undefined
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE)

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch    = rows.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1

    const { error, count } = await supabase
      .from(table)
      .insert(batch, { count: 'exact' })

    if (error) {
      const msg = `${error.message}${error.details ? ` — ${error.details}` : ''}`
      log.error(`  [${table}] batch ${batchNum}/${totalBatches} ERROR: ${msg}`)
      failed += batch.length
      if (!firstError) firstError = msg
    } else {
      const n = count ?? batch.length
      inserted += n
      log.info(`  [${table}] batch ${batchNum}/${totalBatches}: ${n} insertados (acum: ${inserted})`)
    }
  }

  return { inserted, failed, firstError }
}

// ─── Deduplication ───────────────────────────────────────────────────────────

/** Deduplica por los campos clave del constraint, conservando la última aparición. */
function deduplicateRows(rows: Record<string, unknown>[], keyFields: string[]): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const key = keyFields.map(f => String(row[f] ?? '')).join('|')
    map.set(key, row)
  }
  return Array.from(map.values())
}

// ─── Auto-detect table type from normalized headers ───────────────────────────

function detectType(headers: string[]): 'ventas' | 'items' {
  const set = new Set(headers)
  // Items have "familia" (product family) — never present in Ventas
  if (set.has('familia') || set.has('fecha_item') || set.has('precio_total')) return 'items'
  return 'ventas'
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Parsear --file ─────────────────────────────────────────────────────
  const fileArg = process.argv.indexOf('--file')
  if (fileArg === -1 || !process.argv[fileArg + 1]) {
    log.error('Falta --file path/to/archivo.xlsx')
    process.exit(1)
  }
  const filePath = process.argv[fileArg + 1]

  log.info('═══════════════════════════════════════════════════════')
  log.info('load-excel → Supabase STG (upsert directo)')
  log.info(`Archivo:  ${filePath}`)
  log.info(`Location: ${LOCATION_ID}`)
  log.info('═══════════════════════════════════════════════════════')

  // ── 2. Leer Excel ─────────────────────────────────────────────────────────
  log.step('Leyendo Excel…')
  let buf: Buffer
  try {
    buf = readFileSync(filePath)
  } catch (err) {
    log.error(`No se pudo leer el archivo: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }

  const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const sheet    = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '', raw: false, dateNF: 'yyyy-mm-dd',
  })

  log.ok(`Filas leídas: ${rawRows.length}`)

  if (rawRows.length === 0) {
    log.warn('El archivo está vacío.')
    process.exit(0)
  }

  // ── 3. Normalizar headers y detectar tipo ────────────────────────────────
  const normalizedRows = rawRows.map(r =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [normalizeHeader(k), v]))
  )
  const headers = Object.keys(normalizedRows[0])
  log.info(`Headers normalizados: ${headers.join(', ')}`)

  const tableType = detectType(headers)
  log.ok(`Tipo detectado: ${tableType === 'ventas' ? 'Ventas (sales_documents)' : 'Items (sales_items)'}`)

  // ── 4. Mapear filas ───────────────────────────────────────────────────────
  log.step('Mapeando filas…')
  const mapped = tableType === 'ventas'
    ? normalizedRows.map(r => mapVentas(r) as Record<string, unknown>)
    : normalizedRows.map(r => mapItems(r)  as Record<string, unknown>)

  const nullIds = mapped.filter(r => !r.external_id).length
  if (nullIds > 0) log.warn(`${nullIds} filas sin external_id`)

  // Para ventas: deduplicar incluyendo cliente para no colapsar tickets de distintos clientes
  // (ej. dos ventas de PedidosYa con distinto cliente pero mismo external_id/total/fecha)
  // Para items: no deduplicar — insertar todas las filas tal cual
  let rows: Record<string, unknown>[]
  if (tableType === 'ventas') {
    const deduped = deduplicateRows(mapped, ['external_id', 'total', 'fecha', 'cliente'])
    if (deduped.length < mapped.length) {
      log.warn(`Duplicados en Excel eliminados: ${mapped.length - deduped.length} filas (${deduped.length} únicas)`)
    }
    rows = deduped
  } else {
    rows = mapped
  }

  // ── 5. Cliente Supabase ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient<any>(STG_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── 6. DELETE por rango de fechas, luego INSERT ───────────────────────────
  const table     = tableType === 'ventas' ? 'sales_documents' : 'sales_items'
  const dateField = tableType === 'ventas' ? 'fecha' : 'fecha_caja'

  const range = dateRangeOf(rows, dateField)
  if (!range) {
    log.error(`No se encontraron fechas válidas en columna "${dateField}". Abortando.`)
    process.exit(1)
  }
  log.info(`Rango de fechas (${dateField}): ${range.min} → ${range.max}`)

  log.step(`Eliminando registros existentes en ese rango…`)
  try {
    await deleteRange(supabase, table, dateField, range.min, range.max)
  } catch (err) {
    log.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }

  log.step(`Insertando ${rows.length} filas → ${table}  (batches de ${BATCH_SIZE})…`)

  const result = await insertBatches(supabase, table, rows)

  // ── 7. Registrar en uploads ───────────────────────────────────────────────
  await supabase.from('uploads').insert({
    org_id:         ORG_ID,
    location_id:    LOCATION_ID,
    file_name:      filePath.split(/[\\/]/).pop() ?? filePath,
    file_type:      tableType,
    status:         result.failed > 0 ? 'partial' : 'done',
    rows_processed: rawRows.length,
    rows_inserted:  result.inserted,
    rows_skipped:   rawRows.length - result.inserted - result.failed,
    error_detail:   result.firstError ?? null,
  })

  // ── 8. Resumen ────────────────────────────────────────────────────────────
  log.info('═══════════════════════════════════════════════════════')
  log.info('RESUMEN')
  log.info(`  Tabla:      ${table}`)
  log.info(`  Filas Excel:    ${rawRows.length}`)
  log.info(`  Filas únicas:   ${rows.length}`)
  log.info(`  Insertados:     ${result.inserted}`)
  log.info(`  Fallidas:   ${result.failed}`)
  if (result.firstError) log.warn(`  Primer error: ${result.firstError}`)
  log.info('═══════════════════════════════════════════════════════')

  if (result.failed > 0) process.exit(1)
  log.ok('Carga completada sin errores.')
}

main().catch(err => {
  console.error('[load-excel] Error no capturado:', err)
  process.exit(1)
})
