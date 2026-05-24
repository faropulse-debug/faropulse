import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { generateTicketHash } from '@/src/lib/upload/generate-ticket-hash'

const BATCH           = 200
const ABORT_THRESHOLD = 0.05

const VENTAS_REQUIRED_COLUMNS = ['Sucursal', 'Numero', 'Fecha Caja', 'Total', 'Comensales', 'Tipo Documento'] as const
const ITEMS_REQUIRED_COLUMNS  = ['Sucursal', 'Numero', 'Descripcion', 'Cantidad', 'Precio Total', 'Fecha Caja', 'Familia'] as const

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

// ─── Rejection tracking ───────────────────────────────────────────────────────

interface RejectionEntry {
  reason:   string
  count:    number
  examples: string[]
}

function addRejection(reasons: Map<string, string[]>, reason: string, example: string): void {
  const arr = reasons.get(reason) ?? []
  arr.push(example)
  reasons.set(reason, arr)
}

function buildRejectionReasons(reasons: Map<string, string[]>): RejectionEntry[] {
  return Array.from(reasons.entries()).map(([reason, examples]) => ({
    reason,
    count:    examples.length,
    examples: examples.slice(0, 3),
  }))
}

// ─── File identity validation ─────────────────────────────────────────────────

type IdentityOk   = { ok: true }
type IdentityFail = { ok: false; message: string; expected: string[]; received: string[]; missing: string[]; extra: string[] }
type IdentityResult = IdentityOk | IdentityFail

async function validateFileIdentity(file: File, expectedType: 'ventas' | 'items'): Promise<IdentityResult> {
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

// ─── Mappers ──────────────────────────────────────────────────────────────────

type DocRow  = ReturnType<typeof mapVenta>
type ItemRow = ReturnType<typeof mapItem>

function mapVenta(row: Record<string, unknown>, orgId: string, locationId: string) {
  const external_id    = toStr(row.numero)
  const fecha_caja     = toDate(row.fecha_caja)
  const hora           = toHora(row.hora)
  const camarero       = toStr(row.camarero)
  const total          = toMoney(row.total)
  const comensales     = toInt(row.comensales)
  const cliente        = toStr(row.cliente)
  const tipo_documento = toStr(row.tipo_documento)
  const punto_venta    = toStr(row.punto_venta)
  const zona           = toStr(row.zona)
  const descuento      = toMoney(row.descuento) ?? 0
  const recargo        = toMoney(row.recargo)   ?? 0

  return {
    org_id:          orgId,
    location_id:     locationId,
    external_id,
    fecha:           toDate(row.fecha),
    total,
    comensales,
    camarero_nombre: toStr(row.camarero_nombre),
    tipo_zona:       normalizeTipoZona(row.tipo_zona),
    zona,
    punto_venta,
    tipo_documento,
    fecha_caja,
    turno:           toStr(row.turno),
    hora,
    descuento,
    recargo,
    cliente,
    formas_pago:     toStr(row.formas_pago),
    camarero,
    ticket_hash:     generateTicketHash({ external_id, fecha_caja, hora, camarero, total, comensales, cliente, tipo_documento, punto_venta, zona, descuento, recargo }),
  }
}

function mapItem(row: Record<string, unknown>, orgId: string, locationId: string) {
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

type SvcHeaders = {
  'Content-Type':  string
  'apikey':        string
  'Authorization': string
  'Prefer':        string
}

async function insertBatch(
  table:  string,
  rows:   Record<string, unknown>[],
  svcUrl: string,
  svc:    SvcHeaders,
  errors: string[],
): Promise<{ inserted: number; failed: number }> {
  let inserted = 0
  let failed   = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch    = rows.slice(i, i + BATCH)
    const batchNum = Math.floor(i / BATCH) + 1
    console.log(`[upload/sales] INSERT ${table} batch=${batchNum} rows=${batch.length}`)
    const res = await fetch(`${svcUrl}/rest/v1/${table}`, {
      method:  'POST',
      headers: svc,
      body:    JSON.stringify(batch),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[upload/sales] INSERT ${table} batch=${batchNum} FAILED status=${res.status}: ${text}`)
      errors.push(`Batch ${batchNum} de ${table}: ${text.slice(0, 200)}`)
      failed += batch.length
    } else {
      inserted += batch.length
    }
  }
  return { inserted, failed }
}

// DELETE existing rows by external_id list — chunked to stay within URL limits.
async function deleteByExternalIds(
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
    console.log(`[upload/sales] DELETE ${table} chunk=${n}/${total} ids=${chunk.length}`)
    const res = await fetch(url, {
      method:  'DELETE',
      headers: { ...svc, 'Prefer': 'return=representation' },
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[upload/sales] DELETE ${table} chunk=${n} FAILED status=${res.status}: ${text.slice(0, 200)}`)
      throw new Error(`DELETE ${table} chunk ${n}: ${text.slice(0, 200)}`)
    }
    const rows  = await res.json()
    deleted    += Array.isArray(rows) ? rows.length : 0
  }
  console.log(`[upload/sales] DELETE ${table} total deleted=${deleted}`)
  return deleted
}

// Non-blocking upsert to data_freshness tracking table.
async function upsertFreshness(
  locationId:   string,
  dataset:      string,
  rowsAffected: number,
  supaUrl:      string,
  svc:          SvcHeaders,
): Promise<void> {
  try {
    const res = await fetch(`${supaUrl}/rest/v1/data_freshness`, {
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
      console.warn(`[upload/sales] data_freshness upsert skipped (${res.status}): ${text.slice(0, 100)}`)
    }
  } catch (e) {
    console.warn('[upload/sales] data_freshness upsert failed (non-blocking):', e)
  }
}

// Query which external_ids from the given list already exist in the DB.
async function queryExistingIds(
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
      console.warn(`[upload/sales] queryExistingIds ${table} chunk=${Math.floor(i / BATCH) + 1} failed: ${res.status}`)
    }
  }
  return existing
}

