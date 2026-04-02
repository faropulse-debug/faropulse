'use client'

import { WidgetError, WidgetSkeleton } from '@/src/components/widgets'
import { getEnabledWidgets, type WidgetConfig } from '@/src/lib/widget-registry'

// ─── Design tokens ────────────────────────────────────────────────────────────

const MUTED      = 'rgba(255,255,255,0.2)'
const FONT_LABEL = "var(--font-dm-mono), monospace"

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardShellProps {
  locationId: string
}

// ─── Grid helpers ─────────────────────────────────────────────────────────────

/** Convert a 12-col span to a CSS grid-column value */
function colSpan(span: number): string {
  return `span ${span}`
}

// ─── Widget slot ─────────────────────────────────────────────────────────────

function WidgetSlot({ widget, locationId }: { widget: WidgetConfig; locationId: string }) {
  const { component: Widget, title, gridSpan } = widget

  return (
    <div
      className="widget-slot"
      data-widget-id={widget.id}
      style={{
        gridColumn: colSpan(gridSpan.mobile),
      }}
    >
      <WidgetError widgetName={title}>
        <Widget locationId={locationId} />
      </WidgetError>

      {/* Responsive column overrides injected per-widget */}
      <style>{`
        @media (min-width: 640px) {
          [data-widget-id="${widget.id}"] { grid-column: span ${gridSpan.tablet ?? 6}; }
        }
        @media (min-width: 1024px) {
          [data-widget-id="${widget.id}"] { grid-column: span ${gridSpan.desktop ?? 4}; }
        }
      `}</style>
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function DashboardShell({ locationId }: DashboardShellProps) {
  const widgets = getEnabledWidgets()

  if (!locationId) {
    return (
      <div style={{ fontFamily: FONT_LABEL, fontSize: '0.7rem', color: MUTED, padding: '40px 0', textAlign: 'center', letterSpacing: '0.14em' }}>
        Configurando datos...
      </div>
    )
  }

  if (widgets.length === 0) {
    return (
      <div style={{ fontFamily: FONT_LABEL, fontSize: '0.7rem', color: MUTED, padding: '40px 0', textAlign: 'center', letterSpacing: '0.14em' }}>
        No hay widgets habilitados.
      </div>
    )
  }

  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gap:                 '16px',
      width:               '100%',
    }}>
      {widgets.map(widget => (
        <WidgetSlot
          key={widget.id}
          widget={widget}
          locationId={locationId}
        />
      ))}
    </div>
  )
}

// ─── Loading shell (used by page.tsx Suspense / auth loading) ─────────────────

export function DashboardShellSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gap:                 '16px',
    }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ gridColumn: 'span 4' }}>
          <WidgetSkeleton />
        </div>
      ))}
    </div>
  )
}
