// Pure aggregation helpers for MixCanalesChart.
// Extracted so they can be unit-tested independently of the React component.
//
// Todo lo que llega acá ya viene agregado por SQL (get_ventas_por_canal /
// get_ventas_por_canal_semana / get_ventas_por_canal_dia, todas con
// documento_peso). Nada de esto lee sales_documents crudo ni cuenta filas —
// solo pivotea filas {periodo, canal, ventas} → series por canal.

// ── Types ─────────────────────────────────────────────────────────────────────

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
  count:      number   // pedidos netos (documento_peso), vienen de la RPC
  pctOfTotal: number
  ticketAvg:  number
}

/** Fila de get_ventas_por_canal — RPC neteada con documento_peso, todo el histórico. */
export interface VentasPorCanalRow {
  mes:     string   // "YYYY-MM"
  canal:   string   // 'Salón' | 'TakeAway' | 'Delivery' — labels de display de la RPC
  ventas:  number
  pedidos: number
}

/** Fila de get_ventas_por_canal_semana — RPC neteada, últimas 6 semanas ISO. */
export interface VentasPorCanalSemanaRow {
  semana:  string   // "YYYY-MM-DD" (lunes de la semana)
  canal:   string
  ventas:  number
  pedidos: number
}

/** Fila de get_ventas_por_canal_dia — RPC neteada, un mes (p_mes). */
export interface VentasPorCanalDiaRow {
  fecha:   string   // "YYYY-MM-DD"
  canal:   string
  ventas:  number
  pedidos: number
}

/** Alias usado por buildChannelStats — mismo shape que las filas mensuales, sin `mes`. */
export type ChannelSummaryRow = Pick<VentasPorCanalRow, 'canal' | 'ventas' | 'pedidos'>

type Accum = { SALON: number; APLICACIONES: number; MOSTRADOR: number }

// ── Internal constants ────────────────────────────────────────────────────────

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

// ── Label formatters ──────────────────────────────────────────────────────────

export function formatMonthLabel(periodo: string): string {
  const [y, m] = periodo.split('-')
  return `${MONTH_LABELS[m] || m} ${y.slice(2)}`
}

export function formatWeekLabel(iso: string): string {
  const d = new Date(iso.substring(0, 10) + 'T12:00:00')
  return `${d.getDate()} ${MONTH_LABELS[String(d.getMonth() + 1).padStart(2, '0')]}`
}

export function formatDayLabel(fecha: string): string {
  return String(parseInt(fecha.substring(8, 10), 10))
}

export function normalizeChannel(raw: string): Channel | null {
  const up = (raw ?? '').toUpperCase().trim()
  if (up === 'SALON' || up === 'SALÓN')                          return 'SALON'
  if (up === 'APLICACIONES' || up === 'APP' || up === 'DELIVERY') return 'APLICACIONES'
  if (up === 'MOSTRADOR' || up === 'TAKEAWAY')                    return 'MOSTRADOR'
  return null
}

// ── Generic pivot: filas {periodo, canal, ventas} → PeriodPoint[] por canal ───

function pivotByPeriod(
  rows: { period: string; canal: string; ventas: number }[],
  formatLabel: (period: string) => string,
): PeriodPoint[] {
  const map = new Map<string, Accum>()
  for (const r of rows) {
    const ch = normalizeChannel(r.canal)
    if (!ch) continue
    if (!map.has(r.period)) map.set(r.period, { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 })
    map.get(r.period)![ch] += Number(r.ventas)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({
      name:         formatLabel(period),
      SALON:        v.SALON,
      APLICACIONES: v.APLICACIONES,
      MOSTRADOR:    v.MOSTRADOR,
      total:        v.SALON + v.APLICACIONES + v.MOSTRADOR,
    }))
}

// ── Public aggregation functions (una por RPC) ─────────────────────────────────

export function buildMonthlyFromRpc(rows: VentasPorCanalRow[]): PeriodPoint[] {
  return pivotByPeriod(rows.map(r => ({ period: r.mes, canal: r.canal, ventas: r.ventas })), formatMonthLabel)
}

export function buildWeeklyFromRpc(rows: VentasPorCanalSemanaRow[]): PeriodPoint[] {
  return pivotByPeriod(rows.map(r => ({ period: r.semana, canal: r.canal, ventas: r.ventas })), formatWeekLabel)
}

export function buildDailyFromRpc(rows: VentasPorCanalDiaRow[]): PeriodPoint[] {
  return pivotByPeriod(rows.map(r => ({ period: r.fecha, canal: r.canal, ventas: r.ventas })), formatDayLabel)
}

/** Meses disponibles a partir de get_ventas_por_canal — no requiere fetch aparte. */
export function availableMonthsFromCanalRows(rows: VentasPorCanalRow[]): string[] {
  return Array.from(new Set(rows.map(r => r.mes))).sort().reverse()   // descendente: más reciente primero
}

/**
 * Construye los totales/conteo/ticket promedio por canal a partir de
 * get_ventas_por_canal (RPC neteada con documento_peso — resta la Nota de
 * Crédito del conteo en SQL). No cuenta filas en cliente: pedidos y ventas
 * llegan ya agregados por mes desde la RPC, acá solo se suman entre meses.
 */
export function buildChannelStats(rows: ChannelSummaryRow[]): ChannelStats[] {
  const totals: Record<Channel, number> = { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 }
  const counts: Record<Channel, number> = { SALON: 0, APLICACIONES: 0, MOSTRADOR: 0 }
  for (const r of rows) {
    const ch = normalizeChannel(r.canal)
    if (!ch) continue
    totals[ch] += Number(r.ventas)
    counts[ch] += Number(r.pedidos)
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
