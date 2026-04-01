'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { logger } from '@/lib/logger'

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG_CARD    = '#111114'
const BORDER     = 'rgba(255,255,255,0.07)'
const RED        = '#EF4444'
const FONT_LABEL = "var(--font-dm-mono), monospace"
const FONT_VALUE = "var(--font-syne), sans-serif"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  children:    ReactNode
  /** Widget name shown in the error fallback UI */
  widgetName?: string
}

interface State {
  hasError: boolean
  message:  string
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

export class WidgetError extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return { hasError: true, message }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const name = this.props.widgetName ?? 'widget'
    logger.error(`[WidgetError] ${name} crashed:`, error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '' })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const name = this.props.widgetName ?? 'Widget'

    return (
      <div style={{
        background:     BG_CARD,
        border:         `1px solid ${RED}33`,
        borderRadius:   '14px',
        padding:        '24px 20px',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '12px',
        textAlign:      'center',
      }}>
        <span style={{ fontSize: '1.4rem' }}>⚠</span>

        <div>
          <div style={{ fontFamily: FONT_VALUE, fontWeight: 600, fontSize: '0.85rem', color: RED, marginBottom: '4px' }}>
            {name}
          </div>
          <div style={{ fontFamily: FONT_LABEL, fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em', maxWidth: '200px' }}>
            {this.state.message}
          </div>
        </div>

        <button
          onClick={this.handleRetry}
          style={{
            fontFamily:    FONT_LABEL,
            fontSize:      '0.58rem',
            fontWeight:    500,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color:         RED,
            background:    `${RED}15`,
            border:        `1px solid ${RED}44`,
            borderRadius:  '8px',
            padding:       '6px 14px',
            cursor:        'pointer',
          }}
        >
          Reintentar
        </button>
      </div>
    )
  }
}
