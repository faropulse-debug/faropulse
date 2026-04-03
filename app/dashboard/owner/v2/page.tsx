'use client'

import { useAuth }                  from '@/hooks/useAuth'
import { DashboardFiltersProvider } from '@/src/context/dashboard-filters'
import { DashboardShell }           from '@/src/components/dashboard/DashboardShell'

const FONT_LABEL = "var(--font-dm-mono), monospace"
const MUTED      = 'rgba(255,255,255,0.35)'

export default function OwnerDashboardV2() {
  const { user } = useAuth()

  // TODO: remover fallback cuando auth esté integrada en v2
  const DEV_FALLBACK_LOCATION_ID = 'e5931742-8249-4d0d-a028-7f1d65b10857' // piloto (mismo default que DashboardFiltersContext)
  const locationId = user?.activeMembership?.location_id || DEV_FALLBACK_LOCATION_ID
  const orgName    = user?.activeMembership?.organization?.name ?? 'Dashboard'

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
