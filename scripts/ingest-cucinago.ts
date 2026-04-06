/**
 * scripts/ingest-cucinago.ts
 *
 * Ingesta desde la API REST de CucinaGo → Supabase STG.
 *
 * Uso:
 *   npx tsx scripts/ingest-cucinago.ts                              # ayer
 *   npx tsx scripts/ingest-cucinago.ts --date 2026-04-05            # un día
 *   npx tsx scripts/ingest-cucinago.ts --from 2026-03-01 --to 2026-03-31  # rango
 *
 * Requiere: @supabase/supabase-js (ya instalado en el proyecto).
 * Entorno: apunta a STG (egjxyskqhnmuqwkrbshu) con service role key.
 */

import { createClient } from '@supabase/supabase-js'

// ─── Config ───────────────────────────────────────────────────────────────────

const STG_URL      = 'https://egjxyskqhnmuqwkrbshu.supabase.co'

const SERVICE_KEY: string = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!SERVICE_KEY) {
  console.error('[ingest-cucinago] ERROR: SUPABASE_SERVICE_ROLE_KEY no definida.')
  console.error('  Exportala antes de correr el script:')
  console.error('    export SUPABASE_SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.staging | cut -d= -f2)')
  process.exit(1)
}

// Fallbacks apuntan al seed de STG — sobreescribir en producción via env
const LOCATION_ID  = process.env.INGEST_LOCATION_ID ?? 'bbbbbbbb-0000-0000-0000-000000000001'
const ORG_ID       = process.env.INGEST_ORG_ID      ?? 'aaaaaaaa-0000-0000-0000-000000000001'

// CucinaGo REST base — el último segmento (2216) es el código de local
const API_BASE     = 'https://gd55d70ed7f53c9-o1anc1ft1sdt1pqp.adb.sa-santiago-1.oraclecloudapps.com/ords/restoweb/grupopopular/items'
const LOCAL_CODE   = '2216'

const BATCH_SIZE   = 200

// ─── Types ────────────────────────────────────────────────────────────────────

/** Fila cruda devuelta por la API de CucinaGo (nombres de columna ORDS) */
interface CucinaGoItem {
  // Identificación del documento
  numero:           string | number   // → external_id + numero_ticket
  id_item?:         string | number   // identificador de línea (referencia interna)
  // Cabecera del documento
  fecha_caja?:      string            // DD-MM-YYYY → fecha del documento
  tipo_documento?:  string
  tipo_zona?:       string
  turno?:           string
  camarero_nombre?: string
  // Ítem
  codigo?:          number
  descripcion?:     string
  cantidad?:        number | string
  precio_unitario?: number | string
  precio_total?:    number | string
  descuento_item?:  number | string
  fecha_item?:      string            // timestamp completo del ítem
  // Campos extra que la API puede devolver — no mapeados
  [key: string]: unknown
}

/** Respuesta paginada estándar de Oracle ORDS */
interface OrdsResponse {
  items:   CucinaGoItem[]
  hasMore: boolean
  limit:   number
  offset:  number
  count:   number
  links?:  Array<{ rel: string; href: string }>
}

// ─── Logger ───────────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 23)
}

