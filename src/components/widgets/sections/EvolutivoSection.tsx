'use client'

import { useState, useEffect, useCallback } from 'react'
import { SectionLabel }        from '@/components/dashboard/SectionLabel'
import EvolutivoChart          from '../../charts/EvolutivoChart'
import { getSupabase }         from '@/lib/supabase'

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

export function EvolutivoSection({ locationId }: Props) {
  const [data,      setData]      = useState<FinancialRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    if (!locationId) return
    setIsLoading(true)
    const { data: rows, error } = await getSupabase()
      .rpc('get_financial_results', { p_location_id: locationId })
    if (error) console.error('[EvolutivoSection]', error.message)
    setData(rows ?? [])
    setIsLoading(false)
  }, [locationId])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Evolutivo 12 meses</SectionLabel>
      <EvolutivoChart data={data} isLoading={isLoading} />
    </div>
  )
}
