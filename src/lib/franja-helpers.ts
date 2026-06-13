// Pure aggregation helpers for FranjaSection.
// Extracted for unit-testing independently of React.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VentaFranja {
  mes:    string   // "YYYY-MM"
  franja: string   // "Mediodía" | "Tarde" | "Noche" | "Madrugada"
  ventas: number
  pedidos: number
}

export interface FranjaRow {
  franja:  string
  ventas:  number
  pedidos: number
  pct:     number        // % of month total ventas (0–100)
  varPct:  number | null // Δ% vs same franja prev month
  isBest:  boolean       // highest ventas in month
  isWorst: boolean       // lowest ventas in month
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Canonical display order: chronological through the day
export const FRANJA_ORDER = ['Mediodía', 'Tarde', 'Noche', 'Madrugada'] as const

// ── Internal ──────────────────────────────────────────────────────────────────

function fmtM(v: number): string {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return '$' + (v / 1_000).toFixed(0) + 'K'
  return '$' + Math.round(v).toLocaleString('es-AR')
}

// ── Public functions ──────────────────────────────────────────────────────────

export function prevMonthOf(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`
}

export function availableMeses(data: VentaFranja[]): string[] {
  const s = new Set<string>()
  for (const r of data) if (r.mes) s.add(r.mes)
  return Array.from(s).sort().reverse()
}

/** Returns rows in FRANJA_ORDER for franjas that have data in `mes`. */
export function computeFranjaRows(
  data: VentaFranja[],
  mes:  string,
  prev: string,
): FranjaRow[] {
  if (!mes) return []

  const curr = data.filter(r => r.mes === mes)
  if (!curr.length) return []

  const prv        = data.filter(r => r.mes === prev)
  const grandTotal = curr.reduce((s, r) => s + Number(r.ventas), 0)
  const byCurr     = new Map(curr.map(r => [r.franja, r]))
  const byPrev     = new Map(prv.map(r =>  [r.franja, r]))

  const rows: FranjaRow[] = FRANJA_ORDER
    .filter(f => byCurr.has(f))
    .map(f => {
      const c      = byCurr.get(f)!
      const p      = byPrev.get(f)
      const ventas  = Number(c.ventas)
      const pedidos = Number(c.pedidos)
      const varPct  = p && Number(p.ventas) > 0
        ? ((ventas - Number(p.ventas)) / Number(p.ventas)) * 100
        : null
      return {
        franja: f,
        ventas,
        pedidos,
        pct:     grandTotal > 0 ? (ventas / grandTotal) * 100 : 0,
        varPct,
        isBest:  false,
        isWorst: false,
      }
    })

  if (rows.length >= 2) {
    const maxV = Math.max(...rows.map(r => r.ventas))
    const minV = Math.min(...rows.map(r => r.ventas))
    for (const row of rows) {
      row.isBest  = row.ventas === maxV
      row.isWorst = row.ventas === minV
    }
  }

  return rows
}

export function buildFranjaInsight(rows: FranjaRow[]): string | null {
  const best  = rows.find(r => r.isBest)
  const worst = rows.find(r => r.isWorst)
  if (!best) return null
  if (!worst || best.franja === worst.franja) {
    return `${best.franja} concentra la mayor facturación (${fmtM(best.ventas)}).`
  }
  const diff = best.ventas > 0
    ? Math.round(((best.ventas - worst.ventas) / best.ventas) * 100)
    : 0
  return `${best.franja} lidera con ${fmtM(best.ventas)} (${diff}% más que ${worst.franja}).`
}
