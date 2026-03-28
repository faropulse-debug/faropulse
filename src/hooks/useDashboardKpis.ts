'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import type { FacturacionKpis, ProyeccionesKpis } from '@/src/types/dashboard'

interface DashboardKpisState {
  facturacion:  FacturacionKpis  | null
  proyecciones: ProyeccionesKpis | null
  loading:      boolean
  error:        string | null
}

export function useDashboardKpis(locationId: string): DashboardKpisState {
  const [facturacion,  setFacturacion]  = useState<FacturacionKpis  | null>(null)
  const [proyecciones, setProyecciones] = useState<ProyeccionesKpis | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    if (!locationId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    Promise.all([
      supabase.rpc('get_facturacion_kpis',  { p_location_id: locationId }),
      supabase.rpc('get_proyecciones_kpis', { p_location_id: locationId }),
    ])
      .then(([facResult, proyResult]) => {
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
        const message = err instanceof Error ? err.message : 'Unknown error'
        logger.error('[useDashboardKpis] unexpected error:', message)
        setError(message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [locationId])

  return { facturacion, proyecciones, loading, error }
}
