'use client'

import {
  AMBER, GLOW_MAP,
  FONT_VALUE, FONT_LABEL, MUTED,
  semColor, arrow, fmtValue, fmtPctSigned,
} from '../widget-tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KpiPresetProps {
  value:      number | null
  variation:  number | null
  compLabel:  string
  compValue:  number | null
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

// ─── Component ────────────────────────────────────────────────────────────────

export function KpiPreset({ value, variation, compLabel, compValue }: KpiPresetProps) {
  const color = semColor(variation)

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      gap:           '10px',
      boxShadow:     `0 0 24px ${GLOW_MAP[color] ?? GLOW_MAP[AMBER]}`,
    }}>
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
        {fmtValue(value)}
      </div>

      {/* Arrow + percentage */}
      <span style={{
        fontFamily: FONT_VALUE,
        fontSize:   '0.8rem',
        fontWeight: 600,
        color,
      }}>
        {arrow(variation)} {fmtPctSigned(variation)}
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
        <span style={{ color: MUTED }}>{compLabel}</span>
        {compValue !== null && (
          <span style={{ color: 'rgba(255,255,255,0.45)' }}>
            {fmtValue(compValue)}
          </span>
        )}
      </div>
    </div>
  )
}
