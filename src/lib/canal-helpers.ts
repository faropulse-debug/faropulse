export interface VentaCanal {
  mes:     string
  canal:   string
  ventas:  number
  pedidos: number
}

export interface CanalRow {
  canal:   string
  ventas:  number
  pedidos: number
  pct:     number        // % share of total ventas for the month (0–100)
  varPct:  number | null // Δ% vs same canal in prevMonth
}

/** Returns rows sorted by ventas desc for currentMonth, with Δ vs prevMonth. */
export function computeCanalRows(
  canales:      VentaCanal[],
  currentMonth: string,
  prevMonth:    string,
): CanalRow[] {
  const curr = canales.filter(c => c.mes === currentMonth)
  if (!curr.length) return []

  const prev        = canales.filter(c => c.mes === prevMonth)
  const totalVentas = curr.reduce((s, c) => s + c.ventas, 0)
  const prevMap     = new Map(prev.map(c => [c.canal, c]))

  return curr
    .map(c => {
      const p = prevMap.get(c.canal)
      return {
        canal:   c.canal,
        ventas:  c.ventas,
        pedidos: c.pedidos,
        pct:     totalVentas > 0 ? (c.ventas / totalVentas) * 100 : 0,
        varPct:  p && p.ventas > 0 ? ((c.ventas - p.ventas) / p.ventas) * 100 : null,
      }
    })
    .sort((a, b) => b.ventas - a.ventas)
}

/** One-line insight: who led + biggest mover vs prev month (if |Δ| ≥ 3%). */
export function buildCanalInsight(rows: CanalRow[]): string | null {
  if (!rows.length) return null

  const leader      = rows[0]
  const withVar     = rows.filter(r => r.varPct !== null)
  const biggestMover = withVar.length
    ? [...withVar].sort((a, b) => Math.abs(b.varPct!) - Math.abs(a.varPct!))[0]
    : null

  let txt = `${leader.canal} lideró el mes con el ${leader.pct.toFixed(0)}% de la facturación.`

  if (biggestMover && biggestMover.varPct !== null && Math.abs(biggestMover.varPct) >= 3) {
    const dir = biggestMover.varPct >= 0 ? 'subió' : 'bajó'
    const abs = Math.abs(biggestMover.varPct).toFixed(1)
    txt += ` ${biggestMover.canal} ${dir} ${abs}% respecto al mes anterior.`
  }

  return txt
}
