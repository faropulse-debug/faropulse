/**
 * scripts/ingest-cucinago.ts
 *
 * Ingesta diaria desde la API REST de CucinaGo → Supabase STG.
 *
 * Uso:
 *   npx tsx scripts/ingest-cucinago.ts              # ayer
 *   npx tsx scripts/ingest-cucinago.ts --date 2026-04-05
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Parsear --date ─────────────────────────────────────────────────────
  const dateArg = process.argv.indexOf('--date')
  const dateIso = dateArg !== -1
    ? process.argv[dateArg + 1]
    : yesterday()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    log.error(`Fecha inválida: "${dateIso}". Formato esperado: YYYY-MM-DD`)
    process.exit(1)
  }

  log.info('═══════════════════════════════════════════════════════')
  log.info(`Ingesta CucinaGo → Supabase STG`)
  log.info(`Fecha: ${dateIso}  |  Location: ${LOCATION_ID}`)
  log.info('═══════════════════════════════════════════════════════')

  // ── 2. Cliente Supabase (service role — bypassa RLS) ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient<any>(STG_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  log.ok('Cliente Supabase STG inicializado (service role)')

  // ── 3. Fetch de la API con paginación ────────────────────────────────────
  let rawItems: CucinaGoItem[]
  try {
    rawItems = await fetchAllItems(dateIso)
  } catch (err) {
    log.error('Falla al llamar la API de CucinaGo:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  if (rawItems.length === 0) {
    log.warn('La API devolvió 0 ítems para esta fecha. Nada que insertar.')
    process.exit(0)
  }

  // ── 4. Agrupar ítems por documento ───────────────────────────────────────
  log.step('Agrupando ítems por documento…')

  const docMap = new Map<string, CucinaGoItem[]>()
  for (const item of rawItems) {
    const key = String(item.numero ?? '').trim()
    if (!key) { log.warn('Ítem sin numero:', item); continue }
    const group = docMap.get(key)
    if (group) group.push(item)
    else docMap.set(key, [item])
  }

  log.ok(`Documentos únicos: ${docMap.size}  |  Ítems totales: ${rawItems.length}`)

  // ── 5. Mapear filas ───────────────────────────────────────────────────────
  const docRows  = Array.from(docMap.entries())
    .map(([extId, items]) => buildDocument(extId, items)) as Record<string, unknown>[]
  const itemRows = rawItems.map(mapItem) as Record<string, unknown>[]

  // ── 6. Upsert sales_documents ─────────────────────────────────────────────
  log.step(`Upserting ${docRows.length} documentos → sales_documents…`)

  const docResult = await upsertBatches(
    supabase,
    'sales_documents',
    docRows,
    'external_id,location_id,total',
  )

  // ── 7. Upsert sales_items ─────────────────────────────────────────────────
  log.step(`Upserting ${itemRows.length} ítems → sales_items…`)

  const itemResult = await upsertBatches(
    supabase,
    'sales_items',
    itemRows,
    'external_id,location_id,fecha_item,codigo',
  )

  // ── 8. Registrar en uploads ───────────────────────────────────────────────
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

  // ── 9. Resumen ────────────────────────────────────────────────────────────
  log.info('═══════════════════════════════════════════════════════')
  log.info('RESUMEN')
  log.info(`  sales_documents → inserted: ${docResult.inserted}  failed: ${docResult.failed}`)
  log.info(`  sales_items     → inserted: ${itemResult.inserted}  failed: ${itemResult.failed}`)
  if (docResult.firstError)  log.warn('  Primer error docs:', docResult.firstError)
  if (itemResult.firstError) log.warn('  Primer error items:', itemResult.firstError)
  log.info('═══════════════════════════════════════════════════════')

  if (docResult.failed > 0 || itemResult.failed > 0) {
    process.exit(1)
  }

  log.ok('Ingesta completada sin errores.')
}

main().catch(err => {
  log.error('Error no capturado:', err)
  process.exit(1)
})
