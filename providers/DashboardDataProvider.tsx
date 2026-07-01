'use client'

import { createContext, useContext } from 'react'
import { useDashboardData } from '@/hooks/useDashboardData'

type DashboardDataContextValue = ReturnType<typeof useDashboardData>

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null)

export function DashboardDataProvider({
  locationId,
  children,
}: {
  locationId: string
  children: React.ReactNode
}) {
  const value = useDashboardData(locationId)
  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  )
}

export function useDashboardDataCtx(): DashboardDataContextValue {
  const ctx = useContext(DashboardDataContext)
  if (!ctx) throw new Error('useDashboardDataCtx must be used inside <DashboardDataProvider>')
  return ctx
}
