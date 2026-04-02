'use client'

import { useAuth }          from '@/hooks/useAuth'
import { OwnerDashboard }   from '@/src/components/dashboard/OwnerDashboard'

// Widget system (in progress — not ready for production):
// import { DashboardFiltersProvider } from '@/src/context/dashboard-filters'
// import { DashboardShell, DashboardShellSkeleton } from '@/src/components/dashboard/DashboardShell'

export default function OwnerDashboardPage() {
  const { user, isLoading } = useAuth()

  const locationId = user?.activeMembership?.location_id ?? ''

  if (isLoading) return null

  return <OwnerDashboard locationId={locationId} />
}
