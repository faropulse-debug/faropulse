'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { type VentaCanal }      from '@/src/lib/canal-helpers'
import { type VentaFamilia }    from '@/src/lib/familia-helpers'
import { type VentaDiaSemana }  from '@/src/lib/dia-semana-helpers'

export type { VentaCanal, VentaFamilia, VentaDiaSemana }

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
  ventasDiarias:      VentaDiaria[]
  ventasSemanales:    VentaSemanal[]
  ventasMensuales:    VentaMensual[]
  financialResults:   FinancialResult[]
  ventasPorCanal:     VentaCanal[]
  ventasPorFamilia:   VentaFamilia[]
  ventasPorDiaSemana: VentaDiaSemana[]
}

interface UseDashboardDataReturn {
  data:        DashboardData | null
  isLoading:   boolean
  error:       string | null
  lastUpdated: Date | null
  refetch:     () => void
}

// Extracts an array from a settled RPC result; logs a warning on any failure
// so the rest of the dashboard keeps rendering with the data that did load.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeArr<T = any>(result: PromiseSettledResult<any>, name: string): T[] {
  if (result.status === 'rejected') {
    logger.warn(`[useDashboardData] ${name} rejected:`, result.reason)
    return []
  }
  if (result.value?.error) {
    logger.warn(`[useDashboardData] ${name} error:`, result.value.error.message)
    return []
  }
  return (result.value?.data ?? []) as T[]
}

export function useDashboardData(locationId: string): UseDashboardDataReturn {
  const [data,        setData]        = useState<DashboardData | null>(null)
  const [isLoading,   setIsLoading]   = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    logger.debug('[useDashboardData] locationId:', locationId)
    if (!locationId) {
      logger.debug('[useDashboardData] locationId vacío — esperando useAuth')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)

    try {
      // allSettled: each RPC resolves independently — one failure never kills the rest.
      const results = await Promise.allSettled([
        getSupabase().rpc('get_ventas_semana',          { p_location_id: locationId }),
        getSupabase().rpc('get_ventas_semanales',       { p_location_id: locationId }),
        getSupabase().rpc('get_ventas_mensuales',       { p_location_id: locationId }),
        getSupabase().rpc('get_financial_results',      { p_location_id: locationId }),
        getSupabase().rpc('get_ventas_por_canal',       { p_location_id: locationId }),
        getSupabase().rpc('get_ventas_por_familia',     { p_location_id: locationId }),
        getSupabase().rpc('get_ventas_por_dia_semana',  { p_location_id: locationId }),
      ])

      setData({
        ventasDiarias:      safeArr<VentaDiaria>     (results[0], 'get_ventas_semana'),
        ventasSemanales:    safeArr<VentaSemanal>    (results[1], 'get_ventas_semanales'),
        ventasMensuales:    safeArr<VentaMensual>    (results[2], 'get_ventas_mensuales'),
        financialResults:   safeArr<FinancialResult> (results[3], 'get_financial_results'),
        ventasPorCanal:     safeArr<VentaCanal>      (results[4], 'get_ventas_por_canal'),
        ventasPorFamilia:   safeArr<VentaFamilia>    (results[5], 'get_ventas_por_familia'),
        ventasPorDiaSemana: safeArr<VentaDiaSemana>  (results[6], 'get_ventas_por_dia_semana'),
      })
      setLastUpdated(new Date())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      logger.error('[useDashboardData] unexpected error:', msg)
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [locationId])

  useEffect(() => { load() }, [load])

  return { data, isLoading, error, lastUpdated, refetch: load }
}
