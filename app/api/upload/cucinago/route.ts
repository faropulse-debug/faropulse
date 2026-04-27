import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BATCH     = 500

const CUCINAGO_BASE  = 'https://gd55d70ed7f53c9-o1anc1ft1sdt1pqp.adb.sa-santiago-1.oraclecloudapps.com/ords/restoweb'
const CUCINAGO_SUCA  = '2216'
const PAGE_SIZE      = 25

const SVC = {
  'Content-Type':  'application/json',
  'apikey':        SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Prefer':        'return=minimal',
}

// ─── CucinaGo response types ──────────────────────────────────────────────────
// Adjust field names to match the actual CucinaGo API response.

interface CucinaGoItem {
  id?:           unknown   // order/document identifier
  fecha?:        unknown   // date string
  total?:        unknown   // total amount
  comensales?:   unknown   // covers
  tipo_zona?:    unknown   // channel
  tipo_doc?:     unknown   // document type
  numero?:       unknown   // ticket number
  descripcion?:  unknown   // item description
  cantidad?:     unknown   // quantity
  precio_unit?:  unknown   // unit price
  precio_total?: unknown   // line total
  codigo?:       unknown   // product code
  familia?:      unknown   // family
  // Add other fields returned by the API as needed
  [key: string]: unknown
}

interface CucinaGoResponse {
  items:   CucinaGoItem[]
  hasMore: boolean
  count?:  number
  offset?: number
  limit?:  number
}

// ─── Transform CucinaGo items → DB rows ──────────────────────────────────────
// CucinaGo returns individual line items; we group by order ID to build
// sales_documents, and keep each line as a sales_item.

function toStr(v: unknown): string | null {
  if (v == null || v === '') return null
  return String(v).trim() || null
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''))
  return isNaN(n) ? null : n
}

function toDate(v: unknown): string | null {
  if (v == null || v === '') return null
  const s = String(v).trim()
  const ddmm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

interface DocAccum {
  external_id:     string
  fecha:           string | null
  total:           number
  comensales:      number
  tipo_zona:       string | null
  tipo_documento:  string | null
  items:           SaleItemRow[]
}

interface SaleItemRow {
  org_id:         string
  location_id:    string
  external_id:    string | null
  numero_ticket:  string | null
  descripcion:    string | null
  cantidad:       number | null
  precio_unitario:number | null
  precio_total:   number | null
  codigo:         number | null
  familia:        string | null
}

function transformItems(
  rawItems: CucinaGoItem[],
  orgId: string,
  locationId: string,
): { docs: Record<string, unknown>[]; items: SaleItemRow[] } {
  const byDoc = new Map<string, DocAccum>()

  for (const item of rawItems) {
    // Order identifier — try common field names
    const docId = String(item.id ?? item.numero ?? item.ticket_id ?? '').trim()
    if (!docId) continue

    if (!byDoc.has(docId)) {
      byDoc.set(docId, {
        external_id:    docId,
        fecha:          toDate(item.fecha ?? item.date ?? item.fecha_doc),
        total:          0,
        comensales:     toNum(item.comensales ?? item.covers ?? item.pax) ?? 0,
        tipo_zona:      toStr(item.tipo_zona ?? item.channel ?? item.canal),
        tipo_documento: toStr(item.tipo_doc  ?? item.tipo_documento ?? 'CUCINAGO'),
        items:          [],
      })
    }

    const doc = byDoc.get(docId)!
    const lineTotal = toNum(item.precio_total ?? item.total_linea ?? item.importe) ?? 0
    doc.total += lineTotal

    doc.items.push({
      org_id:          orgId,
      location_id:     locationId,
      external_id:     toStr(item.id ?? item.item_id),
      numero_ticket:   docId,
      descripcion:     toStr(item.descripcion ?? item.description ?? item.nombre),
      cantidad:        toNum(item.cantidad ?? item.qty ?? item.quantity),
      precio_unitario: toNum(item.precio_unit ?? item.precio_unitario ?? item.unit_price),
      precio_total:    lineTotal || null,
      codigo:          toNum(item.codigo ?? item.product_id ?? item.sku),
      familia:         toStr(item.familia ?? item.family ?? item.categoria),
    })
  }

  const docs = Array.from(byDoc.values()).map(d => ({
    org_id:         orgId,
    location_id:    locationId,
    external_id:    d.external_id,
    fecha:          d.fecha,
    total:          d.total,
    comensales:     d.comensales,
    tipo_zona:      d.tipo_zona,
    tipo_documento: d.tipo_documento,
  }))

  const items = Array.from(byDoc.values()).flatMap(d => d.items)

  return { docs, items }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function supaInsertBatch(table: string, rows: unknown[]): Promise<number> {
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
    const body       = await req.json() as { from: string; to: string; location_id: string; org_id: string }
    const { from, to, location_id: locationId, org_id: orgId } = body

    if (!from || !to || !locationId || !orgId) {
      return NextResponse.json({ error: 'Faltan campos: from, to, location_id, org_id' }, { status: 400 })
    }

    // Fetch all pages from CucinaGo
    const allItems: CucinaGoItem[] = []
    let offset  = 0
    let hasMore = true
    let pages   = 0
    const MAX_PAGES = 200  // safety cap (~5000 items)

    while (hasMore && pages < MAX_PAGES) {
      const url = `${CUCINAGO_BASE}/grupopopular/items/${from}/${to}/${CUCINAGO_SUCA}?offset=${offset}&limit=${PAGE_SIZE}`
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30_000),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`CucinaGo API error (offset=${offset}): ${res.status} ${text}`)
      }

      const data = await res.json() as CucinaGoResponse
      const page = Array.isArray(data.items) ? data.items : []
      allItems.push(...page)

      hasMore  = data.hasMore === true && page.length === PAGE_SIZE
      offset  += PAGE_SIZE
      pages++
    }

    if (allItems.length === 0) {
      return NextResponse.json({ success: true, docsInserted: 0, itemsInserted: 0, message: 'No hay datos para el rango seleccionado' })
    }

    const { docs, items } = transformItems(allItems, orgId, locationId)

    // DELETE existing in date range
    await fetch(
      `${SUPA_URL}/rest/v1/sales_documents?location_id=eq.${locationId}&fecha=gte.${from}&fecha=lte.${to}&tipo_documento=eq.CUCINAGO`,
      { method: 'DELETE', headers: SVC },
    )
    await fetch(
      `${SUPA_URL}/rest/v1/sales_items?location_id=eq.${locationId}&fecha_documento=gte.${from}&fecha_documento=lte.${to}`,
      { method: 'DELETE', headers: SVC },
    )

    const docsInserted  = await supaInsertBatch('sales_documents', docs)
    const itemsInserted = await supaInsertBatch('sales_items',     items)

    return NextResponse.json({
      success: true,
      docsInserted,
      itemsInserted,
      rawItems: allItems.length,
      pages,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload/cucinago] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
