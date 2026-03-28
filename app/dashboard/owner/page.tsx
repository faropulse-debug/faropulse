'use client'

import { useEffect } from 'react'
import { useAuth }          from '@/hooks/useAuth'
import { OwnerDashboard }   from '@/src/components/dashboard/OwnerDashboard'
import { logger }           from '@/lib/logger'

export default function OwnerDashboardPage() {
  const { user, isLoading } = useAuth()

  const locationId = user?.activeMembership?.location_id ?? ''

  useEffect(() => {
    if (!isLoading && !locationId) {
      logger.warn('[OwnerDashboardPage] locationId vacío — auth aún resolviendo o membership sin location')
    }
  }, [isLoading, locationId])

  if (isLoading) {
    return <PageShell><LoadingState label="Cargando sesión..." /></PageShell>
  }

  if (!locationId) {
    return <PageShell><LoadingState label="Configurando datos..." /></PageShell>
  }

  return (
    <PageShell>
      <OwnerDashboard locationId={locationId} />
    </PageShell>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{
      minHeight:   '100vh',
      background:  '#0C0C0F',
      padding:     'clamp(16px, 4vw, 40px)',
      boxSizing:   'border-box',
    }}>
      {children}
    </main>
  )
}

// ─── Loading / empty state ────────────────────────────────────────────────────

function LoadingState({ label }: { label: string }) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      minHeight:      '60vh',
      fontFamily:     "var(--font-dm-mono), monospace",
      fontSize:       '0.75rem',
      letterSpacing:  '0.18em',
      textTransform:  'uppercase',
      color:          'rgba(255,255,255,0.3)',
    }}>
      {label}
    </div>
  )
}
