'use client'

import { useState, useEffect, useCallback } from 'react'
import { SectionLabel }                  from '@/components/dashboard/SectionLabel'
import MixCanalesChart, { RawSaleRow }   from '../../charts/MixCanalesChart'
import { getSupabase }                   from '@/lib/supabase'

interface Props {
  locationId: string
}

export function MixCanalesSection({ locationId }: Props) {
  const [data,      setData]      = useState<RawSaleRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    if (!locationId) return
    setIsLoading(true)
    const { data: rows, error } = await getSupabase()
      .from('sales_documents')
      .select('fecha,total,tipo_zona')
      .eq('location_id', locationId)
      .order('fecha', { ascending: true })
      .limit(50000)
    if (error) console.error('[MixCanalesSection]', error.message)
    setData(rows ?? [])
    setIsLoading(false)
  }, [locationId])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Mix de Canales</SectionLabel>
      <MixCanalesChart data={data} isLoading={isLoading} />
    </div>
  )
}