const log = {
  info:  (...args: unknown[]) => console.log( `[${ts()}] INFO  `, ...args),
  warn:  (...args: unknown[]) => console.warn(`[${ts()}] WARN  `, ...args),
  error: (...args: unknown[]) => console.error(`[${ts()}] ERROR `, ...args),
  step:  (...args: unknown[]) => console.log( `[${ts()}] ──►   `, ...args),
  ok:    (...args: unknown[]) => console.log( `[${ts()}] ✓     `, ...args),
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** YYYY-MM-DD → DD-MM-YYYY (formato de la API de CucinaGo) */
function toApiDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

/** Cualquier formato de fecha → YYYY-MM-DD (para columnas date de Supabase) */
function toIsoDate(v: string | undefined | null): string | null {
  if (!v) return null
  // DD-MM-YYYY o DD/MM/YYYY
  const ddmm = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(v.trim())
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`
  // ISO o cualquier cosa que Date entienda
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

/** Cualquier fecha/hora → ISO-8601 completo (para timestamptz) */
function toIsoTimestamp(v: string | undefined | null): string | null {
  if (!v) return null
  const date = toIsoDate(v)
  if (!date) return null
  // Si ya tiene hora: "DD-MM-YYYY HH:MM:SS"
  const timePart = /(\d{1,2}:\d{2}(?::\d{2})?)/.exec(v.trim())?.[1] ?? '00:00:00'
  return `${date}T${timePart}Z`
}

/** Devuelve YYYY-MM-DD de ayer */
function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

/** Genera array de fechas YYYY-MM-DD desde from hasta to (inclusive) */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from + 'T00:00:00Z')
  const end = new Date(to   + 'T00:00:00Z')
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Value coercers ───────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(/[,$\s]/g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

function toMoney(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const s = String(v).trim().replace(/\$/g, '').replace(/\s/g, '')
  const normalized = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s
  const n = parseFloat(normalized)
  return isNaN(n) ? null : n
}

function toStr(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null
  return String(v).trim()
}

// ─── API fetcher ──────────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<OrdsResponse> {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API HTTP ${res.status} — ${url}\n${body.slice(0, 300)}`)
  }

  return res.json() as Promise<OrdsResponse>
}

/**
 * Recupera TODOS los ítems del día paginando hasta hasMore=false.
 * Sigue el link rel="next" de ORDS cuando existe; si no, incrementa offset.
 */
async function fetchAllItems(dateIso: string): Promise<CucinaGoItem[]> {
  const apiDate = toApiDate(dateIso)
  const baseUrl = `${API_BASE}/${apiDate}/${apiDate}/${LOCAL_CODE}`

  log.step(`Fetch API: ${baseUrl}`)

  const all: CucinaGoItem[] = []
  let nextUrl: string | null = baseUrl
  let page = 0

  while (nextUrl) {
    page++
    log.info(`  Página ${page} → ${nextUrl}`)

    const data = await fetchPage(nextUrl)

    log.info(`  Recibidos: ${data.count ?? data.items.length} ítems (hasMore=${data.hasMore})`)
    all.push(...data.items)

    if (!data.hasMore) break

    // Preferir el link rel:next que ORDS incluye; fallback: offset manual
    const nextLink = data.links?.find(l => l.rel === 'next')?.href ?? null
    if (nextLink) {
      nextUrl = nextLink
    } else {
      // Construir con offset manual si ORDS no devuelve el link
      const offset = (data.offset ?? 0) + (data.limit ?? data.items.length)
      nextUrl = `${baseUrl}?offset=${offset}&limit=${data.limit ?? 25}`
    }
  }

  log.ok(`Total ítems recibidos de la API: ${all.length}`)
  return all
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapItem(r: CucinaGoItem) {
  return {
    org_id:          ORG_ID,
    location_id:     LOCATION_ID,
    // numero → tanto external_id (clave de upsert) como numero_ticket (JOIN con docs)
    external_id:     toStr(r.numero),
    numero_ticket:   toStr(r.numero),
    // Ítem
    codigo:          toNum(r.codigo),
    descripcion:     toStr(r.descripcion),
    cantidad:        toMoney(r.cantidad),
    precio_unitario: toMoney(r.precio_unitario),
    precio_total:    toMoney(r.precio_total),
    descuento_item:  toMoney(r.descuento_item) ?? 0,
    // fecha_item: timestamp completo del ítem (parte del onConflict)
    fecha_item:      toIsoTimestamp(r.fecha_item),
    // Campos de cabecera copiados al ítem
    tipo_zona:       toStr(r.tipo_zona),
    turno:           toStr(r.turno),
    camarero_nombre: toStr(r.camarero_nombre),
  }
}

/**
 * Agrupa ítems por número de documento y construye una fila de sales_documents.
 * - fecha:     tomada de fecha_caja del primer ítem (DD-MM-YYYY → YYYY-MM-DD)
 * - total:     SUM(precio_total) de todos los ítems del documento
 * - descuento: SUM(descuento_item) de todos los ítems del documento
 */
function buildDocument(externalId: string, items: CucinaGoItem[]) {
  const first = items[0]

  const total     = items.reduce((acc, it) => acc + (toMoney(it.precio_total)   ?? 0), 0)
  const descuento = items.reduce((acc, it) => acc + (toMoney(it.descuento_item) ?? 0), 0)

  return {
    org_id:          ORG_ID,
    location_id:     LOCATION_ID,
    external_id:     externalId,
    // fecha_caja (DD-MM-YYYY) es la fecha operativa del documento
    fecha:           toIsoDate(toStr(first.fecha_caja)),
    tipo_documento:  toStr(first.tipo_documento),
    tipo_zona:       toStr(first.tipo_zona),
    turno:           toStr(first.turno),
    camarero_nombre: toStr(first.camarero_nombre),
    total,
    descuento,
    cantidad_documentos: items.length,
  }
}

// ─── Upsert helpers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertBatches(
  supabase: ReturnType<typeof createClient<any>>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<{ inserted: number; failed: number; firstError?: string }> {
  let inserted = 0
  let failed   = 0
  let firstError: string | undefined
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE)

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch    = rows.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1

    const { error, count } = await supabase
      .from(table)
      .upsert(batch, { onConflict, ignoreDuplicates: true, count: 'exact' })

    if (error) {
      const msg = `${error.message}${error.details ? ` — ${error.details}` : ''}`
      log.error(`  [${table}] batch ${batchNum}/${totalBatches} ERROR: ${msg}`)
      failed += batch.length
      if (!firstError) firstError = msg
    } else {
      const n = count ?? batch.length
      inserted += n
      log.info(`  [${table}] batch ${batchNum}/${totalBatches}: ${n} upserted`)
    }
  }

  return { inserted, failed, firstError }
}

