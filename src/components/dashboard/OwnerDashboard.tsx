'use client'

import { useDashboardKpis } from '@/src/hooks/useDashboardKpis'
import { fmtMillones, fmtPct } from '@/lib/format'
import type { FacturacionKpis } from '@/src/types/dashboard'

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG_CARD    = '#111114'
const BORDER     = 'rgba(255,255,255,0.07)'
const GREEN      = '#10B981'
const RED        = '#EF4444'
const AMBER      = '#F59E0B'
const MUTED      = 'rgba(255,255,255,0.35)'
const FONT_VALUE = "'Syne', sans-serif"
const FONT_LABEL = "'DM Mono', monospace"

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatValue(v: number | null): string {
  if (v === null) return '—'
  return fmtMillones(v)
}

function formatPct(v: number | null): string {
  if (v === null) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${fmtPct(v)}`
}

// ─── KPI card config ─────────────────────────────────────────────────────────

interface CardConfig {
  label:      string
  compLabel:  string
  value:      number | null
  comp:       number | null
  pct:        number | null
}

function buildCards(d: FacturacionKpis): CardConfig[] {
  return [
    {
      label:     'SEMANA ACTUAL',
      compLabel: 'vs sem. anterior',
      value:     d.fact_semana,
      comp:      d.fact_semana_comp,
      pct:       d.pct_var_semana,
    },
    {
      label:     'MES ACUMULADO',
      compLabel: 'vs mismo período mes ant.',
      value:     d.fact_mes_acum,
      comp:      d.fact_mes_comp,
      pct:       d.pct_var_mes,
    },
    {
      label:     'ÚLTIMO MES',
      compLabel: 'vs mes anterior',
      value:     d.fact_ult_mes,
      comp:      d.fact_ante_mes,
      pct:       d.pct_var_ult_mes,
    },
    {
      label:     'PROM. DIARIO',
      compLabel: 'vs sem. anterior',
      value:     d.prom_diario_semana,
      comp:      d.prom_diario_comp,
      pct:       d.pct_var_prom_diario,
    },
    {
      label:     'ROLLING 28D',
      compLabel: 'vs período anterior',
      value:     d.fact_rolling,
      comp:      d.fact_rolling_comp,
      pct:       d.pct_var_rolling,
    },
  ]
}

// ─── Single KPI card ─────────────────────────────────────────────────────────

function KpiCard({ label, compLabel, value, comp, pct }: CardConfig) {
  const color = semColor(pct)
  const glow  = color === GREEN ? 'rgba(16,185,129,0.12)'
              : color === RED   ? 'rgba(239,68,68,0.12)'
              : 'rgba(245,158,11,0.12)'

  return (
    <div style={{
      position:      'relative',
      background:    BG_CARD,
      border:        `1px solid ${BORDER}`,
      borderRadius:  '14px',
      padding:       '20px 18px 16px',
      display:       'flex',
      flexDirection: 'column',
      gap:           '10px',
      boxShadow:     `0 0 24px ${glow}`,
      overflow:      'hidden',
    }}>
      {/* Top color bar */}
      <div style={{
        position:   'absolute',
        top:        0,
        left:       0,
        right:      0,
        height:     '3px',
        background: color,
        opacity:    0.85,
      }} />

      {/* Label */}
      <span style={{
        fontFamily:    FONT_LABEL,
        fontSize:      '0.6rem',
        fontWeight:    500,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color:         MUTED,
      }}>
        {label}
      </span>

      {/* Main value */}
      <div style={{
        fontFamily:    FONT_VALUE,
        fontWeight:    700,
        fontSize:      'clamp(1.4rem, 2.2vw, 1.8rem)',
        lineHeight:    1,
        color:         'rgba(255,255,255,0.92)',
        letterSpacing: '-0.02em',
      }}>
        {formatValue(value)}
      </div>

      {/* Delta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          fontFamily: FONT_VALUE,
          fontSize:   '0.8rem',
          fontWeight: 600,
          color:      color,
        }}>
          {arrow(pct)} {formatPct(pct)}
        </span>
      </div>

      {/* Comparison text */}
      <div style={{
        fontFamily:    FONT_LABEL,
        fontSize:      '0.62rem',
        color:         'rgba(255,255,255,0.28)',
        letterSpacing: '0.08em',
        display:       'flex',
        justifyContent:'space-between',
        alignItems:    'center',
      }}>
        <span>{compLabel}</span>
        {comp !== null && (
          <span style={{ color: 'rgba(255,255,255,0.45)' }}>
            {formatValue(comp)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      background:   BG_CARD,
      border:       `1px solid ${BORDER}`,
      borderRadius: '14px',
      padding:      '20px 18px 16px',
      display:      'flex',
      flexDirection:'column',
      gap:          '12px',
    }}>
      {[{ w: '50%', h: '10px' }, { w: '70%', h: '28px' }, { w: '40%', h: '12px' }, { w: '60%', h: '10px' }]
        .map((s, i) => (
          <div key={i} style={{
            width:        s.w,
            height:       s.h,
            borderRadius: '6px',
            background:   'rgba(255,255,255,0.06)',
            animation:    'pulse 1.6s ease-in-out infinite',
          }} />
        ))}
    </div>
  )
}

// ─── Owner Dashboard ─────────────────────────────────────────────────────────

interface Props {
  locationId: string
}

export function OwnerDashboard({ locationId }: Props) {
  const { facturacion, loading, error } = useDashboardKpis(locationId)

  return (
    <section>
      {/* Section header */}
      <div style={{
        fontFamily:    FONT_LABEL,
        fontSize:      '0.62rem',
        fontWeight:    500,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color:         MUTED,
        marginBottom:  '16px',
      }}>
        Bloque 1 — Facturación
      </div>

      {/* 5-col grid */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap:                 '12px',
      }}
        className="kpi-grid"
      >
        {loading || !facturacion
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          : buildCards(facturacion).map(card => (
              <KpiCard key={card.label} {...card} />
            ))
        }
      </div>

      {error && (
        <p style={{
          fontFamily: FONT_LABEL,
          fontSize:   '0.7rem',
          color:      RED,
          marginTop:  '12px',
          letterSpacing: '0.06em',
        }}>
          Error al cargar KPIs: {error}
        </p>
      )}

      {/* Responsive grid styles + skeleton pulse */}
      <style>{`
        @media (min-width: 1024px) {
          .kpi-grid { grid-template-columns: repeat(5, 1fr) !important; }
        }
        @media (min-width: 640px) and (max-width: 1023px) {
          .kpi-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.9; }
        }
      `}</style>
    </section>
  )
}
