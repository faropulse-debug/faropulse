'use client'

import { useEffect } from 'react'
import { useAuth }                  from '@/hooks/useAuth'
import { DashboardFiltersProvider } from '@/src/context/dashboard-filters'
import { DashboardShell, DashboardShellSkeleton } from '@/src/components/dashboard/DashboardShell'
import { logger }                   from '@/lib/logger'

// OwnerDashboard kept as reference during widget system migration:
// import { OwnerDashboard } from '@/src/components/dashboard/OwnerDashboard'

export default function OwnerDashboardPage() {
  const { user, isLoading } = useAuth()

  const locationId = user?.activeMembership?.location_id ?? ''

  useEffect(() => {
    if (!isLoading && !locationId) {
      logger.warn('[OwnerDashboardPage] locationId vacío — auth aún resolviendo o membership sin location')
    }
  }, [isLoading, locationId])

  if (isLoading) {
    return <PageShell><DashboardShellSkeleton /></PageShell>
  }

  return (
    <DashboardFiltersProvider>
      <PageShell>
        <DashboardShell locationId={locationId} />
      </PageShell>
    </DashboardFiltersProvider>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{
      minHeight:  '100vh',
      background: '#0C0C0F',
      padding:    'clamp(16px, 4vw, 40px)',
      boxSizing:  'border-box',
    }}>
      {children}
    </main>
  )
}