// ─── Per-day ingestion ────────────────────────────────────────────────────────

interface DayResult {
  date:       string
  docs:       number
  items:      number
  failed:     boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ingestDay(dateIso: string, supabase: ReturnType<typeof createClient<any>>, showRawSample: boolean): Promise<DayResult> {
  log.info('───────────────────────────────────────────────────────')
  log.info(`Procesando: ${dateIso}`)
  log.info('───────────────────────────────────────────────────────')

  // Fetch
  let rawItems: CucinaGoItem[]
  try {
    rawItems = await fetchAllItems(dateIso)
  } catch (err) {
    log.error('Falla al llamar la API de CucinaGo:', err instanceof Error ? err.message : err)
    return { date: dateIso, docs: 0, items: 0, failed: true }
  }

  if (rawItems.length === 0) {
    log.warn(`${dateIso}: API devolvió 0 ítems. Nada que insertar.`)
    return { date: dateIso, docs: 0, items: 0, failed: false }
  }

  // Muestra del primer ítem crudo (solo al correr un único día)
  if (showRawSample) {
    log.step('Campos del primer ítem (API raw):')
    console.log(JSON.stringify(rawItems[0], null, 2))
  }

  // Agrupar por documento
  const docMap = new Map<string, CucinaGoItem[]>()
  for (const item of rawItems) {
    const key = String(item.numero ?? '').trim()
    if (!key) { log.warn('Ítem sin numero:', item); continue }
    const group = docMap.get(key)
    if (group) group.push(item)
    else docMap.set(key, [item])
  }
  log.ok(`Documentos únicos: ${docMap.size}  |  Ítems totales: ${rawItems.length}`)

  // Mapear filas
  const docRows  = Array.from(docMap.entries())
    .map(([extId, items]) => buildDocument(extId, items)) as Record<string, unknown>[]
  const itemRows = rawItems.map(mapItem) as Record<string, unknown>[]

  // Upsert sales_documents
  log.step(`Upserting ${docRows.length} documentos → sales_documents…`)
  const docResult = await upsertBatches(supabase, 'sales_documents', docRows, 'external_id,location_id,total,fecha')

  // Upsert sales_items
  log.step(`Upserting ${itemRows.length} ítems → sales_items…`)
  const itemResult = await upsertBatches(supabase, 'sales_items', itemRows, 'external_id,location_id,fecha_item,codigo')

  // Registrar en uploads
  const anyFailed = docResult.failed + itemResult.failed > 0
  await supabase.from('uploads').insert({
    org_id:         ORG_ID,
    location_id:    LOCATION_ID,
    file_name:      `cucinago_api_${dateIso}`,
    file_type:      'items',
    status:         anyFailed ? 'partial' : 'done',
    rows_processed: rawItems.length,
    rows_inserted:  itemResult.inserted,
    rows_skipped:   itemResult.inserted === 0 ? rawItems.length : 0,
    error_detail:   itemResult.firstError ?? docResult.firstError ?? null,
  })

  log.ok(`${dateIso}: docs=${docResult.inserted} items=${itemResult.inserted} failed=${docResult.failed + itemResult.failed}`)
  return {
    date:   dateIso,
    docs:   docResult.inserted,
    items:  itemResult.inserted,
    failed: anyFailed,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Parsear argumentos ────────────────────────────────────────────────
  const argv = process.argv

  const dateArg = argv.indexOf('--date')
  const fromArg = argv.indexOf('--from')
  const toArg   = argv.indexOf('--to')

  let dates: string[]

  if (fromArg !== -1 || toArg !== -1) {
    // Modo rango
    if (fromArg === -1 || toArg === -1) {
      log.error('--from y --to deben usarse juntos. Ej: --from 2026-03-01 --to 2026-03-31')
      process.exit(1)
    }
    const from = argv[fromArg + 1]
    const to   = argv[toArg   + 1]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      log.error(`Fechas inválidas: from="${from}" to="${to}". Formato: YYYY-MM-DD`)
      process.exit(1)
    }
    if (from > to) {
      log.error(`--from (${from}) debe ser ≤ --to (${to})`)
      process.exit(1)
    }
    dates = dateRange(from, to)
  } else {
    // Modo día único (--date o ayer por defecto)
    const dateIso = dateArg !== -1 ? argv[dateArg + 1] : yesterday()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      log.error(`Fecha inválida: "${dateIso}". Formato esperado: YYYY-MM-DD`)
      process.exit(1)
    }
    dates = [dateIso]
  }

