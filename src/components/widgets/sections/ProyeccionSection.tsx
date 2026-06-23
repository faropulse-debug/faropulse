'use client'

import { useState, useEffect, useCallback } from 'react'
import { SectionLabel }                  from '@/components/dashboard/SectionLabel'
import ProyeccionEjecutivaChart          from '../../charts/ProyeccionEjecutivaChart'
import type { RawComensalRow }           from '../../charts/ComensalesChart'
import { getSupabase }                   from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinancialRow {
  periodo:   string
  categoria: string
  concepto:  string
  monto:     number
}

interface Props {
  locationId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProyeccionSection({ locationId }: Props) {
  const [data,           setData]           = useState<FinancialRow[]>([])
  const [comensalesData, setComensalesData] = useState<RawComensalRow[]>([])
  const [isLoading,      setIsLoading]      = useState(true)

  const load = useCallback(async () => {
    if (!locationId) return
    setIsLoading(true)
    const [fin, com] = await Promise.all([
      getSupabase().rpc('get_financial_results', { p_location_id: locationId }),
      getSupabase().rpc('get_comensales_full',   { p_location_id: locationId }),
    ])
    if (fin.error) console.error('[ProyeccionSection] financial:',  fin.error.message)
    if (com.error) console.error('[ProyeccionSection] comensales:', com.error.message)
    setData(fin.data ?? [])
    setComensalesData(com.data ?? [])
    setIsLoading(false)
  }, [locationId])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Proyección Ejecutiva</SectionLabel>
      <ProyeccionEjecutivaChart data={data} comensalesData={comensalesData} isLoading={isLoading} />
    </div>
  )
}
