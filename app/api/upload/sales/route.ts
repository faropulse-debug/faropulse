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
  inserted: number
  skipped:  number
  failed:   number
  dateRange: string
  errors:   string[]
}

async function processDocs(
  file:       File,
  orgId:      string,
  locationId: string,
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<DocsResult> {
  const errors:  string[] = []
  const buf      = await file.arrayBuffer()
  const rawRows  = parseSheet(buf)

  // Validate: require numero, fecha, total
  const valid:    DocRow[] = []
  let   rejected = 0

  for (const r of rawRows) {
    if (!toStr(r.numero) || !toDate(r.fecha) || toMoney(r.total) == null) {
      rejected++
      continue
    }
    valid.push(mapVenta(r, orgId, locationId))
  }

  if (rejected > 0) errors.push(`${rejected} fila(s) rechazada(s) por falta de Numero, Fecha o Total`)
  if (valid.length === 0) return { inserted: 0, skipped: 0, failed: 0, dateRange: '', errors }

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

  return { inserted, skipped, failed, dateRange: `${dateFrom} – ${dateTo}`, errors }
}

// ─── Items processing ─────────────────────────────────────────────────────────

interface ItemsResult {
  inserted: number
  skipped:  number
  failed:   number
  errors:   string[]
}

async function processItems(
  file:       File,
  orgId:      string,
  locationId: string,
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<ItemsResult> {
  const errors:  string[] = []
  const buf      = await file.arrayBuffer()
  const rawRows  = parseSheet(buf)

  // Validate: require numero and descripcion
  const valid:    ItemRow[] = []
  let   rejected = 0

  for (const r of rawRows) {
    if (!toStr(r.numero) || !toStr(r.descripcion)) {
      rejected++
      continue
    }
    valid.push(mapItem(r, orgId, locationId))
  }

  if (rejected > 0) errors.push(`${rejected} fila(s) rechazada(s) por falta de Numero o Descripcion`)
  if (valid.length === 0) return { inserted: 0, skipped: 0, failed: 0, errors }

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

  return { inserted, skipped, failed, errors }
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
    let docsInserted = 0
    let docsSkipped  = 0
    let docsFailed   = 0
    let dateRange    = ''

    if (ventasFile) {
      const r = await processDocs(ventasFile, orgId, locationId, supaUrl!, svc)
      docsInserted = r.inserted
      docsSkipped  = r.skipped
      docsFailed   = r.failed
      dateRange    = r.dateRange
      allErrors.push(...r.errors)
    }

    // ── Items ─────────────────────────────────────────────────────────────────
    let itemsInserted = 0
    let itemsSkipped  = 0
    let itemsFailed   = 0

    if (itemsFile) {
      const r = await processItems(itemsFile, orgId, locationId, supaUrl!, svc)
      itemsInserted = r.inserted
      itemsSkipped  = r.skipped
      itemsFailed   = r.failed
      allErrors.push(...r.errors)
    }

    return NextResponse.json({
      success:      true,
      docsInserted,
      docsSkipped,
      docsFailed,
      itemsInserted,
      itemsSkipped,
      itemsFailed,
      dateRange,
      errors:       allErrors,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload/sales] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
