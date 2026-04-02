'use client'

import { createWidget }            from './createWidget'
import type { WidgetRenderConfig } from './createWidget'
import { fmtMillones, fmtPct }     from '@/lib/format'

// ─── Widget config (inline — no registry import to avoid circular deps) ────────

const config: WidgetRenderConfig = {
  id:    'facturacion-mes',
  title: 'Facturación Mes',
  rpcName: 'get_facturacion_mes',
  filterSupport: {
    required: ['locationId', 'monthReference'],
    optional: ['compareMode', 'channel'],
    ignored:  ['weekReference'],
  },
}

// ─── RPC response shape ───────────────────────────────────────────────────────

interface FacturacionMesRPC {
  facturacion_mes_actual_acumulada:       number | null
  facturacion_mismo_periodo_mes_anterior: number | null
  pct_vs_mes_anterior:                    number | null
  facturacion_anterior_cerrado:           number | null
  pct_ultimo_mes_vs_anterior:             number | null
  proyeccion_cierre_lineal:               number | null
  proyeccion_cierre_ponderada:            number | null
  promedio_diario_mes_actual:             number | null
  meta_diaria_igualar_mes_anterior:       number | null
  meta_diaria_superar_10pct:              number | null
  desvio_acumulado_pct:                   number | null
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const GREEN      = '#10B981'
const RED        = '#EF4444'
const AMBER      = '#F59E0B'
const MUTED      = 'rgba(255,255,255,0.35)'
const FONT_VALUE = "var(--font-syne), sans-serif"
const FONT_LABEL = "var(--font-dm-mono), monospace"

const GLOW_MAP: Record<string, string> = {
  [GREEN]: 'rgba(16,185,129,0.12)',
  [RED]:   'rgba(239,68,68,0.12)',
  [AMBER]: 'rgba(245,158,11,0.12)',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function semColor(pct: number | null): string {
  if (pct === null) return AMBER
  if (pct > 0)      return GREEN
  if (pct < 0)      return RED
  return AMBER
}

function arrow(pct: number | null): string {
  if (pct === null || pct === 0) return '▶'
  return pct > 0 ? '▲' : '▼'
}

function fmtValue(v: number | null): string {
  return v === null ? '—' : fmtMillones(v)
}

function fmtPctSigned(v: number | null): string {
  if (v === null) return '—'
  return `${v > 0 ? '+' : ''}${fmtPct(v)}`
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

function TopBar({ color }: { color: string }) {
  return (
    <div style={{
      position:   'absolute',
      top:        0,
      left:       0,
      right:      0,
      height:     '3px',
      background: color,
      opacity:    0.85,
    }} />
  )
}

// ─── Content renderer ─────────────────────────────────────────────────────────

function renderContent(data: FacturacionMesRPC) {
  const pct   = data.pct_vs_mes_anterior
  const color = semColor(pct)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: `0 0 24px ${GLOW_MAP[color] ?? GLOW_MAP[AMBER]}` }}>
      <TopBar color={color} />

      {/* Primary value */}
      <div style={{
        fontFamily:    FONT_VALUE,
        fontWeight:    700,
        fontSize:      'clamp(1.4rem, 2.2vw, 1.8rem)',
        lineHeight:    1,
        color:         'rgba(255,255,255,0.92)',
        letterSpacing: '-0.02em',
      }}>
        {fmtValue(data.facturacion_mes_actual_acumulada)}
      </div>

      {/* Arrow + percentage */}
      <span style={{ fontFamily: FONT_VALUE, fontSize: '0.8rem', fontWeight: 600, color }}>
        {arrow(pct)} {fmtPctSigned(pct)}
      </span>

      {/* Comparison row */}
      <div style={{
        fontFamily:     FONT_LABEL,
        fontSize:       '0.62rem',
        letterSpacing:  '0.08em',
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
      }}>
        <span style={{ color: MUTED }}>vs mismo período mes ant.</span>
        {data.facturacion_mismo_periodo_mes_anterior !== null && (
          <span style={{ color: 'rgba(255,255,255,0.45)' }}>
            {fmtValue(data.facturacion_mismo_periodo_mes_anterior)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export const FacturacionMesWidget = createWidget({
  config,
  renderContent,
  skeletonLines: [1, 2, 3, 4],
})
