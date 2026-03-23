'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export interface VentaDiaria {
  fecha:      string
  ventas:     number
  tickets:    number
  comensales: number
}

export interface VentaSemanal {
  semana:     string
  ventas:     number
  tickets:    number
  comensales: number
}

export interface VentaMensual {
  mes:        string
  ventas:     number
  tickets:    number
  comensales: number
}

export interface FinancialResult {
  periodo:   string
  categoria: string
  concepto:  string
  monto:     number
}

export interface DashboardData {
  ventasDiarias:    VentaDiaria[]
  ventasSemanales:  VentaSemanal[]
  ventasMensuales:  VentaMensual[]
  financialResults: FinancialResult[]
}

interface UseDashboardDataReturn {
  data:        DashboardData | null
  isLoading:   boolean
  error:       string | null
  lastUpdated: Date | null
  refetch:     () => void
}

export function useDashboardData(locationId: string): UseDashboardDataReturn {
  const [data,        setData]        = useState<DashboardData | null>(null)
  const [isLoading,   setIsLoading]   = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    if (!locationId) {
      logger.warn('[useDashboardData] locationId vacío — datos no disponibles')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)

    try {
      const [diarias, semanales, mensuales, financiales] = await Promise.all([
        getSupabase().rpc('get_ventas_semana',     { p_location_id: locationId }),
        getSupabase().rpc('get_ventas_semanales',  { p_location_id: locationId }),
        getSupabase().rpc('get_ventas_mensuales',  { p_location_id: locationId }),
        getSupabase().rpc('get_financial_results', { p_location_id: locationId }),
      ])

      if (diarias.error)     throw new Error(`get_ventas_semana: ${diarias.error.message}`)
      if (semanales.error)   throw new Error(`get_ventas_semanales: ${semanales.error.message}`)
      if (mensuales.error)   throw new Error(`get_ventas_mensuales: ${mensuales.error.message}`)
      if (financiales.error) throw new Error(`get_financial_results: ${financiales.error.message}`)

      setData({
        ventasDiarias:    diarias.data    ?? [],
        ventasSemanales:  semanales.data  ?? [],
        ventasMensuales:  mensuales.data  ?? [],
        financialResults: financiales.data ?? [],
      })
      setLastUpdated(new Date())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [locationId])

  useEffect(() => { load() }, [load])

  return { data, isLoading, error, lastUpdated, refetch: load }
}
