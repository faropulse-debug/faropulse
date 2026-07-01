'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { SectionLabel }                  from '@/components/dashboard/SectionLabel'
import MixCanalesChart, { RawSaleRow }   from '../../charts/MixCanalesChart'
import { getSupabase }                   from '@/lib/supabase'

// Survives tab remounts (useRef resets on unmount; module-level Map does not).
// Keyed by locationId so multi-tenant is safe.
const dataCache = new Map<string, RawSaleRow[]>()

interface Props {
  locationId: string
}

export function MixCanalesSection({ locationId }: Props) {
  const cached = dataCache.get(locationId)

  const [data,         setData]         = useState<RawSaleRow[]>(cached ?? [])
  const [isLoading,    setIsLoading]    = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  // True once this mount has data (either from cache or first fetch).
  const hasDataRef = useRef(!!cached)

  const load = useCallback(async () => {
    if (!locationId) return
    if (hasDataRef.current) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    const { data: rows, error } = await getSupabase()
      .from('sales_documents')
      .select('fecha,total,tipo_zona')
      .eq('location_id', locationId)
      .order('fecha', { ascending: true })
      .limit(50000)
    if (error) console.error('[MixCanalesSection]', error.message)
    const result = rows ?? []
    dataCache.set(locationId, result)
    setData(result)
    hasDataRef.current = true
    setIsLoading(false)
    setIsRefreshing(false)
  }, [locationId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Mix de Canales</SectionLabel>
      <div style={{ opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.3s' }}>
        <MixCanalesChart data={data} isLoading={isLoading} />
      </div>
    </div>
  )
}
