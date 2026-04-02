'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import type { FacturacionKpis, ProyeccionesKpis } from '@/src/types/dashboard'

export function useDashboardKpis(locationId: string) {
  const [facturacion,  setFacturacion]  = useState<FacturacionKpis  | null>(null)
  const [proyecciones, setProyecciones] = useState<ProyeccionesKpis | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    if (!locationId) {
      setLoading(false)
      return
    }

    let cancelled = false

    setLoading(true)
    setError(null)

    const supabase = getSupabase()

    Promise.all([
      supabase.rpc('get_facturacion_kpis',  { p_location_id: locationId }),
      supabase.rpc('get_proyecciones_kpis', { p_location_id: locationId }),
    ])
      .then(([facResult, proyResult]) => {
        if (cancelled) return

        if (facResult.error) {
          logger.error('[useDashboardKpis] get_facturacion_kpis failed:', facResult.error.message)
          setError(facResult.error.message)
          return
        }
        if (proyResult.error) {
          logger.error('[useDashboardKpis] get_proyecciones_kpis failed:', proyResult.error.message)
          setError(proyResult.error.message)
          return
        }

        setFacturacion(facResult.data  as FacturacionKpis)
        setProyecciones(proyResult.data as ProyeccionesKpis)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Unknown error'
        logger.error('[useDashboardKpis] unexpected error:', message)
        setError(message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [locationId])

  return { facturacion, proyecciones, loading, error }
}
