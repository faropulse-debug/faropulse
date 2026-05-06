import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const BATCH = 200

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return String(h).trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function parseSheet(buf: ArrayBuffer): Record<string, unknown>[] {
  const wb    = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '', raw: false, dateNF: 'yyyy-mm-dd',
  }).map(r => Object.fromEntries(
    Object.entries(r).map(([k, v]) => [normalizeHeader(k), v])
  ))
}

function toStr(v: unknown): string | null {
  if (v === '' || v == null) return null
  return String(v).trim() || null
}

function toInt(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = parseInt(String(v).trim().replace(',', '.').replace(/\s/g, ''), 10)
  return isNaN(n) ? null : n
}

function toMoney(v: unknown): number | null {
  if (v === '' || v == null) return null
  const s = String(v).trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!s) return null
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n    = parseFloat(norm)
  return isNaN(n) ? null : n
}

function toDate(v: unknown): string | null {
  if (v === '' || v == null) return null
  const s = String(v).trim()
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

function toTimestamp(v: unknown): string | null {
  if (v === '' || v == null) return null
  const s    = String(v).trim()
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/.exec(s)
  if (ddmm) {
    const date = `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`
    const time = ddmm[4] ?? '00:00:00'
    return new Date(`${date}T${time}`).toISOString()
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function toHora(v: unknown): string | null {
  if (v === '' || v == null) return null
  const s = String(v).trim()
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5)
  const n = parseFloat(s.replace(',', '.'))
  if (!isNaN(n) && n >= 0 && n < 1) {
    const mins = Math.round(n * 1440)
    return `${String(Math.floor(mins / 60)).padStart(2,'0')}:${String(mins % 60).padStart(2,'0')}`
  }
  return s
}

// null and "DELIVERY" → "APLICACIONES". Everything else kept as-is.
function normalizeTipoZona(v: unknown): string | null {
  const s = toStr(v)
  if (!s || s.toUpperCase() === 'DELIVERY') return 'APLICACIONES'
  return s
}

// ─── Date validation ──────────────────────────────────────────────────────────

const DATE_MIN = '2024-01-01'

function maxAllowedDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function isDateValid(dateStr: string | null): boolean {
  if (!dateStr) return false
  return dateStr >= DATE_MIN && dateStr <= maxAllowedDate()
}

function incReason(reasons: Record<string, number>, key: string): void {
  reasons[key] = (reasons[key] ?? 0) + 1
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

type DocRow   = ReturnType<typeof mapVenta>
type ItemRow  = ReturnType<typeof mapItem>

function mapVenta(row: Record<string, unknown>, orgId: string, locationId: string) {
  return {
    org_id:          orgId,
    location_id:     locationId,
    external_id:     toStr(row.numero),
    fecha:           toDate(row.fecha),
    total:           toMoney(row.total),
    comensales:      toInt(row.comensales),            // int, nullable
    camarero_nombre: toStr(row.camarero_nombre),       // nullable
    tipo_zona:       normalizeTipoZona(row.tipo_zona),
    zona:            toStr(row.zona),
    punto_venta:     toStr(row.punto_venta),
    tipo_documento:  toStr(row.tipo_documento),
    fecha_caja:      toDate(row.fecha_caja),
    turno:           toStr(row.turno),
    hora:            toHora(row.hora),
    descuento:       toMoney(row.descuento) ?? 0,
    recargo:         toMoney(row.recargo)   ?? 0,
    cliente:         toStr(row.cliente),               // nullable
    formas_pago:     toStr(row.formas_pago),
    camarero:        toStr(row.camarero),              // nullable
  }
}

function mapItem(row: Record<string, unknown>, orgId: string, locationId: string) {
  return {
    org_id:          orgId,
    location_id:     locationId,
    external_id:     toStr(row.numero),
    descripcion:     toStr(row.descripcion),
    cantidad:        toInt(row.cantidad),              // int
    precio_unitario: toMoney(row.precio_unitario),
    precio_total:    toMoney(row.precio_total),
    codigo:          toInt(row.codigo),                // int
    familia:         toStr(row.familia),               // nullable
    subfamilia:      toStr(row.subfamilia),            // nullable
    es_variacion:    toStr(row.es_variacion),
    tipo_zona:       normalizeTipoZona(row.tipo_zona),
    camarero_nombre: toStr(row.camarero_nombre),       // nullable
    fecha_caja:      toDate(row.fecha_caja),            // from "Fecha Caja" (Excel header → key "fecha_caja")
    fecha_documento: toDate(row.fecha_documento),      // from "Fecha Documento"
    fecha_item:      toTimestamp(row.fecha_item),
    turno:           toStr(row.turno),
    zona:            toStr(row.zona),
    numero_ticket:   toStr(row.numero),
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

type SvcHeaders = {
  'Content-Type':  string
  'apikey':        string
  'Authorization': string
  'Prefer':        string
}

async function supaGet(
  url: string,
  svc: SvcHeaders,
  select: string,
  filters: [string, string][],
): Promise<unknown[]> {
  const qs = [
    `select=${encodeURIComponent(select)}`,
    ...filters.map(([k, v]) => `${k}=${encodeURIComponent(v)}`),
    'limit=50000',
  ].join('&')

  const res = await fetch(`${url}?${qs}`, {
    headers: { ...svc, 'Range': '0-49999', 'Prefer': 'return=representation' },
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`[upload/sales] SELECT ${url} FAILED status=${res.status}: ${text}`)
    throw new Error(`SELECT error: ${text}`)
  }
  const json = await res.json()
  return Array.isArray(json) ? json : []
}

async function insertBatch(
  table:    string,
  rows:     Record<string, unknown>[],
  svcUrl:   string,
  svc:      SvcHeaders,
  errors:   string[],
): Promise<{ inserted: number; failed: number }> {
  let inserted = 0
  let failed   = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch     = rows.slice(i, i + BATCH)
    const batchNum  = Math.floor(i / BATCH) + 1
    console.log(`[upload/sales] INSERT ${table} batch=${batchNum} rows=${batch.length}`)
    const res = await fetch(`${svcUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: svc,
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[upload/sales] INSERT ${table} batch=${batchNum} FAILED status=${res.status}: ${text}`)
      const msg  = `Batch ${batchNum} de ${table}: ${text.slice(0, 200)}`
      errors.push(msg)
      failed += batch.length
    } else {
      inserted += batch.length
    }
  }
  return { inserted, failed }
}

// ─── Docs processing ──────────────────────────────────────────────────────────

interface DocsResult {
  processed:       number
  inserted:        number
  skipped:         number
  failed:          number
  rejected:        number
  dateFrom:        string
  dateTo:          string
  rejectedReasons: Record<string, number>
  errors:          string[]
}

async function processDocs(
  file:       File,
  orgId:      string,
  locationId: string,
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<DocsResult> {
  const errors:          string[] = []
  const rejectedReasons: Record<string, number> = {}
  const buf       = await file.arrayBuffer()
  const rawRows   = parseSheet(buf)
  const processed = rawRows.length
  const maxDate   = maxAllowedDate()

  // Validate: require numero, fecha, total; reject dates outside [DATE_MIN, hoy+1]
  const valid:   DocRow[] = []
  let   rejected = 0

  for (const r of rawRows) {
    const numero = toStr(r.numero)
    const fecha  = toDate(r.fecha)
    const total  = toMoney(r.total)

    if (!numero) { incReason(rejectedReasons, 'sin_numero'); rejected++; continue }
    if (!fecha || total == null) { incReason(rejectedReasons, 'datos_invalidos'); rejected++; continue }
    if (!isDateValid(fecha)) {
      console.log(`[upload/sales] fecha rechazada: ${fecha} (rango válido: ${DATE_MIN}–${maxDate})`)
      incReason(rejectedReasons, 'fecha_invalida'); rejected++; continue
    }
    valid.push(mapVenta(r, orgId, locationId))
  }

  if (rejected > 0) errors.push(`${rejected} fila(s) rechazada(s)`)
  if (valid.length === 0) return { processed, inserted: 0, skipped: 0, failed: 0, rejected, dateFrom: '', dateTo: '', rejectedReasons, errors }

  // Date range
  const dates    = [...new Set(valid.map(r => r.fecha).filter(Boolean))].sort() as string[]
  const dateFrom = dates[0]
  const dateTo   = dates[dates.length - 1]

  // Fetch existing external_ids in date range
  const existing = await supaGet(
    `${supaUrl}/rest/v1/sales_documents`, svc,
    'external_id',
    [
      ['location_id', `eq.${locationId}`],
      ['fecha',       `gte.${dateFrom}`],
      ['fecha',       `lte.${dateTo}`],
    ],
  )
  const existingSet = new Set(
    (existing as { external_id: string }[]).map(r => r.external_id)
  )

  // Split into new vs duplicate
  const toInsert: DocRow[] = []
  let   skipped  = 0

  for (const row of valid) {
    if (row.external_id && existingSet.has(row.external_id)) {
      skipped++
    } else {
      toInsert.push(row)
    }
  }

  const { inserted, failed } = await insertBatch(
    'sales_documents',
    toInsert as unknown as Record<string, unknown>[],
    supaUrl, svc, errors,
  )

  return { processed, inserted, skipped, failed, rejected, dateFrom, dateTo, rejectedReasons, errors }
}

// ─── Items processing ─────────────────────────────────────────────────────────

interface ItemsResult {
  processed:       number
  inserted:        number
  skipped:         number
  failed:          number
  rejected:        number
  rejectedReasons: Record<string, number>
  errors:          string[]
}

async function processItems(
  file:       File,
  orgId:      string,
  locationId: string,
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<ItemsResult> {
  const errors:          string[] = []
  const rejectedReasons: Record<string, number> = {}
  const buf       = await file.arrayBuffer()
  const rawRows   = parseSheet(buf)
  const processed = rawRows.length
  const maxDate   = maxAllowedDate()

  // Validate: require numero and descripcion; reject bad fecha_documento
  const valid:   ItemRow[] = []
  let   rejected = 0

  for (const r of rawRows) {
    const numero = toStr(r.numero)
    const desc   = toStr(r.descripcion)
    const fecha  = toDate(r.fecha_documento)

    if (!numero) { incReason(rejectedReasons, 'sin_numero'); rejected++; continue }
    if (!desc)   { incReason(rejectedReasons, 'sin_descripcion'); rejected++; continue }
    if (fecha && !isDateValid(fecha)) {
      console.log(`[upload/sales] item fecha_documento rechazada: ${fecha} (rango válido: ${DATE_MIN}–${maxDate})`)
      incReason(rejectedReasons, 'fecha_invalida'); rejected++; continue
    }
    valid.push(mapItem(r, orgId, locationId))
  }

  if (rejected > 0) errors.push(`${rejected} ítem(s) rechazado(s)`)
  if (valid.length === 0) return { processed, inserted: 0, skipped: 0, failed: 0, rejected, rejectedReasons, errors }

  // Dedup: composite key external_id|codigo|descripcion
  // Fetch existing from fecha_documento range
  const fechas   = [...new Set(valid.map(r => r.fecha_documento).filter(Boolean))].sort() as string[]
  const dateFrom = fechas[0]
  const dateTo   = fechas[fechas.length - 1]

  const existingItems = dateFrom && dateTo
    ? await supaGet(
        `${supaUrl}/rest/v1/sales_items`, svc,
        'external_id,codigo,descripcion',
        [
          ['location_id',     `eq.${locationId}`],
          ['fecha_documento',  `gte.${dateFrom}`],
          ['fecha_documento',  `lte.${dateTo}`],
        ],
      )
    : []

  type ExItem = { external_id: string; codigo: number | null; descripcion: string | null }
  const existingSet = new Set(
    (existingItems as ExItem[]).map(r => `${r.external_id}|${r.codigo ?? ''}|${r.descripcion ?? ''}`)
  )

  const toInsert: ItemRow[] = []
  let   skipped  = 0

  for (const row of valid) {
    const key = `${row.external_id ?? ''}|${row.codigo ?? ''}|${row.descripcion ?? ''}`
    if (existingSet.has(key)) {
      skipped++
    } else {
      toInsert.push(row)
    }
  }

  const { inserted, failed } = await insertBatch(
    'sales_items',
    toInsert as unknown as Record<string, unknown>[],
    supaUrl, svc, errors,
  )

  return { processed, inserted, skipped, failed, rejected, rejectedReasons, errors }
}

// ─── Route ────────────────────────────────────────────────────────────────────

const mask = (s: string) => s.slice(0, 10) + '***'

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missingVars: string[] = []
  if (!supaUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supaKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missingVars.length > 0) {
    console.error('[upload/sales] missing env vars:', missingVars.join(', '))
    return NextResponse.json({
      error: 'Configuración faltante',
      details: missingVars.map(v => `Variable ${v} no está definida en el ambiente. Configurar en Vercel Settings → Environment Variables`).join(' '),
      missingVars,
    }, { status: 500 })
  }
  console.log(`[upload/sales] env: url=${mask(supaUrl!)} key=${mask(supaKey!)}`)

  const svc: SvcHeaders = {
    'Content-Type':  'application/json',
    'apikey':        supaKey!,
    'Authorization': `Bearer ${supaKey}`,
    'Prefer':        'return=minimal',
  }

  try {
    const form       = await req.formData()
    const ventasFile = form.get('ventas')      as File   | null
    const itemsFile  = form.get('items')       as File   | null
    const locationId = form.get('location_id') as string | null
    const orgId      = form.get('org_id')      as string | null

    console.log(`[upload/sales] location_id=${locationId} org_id=${orgId} ventasFile=${ventasFile?.name ?? 'none'} itemsFile=${itemsFile?.name ?? 'none'}`)

    if (!locationId || !orgId) {
      return NextResponse.json({ error: 'Faltan location_id u org_id' }, { status: 400 })
    }
    if (!ventasFile && !itemsFile) {
      return NextResponse.json({ error: 'Se requiere al menos un archivo (ventas o items)' }, { status: 400 })
    }

    const allErrors: string[] = []

    // ── Ventas ────────────────────────────────────────────────────────────────
    const EMPTY_DOCS: DocsResult  = { processed: 0, inserted: 0, skipped: 0, failed: 0, rejected: 0, dateFrom: '', dateTo: '', rejectedReasons: {}, errors: [] }
    const EMPTY_ITEMS: ItemsResult = { processed: 0, inserted: 0, skipped: 0, failed: 0, rejected: 0, rejectedReasons: {}, errors: [] }

    let docsResult  = EMPTY_DOCS
    let itemsResult = EMPTY_ITEMS

    if (ventasFile) {
      docsResult = await processDocs(ventasFile, orgId, locationId, supaUrl!, svc)
      allErrors.push(...docsResult.errors)
    }

    // ── Items ─────────────────────────────────────────────────────────────────
    if (itemsFile) {
      itemsResult = await processItems(itemsFile, orgId, locationId, supaUrl!, svc)
      allErrors.push(...itemsResult.errors)
    }

    // Merge rejected reasons from both files
    const rejectedReasons: Record<string, number> = {}
    for (const [k, v] of Object.entries(docsResult.rejectedReasons))  rejectedReasons[k] = (rejectedReasons[k] ?? 0) + v
    for (const [k, v] of Object.entries(itemsResult.rejectedReasons)) rejectedReasons[k] = (rejectedReasons[k] ?? 0) + v

    return NextResponse.json({
      success: true,
      summary: {
        documentsProcessed: docsResult.processed,
        documentsInserted:  docsResult.inserted,
        documentsSkipped:   docsResult.skipped,
        documentsRejected:  docsResult.rejected,
        itemsProcessed:     itemsResult.processed,
        itemsInserted:      itemsResult.inserted,
        dateRange:          docsResult.dateFrom ? { from: docsResult.dateFrom, to: docsResult.dateTo } : null,
        rejectedReasons,
      },
      // flat fields (backward compat)
      docsInserted:  docsResult.inserted,
      docsSkipped:   docsResult.skipped,
      docsFailed:    docsResult.failed,
      itemsInserted: itemsResult.inserted,
      itemsSkipped:  itemsResult.skipped,
      itemsFailed:   itemsResult.failed,
      dateRange:     docsResult.dateFrom ? `${docsResult.dateFrom} – ${docsResult.dateTo}` : '',
      errors:        allErrors,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload/sales] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
