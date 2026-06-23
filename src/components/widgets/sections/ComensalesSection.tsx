'use client'

import { useState, useEffect, useCallback } from 'react'
import { SectionLabel }                    from '@/components/dashboard/SectionLabel'
import ComensalesChart, { RawComensalRow } from '../../charts/ComensalesChart'
import { getSupabase }                     from '@/lib/supabase'

interface Props {
  locationId: string
}

export function ComensalesSection({ locationId }: Props) {
  const [data,      setData]      = useState<RawComensalRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    if (!locationId) return
    setIsLoading(true)
    const { data: rows, error } = await getSupabase()
      .rpc('get_comensales_full', { p_location_id: locationId })
    if (error) console.error('[ComensalesSection]', error.message)
    setData(rows ?? [])
    setIsLoading(false)
  }, [locationId])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Comensales</SectionLabel>
      <ComensalesChart data={data} isLoading={isLoading} />
    </div>
  )
}
