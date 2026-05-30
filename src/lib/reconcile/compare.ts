import type { CucinaGoRawItem } from './cucinago-source'

export interface ComprobanteCG {
  total:  number
  lineas: number
}

export interface ComprobanteMaxirest {
  total: number
}

export interface Discrepancia {
  numero:         string
  totalCucinago:  number
  totalMaxirest:  number
  diff:           number
}

export interface SoloCucinago {
  numero: string
  total:  number
}

export interface SoloMaxirest {
  external_id: string
  total:       number
}

export interface ReconcileResumen {
  coincidenCount:      number
  discrepanciasCount:  number
  soloCucinagoCount:   number
  soloMaxirestCount:   number
  totalCucinago:       number
  totalMaxirest:       number
  diffTotal:           number
}

export interface ReconcileResult {
  resumen:      ReconcileResumen
  discrepancias: Discrepancia[]
  soloCucinago:  SoloCucinago[]
  soloMaxirest:  SoloMaxirest[]
}

export function groupByComprobante(
  items: CucinaGoRawItem[],
): Map<string, ComprobanteCG> {
  const map = new Map<string, ComprobanteCG>()
  for (const item of items) {
    const key = String(item.numero ?? '').trim()
    if (!key) continue
    const existing = map.get(key)
    if (existing) {
      existing.total  += item.precio_total
      existing.lineas += 1
    } else {
      map.set(key, { total: item.precio_total, lineas: 1 })
    }
  }
  // Round totals to nearest integer — floating-point accumulation of integer
  // prices (e.g. 17600 + 13700 + ...) can produce sub-cent diffs like 7.2e-12.
  for (const d of map.values()) d.total = Math.round(d.total)
  return map
}

export function reconcile(
  cucinagoDocs:  Map<string, ComprobanteCG>,
  maxirestDocs:  Map<string, ComprobanteMaxirest>,
): ReconcileResult {
  const discrepancias: Discrepancia[] = []
  const soloCucinago:  SoloCucinago[] = []
  const soloMaxirest:  SoloMaxirest[] = []
  let   coincidenCount = 0

  for (const [numero, cg] of cucinagoDocs) {
    const mx = maxirestDocs.get(numero)
    if (!mx) {
      soloCucinago.push({ numero, total: cg.total })
    } else if (cg.total === mx.total) {
      coincidenCount++
    } else {
      discrepancias.push({
        numero,
        totalCucinago: cg.total,
        totalMaxirest: mx.total,
        diff:          cg.total - mx.total,
      })
    }
  }

  for (const [external_id, mx] of maxirestDocs) {
    if (!cucinagoDocs.has(external_id)) {
      soloMaxirest.push({ external_id, total: mx.total })
    }
  }

  const totalCucinago  = [...cucinagoDocs.values()].reduce((s, d) => s + d.total, 0)
  const totalMaxirest  = [...maxirestDocs.values()].reduce((s, d) => s + d.total, 0)

  return {
    resumen: {
      coincidenCount,
      discrepanciasCount: discrepancias.length,
      soloCucinagoCount:  soloCucinago.length,
      soloMaxirestCount:  soloMaxirest.length,
      totalCucinago,
      totalMaxirest,
      diffTotal: totalCucinago - totalMaxirest,
    },
    discrepancias,
    soloCucinago,
    soloMaxirest,
  }
}
