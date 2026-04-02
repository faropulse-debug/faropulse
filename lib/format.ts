export function fmtPeso(v: number) {
  return '$' + v.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

export function fmtMillones(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return '$' + (v / 1_000).toFixed(0) + 'K'
  return '$' + v.toLocaleString('es-AR')
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(1) + '%'
}
