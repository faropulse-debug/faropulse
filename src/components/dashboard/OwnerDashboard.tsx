'use client'

import { useDashboardKpis } from '@/src/hooks/useDashboardKpis'
import { fmtMillones, fmtPct } from '@/lib/format'
import type { FacturacionKpis, ProyeccionesKpis } from '@/src/types/dashboard'

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG_CARD    = '#111114'
const BORDER     = 'rgba(255,255,255,0.07)'
const GREEN      = '#10B981'
const RED        = '#EF4444'
const AMBER      = '#F59E0B'
const MUTED      = 'rgba(255,255,255,0.35)'
const FONT_VALUE = "var(--font-syne), sans-serif"
const FONT_LABEL = "var(--font-dm-mono), monospace"

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

// ─── Progress bar ────────────────────────────────────────────────────────────

const TRACK = '#1F1F26'

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100)
  return (
    <div style={{
      width:        '100%',
      height:       '6px',
      background:   TRACK,
      borderRadius: '99px',
      overflow:     'hidden',
    }}>
      <div style={{
        width:        `${clamped}%`,
        height:       '100%',
        borderRadius: '99px',
        background:   `linear-gradient(90deg, ${AMBER}, #FF9500)`,
        transition:   'width 0.6s ease',
      }} />
    </div>
  )
}

// ─── Proyección card (lineal / ponderada) ─────────────────────────────────────

interface ProyCardProps {
  label:    string
  subLabel: string
  acum:     number | null
  proy:     number | null
  varPct:   number | null
}

function ProyCard({ label, subLabel, acum, proy, varPct }: ProyCardProps) {
  const progressPct = acum !== null && proy !== null && proy > 0
    ? (acum / proy) * 100
    : 0
  const color = semColor(varPct)
  const glow  = color === GREEN ? 'rgba(16,185,129,0.10)'
              : color === RED   ? 'rgba(239,68,68,0.10)'
              : 'rgba(245,158,11,0.10)'

  return (
    <div style={{
      position:      'relative',
      background:    BG_CARD,
      border:        `1px solid ${BORDER}`,
      borderRadius:  '14px',
      padding:       '20px 18px 18px',
      display:       'flex',
      flexDirection: 'column',
      gap:           '12px',
      boxShadow:     `0 0 24px ${glow}`,
      overflow:      'hidden',
    }}>
      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: AMBER, opacity: 0.8 }} />

      {/* Label */}
      <span style={{ fontFamily: FONT_LABEL, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: MUTED }}>
        {label}
      </span>

      {/* Projected value */}
      <div style={{ fontFamily: FONT_VALUE, fontWeight: 700, fontSize: 'clamp(1.4rem, 2.2vw, 1.8rem)', lineHeight: 1, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.02em' }}>
        {formatValue(proy)}
      </div>

      {/* Progress bar + pct */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <ProgressBar pct={progressPct} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONT_LABEL, fontSize: '0.6rem', color: AMBER, letterSpacing: '0.06em' }}>
            {progressPct.toFixed(1)}% completado
          </span>
          <span style={{ fontFamily: FONT_VALUE, fontSize: '0.75rem', fontWeight: 600, color }}>
            {arrow(varPct)} {formatPct(varPct)}
          </span>
        </div>
      </div>

      {/* Acum vs proy */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT_LABEL, fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em' }}>
        <span>acum. {formatValue(acum)}</span>
        <span>{subLabel}</span>
      </div>
    </div>
  )
}

// ─── Meta / desvío card ───────────────────────────────────────────────────────

interface MetaCardProps {
  metaIgualar:  number | null
  metaPlus10:   number | null
  ritmoActual:  number | null
}

