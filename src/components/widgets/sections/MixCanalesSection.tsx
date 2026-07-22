'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { SectionLabel }                  from '@/components/dashboard/SectionLabel'
import MixCanalesChart, { RawSaleRow }   from '../../charts/MixCanalesChart'
import type { ChannelSummaryRow }        from '@/src/lib/canal-chart-helpers'
import { getSupabase }                   from '@/lib/supabase'

// Survives tab remounts (useRef resets on unmount; module-level Map does not).
// Keyed by locationId so multi-tenant is safe.
const dataCache    = new Map<string, RawSaleRow[]>()
const summaryCache = new Map<string, ChannelSummaryRow[]>()

interface Props {
  locationId: string
}

export function MixCanalesSection({ locationId }: Props) {
  const cached        = dataCache.get(locationId)
  const cachedSummary = summaryCache.get(locationId)

  const [data,           setData]           = useState<RawSaleRow[]>(cached ?? [])
  const [channelSummary, setChannelSummary] = useState<ChannelSummaryRow[]>(cachedSummary ?? [])
  const [isLoading,      setIsLoading]      = useState(!cached)
  const [isRefreshing,   setIsRefreshing]   = useState(false)
  // True once this mount has data (either from cache or first fetch).
  const hasDataRef = useRef(!!cached)

  const load = useCallback(async () => {
    if (!locationId) return
    if (hasDataRef.current) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    const supabase = getSupabase()
    // Filas crudas: solo alimentan los gráficos de $ por período (SUM(total),
    // ya netea por signo — no requieren documento_peso).
    // pedidos/ticket por canal (ChannelCards) vienen de get_ventas_por_canal,
    // que sí aplica documento_peso en SQL — no se cuenta nada acá en cliente.
    const [{ data: rows, error: rowsError }, { data: summary, error: summaryError }] = await Promise.all([
      supabase
        .from('sales_documents')
        .select('fecha,total,tipo_zona')
        .eq('location_id', locationId)
        .order('fecha', { ascending: true })
        .limit(50000),
      supabase.rpc('get_ventas_por_canal', { p_location_id: locationId }),
    ])
    if (rowsError)    console.error('[MixCanalesSection]', rowsError.message)
    if (summaryError) console.error('[MixCanalesSection] get_ventas_por_canal', summaryError.message)
    const result        = rows ?? []
    const summaryResult = summary ?? []
    dataCache.set(locationId, result)
    summaryCache.set(locationId, summaryResult)
    setData(result)
    setChannelSummary(summaryResult)
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
        <MixCanalesChart data={data} channelSummary={channelSummary} isLoading={isLoading} />
      </div>
    </div>
  )
}
