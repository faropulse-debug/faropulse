'use client'

import { useState, useEffect }               from 'react'
import { SectionLabel }                      from '@/components/dashboard/SectionLabel'
import TicketPromedioChart, { RawTicketRow } from '../../charts/TicketPromedioChart'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface Props {
  locationId: string
}

export function TicketPromedioSection({ locationId }: Props) {
  const [data,      setData]      = useState<RawTicketRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!locationId) return
    setIsLoading(true)

    fetch(`${SUPABASE_URL}/rest/v1/rpc/get_ticket_promedio_full`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ p_location_id: locationId }),
    })
      .then(r => r.json())
      .then(rows => {
        const valid = Array.isArray(rows) ? rows : []
        console.log('[TicketPromedioSection] rows recibidos:', valid.length)
        setData(valid)
      })
      .catch(err => {
        console.error('[TicketPromedioSection] fetch error:', err)
        setData([])
      })
      .finally(() => setIsLoading(false))
  }, [locationId])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Ticket Promedio</SectionLabel>
      <TicketPromedioChart data={data} isLoading={isLoading} />
    </div>
  )
}
