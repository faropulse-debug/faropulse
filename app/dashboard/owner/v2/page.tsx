'use client'

import { useState }                     from 'react'
import Link                              from 'next/link'
import { useAuth }                       from '@/hooks/useAuth'
import { DashboardFiltersProvider }      from '@/src/context/dashboard-filters'
import { DashboardDataProvider }         from '@/providers/DashboardDataProvider'
import { WidgetError }                   from '@/src/components/widgets'
import {
  getEnabledWidgets,
  type WidgetCategory,
  type WidgetConfig,
} from '@/src/lib/widget-registry'

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabKey = 'resumen' | 'pnl' | 'operacion' | 'inversion'

const TABS: { key: TabKey; label: string; categories: WidgetCategory[] }[] = [
  { key: 'resumen',   label: 'Resumen',   categories: ['kpi', 'alert'] },
  { key: 'pnl',       label: 'P&L',       categories: ['financial']    },
  { key: 'operacion', label: 'Operación', categories: ['diagnostic']   },
  { key: 'inversion', label: 'Inversión', categories: ['investment']   },
]

// ─── Design tokens ────────────────────────────────────────────────────────────

const FONT_MONO  = "var(--font-dm-mono), monospace"
const FONT_SYNE  = "'Syne', sans-serif"
const AMBER      = '#f5820a'
const MUTED      = 'rgba(255,255,255,0.35)'

// ─── WidgetSlot ───────────────────────────────────────────────────────────────

function WidgetSlot({ widget, locationId }: { widget: WidgetConfig; locationId: string }) {
  const { component: Widget, title, gridSpan, id } = widget
  return (
    <div
      className="widget-slot"
      data-widget-id={id}
      style={{ gridColumn: `span ${gridSpan.mobile}` }}
    >
      <WidgetError widgetName={title}>
        <Widget locationId={locationId} />
      </WidgetError>
      <style>{`
        @media (min-width: 640px)  { [data-widget-id="${id}"] { grid-column: span ${gridSpan.tablet  ?? 6}; } }
        @media (min-width: 1024px) { [data-widget-id="${id}"] { grid-column: span ${gridSpan.desktop ?? 4}; } }
      `}</style>
    </div>
  )
}

// ─── TabContent ───────────────────────────────────────────────────────────────

function TabContent({ categories, locationId }: { categories: WidgetCategory[]; locationId: string }) {
  const widgets = getEnabledWidgets().filter(w => categories.includes(w.category))

  if (widgets.length === 0) {
    return (
      <div style={{
        padding: '60px 0', textAlign: 'center',
        fontFamily: FONT_MONO, fontSize: '0.7rem',
        color: MUTED, letterSpacing: '0.14em',
      }}>
        Sin widgets para esta sección.
      </div>
    )
  }

  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gap:                 '16px',
    }}>
      {widgets.map(w => (
        <WidgetSlot key={w.id} widget={w} locationId={locationId} />
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OwnerDashboardV2() {
  const { user, isLoading, error: authError, locationId } = useAuth()
  const [activeTab, setActiveTab] = useState<TabKey>('resumen')

  const isDev   = process.env.NODE_ENV === 'development'
  const orgName = user?.activeMembership?.organization?.name ?? 'Dashboard'

  console.log('[DIAG:owner/v2] render', {
    isLoading,
    authError,
    hasUser: Boolean(user),
    activeMembership: user?.activeMembership?.id ?? null,
    activeMembershipOrg: user?.activeMembership?.org_id ?? null,
    locationId,
    memberships: user?.memberships.map(m => ({
      id: m.id,
      org_id: m.org_id,
      role: m.role,
      location_id: m.location_id ?? null,
    })) ?? null,
  })

  if (isLoading && !isDev) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: MUTED,
        fontFamily: FONT_MONO, fontSize: '0.75rem', letterSpacing: '0.15em',
      }}>
        cargando sesión…
      </div>
    )
  }

  if (!locationId) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: MUTED,
        fontFamily: FONT_MONO, fontSize: '0.75rem', letterSpacing: '0.15em',
      }}>
        {authError ?? 'sin ubicación activa'}
      </div>
    )
  }

  const currentTab = TABS.find(t => t.key === activeTab)!

  return (
    <DashboardFiltersProvider>
    <DashboardDataProvider locationId={locationId}>
      <div style={{ padding: '32px 24px', maxWidth: '1280px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            fontFamily: FONT_MONO, fontSize: '0.58rem', fontWeight: 500,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED,
          }}>
            {orgName}
          </div>
          <div style={{
            fontFamily: FONT_MONO, fontSize: '0.52rem',
            letterSpacing: '0.14em', color: 'rgba(255,255,255,0.18)', marginTop: '4px',
          }}>
            widget system v2
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display:      'flex',
          gap:          '4px',
          marginBottom: '28px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          paddingBottom: '0',
        }}>
          {TABS.map(tab => {
            const isActive = tab.key === activeTab
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding:       '10px 20px',
                  fontSize:      '0.75rem',
                  fontFamily:    FONT_SYNE,
                  fontWeight:    isActive ? 700 : 400,
                  letterSpacing: '0.04em',
                  color:         isActive ? AMBER : MUTED,
                  background:    'transparent',
                  border:        'none',
                  borderBottom:  isActive ? `2px solid ${AMBER}` : '2px solid transparent',
                  marginBottom:  '-1px',
                  cursor:        'pointer',
                  transition:    'color 0.15s, border-color 0.15s',
                  whiteSpace:    'nowrap',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Reconcile shortcut */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
          <Link href="/dashboard/reconcile" style={{
            fontFamily: FONT_MONO, fontSize: '0.58rem', letterSpacing: '0.14em',
            textTransform: 'uppercase', color: MUTED, textDecoration: 'none',
            padding: '5px 10px', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '6px', transition: 'color 0.15s, border-color 0.15s',
          }}>
            Reconciliar vs CucinaGo →
          </Link>
        </div>

        {/* Content */}
        <TabContent categories={currentTab.categories} locationId={locationId} />

      </div>
    </DashboardDataProvider>
    </DashboardFiltersProvider>
  )
}
