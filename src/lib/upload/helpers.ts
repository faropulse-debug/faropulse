import * as XLSX from 'xlsx'

// ─── Constants ────────────────────────────────────────────────────────────────

export const BATCH           = 200
export const ABORT_THRESHOLD = 0.05
export const DATE_MIN        = '2024-01-01'

export const VENTAS_REQUIRED_COLUMNS = ['Sucursal', 'Numero', 'Fecha Caja', 'Total', 'Comensales', 'Tipo Documento'] as const
export const ITEMS_REQUIRED_COLUMNS  = ['Sucursal', 'Numero', 'Descripcion', 'Cantidad', 'Precio Total', 'Fecha Caja', 'Familia'] as const

// ─── Supabase service-role header bag ─────────────────────────────────────────

export type SvcHeaders = {
  'Content-Type':  string
  'apikey':        string
  'Authorization': string
  'Prefer':        string
}

// ─── Pure utilities ───────────────────────────────────────────────────────────

export function normalizeHeader(h: string): string {
  return String(h).trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
}

export function parseSheet(buf: ArrayBuffer): Record<string, unknown>[] {
  const wb    = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '', raw: false, dateNF: 'yyyy-mm-dd',
  }).map(r => Object.fromEntries(
    Object.entries(r).map(([k, v]) => [normalizeHeader(k), v])
  ))
}

export function toStr(v: unknown): string | null {
  if (v === '' || v == null) return null
  return String(v).trim() || null
}

export function toInt(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = parseInt(String(v).trim().replace(',', '.').replace(/\s/g, ''), 10)
  return isNaN(n) ? null : n
}

export function toMoney(v: unknown): number | null {
  if (v === '' || v == null) return null
  const s = String(v).trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!s) return null
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n    = parseFloat(norm)
  return isNaN(n) ? null : n
}

export function toDate(v: unknown): string | null {
  if (v === '' || v == null) return null
  const s    = String(v).trim()
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

export function toTimestamp(v: unknown): string | null {
  if (v === '' || v == null) return null
  const s    = String(v).trim()
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/.exec(s)
  if (ddmm) {
    const date = `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`
    const time = ddmm[4] ?? '00:00:00'
    return new Date(`${date}T${time}`).toISOString()
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export function toHora(v: unknown): string | null {
  if (v === '' || v == null) return null
  const s = String(v).trim()
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5)
  const n = parseFloat(s.replace(',', '.'))
  if (!isNaN(n) && n >= 0 && n < 1) {
    const mins = Math.round(n * 1440)
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  }
  return s
}

// null and "DELIVERY" → "APLICACIONES". Everything else kept as-is.
export function normalizeTipoZona(v: unknown): string | null {
  const s = toStr(v)
  if (!s || s.toUpperCase() === 'DELIVERY') return 'APLICACIONES'
  return s
}

// ─── Date validation ──────────────────────────────────────────────────────────

export function maxAllowedDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export function isDateValid(dateStr: string | null): boolean {
  if (!dateStr) return false
  return dateStr >= DATE_MIN && dateStr <= maxAllowedDate()
}

// ─── Rejection tracking ───────────────────────────────────────────────────────

export interface RejectionEntry {
  reason:   string
  count:    number
  examples: string[]
}

export function addRejection(reasons: Map<string, string[]>, reason: string, example: string): void {
  const arr = reasons.get(reason) ?? []
  arr.push(example)
  reasons.set(reason, arr)
}

export function buildRejectionReasons(reasons: Map<string, string[]>): RejectionEntry[] {
  return Array.from(reasons.entries()).map(([reason, examples]) => ({
    reason,
    count:    examples.length,
    examples: examples.slice(0, 3),
  }))
}

// ─── File identity validation ─────────────────────────────────────────────────

type IdentityOk   = { ok: true }
type IdentityFail = { ok: false; message: string; expected: string[]; received: string[]; missing: string[]; extra: string[] }
export type IdentityResult = IdentityOk | IdentityFail

export async function validateFileIdentity(file: File, expectedType: 'ventas' | 'items'): Promise<IdentityResult> {
  const required     = expectedType === 'ventas' ? [...VENTAS_REQUIRED_COLUMNS] : [...ITEMS_REQUIRED_COLUMNS]
  const requiredNorm = required.map(normalizeHeader)

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'xlsx') {
    return { ok: false, message: 'Archivo no es Excel', expected: requiredNorm, received: [], missing: requiredNorm, extra: [] }
  }

  const buf   = await file.arrayBuffer()
  const magic = new Uint8Array(buf.slice(0, 4))
  // XLSX is ZIP-based: magic bytes PK\x03\x04
  const isZip = magic[0] === 0x50 && magic[1] === 0x4B && magic[2] === 0x03 && magic[3] === 0x04
  if (!isZip) {
    return { ok: false, message: 'Archivo no es Excel', expected: requiredNorm, received: [], missing: requiredNorm, extra: [] }
  }

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  } catch {
    return { ok: false, message: 'Archivo no es Excel', expected: requiredNorm, received: [], missing: requiredNorm, extra: [] }
  }

  if (wb.SheetNames.length === 0) {
    return { ok: false, message: 'Excel vacío', expected: requiredNorm, received: [], missing: requiredNorm, extra: [] }
  }

  const sheet   = wb.Sheets[wb.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })

  if (rawRows.length === 0) {
    return { ok: false, message: 'Excel vacío', expected: requiredNorm, received: [], missing: requiredNorm, extra: [] }
  }

  const received = Object.keys(rawRows[0]).map(normalizeHeader)
  const missing  = requiredNorm.filter(c => !received.includes(c))
  const extra    = received.filter(c => !requiredNorm.includes(c))

  if (missing.length > 0) {
    const message = `Faltan columnas requeridas: [${missing.join(', ')}]. Sobran columnas: [${extra.join(', ')}]`
    return { ok: false, message, expected: requiredNorm, received, missing, extra }
  }

  return { ok: true }
}

