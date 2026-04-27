import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BATCH    = 500

const SVC = {
  'Content-Type':  'application/json',
  'apikey':        SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Prefer':        'return=minimal',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return String(h).trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, '_')
}

function toStr(v: unknown): string | null {
  if (v === '' || v == null) return null
  return String(v).trim() || null
}

function toNum(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''))
  return isNaN(n) ? null : n
}

function toMoney(v: unknown): number | null {
  if (v === '' || v == null) return null
  const s = String(v).trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!s) return null
  const norm = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s
  const n = parseFloat(norm)
  return isNaN(n) ? null : n
}

function toNumComma(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = parseFloat(String(v).trim().replace(/\s/g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

function parseFlexDate(v: unknown): string | null {
  if (v === '' || v == null) return null
  const s = String(v).trim()
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`
  // YYYY-MM-DD or ISO
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return null
}

function toDate(v: unknown): string | null { return parseFlexDate(v) }

function toTimestamp(v: unknown): string | null {
  if (v === '' || v == null) return null
  const s = String(v).trim()
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

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapVenta(row: Record<string, unknown>, orgId: string, locationId: string) {
  return {
    org_id:          orgId,
    location_id:     locationId,
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

function mapItem(row: Record<string, unknown>, orgId: string, locationId: string) {
  return {
    org_id:                  orgId,
    location_id:             locationId,
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

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function supaDelete(table: string, params: [string, string][]) {
  const qs  = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs}`, {
    method: 'DELETE', headers: SVC,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DELETE ${table}: ${text}`)
  }
}

async function supaInsertBatch(
  table:  string,
  rows:   Record<string, unknown>[],
): Promise<number> {
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const res   = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
      method: 'POST', headers: SVC,
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`INSERT ${table} (batch ${Math.floor(i/BATCH)+1}): ${text}`)
    }
    inserted += batch.length
  }
  return inserted
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    const ventasFile = form.get('ventas')      as File   | null
    const itemsFile  = form.get('items')       as File   | null
    const locationId = form.get('location_id') as string | null
    const orgId      = form.get('org_id')      as string | null

    if (!ventasFile || !itemsFile || !locationId || !orgId) {
      return NextResponse.json({ error: 'Faltan campos: ventas, items, location_id, org_id' }, { status: 400 })
    }

    // Parse Excel
    const [vBuf, iBuf] = await Promise.all([ventasFile.arrayBuffer(), itemsFile.arrayBuffer()])

    const parseSheet = (buf: ArrayBuffer) => {
      const wb    = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' })
        .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [normalizeHeader(k), v])))
    }

    const ventasRows = parseSheet(vBuf)
    const itemsRows  = parseSheet(iBuf)

    if (ventasRows.length === 0) {
      return NextResponse.json({ error: 'El archivo de ventas no contiene filas' }, { status: 400 })
    }

    // Date range from ventas
    const dates    = ventasRows.map(r => toDate(r.fecha)).filter(Boolean).sort() as string[]
    const dateFrom = dates[0]
    const dateTo   = dates[dates.length - 1]

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: 'No se pudo determinar el rango de fechas del Excel de ventas' }, { status: 400 })
    }

    // DELETE existing in range
    await supaDelete('sales_documents', [
      ['location_id', `eq.${locationId}`],
      ['fecha',       `gte.${dateFrom}`],
      ['fecha',       `lte.${dateTo}`],
    ])
    await supaDelete('sales_items', [
      ['location_id',     `eq.${locationId}`],
      ['fecha_documento', `gte.${dateFrom}`],
      ['fecha_documento', `lte.${dateTo}`],
    ])

    // Map + insert
    const mappedVentas = ventasRows.map(r => mapVenta(r, orgId, locationId))
    const mappedItems  = itemsRows.map(r  => mapItem(r,  orgId, locationId))

    const docsInserted  = await supaInsertBatch('sales_documents', mappedVentas)
    const itemsInserted = await supaInsertBatch('sales_items',     mappedItems)

    return NextResponse.json({
      success:      true,
      docsInserted,
      itemsInserted,
      dateRange:    `${dateFrom} – ${dateTo}`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload/sales] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
