const PAGE_LIMIT = 25
const MAX_PAGES  = 200

export interface CucinaGoRawItem {
  numero:        string
  precio_total:  number
  fecha_caja:    string
  tipo_documento: string
  tipo_zona:     string
  es_variacion:  string
  documento_id:  number
  id_item:       number
  [key: string]: unknown
}

// Oracle ORDS requires DD-MM-YYYY, not ISO YYYY-MM-DD
function toOracleDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

export async function fetchCucinaGoSales(
  from: string,
  to:   string,
): Promise<CucinaGoRawItem[]> {
  const base    = process.env.CUCINAGO_BASE
  const empresa = process.env.CUCINAGO_EMPRESA
  const suca    = process.env.CUCINAGO_SUCA

  if (!base || !empresa || !suca) {
    throw new Error('Missing env: CUCINAGO_BASE, CUCINAGO_EMPRESA, or CUCINAGO_SUCA')
  }

  const fromOracle = toOracleDate(from)
  const toOracle   = toOracleDate(to)
  const urlBase    = `${base}/${empresa}/items/${fromOracle}/${toOracle}/${suca}`

  const all: CucinaGoRawItem[] = []
  let offset = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${urlBase}?offset=${offset}&limit=${PAGE_LIMIT}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal:  AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`CucinaGo API error (offset=${offset}): HTTP ${res.status} — ${text.slice(0, 300)}`)
    }

    const data = await res.json() as { items?: unknown[]; hasMore?: boolean }
    const items = Array.isArray(data.items) ? (data.items as CucinaGoRawItem[]) : []
    all.push(...items)

    if (data.hasMore !== true || items.length < PAGE_LIMIT) break
    offset += PAGE_LIMIT
  }

  return all
}
