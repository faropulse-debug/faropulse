'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { useDashboardFilters } from '@/src/context/dashboard-filters'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FacturacionSemanaData {
  fact_semana:         number | null
  fact_semana_comp:    number | null
  pct_var_semana:      number | null
  prom_diario_semana:  number | null
  prom_diario_comp:    number | null
  pct_var_prom_diario: number | null
  sem_actual_inicio:   string
  sem_actual_fin:      string
  dias_semana:         number | null
  dias_semana_comp:    number | null
  ref_date:            string
}

export interface UseFacturacionSemanaResult {
  data:    FacturacionSemanaData | null
  loading: boolean
  error:   string | null
  refetch: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFacturacionSemana(locationId: string): UseFacturacionSemanaResult {
  const { filters } = useDashboardFilters()
  const { weekReference, compareMode } = filters

  const [data,    setData]    = useState<FacturacionSemanaData | null>(null)
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
        const supabase = getSupabase()
        const { data: result, error: rpcError } = await supabase.rpc(
          'get_facturacion_semana',
          {
            p_location_id:   locationId,
            p_week_reference: weekReference,
            p_compare_mode:  compareMode,
          }
        )
        if (cancelled) return
        if (rpcError) {
          logger.error('[useFacturacionSemana] RPC failed:', rpcError.message)
          setError(rpcError.message)
          return
        }
        setData(result as FacturacionSemanaData)
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Error desconocido'
        logger.error('[useFacturacionSemana] unexpected error:', message)
        setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [locationId, weekReference, compareMode, tick])

  return {
    data,
    loading,
    error,
    refetch: () => setTick(t => t + 1),
  }
}
