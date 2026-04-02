'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { useDashboardFilters } from '@/src/context/dashboard-filters'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FacturacionMesData {
  fact_mes_acum:     number | null
  fact_mes_comp:     number | null
  pct_var_mes:       number | null
  fact_ult_mes:      number | null
  fact_ante_mes:     number | null
  pct_var_ult_mes:   number | null
  mes_actual_inicio: string
  dias_mes_acum:     number | null
  ult_mes_inicio:    string
  ult_mes_fin:       string
  ref_date:          string
}

export interface UseFacturacionMesResult {
  data:    FacturacionMesData | null
  loading: boolean
  error:   string | null
  refetch: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFacturacionMes(locationId: string): UseFacturacionMesResult {
  const { filters } = useDashboardFilters()
  const { monthReference, compareMode } = filters

  const [data,    setData]    = useState<FacturacionMesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [tick,    setTick]    = useState(0)

  useEffect(() => {
    if (!locationId) {
      setLoading(false)
      return
    }

    let cancelled = false

    setLoading(true)
    setError(null)

    const run = async () => {
      try {
        const { data: result, error: rpcError } = await supabase.rpc(
          'get_facturacion_mes',
          {
            p_location_id:    locationId,
            p_month_reference: monthReference,
            p_compare_mode:   compareMode,
          }
        )
        if (cancelled) return
        if (rpcError) {
          logger.error('[useFacturacionMes] RPC failed:', rpcError.message)
          setError(rpcError.message)
          return
        }
        setData(result as FacturacionMesData)
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Error desconocido'
        logger.error('[useFacturacionMes] unexpected error:', message)
        setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [locationId, monthReference, compareMode, tick])

  return {
    data,
    loading,
    error,
    refetch: () => setTick(t => t + 1),
  }
}