// Query which ticket_hashes from the given list already exist in sales_documents.
async function queryExistingHashes(
  locationId: string,
  hashes:     string[],
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<Set<string>> {
  if (hashes.length === 0) return new Set()
  const existing = new Set<string>()
  for (let i = 0; i < hashes.length; i += BATCH) {
    const chunk = hashes.slice(i, i + BATCH)
    const inVal = `in.(${chunk.map(h => `"${h}"`).join(',')})`
    const url   = `${supaUrl}/rest/v1/sales_documents?location_id=eq.${encodeURIComponent(locationId)}&ticket_hash=${encodeURIComponent(inVal)}&select=ticket_hash`
    const res   = await fetch(url, { headers: svc })
    if (res.ok) {
      const rows = await res.json() as { ticket_hash: string }[]
      for (const r of rows) existing.add(r.ticket_hash)
    } else {
      console.warn(`[upload/sales] queryExistingHashes chunk=${Math.floor(i / BATCH) + 1} failed: ${res.status}`)
    }
  }
  return existing
}

// DELETE existing sales_documents rows by ticket_hash — chunked to stay within URL limits.
async function deleteByTicketHashes(
  locationId: string,
  hashes:     string[],
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<number> {
  if (hashes.length === 0) return 0
  let deleted = 0
  const total = Math.ceil(hashes.length / BATCH)
  for (let i = 0; i < hashes.length; i += BATCH) {
    const chunk = hashes.slice(i, i + BATCH)
    const inVal = `in.(${chunk.map(h => `"${h}"`).join(',')})`
    const url   = `${supaUrl}/rest/v1/sales_documents?location_id=eq.${encodeURIComponent(locationId)}&ticket_hash=${encodeURIComponent(inVal)}`
    const n     = Math.floor(i / BATCH) + 1
    console.log(`[upload/sales] DELETE sales_documents by hash chunk=${n}/${total} hashes=${chunk.length}`)
    const res = await fetch(url, {
      method:  'DELETE',
      headers: { ...svc, 'Prefer': 'return=representation' },
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[upload/sales] DELETE sales_documents by hash chunk=${n} FAILED status=${res.status}: ${text.slice(0, 200)}`)
      throw new Error(`DELETE sales_documents by hash chunk ${n}: ${text.slice(0, 200)}`)
    }
    const rows = await res.json()
    deleted   += Array.isArray(rows) ? rows.length : 0
  }
  console.log(`[upload/sales] DELETE sales_documents by hash total deleted=${deleted}`)
  return deleted
}

// Read data_freshness rows for this location after upload.
async function queryFreshness(
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

interface ParsedDocs {
  processed:      number
  valid:          DocRow[]
  rejected:       number
  reasons:        Map<string, string[]>
  rejectedPct:    number
  fechaCajaCount: number
  sumTotal:       number
  dateFrom:       string
  dateTo:         string
}

interface ParsedItems {
  processed:      number
  valid:          ItemRow[]
  rejected:       number
  reasons:        Map<string, string[]>
  rejectedPct:    number
  fechaCajaCount: number
  sumPrecioTotal: number
}

function parseDocs(buf: ArrayBuffer, orgId: string, locationId: string): ParsedDocs {
  const rawRows   = parseSheet(buf)
  const processed = rawRows.length
  const valid:    DocRow[] = []
  let   rejected  = 0
  const reasons   = new Map<string, string[]>()
  let   fechaCajaCount = 0
  let   sumTotal       = 0
  const maxDate        = maxAllowedDate()

  for (const r of rawRows) {
    const numero       = toStr(r.numero)
    const fecha        = toDate(r.fecha)
    const total        = toMoney(r.total)
    const fechaCaja    = toDate(r.fecha_caja)
    const fechaCajaRaw = toStr(r.fecha_caja)

    if (!numero) {
      addRejection(reasons, 'external_id_null', `row-${valid.length + rejected + 1}`)
      rejected++; continue
    }
    if (!fecha || total == null) {
      addRejection(reasons, 'datos_invalidos', numero)
      rejected++; continue
    }
    if (!isDateValid(fecha)) {
      console.log(`[upload/sales] fecha rechazada: ${fecha} (rango válido: ${DATE_MIN}–${maxDate})`)
      addRejection(reasons, 'fecha_invalida', numero)
      rejected++; continue
    }
    if (total < 0) {
      addRejection(reasons, 'total_negativo', numero)
      rejected++; continue
    }
    if (fechaCajaRaw && !fechaCaja) {
      addRejection(reasons, 'fecha_caja_invalida', numero)
      rejected++; continue
    }

    if (fechaCaja) fechaCajaCount++
    sumTotal += total
    valid.push(mapVenta(r, orgId, locationId))
  }

  const fechas = [...new Set(valid.map(r => r.fecha).filter(Boolean))].sort() as string[]
  return {
    processed,
    valid,
    rejected,
    reasons,
    rejectedPct:    processed > 0 ? rejected / processed : 0,
    fechaCajaCount,
    sumTotal,
    dateFrom: fechas[0] ?? '',
    dateTo:   fechas[fechas.length - 1] ?? '',
  }
}

function parseItems(buf: ArrayBuffer, orgId: string, locationId: string): ParsedItems {
  const rawRows   = parseSheet(buf)
  const processed = rawRows.length
  const valid:    ItemRow[] = []
  let   rejected  = 0
  const reasons   = new Map<string, string[]>()
  let   fechaCajaCount  = 0
  let   sumPrecioTotal  = 0
  const maxDate         = maxAllowedDate()

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
      console.log(`[upload/sales] item fecha_documento rechazada: ${fecha} (rango válido: ${DATE_MIN}–${maxDate})`)
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

  return {
    processed,
    valid,
    rejected,
    reasons,
    rejectedPct:   processed > 0 ? rejected / processed : 0,
    fechaCajaCount,
    sumPrecioTotal,
  }
}

// ─── Insert phase (DB operations) ─────────────────────────────────────────────

interface DocsResult {
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

interface ItemsResult {
  processed:        number
  new:              number
  updated:          number
  inserted:         number
  deleted:          number
  failed:           number
  rejected:         number
  rejectionReasons: RejectionEntry[]
  errors:           string[]
}

async function insertDocs(
  parsed:     ParsedDocs,
  locationId: string,
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<DocsResult> {
  const { processed, valid, rejected, reasons, dateFrom, dateTo } = parsed
  const errors:           string[]         = []
  const rejectionReasons: RejectionEntry[] = buildRejectionReasons(reasons)

  if (rejected > 0) errors.push(`${rejected} fila(s) rechazada(s)`)
  if (valid.length === 0) {
    return { processed, new: 0, updated: 0, inserted: 0, deleted: 0, failed: 0, rejected, dateFrom, dateTo, rejectionReasons, errors }
  }

  const hashes         = [...new Set(valid.map(r => r.ticket_hash))]
  const existingHashes = await queryExistingHashes(locationId, hashes, supaUrl, svc)
  const newCount       = hashes.length - existingHashes.size
  const updatedCount   = existingHashes.size

  const deleted              = await deleteByTicketHashes(locationId, hashes, supaUrl, svc)
  const { inserted, failed } = await insertBatch('sales_documents', valid as unknown as Record<string, unknown>[], supaUrl, svc, errors)

  await upsertFreshness(locationId, 'sales_documents', inserted, supaUrl, svc)

  return { processed, new: newCount, updated: updatedCount, inserted, deleted, failed, rejected, dateFrom, dateTo, rejectionReasons, errors }
}

async function insertItems(
  parsed:     ParsedItems,
  locationId: string,
  supaUrl:    string,
  svc:        SvcHeaders,
): Promise<ItemsResult> {
  const { processed, valid, rejected, reasons } = parsed
  const errors:           string[]         = []
  const rejectionReasons: RejectionEntry[] = buildRejectionReasons(reasons)

  if (rejected > 0) errors.push(`${rejected} ítem(s) rechazado(s)`)
  if (valid.length === 0) {
    return { processed, new: 0, updated: 0, inserted: 0, deleted: 0, failed: 0, rejected, rejectionReasons, errors }
  }

  const externalIds  = [...new Set(valid.map(r => r.external_id).filter(Boolean))] as string[]
  const existingIds  = await queryExistingIds('sales_items', locationId, externalIds, supaUrl, svc)
  const newCount     = externalIds.length - existingIds.size
  const updatedCount = existingIds.size

  const deleted              = await deleteByExternalIds('sales_items', locationId, externalIds, supaUrl, svc)
  const { inserted, failed } = await insertBatch('sales_items', valid as unknown as Record<string, unknown>[], supaUrl, svc, errors)

  await upsertFreshness(locationId, 'sales_items', inserted, supaUrl, svc)

  return { processed, new: newCount, updated: updatedCount, inserted, deleted, failed, rejected, rejectionReasons, errors }
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

    // ── Phase 0: File identity — extension, magic bytes, required columns ─────────
    if (ventasFile) {
      const identity = await validateFileIdentity(ventasFile, 'ventas')
      if (!identity.ok) {
        console.warn(`[upload/sales] FILE_IDENTITY_FAILED ventas: ${identity.message}`)
        return NextResponse.json({
          success:  false,
          error:    'FILE_IDENTITY_FAILED',
          message:  identity.message,
          expected: identity.expected,
          received: identity.received,
          missing:  identity.missing,
          extra:    identity.extra,
        }, { status: 422 })
      }
    }
    if (itemsFile) {
      const identity = await validateFileIdentity(itemsFile, 'items')
      if (!identity.ok) {
        console.warn(`[upload/sales] FILE_IDENTITY_FAILED items: ${identity.message}`)
        return NextResponse.json({
          success:  false,
          error:    'FILE_IDENTITY_FAILED',
          message:  identity.message,
          expected: identity.expected,
          received: identity.received,
          missing:  identity.missing,
          extra:    identity.extra,
        }, { status: 422 })
      }
    }

    // ── Phase 1: Parse + validate both files (no DB) ───────────────────────────
    const parsedDocs  = ventasFile ? parseDocs(await ventasFile.arrayBuffer(), orgId, locationId)  : null
    const parsedItems = itemsFile  ? parseItems(await itemsFile.arrayBuffer(), orgId, locationId)  : null

    // ── Phase 2: 5% abort check — bail before touching DB ──────────────────────
    const docsAbort  = parsedDocs  && parsedDocs.rejectedPct  > ABORT_THRESHOLD
    const itemsAbort = parsedItems && parsedItems.rejectedPct > ABORT_THRESHOLD

    if (docsAbort || itemsAbort) {
      const abortDetails = []
      if (docsAbort)  abortDetails.push({ file: 'ventas', rejectedPct: +(parsedDocs!.rejectedPct  * 100).toFixed(1), reasons: buildRejectionReasons(parsedDocs!.reasons)  })
      if (itemsAbort) abortDetails.push({ file: 'items',  rejectedPct: +(parsedItems!.rejectedPct * 100).toFixed(1), reasons: buildRejectionReasons(parsedItems!.reasons) })
      console.warn(`[upload/sales] ABORT: rechazo supera ${ABORT_THRESHOLD * 100}%`, JSON.stringify(abortDetails))
      return NextResponse.json({
        success:      false,
        abortReason:  `Más del ${ABORT_THRESHOLD * 100}% de filas son inválidas. No se insertó nada.`,
        abortDetails,
      }, { status: 422 })
    }

    // ── Phase 3: DB operations ─────────────────────────────────────────────────
    const EMPTY_DOCS:  DocsResult  = { processed: 0, new: 0, updated: 0, inserted: 0, deleted: 0, failed: 0, rejected: 0, dateFrom: '', dateTo: '', rejectionReasons: [], errors: [] }
    const EMPTY_ITEMS: ItemsResult = { processed: 0, new: 0, updated: 0, inserted: 0, deleted: 0, failed: 0, rejected: 0, rejectionReasons: [], errors: [] }

    const allErrors: string[] = []
    let docsResult  = EMPTY_DOCS
    let itemsResult = EMPTY_ITEMS

    if (parsedDocs)  { docsResult  = await insertDocs(parsedDocs,   locationId, supaUrl!, svc); allErrors.push(...docsResult.errors)  }
    if (parsedItems) { itemsResult = await insertItems(parsedItems,  locationId, supaUrl!, svc); allErrors.push(...itemsResult.errors) }

    // ── Phase 4: Freshness after insert ───────────────────────────────────────
    const fresh = await queryFreshness(locationId, supaUrl!, svc)

    // ── Phase 5: Computed validations ─────────────────────────────────────────
    const totalProcessed        = (parsedDocs?.processed ?? 0) + (parsedItems?.processed ?? 0)
    const fechaCajaCount        = (parsedDocs?.fechaCajaCount ?? 0) + (parsedItems?.fechaCajaCount ?? 0)
    const fechaCajaCompleteness = totalProcessed > 0
      ? +(fechaCajaCount / totalProcessed * 100).toFixed(1)
      : 0
    const sumDocs            = parsedDocs?.sumTotal       ?? 0
    const sumItems           = parsedItems?.sumPrecioTotal ?? 0
    const itemsVsDocsDiffPct = sumDocs > 0
      ? +((Math.abs(sumItems - sumDocs) / sumDocs) * 100).toFixed(1)
      : null

    // ── Phase 6: Summary string ────────────────────────────────────────────────
    const parts: string[] = []
    if (docsResult.processed  > 0) parts.push(`${docsResult.inserted} docs (${docsResult.new} nuevos, ${docsResult.updated} actualizados)`)
    if (itemsResult.processed > 0) parts.push(`${itemsResult.inserted} ítems (${itemsResult.new} nuevos, ${itemsResult.updated} actualizados)`)
    const summary = parts.join('; ') || 'Sin datos procesados'

    return NextResponse.json({
      success: true,
      summary,

      // ── Expanded telemetry ─────────────────────────────────────────────────
      documents: {
        processed:        docsResult.processed,
        new:              docsResult.new,
        updated:          docsResult.updated,
        rejected:         docsResult.rejected,
        rejectionReasons: docsResult.rejectionReasons,
      },
      items: {
        processed:        itemsResult.processed,
        new:              itemsResult.new,
        updated:          itemsResult.updated,
        rejected:         itemsResult.rejected,
        rejectionReasons: itemsResult.rejectionReasons,
      },
      validations: {
        fechaCajaCompleteness,
        totalsConsistency: { itemsVsDocsDiffPct },
      },
      freshness: {
        lastUpload: fresh.lastUpload ?? new Date().toISOString(),
        datasets: {
          sales_documents: fresh.datasets['sales_documents'] ?? null,
          sales_items:     fresh.datasets['sales_items']     ?? null,
        },
      },

      // ── Backward compat flat fields ────────────────────────────────────────
      docsInserted:  docsResult.inserted,
      docsDeleted:   docsResult.deleted,
      docsFailed:    docsResult.failed,
      itemsInserted: itemsResult.inserted,
      itemsDeleted:  itemsResult.deleted,
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
