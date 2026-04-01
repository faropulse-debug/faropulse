'use client'

import type { ReactNode } from 'react'

// ─── Design tokens (shared with OwnerDashboard) ───────────────────────────────

const BG_CARD    = '#111114'
const BORDER     = 'rgba(255,255,255,0.07)'
const MUTED      = 'rgba(255,255,255,0.35)'
const FONT_LABEL = "var(--font-dm-mono), monospace"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WidgetCardProps {
  title:       string
  children:    ReactNode
  /** Optional action element rendered top-right (e.g. refresh button) */
  action?:     ReactNode
  /** Hides the header — useful for full-bleed chart widgets */
  hideHeader?: boolean
  /** Extra inline styles on the outer container */
  style?:      React.CSSProperties
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WidgetCard({ title, children, action, hideHeader = false, style }: WidgetCardProps) {
  return (
    <div style={{
      position:      'relative',
      background:    BG_CARD,
      border:        `1px solid ${BORDER}`,
      borderRadius:  '14px',
      padding:       '20px 18px 18px',
      display:       'flex',
      flexDirection: 'column',
      gap:           '16px',
      overflow:      'hidden',
      ...style,
    }}>
      {!hideHeader && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontFamily:    FONT_LABEL,
            fontSize:      '0.6rem',
            fontWeight:    500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color:         MUTED,
          }}>
            {title}
          </span>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