// ─── Item mapper ──────────────────────────────────────────────────────────────

export type ItemRow = ReturnType<typeof mapItem>

export function mapItem(row: Record<string, unknown>, orgId: string, locationId: string) {
  return {
    org_id:          orgId,
    location_id:     locationId,
    external_id:     toStr(row.numero),
    descripcion:     toStr(row.descripcion),
    cantidad:        toInt(row.cantidad),
    precio_unitario: toMoney(row.precio_unitario),
    precio_total:    toMoney(row.precio_total),
    codigo:          toInt(row.codigo),
    familia:         toStr(row.familia),
    subfamilia:      toStr(row.subfamilia),
    es_variacion:    toStr(row.es_variacion),
    tipo_zona:       normalizeTipoZona(row.tipo_zona),
    camarero_nombre: toStr(row.camarero_nombre),
    fecha_caja:      toDate(row.fecha_caja),
    fecha_documento: toDate(row.fecha_documento),
    fecha_item:      toTimestamp(row.fecha_item),
    turno:           toStr(row.turno),
    zona:            toStr(row.zona),
    numero_ticket:   toStr(row.numero),
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

export async function insertBatch(
  table:  string,
  rows:   Record<string, unknown>[],
  svcUrl: string,
  svc:    SvcHeaders,
  errors: string[],
): Promise<{ inserted: number; failed: number }> {
  let inserted = 0
  let failed   = 0
  const total  = Math.ceil(rows.length / BATCH)
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch    = rows.slice(i, i + BATCH)
    const batchNum = Math.floor(i / BATCH) + 1
    console.log(`[upload] INSERT ${table} batch=${batchNum}/${total} rows=${batch.length}`)
    const res = await fetch(`${svcUrl}/rest/v1/${table}`, {
      method:  'POST',
      headers: svc,
      body:    JSON.stringify(batch),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[upload] INSERT ${table} batch=${batchNum} FAILED status=${res.status}: ${text}`)
      errors.push(`Batch ${batchNum} de ${table}: ${text.slice(0, 200)}`)
      failed += batch.length
    } else {
      inserted += batch.length
    }
  }
  return { inserted, failed }
}

export async function deleteByExternalIds(
  table:      string,
  locationId: string,
  ids:        string[],
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<number> {
  if (ids.length === 0) return 0
  let deleted = 0
  const total = Math.ceil(ids.length / BATCH)
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk  = ids.slice(i, i + BATCH)
    const inVal  = `in.(${chunk.map(id => `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`
    const url    = `${supaUrl}/rest/v1/${table}?location_id=eq.${encodeURIComponent(locationId)}&external_id=${encodeURIComponent(inVal)}`
    const n      = Math.floor(i / BATCH) + 1
    console.log(`[upload] DELETE ${table} chunk=${n}/${total} ids=${chunk.length}`)
    const res = await fetch(url, {
      method:  'DELETE',
      headers: { ...svc, 'Prefer': 'return=representation' },
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[upload] DELETE ${table} chunk=${n} FAILED status=${res.status}: ${text.slice(0, 200)}`)
      throw new Error(`DELETE ${table} chunk ${n}: ${text.slice(0, 200)}`)
    }
    const rows = await res.json()
    deleted   += Array.isArray(rows) ? rows.length : 0
  }
  console.log(`[upload] DELETE ${table} total deleted=${deleted}`)
  return deleted
}

export async function upsertFreshness(
  locationId:   string,
  dataset:      string,
  rowsAffected: number,
  supaUrl:      string,
  svc:          SvcHeaders,
): Promise<void> {
  try {
    const res = await fetch(`${supaUrl}/rest/v1/data_freshness?on_conflict=location_id,dataset`, {
      method:  'POST',
      headers: { ...svc, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body:    JSON.stringify({
        location_id:   locationId,
        dataset,
        rows_affected: rowsAffected,
        last_upload:   new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.warn(`[upload] data_freshness upsert skipped (${res.status}): ${text.slice(0, 100)}`)
    }
  } catch (e) {
    console.warn('[upload] data_freshness upsert failed (non-blocking):', e)
  }
}

export async function queryExistingIds(
  table:      string,
  locationId: string,
  ids:        string[],
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const existing = new Set<string>()
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const inVal = `in.(${chunk.map(id => `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`
    const url   = `${supaUrl}/rest/v1/${table}?location_id=eq.${encodeURIComponent(locationId)}&external_id=${encodeURIComponent(inVal)}&select=external_id`
    const res   = await fetch(url, { headers: svc })
    if (res.ok) {
      const rows = await res.json() as { external_id: string }[]
      for (const r of rows) existing.add(r.external_id)
    } else {
      console.warn(`[upload] queryExistingIds ${table} chunk=${Math.floor(i / BATCH) + 1} failed: ${res.status}`)
    }
  }
  return existing
}

export async function queryFreshness(
  locationId: string,
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<{ datasets: Record<string, string | null>; lastUpload: string | null }> {
  try {
    const url = `${supaUrl}/rest/v1/data_freshness?location_id=eq.${encodeURIComponent(locationId)}&select=dataset,last_upload`
    const res = await fetch(url, { headers: svc })
    if (!res.ok) return { datasets: {}, lastUpload: null }
    const rows = await res.json() as { dataset: string; last_upload: string }[]
    const datasets: Record<string, string | null> = {}
    let lastUpload: string | null = null
    for (const r of rows) {
      datasets[r.dataset] = r.last_upload
      if (!lastUpload || r.last_upload > lastUpload) lastUpload = r.last_upload
    }
    return { datasets, lastUpload }
  } catch {
    return { datasets: {}, lastUpload: null }
  }
}

// ─── Parse phase (pure — no DB calls) ────────────────────────────────────────

export interface ParsedItems {
  processed:      number
  valid:          ItemRow[]
  rejected:       number
  reasons:        Map<string, string[]>
  rejectedPct:    number
  fechaCajaCount: number
  sumPrecioTotal: number
  dateFrom:       string
  dateTo:         string
}

export function parseItems(buf: ArrayBuffer, orgId: string, locationId: string): ParsedItems {
  const rawRows   = parseSheet(buf)
  const processed = rawRows.length
  const valid:    ItemRow[] = []
  let   rejected  = 0
  const reasons   = new Map<string, string[]>()
  let   fechaCajaCount = 0
  let   sumPrecioTotal = 0
  const maxDate        = maxAllowedDate()

  for (const r of rawRows) {
    const numero       = toStr(r.numero)
    const desc         = toStr(r.descripcion)
    const fecha        = toDate(r.fecha_documento)
    const fechaCaja    = toDate(r.fecha_caja)
    const fechaCajaRaw = toStr(r.fecha_caja)
    const precioTotal  = toMoney(r.precio_total)

    if (!numero) {
      addRejection(reasons, 'external_id_null', `row-${valid.length + rejected + 1}`)
      rejected++; continue
    }
    if (!desc) {
      addRejection(reasons, 'descripcion_vacia', numero)
      rejected++; continue
    }
    if (fecha && !isDateValid(fecha)) {
      console.log(`[upload/items] item fecha_documento rechazada: ${fecha} (rango válido: ${DATE_MIN}–${maxDate})`)
      addRejection(reasons, 'fecha_invalida', numero)
      rejected++; continue
    }
    if (precioTotal != null && precioTotal < 0) {
      addRejection(reasons, 'total_negativo', numero)
      rejected++; continue
    }
    if (fechaCajaRaw && !fechaCaja) {
      addRejection(reasons, 'fecha_caja_invalida', numero)
      rejected++; continue
    }

    if (fechaCaja) fechaCajaCount++
    sumPrecioTotal += precioTotal ?? 0
    valid.push(mapItem(r, orgId, locationId))
  }

  const fechas = [...new Set(valid.map(r => r.fecha_caja).filter(Boolean))].sort() as string[]
  return {
    processed,
    valid,
    rejected,
    reasons,
    rejectedPct:   processed > 0 ? rejected / processed : 0,
    fechaCajaCount,
    sumPrecioTotal,
    dateFrom: fechas[0] ?? '',
    dateTo:   fechas[fechas.length - 1] ?? '',
  }
}

// ─── Insert phase (DB operations) ─────────────────────────────────────────────

export interface ItemsResult {
  processed:        number
  new:              number
  updated:          number
  inserted:         number
  deleted:          number
  failed:           number
  rejected:         number
  dateFrom:         string
  dateTo:           string
  rejectionReasons: RejectionEntry[]
  errors:           string[]
}

export async function insertItems(
  parsed:     ParsedItems,
  locationId: string,
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<ItemsResult> {
  const { processed, valid, rejected, reasons, dateFrom, dateTo } = parsed
  const errors:           string[]         = []
  const rejectionReasons: RejectionEntry[] = buildRejectionReasons(reasons)

  if (rejected > 0) errors.push(`${rejected} ítem(s) rechazado(s)`)
  if (valid.length === 0) {
    return { processed, new: 0, updated: 0, inserted: 0, deleted: 0, failed: 0, rejected, dateFrom, dateTo, rejectionReasons, errors }
  }

  const externalIds  = [...new Set(valid.map(r => r.external_id).filter(Boolean))] as string[]
  const existingIds  = await queryExistingIds('sales_items', locationId, externalIds, supaUrl, svc)
  const newCount     = externalIds.length - existingIds.size
  const updatedCount = existingIds.size

  const deleted              = await deleteByExternalIds('sales_items', locationId, externalIds, supaUrl, svc)
  const { inserted, failed } = await insertBatch('sales_items', valid as unknown as Record<string, unknown>[], supaUrl, svc, errors)

  await upsertFreshness(locationId, 'sales_items', inserted, supaUrl, svc)

  return { processed, new: newCount, updated: updatedCount, inserted, deleted, failed, rejected, dateFrom, dateTo, rejectionReasons, errors }
}
