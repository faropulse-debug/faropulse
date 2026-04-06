/**
 * scripts/complement-excel.ts
 *
 * Complementa sales_documents en Supabase con los campos que la API de CucinaGo
 * no provee, leyéndolos del Excel de Ventas exportado del POS.
 *
 * Campos actualizados: comensales, formas_pago, zona, hora,
 *                      fecha_inicio, fecha_cierre, recargo
 *
 * Match de 4 campos para integridad: external_id + location_id + total + fecha
 * Si el UPDATE afecta 0 filas (pese a que el external_id existe), se registra
 * como conflicto con los valores que no matchearon.
 *
 * Categorías del resumen:
 *   actualizados   — UPDATE afectó ≥1 fila
 *   conflictos     — external_id existe en DB pero total/fecha no matchean
 *   no encontrados — external_id no existe en DB
 *   anomalías      — fila del Excel sin total o sin fecha (match incompleto)
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

// ─── Value coercers ───────────────────────────────────────────────────────────

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

// DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD (for date column match)
function toDate(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null
  const s = String(v).trim()
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (ddmm) {
    return `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// ─── Patch builder ────────────────────────────────────────────────────────────

interface Patch {
  // Match keys (WHERE clause)
  external_id:  string
  match_total:  number | null   // columna "Total" del Excel
  match_fecha:  string | null   // columna "Fecha" del Excel → YYYY-MM-DD
  // Fields to UPDATE
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
    match_total:  toMoney(row.total),
    match_fecha:  toDate(row.fecha),
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
  log.info('Complement Excel → Supabase  (solo UPDATE, match 4 campos)')
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

  const patches: Patch[]     = []
  const anomalies: Patch[]   = []   // match_total o match_fecha nulos
  let skippedNoId = 0

  for (const row of normalizedRows) {
    const patch = buildPatch(row)
    if (!patch) { skippedNoId++; continue }

    // Solo incluir si al menos un campo complementario tiene valor
    const hasData = patch.comensales !== null || patch.formas_pago !== null ||
                    patch.zona       !== null || patch.hora        !== null ||
                    patch.fecha_inicio !== null || patch.fecha_cierre !== null ||
                    patch.recargo    !== null
    if (!hasData) continue

    // Sin total o fecha no podemos garantizar el match de 4 campos → anomalía
    if (patch.match_total === null || patch.match_fecha === null) {
      anomalies.push(patch)
    } else {
      patches.push(patch)
    }
  }

  log.ok(`Patches válidos (4 campos): ${patches.length}  |  Anomalías: ${anomalies.length}  |  Sin external_id: ${skippedNoId}`)

  if (anomalies.length > 0) {
    log.warn('Anomalías — filas sin total o fecha en Excel (no se actualizarán):')
    anomalies.slice(0, 10).forEach(p =>
      log.warn(`  ${p.external_id}  total=${p.match_total ?? 'NULL'}  fecha=${p.match_fecha ?? 'NULL'}`)
    )
    if (anomalies.length > 10) log.warn(`  ... y ${anomalies.length - 10} más`)
  }

  if (patches.length === 0) {
    log.warn('Ninguna fila tiene los 4 campos de match. Nada que actualizar.')
    printSummary(rawRows.length, patches.length + anomalies.length, 0, 0, [], anomalies.length)
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
  const CHUNK    = 500
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

  const toUpdate   = patches.filter(p => foundSet.has(p.external_id))
  const notFound   = patches.filter(p => !foundSet.has(p.external_id))

  log.ok(`Encontrados en DB: ${toUpdate.length}  |  No encontrados: ${notFound.length}`)

  if (notFound.length > 0) {
    log.warn('external_ids no encontrados en DB (se omiten):')
    notFound.slice(0, 10).forEach(p => log.warn(`  ${p.external_id}`))
    if (notFound.length > 10) log.warn(`  ... y ${notFound.length - 10} más`)
  }

  if (toUpdate.length === 0) {
    log.warn('Ningún documento del Excel existe en la DB. Nada que actualizar.')
    printSummary(rawRows.length, patches.length + anomalies.length, 0, notFound.length, [], anomalies.length)
    process.exit(0)
  }

  // ── 6. Ejecutar UPDATEs en paralelo con concurrencia controlada ───────────
  log.step(`Actualizando ${toUpdate.length} documentos con match 4 campos (concurrencia: ${CONCURRENCY})…`)

  let updated = 0
  const conflicts: Array<{ external_id: string; total: number; fecha: string }> = []
  let firstError: string | undefined

  await runChunked(toUpdate, CONCURRENCY, async (patch) => {
    const {
      external_id,
      match_total,
      match_fecha,
      ...updateFields
    } = patch

    const { data, error } = await supabase
      .from('sales_documents')
      .update(updateFields)
      .eq('external_id', external_id)
      .eq('location_id', LOCATION_ID)
      .eq('total',       match_total)
      .eq('fecha',       match_fecha)
      .select('id')

    if (error) {
      log.error(`  UPDATE ${external_id} ERROR: ${error.message}`)
      if (!firstError) firstError = error.message
    } else if (!data || data.length === 0) {
      // external_id existe en DB pero ninguna fila matcheó total+fecha
      log.warn(`  CONFLICTO ${external_id}  total=${match_total}  fecha=${match_fecha}`)
      conflicts.push({ external_id, total: match_total!, fecha: match_fecha! })
    } else {
      updated++
    }
  })

  // ── 7. Resumen ────────────────────────────────────────────────────────────
  printSummary(rawRows.length, patches.length + anomalies.length, updated, notFound.length, conflicts, anomalies.length)

  if (conflicts.length > 0) {
    log.warn('Conflictos (total/fecha no matchean fila en DB):')
    conflicts.slice(0, 20).forEach(c =>
      log.warn(`  ${c.external_id}  total=${c.total}  fecha=${c.fecha}`)
    )
    if (conflicts.length > 20) log.warn(`  ... y ${conflicts.length - 20} más`)
  }

  if (firstError) log.error(`Primer error HTTP: ${firstError}`)
  if (firstError) process.exit(1)
  log.ok('Complemento completado.')
}

function printSummary(
  totalRows:    number,
  totalPatches: number,
  updated:      number,
  notFound:     number,
  conflicts:    unknown[],
  anomalies:    number,
) {
  log.info('═══════════════════════════════════════════════════════')
  log.info('RESUMEN')
  log.info(`  Filas en Excel:       ${totalRows}`)
  log.info(`  Patches construidos:  ${totalPatches}`)
  log.info(`  Actualizados:         ${updated}`)
  log.info(`  Conflictos:           ${conflicts.length}`)
  log.info(`  No encontrados:       ${notFound}`)
  log.info(`  Anomalías:            ${anomalies}`)
  log.info('═══════════════════════════════════════════════════════')
}

main().catch(err => {
  console.error('[complement-excel] Error no capturado:', err)
  process.exit(1)
})
