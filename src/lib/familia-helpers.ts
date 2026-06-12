export interface VentaFamilia {
  mes:      string
  familia:  string
  ventas:   number
  cantidad: number
}

export interface FamiliaRow {
  familia:  string
  ventas:   number
  cantidad: number
  pct:      number        // % share of total ventas for the month (0–100)
  varPct:   number | null // Δ% vs same familia in prevMonth
}

export interface FamiliaDisplay {
  top:        FamiliaRow[]      // sorted by ventas desc, top N
  otras:      FamiliaRow | null // aggregated remainder (null if ≤ topN families)
  otrasCount: number            // how many families in "otras"
  total:      number            // total ventas for the month
}

/** Returns rows sorted by ventas desc for currentMonth, with Δ vs prevMonth. */
export function computeFamiliaRows(
  data:         VentaFamilia[],
  currentMonth: string,
  prevMonth:    string,
): FamiliaRow[] {
  const curr = data.filter(r => r.mes === currentMonth)
  if (!curr.length) return []

  const prev        = data.filter(r => r.mes === prevMonth)
  const totalVentas = curr.reduce((s, r) => s + r.ventas, 0)
  const prevMap     = new Map(prev.map(r => [r.familia, r]))

  return curr
    .map(r => {
      const p = prevMap.get(r.familia)
      return {
        familia:  r.familia,
        ventas:   r.ventas,
        cantidad: r.cantidad,
        pct:      totalVentas > 0 ? (r.ventas / totalVentas) * 100 : 0,
        varPct:   p && p.ventas > 0 ? ((r.ventas - p.ventas) / p.ventas) * 100 : null,
      }
    })
    .sort((a, b) => b.ventas - a.ventas)
}

/** Splits sorted rows into top N + "otras" aggregate. */
export function buildFamiliaDisplay(rows: FamiliaRow[], topN = 7): FamiliaDisplay {
  if (!rows.length) return { top: [], otras: null, otrasCount: 0, total: 0 }

  const total = rows.reduce((s, r) => s + r.ventas, 0)
  const top   = rows.slice(0, topN)
  const rest  = rows.slice(topN)

  if (!rest.length) return { top, otras: null, otrasCount: 0, total }

  const otras: FamiliaRow = {
    familia:  `Otras (${rest.length} familias)`,
    ventas:   rest.reduce((s, r) => s + r.ventas, 0),
    cantidad: rest.reduce((s, r) => s + r.cantidad, 0),
    pct:      total > 0 ? (rest.reduce((s, r) => s + r.ventas, 0) / total) * 100 : 0,
    varPct:   null,
  }

  return { top, otras, otrasCount: rest.length, total }
}

/** Returns the preceding month in YYYY-MM format. */
export function prevMonthOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** One-line insight: who led + biggest mover vs prev month (if |Δ| ≥ 3%). */
export function buildFamiliaInsight(top: FamiliaRow[]): string | null {
  if (!top.length) return null

  const leader       = top[0]
  const withVar      = top.filter(r => r.varPct !== null)
  const biggestMover = withVar.length
    ? [...withVar].sort((a, b) => Math.abs(b.varPct!) - Math.abs(a.varPct!))[0]
    : null

  let txt = `${leader.familia} lideró el mes con el ${leader.pct.toFixed(0)}% de la facturación.`

  if (biggestMover && biggestMover.varPct !== null && Math.abs(biggestMover.varPct) >= 3) {
    const dir = biggestMover.varPct >= 0 ? 'subió' : 'bajó'
    const abs = Math.abs(biggestMover.varPct).toFixed(1)
    txt += ` ${biggestMover.familia} ${dir} ${abs}% respecto al mes anterior.`
  }

  return txt
}
