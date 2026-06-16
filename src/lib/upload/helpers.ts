import * as XLSX from 'xlsx'

// ─── Constants ────────────────────────────────────────────────────────────────

export const VENTAS_REQUIRED_COLUMNS = ['Sucursal', 'Numero', 'Fecha Caja', 'Total', 'Comensales', 'Tipo Documento'] as const
export const ITEMS_REQUIRED_COLUMNS  = ['Sucursal', 'Numero', 'Descripcion', 'Cantidad', 'Precio Total', 'Fecha Caja', 'Familia'] as const

// ─── Supabase service-role header bag ─────────────────────────────────────────

export type SvcHeaders = {
  'Content-Type': string
  'apikey':       string
  'Prefer':       string
}

// ─── Pure utilities ───────────────────────────────────────────────────────────

export function normalizeHeader(h: string): string {
  return String(h).trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
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

const pad2 = (n: number) => String(n).padStart(2, '0')

export function toDate(v: unknown): string | null {
  if (v === '' || v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    const p = XLSX.SSF.parse_date_code(Math.floor(v))
    if (p && p.y > 1900 && p.y < 2200) return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`
    return null
  }
  const s    = String(v).trim()
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

export function toTimestamp(v: unknown): string | null {
  if (v === '' || v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    const p = XLSX.SSF.parse_date_code(v)
    if (p && p.y > 1900 && p.y < 2200) {
      return new Date(`${p.y}-${pad2(p.m)}-${pad2(p.d)}T${pad2(p.H)}:${pad2(p.M)}:${pad2(p.S)}`).toISOString()
    }
    return null
  }
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

// ─── Supabase helpers ─────────────────────────────────────────────────────────

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
