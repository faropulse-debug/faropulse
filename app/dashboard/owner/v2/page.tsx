'use client'

import { useAuth }                  from '@/hooks/useAuth'
import { DashboardFiltersProvider } from '@/src/context/dashboard-filters'
import { DashboardShell }           from '@/src/components/dashboard/DashboardShell'

const FONT_LABEL = "var(--font-dm-mono), monospace"
const MUTED      = 'rgba(255,255,255,0.35)'

export default function OwnerDashboardV2() {
  const { user, isLoading } = useAuth()

  const DEV_FALLBACK_LOCATION_ID = 'bbbbbbbb-0000-0000-0000-000000000001'
  const isDev = process.env.NODE_ENV === 'development'

  const locationId =
    user?.activeMembership?.location_id ??
    (isDev ? DEV_FALLBACK_LOCATION_ID : null)
  const orgName = user?.activeMembership?.organization?.name ?? 'Dashboard'

  if (isLoading && !isDev) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'rgba(255,255,255,0.3)',
        fontFamily: "var(--font-dm-mono), monospace",
        fontSize: '0.75rem', letterSpacing: '0.15em',
      }}>
        cargando sesión…
      </div>
    )
  }

  if (!locationId) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'rgba(255,255,255,0.3)',
        fontFamily: "var(--font-dm-mono), monospace",
        fontSize: '0.75rem', letterSpacing: '0.15em',
      }}>
        sin ubicación activa
      </div>
    )
  }

  return (
    <DashboardFiltersProvider>
      <div style={{ padding: '32px 24px', maxWidth: '1280px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            fontFamily:    FONT_LABEL,
            fontSize:      '0.58rem',
            fontWeight:    500,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color:         MUTED,
          }}>
            {orgName}
          </div>
          <div style={{
            fontFamily:    FONT_LABEL,
            fontSize:      '0.52rem',
            letterSpacing: '0.14em',
            color:         'rgba(255,255,255,0.18)',
            marginTop:     '4px',
          }}>
            widget system v2
          </div>
        </div>

        {/* Widget grid */}
        <DashboardShell locationId={locationId} />

</div>
    </DashboardFiltersProvider>
  )
}