  const isRange = dates.length > 1

  log.info('═══════════════════════════════════════════════════════')
  log.info('Ingesta CucinaGo → Supabase STG')
  if (isRange) {
    log.info(`Rango: ${dates[0]} → ${dates[dates.length - 1]}  (${dates.length} días)`)
  } else {
    log.info(`Fecha: ${dates[0]}`)
  }
  log.info(`Location: ${LOCATION_ID}`)
  log.info('═══════════════════════════════════════════════════════')

  // ── 2. Cliente Supabase ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient<any>(STG_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  log.ok('Cliente Supabase STG inicializado (service role)')

  // ── 3. Iterar días ───────────────────────────────────────────────────────
  const results: DayResult[] = []

  for (let i = 0; i < dates.length; i++) {
    const result = await ingestDay(dates[i], supabase, !isRange)
    results.push(result)

    // Delay entre días (no después del último)
    if (isRange && i < dates.length - 1) {
      log.info('Esperando 2s antes del siguiente día…')
      await sleep(2000)
    }
  }

  // ── 4. Resumen total ─────────────────────────────────────────────────────
  const totalDocs    = results.reduce((s, r) => s + r.docs,  0)
  const totalItems   = results.reduce((s, r) => s + r.items, 0)
  const failedDays   = results.filter(r => r.failed)

  log.info('═══════════════════════════════════════════════════════')
  log.info('RESUMEN TOTAL')
  log.info(`  Días procesados:  ${results.length}`)
  log.info(`  Total docs:       ${totalDocs}`)
  log.info(`  Total items:      ${totalItems}`)
  log.info(`  Días con error:   ${failedDays.length}`)
  if (failedDays.length > 0) {
    log.warn('  Fechas con error:')
    failedDays.forEach(r => log.warn(`    ${r.date}`))
  }
  log.info('═══════════════════════════════════════════════════════')

  if (failedDays.length > 0) process.exit(1)
  log.ok('Ingesta completada sin errores.')
}

main().catch(err => {
  log.error('Error no capturado:', err)
  process.exit(1)
})
