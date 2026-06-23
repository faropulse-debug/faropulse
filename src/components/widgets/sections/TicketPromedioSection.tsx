'use client'

import { useState, useEffect, useCallback }   from 'react'
import { SectionLabel }                      from '@/components/dashboard/SectionLabel'
import TicketPromedioChart, { RawTicketRow } from '../../charts/TicketPromedioChart'
import { getSupabase }                       from '@/lib/supabase'

interface Props {
  locationId: string
}

export function TicketPromedioSection({ locationId }: Props) {
  const [data,      setData]      = useState<RawTicketRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    if (!locationId) return
    setIsLoading(true)
    const { data: rows, error } = await getSupabase()
      .rpc('get_ticket_promedio_full', { p_location_id: locationId })
    if (error) console.error('[TicketPromedioSection]', error.message)
    setData(rows ?? [])
    setIsLoading(false)
  }, [locationId])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Ticket Promedio</SectionLabel>
      <TicketPromedioChart data={data} isLoading={isLoading} />
    </div>
  )
}
