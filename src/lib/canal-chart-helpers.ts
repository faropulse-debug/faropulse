// Pure aggregation helpers for MixCanalesChart.
// Extracted so they can be unit-tested independently of the React component.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawSaleRow {
  fecha:     string   // "YYYY-MM-DD" or full ISO timestamp — both handled
  total:     number
  tipo_zona: string   // raw DB value: "SALON" | "APLICACIONES" | "MOSTRADOR" | …
}

export const CHANNELS = ['SALON', 'APLICACIONES', 'MOSTRADOR'] as const
export type  Channel  = typeof CHANNELS[number]

export const CHANNEL_COLORS: Record<Channel, string> = {
  SALON:        '#f5820a',
  APLICACIONES: '#a855f7',
  MOSTRADOR:    '#06b6d4',
}

export interface PeriodPoint {
  name:         string
  SALON:        number
  APLICACIONES: number
  MOSTRADOR:    number
  total:        number
}

export interface ChannelStats {
  channel:    Channel
  total:      number
  count:      number   // number of sales_documents rows (≈ pedidos)
  pctOfTotal: number
  ticketAvg:  number
}

type Accum = { SALON: number; APLICACIONES: number; MOSTRADOR: number }

// ── Internal constants ────────────────────────────────────────────────────────

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

// ── Low-level helpers ─────────────────────────────────────────────────────────

/** Extracts the date portion (first 10 chars) from any ISO date or timestamp string. */
function isoDate(raw: string): string {
  return raw.substring(0, 10)
}

export function normalizeChannel(raw: string): Channel | null {
  const up = (raw ?? '').toUpperCase().trim()
  if (up === 'SALON' || up === 'SALÓN')                          return 'SALON'
  if (up === 'APLICACIONES' || up === 'APP' || up === 'DELIVERY') return 'APLICACIONES'
  if (up === 'MOSTRADOR')                                         return 'MOSTRADOR'
  return null
}

export function formatMonthLabel(periodo: string): string {
  const [y, m] = periodo.split('-')
  return `${MONTH_LABELS[m] || m} ${y.slice(2)}`
}

export function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate()} ${MONTH_LABELS[String(d.getMonth() + 1).padStart(2, '0')]}`
}

export function formatDayLabel(fecha: string): string {
  return String(parseInt(isoDate(fecha).substring(8, 10), 10))
}

function getMondayOfWeek(raw: string): string {
  // Use isoDate() to strip any time/timezone component before parsing.
  // Without this, concatenating 'T12:00:00' onto a full ISO timestamp produces
  // an invalid date string (NaN), breaking weekly aggregation.
  const d    = new Date(isoDate(raw) + 'T12:00:00')
  const day  = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

// ── Public aggregation functions ──────────────────────────────────────────────

export function availableMonths(rows: RawSaleRow[]): string[] {
  const s = new Set<string>()
  for (const r of rows) {
    if (r.fecha && r.fecha.length >= 7) s.add(r.fecha.substring(0, 7))
  }
  return Array.from(s).sort().reverse()   // descending: most-recent first
}

export function buildMonthly(rows: RawSaleRow[]): PeriodPoint[] {
  const map = new Map<string, Accum>()
  for (const r of rows) {
    const ch = normalizeChannel(r.tipo_zona)
    if (!ch) continue
    const k = r.fecha.substring(0, 7)   // "YYYY-MM" — safe for both date and timestamp
    if (!map.has(k)) map.set(k, { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 })
    map.get(k)![ch] += Number(r.total)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, v]) => ({
      name:         formatMonthLabel(periodo),
      SALON:        v.SALON,
      APLICACIONES: v.APLICACIONES,
      MOSTRADOR:    v.MOSTRADOR,
      total:        v.SALON + v.APLICACIONES + v.MOSTRADOR,
    }))
}

export function buildWeekly(rows: RawSaleRow[]): PeriodPoint[] {
  const map = new Map<string, Accum>()
  for (const r of rows) {
    const ch = normalizeChannel(r.tipo_zona)
    if (!ch) continue
    const k = getMondayOfWeek(r.fecha)   // isoDate() applied internally — safe with timestamps
    if (!map.has(k)) map.set(k, { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 })
    map.get(k)![ch] += Number(r.total)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, v]) => ({
      name:         formatWeekLabel(semana),
      SALON:        v.SALON,
      APLICACIONES: v.APLICACIONES,
      MOSTRADOR:    v.MOSTRADOR,
      total:        v.SALON + v.APLICACIONES + v.MOSTRADOR,
    }))
}

/** Daily aggregation for one calendar month (p_mes = "YYYY-MM"). */
export function buildDaily(rows: RawSaleRow[], month: string): PeriodPoint[] {
  if (!month) return []
  const map = new Map<string, Accum>()
  for (const r of rows) {
    if (!r.fecha.startsWith(month)) continue   // startsWith works for both date and timestamp
    const ch = normalizeChannel(r.tipo_zona)
    if (!ch) continue
    const k = isoDate(r.fecha)   // "YYYY-MM-DD"
    if (!map.has(k)) map.set(k, { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 })
    map.get(k)![ch] += Number(r.total)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({
      name:         formatDayLabel(fecha),
      SALON:        v.SALON,
      APLICACIONES: v.APLICACIONES,
      MOSTRADOR:    v.MOSTRADOR,
      total:        v.SALON + v.APLICACIONES + v.MOSTRADOR,
    }))
}

export function buildChannelStats(rows: RawSaleRow[]): ChannelStats[] {
  const totals: Record<Channel, number> = { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 }
  const counts: Record<Channel, number> = { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 }
  for (const r of rows) {
    const ch = normalizeChannel(r.tipo_zona)
    if (!ch) continue
    totals[ch] += Number(r.total)
    counts[ch] += 1
  }
  const grandTotal = CHANNELS.reduce((s, ch) => s + totals[ch], 0)
  return CHANNELS.map(ch => ({
    channel:    ch,
    total:      totals[ch],
    count:      counts[ch],
    pctOfTotal: grandTotal > 0 ? (totals[ch] / grandTotal) * 100 : 0,
    ticketAvg:  counts[ch] > 0 ? totals[ch] / counts[ch] : 0,
  }))
}
