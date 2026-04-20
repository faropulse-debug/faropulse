'use client'

import { useState, useEffect }             from 'react'
import { SectionLabel }                    from '@/components/dashboard/SectionLabel'
import ComensalesChart, { RawComensalRow } from '../../charts/ComensalesChart'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface Props {
  locationId: string
}

export function ComensalesSection({ locationId }: Props) {
  const [data,      setData]      = useState<RawComensalRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!locationId) return
    setIsLoading(true)

    // Fetch directo al REST endpoint — sin RPC, agregación client-side.
    // Range: 0-99999 bypasea el default de PostgREST (1000 filas) para
    // traer todo el historial de 12 meses en una sola request.
    fetch(`${SUPABASE_URL}/rest/v1/rpc/get_comensales_full`, {
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
        console.log('[ComensalesSection] rows recibidos:', valid.length)
        setData(valid)
      })
      .catch(err => {
        console.error('[ComensalesSection] fetch error:', err)
        setData([])
      })
      .finally(() => setIsLoading(false))
  }, [locationId])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Comensales</SectionLabel>
      <ComensalesChart data={data} isLoading={isLoading} />
    </div>
  )
}
