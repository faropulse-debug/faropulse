'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { type VentaCanal }      from '@/src/lib/canal-helpers'
import { type VentaFamilia }    from '@/src/lib/familia-helpers'
import { type VentaDiaSemana }  from '@/src/lib/dia-semana-helpers'
import { type VentaFranja }    from '@/src/lib/franja-helpers'
import { type RawComensalRow }  from '@/src/components/charts/ComensalesChart'
import { type RawTicketRow }    from '@/src/components/charts/TicketPromedioChart'

export type { VentaCanal, VentaFamilia, VentaDiaSemana, VentaFranja, RawComensalRow, RawTicketRow }

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
  ventasPorFranja:    VentaFranja[]
  comensalesFull:     RawComensalRow[]
  ticketPromedioFull: RawTicketRow[]
}

interface UseDashboardDataReturn {
  data:          DashboardData | null
  isLoading:     boolean
  isRefreshing:  boolean
  error:         string | null
  lastUpdated:   Date | null
  refetch:       () => void
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

// Detects PGRST301 (JWT expired) / HTTP 401 from a settled RPC result.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAuthError(result: PromiseSettledResult<any>): boolean {
  if (result.status !== 'fulfilled') return false
  const err = result.value?.error
  if (!err) return false
  return (
    err.code === 'PGRST301' ||
    err.status === 401 ||
    /jwt|expired|unauthorized/i.test(String(err.message ?? ''))
  )
}

// Runs all 10 RPCs concurrently — extracted so the load() function can retry on auth error.
function runAllRPCs(locationId: string) {
  return Promise.allSettled([
    getSupabase().rpc('get_ventas_semana',         { p_location_id: locationId }),
    getSupabase().rpc('get_ventas_semanales',      { p_location_id: locationId }),
    getSupabase().rpc('get_ventas_mensuales',      { p_location_id: locationId }),
    getSupabase().rpc('get_financial_results',     { p_location_id: locationId }),
    getSupabase().rpc('get_ventas_por_canal',      { p_location_id: locationId }),
    getSupabase().rpc('get_ventas_por_familia',    { p_location_id: locationId }),
    getSupabase().rpc('get_ventas_por_dia_semana', { p_location_id: locationId }),
    getSupabase().rpc('get_ventas_por_franja',     { p_location_id: locationId }),
    getSupabase().rpc('get_comensales_full',       { p_location_id: locationId }),
    getSupabase().rpc('get_ticket_promedio_full',  { p_location_id: locationId }),
  ])
}

export function useDashboardData(locationId: string): UseDashboardDataReturn {
  const [data,          setData]          = useState<DashboardData | null>(null)
  const [isLoading,     setIsLoading]     = useState(true)
  const [isRefreshing,  setIsRefreshing]  = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null)
  // Tracks which locationId produced the current `data` so we can distinguish
  // a first-load (no data yet) from a background refresh (stale data available).
  const loadedForRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    logger.debug('[useDashboardData] locationId:', locationId)
    if (!locationId) {
      logger.debug('[useDashboardData] locationId vacío — esperando useAuth')
      setIsLoading(false)
      return
    }
    if (loadedForRef.current === locationId) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setError(null)

    try {
      // allSettled: each RPC resolves independently — one failure never kills the rest.
      let results = await runAllRPCs(locationId)

      // Auto-recovery: if any RPC returned an auth error (JWT expired / 401),
      // call refreshSession() to force a new JWT from @supabase/ssr,
      // then retry once. If the retry also fails, safeArr logs warnings and returns [].
      if (results.some(isAuthError)) {
        logger.warn('[useDashboardData] auth error detectado — refresh de sesión + reintento')
        await getSupabase().auth.refreshSession()
        results = await runAllRPCs(locationId)
        if (results.some(isAuthError)) {
          logger.warn('[useDashboardData] reintento también falló — dejando estado vacío')
          setError('Se cortó la sesión. Recargá la página para volver a entrar.')
        }
      }

      setData({
        ventasDiarias:      safeArr<VentaDiaria>     (results[0], 'get_ventas_semana'),
        ventasSemanales:    safeArr<VentaSemanal>    (results[1], 'get_ventas_semanales'),
        ventasMensuales:    safeArr<VentaMensual>    (results[2], 'get_ventas_mensuales'),
        financialResults:   safeArr<FinancialResult> (results[3], 'get_financial_results'),
        ventasPorCanal:     safeArr<VentaCanal>      (results[4], 'get_ventas_por_canal'),
        ventasPorFamilia:   safeArr<VentaFamilia>    (results[5], 'get_ventas_por_familia'),
        ventasPorDiaSemana: safeArr<VentaDiaSemana>  (results[6], 'get_ventas_por_dia_semana'),
        ventasPorFranja:    safeArr<VentaFranja>     (results[7], 'get_ventas_por_franja'),
        comensalesFull:     safeArr<RawComensalRow>  (results[8], 'get_comensales_full'),
        ticketPromedioFull: safeArr<RawTicketRow>    (results[9], 'get_ticket_promedio_full'),
      })
      loadedForRef.current = locationId
      setLastUpdated(new Date())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      logger.error('[useDashboardData] unexpected error:', msg)
      setError(msg)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [locationId])

  // Initial load (and re-load when locationId changes)
  useEffect(() => { load() }, [load])

  // Re-fetch when the user returns to the tab — catches sessions that expired
  // while the tab was in the background and weren't caught by TOKEN_REFRESHED.
  useEffect(() => {
    if (!locationId) return
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [load, locationId])

  return { data, isLoading, isRefreshing, error, lastUpdated, refetch: load }
}
