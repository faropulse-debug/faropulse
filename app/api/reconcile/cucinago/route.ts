import { NextRequest, NextResponse } from 'next/server'
import { fetchCucinaGoSales }        from '@/src/lib/reconcile/cucinago-source'
import { groupByComprobante, reconcile } from '@/src/lib/reconcile/compare'

// TODO: auth server-side + tenant desde sesión (feature P0 en backlog)

const POSTGREST_PAGE = 1000

async function fetchMaxirestDocs(
  locationId: string,
  from:       string,
  to:         string,
  supaUrl:    string,
  svcKey:     string,
): Promise<Map<string, { total: number }>> {
  const headers = {
    apikey: svcKey,
    Accept: 'application/json',
  }
  const map = new Map<string, { total: number }>()
  let offset = 0

  while (true) {
    const url = `${supaUrl}/rest/v1/sales_documents` +
      `?location_id=eq.${encodeURIComponent(locationId)}` +
      `&fecha=gte.${from}&fecha=lte.${to}` +
      `&select=external_id,total` +
      `&offset=${offset}&limit=${POSTGREST_PAGE}`

    const res = await fetch(url, { headers })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Maxirest fetch failed (offset=${offset}): HTTP ${res.status} — ${text.slice(0, 300)}`)
    }

    const rows = await res.json() as { external_id: string; total: number }[]
    for (const r of rows) {
      if (r.external_id) map.set(r.external_id, { total: r.total ?? 0 })
    }
    if (rows.length < POSTGREST_PAGE) break
    offset += POSTGREST_PAGE
  }

  return map
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supaUrl || !svcKey) {
    return NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 })
  }

  let body: { from?: string; to?: string; location_id?: string; org_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { from, to, location_id, org_id } = body

  if (!from || !to || !location_id || !org_id) {
    return NextResponse.json(
      { error: 'Required: from, to, location_id, org_id' },
      { status: 400 },
    )
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must be <= to' }, { status: 400 })
  }

  try {
    const [rawItems, maxirestMap] = await Promise.all([
      fetchCucinaGoSales(from, to),
      fetchMaxirestDocs(location_id, from, to, supaUrl, svcKey),
    ])

    const cucinagoMap = groupByComprobante(rawItems)
    const result      = reconcile(cucinagoMap, maxirestMap)

    return NextResponse.json({
      ok:          true,
      from,
      to,
      rawItems:    rawItems.length,
      generatedAt: new Date().toISOString(),
      range:       { from, to },
      source:      'cucinago-vs-maxirest',
      ...result,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
