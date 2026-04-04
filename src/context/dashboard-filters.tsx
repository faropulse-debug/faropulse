'use client'

import React from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompareMode = 'vs_prev_month' | 'vs_prev_year'

export type DashboardFilters = {
  locationId:     string
  /** ISO date del lunes de la semana de referencia */
  weekReference:  string
  /** ISO date del primer día del mes de referencia */
  monthReference: string
  compareMode:    CompareMode
  channel?:       ('SALON' | 'APLICACIONES' | 'MOSTRADOR')[]
}

/** Lo que cada widget declara sobre los filtros que soporta */
export type WidgetFilterSupport = {
  required: (keyof DashboardFilters)[]
  optional: (keyof DashboardFilters)[]
  ignored:  (keyof DashboardFilters)[]
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

function getMondayOfCurrentWeek(): string {
  const today = new Date()
  const day = today.getDay() // 0=sun, 1=mon ... 6=sat
  const diff = day === 0 ? -6 : 1 - day  // retroceder al lunes
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  return monday.toISOString().slice(0, 10)
}

function getFirstDayOfCurrentMonth(): string {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().slice(0, 10)
}

const DEFAULT_FILTERS: DashboardFilters = {
  locationId:     'e5931742-8249-4d0d-a028-7f1d65b10857',
  weekReference:  getMondayOfCurrentWeek(),
  monthReference: getFirstDayOfCurrentMonth(),
  compareMode:    'vs_prev_month',
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface DashboardFiltersContextValue {
  filters:    DashboardFilters
  setFilters: (partial: Partial<DashboardFilters>) => void
}

export const DashboardFiltersContext = React.createContext<DashboardFiltersContextValue>({
  filters:    DEFAULT_FILTERS,
  setFilters: () => {},
})

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DashboardFiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFiltersState] = React.useState<DashboardFilters>(DEFAULT_FILTERS)

  const setFilters = (partial: Partial<DashboardFilters>) =>
    setFiltersState(prev => ({ ...prev, ...partial }))

  return (
    <DashboardFiltersContext.Provider value={{ filters, setFilters }}>
      {children}
    </DashboardFiltersContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useDashboardFilters = () => React.useContext(DashboardFiltersContext)
