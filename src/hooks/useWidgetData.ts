'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { useDashboardFilters } from '@/src/context/dashboard-filters'
import type { DashboardFilters }  from '@/src/context/dashboard-filters'
import type { WidgetRenderConfig } from '@/src/components/widgets/createWidget'

// ─── Filter key → RPC param name ─────────────────────────────────────────────
// locationId is always mapped to p_location_id separately — not listed here.

const FILTER_PARAM_MAP: Partial<Record<keyof DashboardFilters, string>> = {
  weekReference:  'p_week_reference',
  monthReference: 'p_month_reference',
  compareMode:    'p_compare_mode',
  channel:        'p_channel',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseWidgetDataResult<T> {
  data:    T | null
  loading: boolean
  empty:   boolean
  error:   string | null
  refetch: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWidgetData<T>(
  widgetConfig: WidgetRenderConfig,
  locationId:   string,
): UseWidgetDataResult<T> {
  const { filters } = useDashboardFilters()

  const [data,    setData]    = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [empty,   setEmpty]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [tick,    setTick]    = useState(0)

  useEffect(() => {
    const { rpcName, filterSupport } = widgetConfig

    // Placeholder widgets (no rpcName) render nothing — not an error condition
    if (!locationId || !rpcName) {
      setLoading(false)
      return
    }

    let cancelled = false

    setLoading(true)
    setEmpty(false)
    setError(null)

    // ── Build RPC params ───────────────────────────────────────────────────────
    // Include a filter param only when its key appears in required or optional.
    // Ignored filters are never passed to the RPC.

    const relevant = new Set([...filterSupport.required, ...filterSupport.optional])

    const params: Record<string, unknown> = { p_location_id: locationId }

    for (const key of relevant) {
      if (key === 'locationId') continue  // already mapped above
      const paramName = FILTER_PARAM_MAP[key as keyof DashboardFilters]
      if (paramName) {
        params[paramName] = filters[key as keyof DashboardFilters]
      }
    }

    // ── Fetch ──────────────────────────────────────────────────────────────────

    const run = async () => {
      try {
        const supabase = getSupabase()
        const { data: result, error: rpcError } = await supabase.rpc(rpcName, params)
        if (cancelled) return
        if (rpcError) {
          logger.error(`[useWidgetData] ${rpcName} failed:`, rpcError.message)
          setError(rpcError.message)
          return
        }
        const resolved = Array.isArray(result) ? (result[0] ?? null) : result
        setData(resolved as T)
        setEmpty(resolved === null)
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Error desconocido'
        logger.error(`[useWidgetData] ${rpcName} unexpected error:`, message)
        setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [locationId, widgetConfig, filters, tick])

  return {
    data,
    loading,
    empty,
    error,
    refetch: () => setTick(t => t + 1),
  }
}
