'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertaSeveridad = 'info' | 'warning' | 'critical'

export interface Alerta {
  id:           string
  tipo:         string
  severidad:    AlertaSeveridad
  mensaje:      string
  valor_actual: number | null
  valor_umbral: number | null
  fecha:        string
}

export interface UseAlertasResult {
  alertas:  Alerta[]
  loading:  boolean
  error:    string | null
  refetch:  () => void
  /** Count by severity — useful for badge indicators */
  counts: {
    info:     number
    warning:  number
    critical: number
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
// filterSupport: required=[locationId], ignored=[weekReference, monthReference,
// compareMode, channel] — no date params passed to this RPC.

export function useAlertas(locationId: string): UseAlertasResult {
  const [alertas,  setAlertas]  = useState<Alerta[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [tick,     setTick]     = useState(0)

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
          'get_alertas',
          { p_location_id: locationId }
        )
        if (cancelled) return
        if (rpcError) {
          logger.error('[useAlertas] RPC failed:', rpcError.message)
          setError(rpcError.message)
          return
        }
        setAlertas((result as Alerta[]) ?? [])
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Error desconocido'
        logger.error('[useAlertas] unexpected error:', message)
        setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [locationId, tick])

  const counts = {
    info:     alertas.filter(a => a.severidad === 'info').length,
    warning:  alertas.filter(a => a.severidad === 'warning').length,
    critical: alertas.filter(a => a.severidad === 'critical').length,
  }

  return {
    alertas,
    loading,
    error,
    refetch: () => setTick(t => t + 1),
    counts,
  }
}
