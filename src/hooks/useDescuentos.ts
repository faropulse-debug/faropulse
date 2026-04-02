'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { useDashboardFilters } from '@/src/context/dashboard-filters'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DescuentosData {
  total_descuentos:    number | null
  pct_sobre_ventas:    number | null
  cantidad_documentos: number | null
  descuento_promedio:  number | null
  periodo_inicio:      string
  periodo_fin:         string
  ref_date:            string
}

export interface UseDescuentosResult {
  data:    DescuentosData | null
  loading: boolean
  error:   string | null
  refetch: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDescuentos(locationId: string): UseDescuentosResult {
  const { filters } = useDashboardFilters()
  const { monthReference } = filters

  const [data,    setData]    = useState<DescuentosData | null>(null)
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
          'get_descuentos_kpis',
          {
            p_location_id:    locationId,
            p_month_reference: monthReference,
          }
        )
        if (cancelled) return
        if (rpcError) {
          logger.error('[useDescuentos] RPC failed:', rpcError.message)
          setError(rpcError.message)
          return
        }
        setData(result as DescuentosData)
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Error desconocido'
        logger.error('[useDescuentos] unexpected error:', message)
        setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [locationId, monthReference, tick])

  return {
    data,
    loading,
    error,
    refetch: () => setTick(t => t + 1),
  }
}