function MetaCard({ metaIgualar, metaPlus10, ritmoActual }: MetaCardProps) {
  const superaMeta   = ritmoActual !== null && metaIgualar !== null && ritmoActual >= metaIgualar
  const badgeColor   = superaMeta ? GREEN : RED
  const badgeBg      = superaMeta ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'
  const badgeLabel   = superaMeta ? 'En ritmo' : 'Por debajo'

  const rows: { label: string; value: number | null; highlight?: boolean }[] = [
    { label: 'Meta igualar mes ant.',  value: metaIgualar },
    { label: 'Meta +10%',             value: metaPlus10 },
    { label: 'Ritmo diario actual',   value: ritmoActual, highlight: true },
  ]

  return (
    <div style={{
      position:      'relative',
      background:    BG_CARD,
      border:        `1px solid ${BORDER}`,
      borderRadius:  '14px',
      padding:       '20px 18px 18px',
      display:       'flex',
      flexDirection: 'column',
      gap:           '14px',
      overflow:      'hidden',
    }}>
      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: badgeColor, opacity: 0.8 }} />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: FONT_LABEL, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: MUTED }}>
          META VS DESVÍO
        </span>
        <span style={{
          fontFamily:    FONT_LABEL,
          fontSize:      '0.58rem',
          fontWeight:    600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          color:         badgeColor,
          background:    badgeBg,
          padding:       '3px 8px',
          borderRadius:  '99px',
          border:        `1px solid ${badgeColor}33`,
        }}>
          {badgeLabel}
        </span>
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.map(row => (
          <div key={row.label} style={{
            display:       'flex',
            justifyContent:'space-between',
            alignItems:    'center',
            padding:       row.highlight ? '8px 10px' : '0',
            background:    row.highlight ? 'rgba(255,255,255,0.04)' : 'transparent',
            borderRadius:  row.highlight ? '8px' : '0',
            border:        row.highlight ? `1px solid ${BORDER}` : 'none',
          }}>
            <span style={{ fontFamily: FONT_LABEL, fontSize: '0.62rem', color: row.highlight ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>
              {row.label}
            </span>
            <span style={{ fontFamily: FONT_VALUE, fontWeight: row.highlight ? 700 : 500, fontSize: row.highlight ? '0.95rem' : '0.82rem', color: row.highlight ? badgeColor : 'rgba(255,255,255,0.7)' }}>
              {formatValue(row.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Bloque 8 — Proyecciones ──────────────────────────────────────────────────

function Bloque8({ proyecciones, loading }: { proyecciones: ProyeccionesKpis | null; loading: boolean }) {
  return (
    <section style={{ marginTop: '32px' }}>
      <div style={{ fontFamily: FONT_LABEL, fontSize: '0.62rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: MUTED, marginBottom: '16px' }}>
        Bloque 8 — Proyecciones
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }} className="proy-grid">
        {loading || !proyecciones ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <ProyCard
              label="PROYECCIÓN LINEAL"
              subLabel="proyección mes"
              acum={proyecciones.fact_acum}
              proy={proyecciones.proy_lineal}
              varPct={proyecciones.proy_lineal_var_pct}
            />
            <ProyCard
              label="PROYECCIÓN PONDERADA"
              subLabel="proyección mes"
              acum={proyecciones.fact_acum}
              proy={proyecciones.proy_ponderada}
              varPct={proyecciones.proy_ponderada_var_pct}
            />
            <MetaCard
              metaIgualar={proyecciones.meta_diaria_igualar}
              metaPlus10={proyecciones.meta_diaria_plus10}
              ritmoActual={proyecciones.ritmo_diario_actual}
            />
          </>
        )}
      </div>
    </section>
  )
}

// ─── Owner Dashboard ─────────────────────────────────────────────────────────

interface Props {
  locationId: string
}

export function OwnerDashboard({ locationId }: Props) {
  const { facturacion, proyecciones, loading, error } = useDashboardKpis(locationId)

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

      <Bloque8 proyecciones={proyecciones} loading={loading} />

      {/* Responsive grid styles + skeleton pulse */}
      <style>{`
        @media (min-width: 1024px) {
          .kpi-grid  { grid-template-columns: repeat(5, 1fr) !important; }
          .proy-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (min-width: 640px) and (max-width: 1023px) {
          .kpi-grid  { grid-template-columns: repeat(3, 1fr) !important; }
          .proy-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.9; }
        }
      `}</style>
    </section>
  )
}
