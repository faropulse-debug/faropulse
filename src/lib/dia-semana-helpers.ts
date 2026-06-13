// Pure aggregation helpers for DiaSemanaSection.
// Extracted for unit-testing independently of React.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VentaDiaSemana {
  mes:        string   // "YYYY-MM"
  dow:        number   // 0=Dom … 6=Sáb (EXTRACT DOW / Date.getDay())
  ventas:     number
  pedidos:    number
  ocurrencias: number  // distinct calendar days with that DOW in the month
}

export interface DiaSemanaRow {
  dow:        number
  label:      string
  ventas:     number
  pedidos:    number
  ocurrencias: number
  promedio:   number   // ventas / ocurrencias
  pct:        number   // % of month total (0–100)
  isBest:     boolean  // highest promedio in month
  isWorst:    boolean  // lowest promedio in month (among days with data)
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const DOW_LABELS: Record<number, string> = {
  0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié',
  4: 'Jue', 5: 'Vie', 6: 'Sáb',
}

// Display order: Lunes first (ISO week), Domingo last.
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]

// ── Internal ──────────────────────────────────────────────────────────────────

function fmtM(v: number): string {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return '$' + (v / 1_000).toFixed(0) + 'K'
  return '$' + Math.round(v).toLocaleString('es-AR')
}

// ── Public functions ──────────────────────────────────────────────────────────

export function availableMeses(data: VentaDiaSemana[]): string[] {
  const s = new Set<string>()
  for (const r of data) if (r.mes) s.add(r.mes)
  return Array.from(s).sort().reverse()
}

export function computeDiaSemanaRows(
  data: VentaDiaSemana[],
  mes:  string,
): DiaSemanaRow[] {
  if (!mes) return []
  const filtered = data.filter(r => r.mes === mes)
  if (!filtered.length) return []

  const grandTotal = filtered.reduce((s, r) => s + Number(r.ventas), 0)
  const byDow      = new Map<number, VentaDiaSemana>()
  for (const r of filtered) byDow.set(r.dow, r)

  const rows: DiaSemanaRow[] = DOW_ORDER.map(dow => {
    const r          = byDow.get(dow)
    const ventas      = r ? Number(r.ventas)      : 0
    const pedidos     = r ? Number(r.pedidos)     : 0
    const ocurrencias = r ? Number(r.ocurrencias) : 0
    return {
      dow,
      label:      DOW_LABELS[dow],
      ventas,
      pedidos,
      ocurrencias,
      promedio:   ocurrencias > 0 ? ventas / ocurrencias : 0,
      pct:        grandTotal  > 0 ? (ventas / grandTotal) * 100 : 0,
      isBest:     false,
      isWorst:    false,
    }
  })

  const withData = rows.filter(r => r.ocurrencias > 0)
  if (withData.length >= 2) {
    const maxProm = Math.max(...withData.map(r => r.promedio))
    const minProm = Math.min(...withData.map(r => r.promedio))
    for (const row of rows) {
      if (row.ocurrencias > 0) {
        row.isBest  = row.promedio === maxProm
        row.isWorst = row.promedio === minProm
      }
    }
  }

  return rows
}

export function buildDiaSemanaInsight(rows: DiaSemanaRow[]): string | null {
  const best  = rows.find(r => r.isBest)
  const worst = rows.find(r => r.isWorst)
  if (!best || !worst || best.dow === worst.dow) return null
  const diff = best.promedio > 0
    ? Math.round(((best.promedio - worst.promedio) / best.promedio) * 100)
    : 0
  return `${best.label} lidera con ${fmtM(best.promedio)} promedio; ${worst.label} es el más flojo (${fmtM(worst.promedio)}, ${diff}% menos).`
}
