/**
 * scripts/complement-excel.ts
 *
 * Complementa sales_documents en Supabase con los campos que la API de CucinaGo
 * no provee, leyéndolos del Excel de Ventas exportado del POS.
 *
 * Campos actualizados: comensales, formas_pago, zona, hora,
 *                      fecha_inicio, fecha_cierre, recargo
 *
 * NO inserta filas nuevas — solo hace UPDATE de las existentes,
 * cruzando por external_id (columna "Numero") + location_id.
 *
 * Uso:
 *   npx tsx scripts/complement-excel.ts --file path/to/Ventas__25_.xlsx
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

const STG_URL      = 'https://egjxyskqhnmuqwkrbshu.supabase.co'
const SERVICE_KEY: string = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!SERVICE_KEY) {
  console.error('[complement-excel] ERROR: SUPABASE_SERVICE_ROLE_KEY no definida.')
  console.error('  export SUPABASE_SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.staging | cut -d= -f2)')
  process.exit(1)
}

const LOCATION_ID = process.env.INGEST_LOCATION_ID ?? 'bbbbbbbb-0000-0000-0000-000000000001'

// Máximo de updates concurrentes para no saturar la conexión
const CONCURRENCY = 20

// ─── Logger ───────────────────────────────────────────────────────────────────

function ts() { return new Date().toISOString().replace('T', ' ').slice(0, 23) }
const log = {
  info:  (...a: unknown[]) => console.log( `[${ts()}] INFO  `, ...a),
  warn:  (...a: unknown[]) => console.warn(`[${ts()}] WARN  `, ...a),
  error: (...a: unknown[]) => console.error(`[${ts()}] ERROR `, ...a),
  step:  (...a: unknown[]) => console.log( `[${ts()}] ──►   `, ...a),
  ok:    (...a: unknown[]) => console.log( `[${ts()}] ✓     `, ...a),
}

// ─── Header normalizer (misma lógica que uploadValidator.ts) ──────────────────

function normalizeHeader(h: string): string {
  return h
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
}

// ─── Value coercers (mismo patrón que excelProcessor.ts) ─────────────────────

function toStr(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null
  return String(v).trim()
}

function toNum(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''))
  return isNaN(n) ? null : n
}

// Parses monetary values with Argentine formatting: "$12.500,00" → 12500.00
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

// Excel stores time as a fraction of a day (0.5 = 12:00).
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

// DD/MM/YYYY or DD/MM/YYYY HH:MM[:SS] → ISO timestamptz string
function toTimestamp(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null
  const s = String(v).trim()
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/.exec(s)
  if (ddmm) {
    const date = `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`
    const time = ddmm[4] ?? '00:00:00'
    const d = new Date(`${date}T${time}`)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// ─── Patch builder ────────────────────────────────────────────────────────────

interface Patch {
  external_id:  string
  comensales:   number | null
  formas_pago:  string | null
  zona:         string | null
  hora:         string | null
  fecha_inicio: string | null
  fecha_cierre: string | null
  recargo:      number | null
}

function buildPatch(row: Record<string, unknown>): Patch | null {
  const extId = toStr(row.numero)
  if (!extId) return null

  return {
    external_id:  extId,
    comensales:   toNum(row.comensales),
    formas_pago:  toStr(row.formas_pago),
    zona:         toStr(row.zona),
    hora:         toHora(row.hora),
    fecha_inicio: toTimestamp(row.fecha_inicio),
    fecha_cierre: toTimestamp(row.fecha_cierre),
    recargo:      toMoney(row.recargo),
  }
}

// ─── Concurrency helper ───────────────────────────────────────────────────────

async function runChunked<T, R>(
  items: T[],
  size:  number,
  fn:    (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size)
    results.push(...await Promise.all(chunk.map(fn)))
  }
  return results
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Parsear --file ─────────────────────────────────────────────────────
  const fileArg = process.argv.indexOf('--file')
  if (fileArg === -1 || !process.argv[fileArg + 1]) {
    log.error('Falta --file path/to/Ventas.xlsx')
    process.exit(1)
  }
  const filePath = process.argv[fileArg + 1]

  log.info('═══════════════════════════════════════════════════════')
  log.info('Complement Excel → Supabase STG  (solo UPDATE)')
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

  log.ok(`Filas leídas del Excel: ${rawRows.length}`)

  if (rawRows.length === 0) {
    log.warn('El archivo está vacío. Nada que hacer.')
    process.exit(0)
  }

  // Mostrar headers normalizados para diagnóstico
  const headers = Object.keys(rawRows[0]).map(normalizeHeader)
  log.info(`Headers normalizados: ${headers.join(', ')}`)

  // ── 3. Normalizar headers y construir patches ─────────────────────────────
  log.step('Construyendo patches…')

  const normalizedRows = rawRows.map(r =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [normalizeHeader(k), v]))
  )

  const patches: Patch[] = []
  let skippedNoId = 0

  for (const row of normalizedRows) {
    const patch = buildPatch(row)
    if (!patch) { skippedNoId++; continue }
    // Solo incluir el patch si al menos un campo complementario tiene valor
    const hasData = patch.comensales !== null || patch.formas_pago !== null ||
                    patch.zona       !== null || patch.hora        !== null ||
                    patch.fecha_inicio !== null || patch.fecha_cierre !== null ||
                    patch.recargo    !== null
    if (hasData) patches.push(patch)
  }

  log.ok(`Patches con datos: ${patches.length}  |  Sin external_id: ${skippedNoId}`)

  if (patches.length === 0) {
    log.warn('Ninguna fila tiene campos complementarios para actualizar.')
    process.exit(0)
  }

  // ── 4. Cliente Supabase ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient<any>(STG_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── 5. Verificar cuáles external_ids existen en DB ────────────────────────
  log.step('Verificando existencia en sales_documents…')

  const allIds   = patches.map(p => p.external_id)
  const CHUNK    = 500   // .in() tiene límite práctico
  const foundSet = new Set<string>()

  for (let i = 0; i < allIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('sales_documents')
      .select('external_id')
      .eq('location_id', LOCATION_ID)
      .in('external_id', allIds.slice(i, i + CHUNK))

    if (error) {
      log.error('Error al consultar sales_documents:', error.message)
      process.exit(1)
    }
    for (const row of data ?? []) foundSet.add(row.external_id)
  }

  const toUpdate  = patches.filter(p => foundSet.has(p.external_id))
  const notFound  = patches.filter(p => !foundSet.has(p.external_id))

  log.ok(`Encontrados en DB: ${toUpdate.length}  |  No encontrados: ${notFound.length}`)

  if (notFound.length > 0) {
    log.warn('external_ids no encontrados en DB (se omiten):')
    notFound.slice(0, 10).forEach(p => log.warn(`  ${p.external_id}`))
    if (notFound.length > 10) log.warn(`  ... y ${notFound.length - 10} más`)
  }

  if (toUpdate.length === 0) {
    log.warn('Ningún documento del Excel existe en la DB. Nada que actualizar.')
    process.exit(0)
  }

  // ── 6. Ejecutar UPDATEs en paralelo con concurrencia controlada ───────────
  log.step(`Actualizando ${toUpdate.length} documentos (concurrencia: ${CONCURRENCY})…`)

  let updated = 0
  let failed  = 0
  let firstError: string | undefined

  await runChunked(toUpdate, CONCURRENCY, async (patch) => {
    const { external_id, ...fields } = patch

    const { error } = await supabase
      .from('sales_documents')
      .update(fields)
      .eq('external_id', external_id)
      .eq('location_id', LOCATION_ID)

    if (error) {
      log.error(`  UPDATE ${external_id} ERROR: ${error.message}`)
      failed++
      if (!firstError) firstError = error.message
    } else {
      updated++
    }
  })

  // ── 7. Resumen ────────────────────────────────────────────────────────────
  log.info('═══════════════════════════════════════════════════════')
  log.info('RESUMEN')
  log.info(`  Filas en Excel:          ${rawRows.length}`)
  log.info(`  Patches construidos:     ${patches.length}`)
  log.info(`  Encontrados en DB:       ${toUpdate.length}`)
  log.info(`  Actualizados:            ${updated}`)
  log.info(`  No encontrados (omitidos): ${notFound.length}`)
  log.info(`  Fallidos:                ${failed}`)
  if (firstError) log.warn(`  Primer error: ${firstError}`)
  log.info('═══════════════════════════════════════════════════════')

  if (failed > 0) process.exit(1)
  log.ok('Complemento completado sin errores.')
}

main().catch(err => {
  console.error('[complement-excel] Error no capturado:', err)
  process.exit(1)
})
