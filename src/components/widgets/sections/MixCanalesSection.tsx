'use client'

import { useState, useEffect }          from 'react'
import { SectionLabel }                  from '@/components/dashboard/SectionLabel'
import MixCanalesChart, { RawSaleRow }   from '../../charts/MixCanalesChart'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface Props {
  locationId: string
}

export function MixCanalesSection({ locationId }: Props) {
  const [data,      setData]      = useState<RawSaleRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!locationId) return
    setIsLoading(true)

    fetch(
      `${SUPABASE_URL}/rest/v1/sales_documents?select=fecha,total,tipo_zona&location_id=eq.${locationId}&order=fecha.asc&limit=50000`,
      {
        headers: {
          'apikey':        ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
          'Range':         '0-49999',
        },
      }
    )
      .then(r => r.json())
      .then(rows => {
        const valid = Array.isArray(rows) ? rows : []
        console.log('[MixCanalesSection] rows recibidos:', valid.length)
        setData(valid)
      })
      .catch(err => {
        console.error('[MixCanalesSection] fetch error:', err)
        setData([])
      })
      .finally(() => setIsLoading(false))
  }, [locationId])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Mix de Canales</SectionLabel>
      <MixCanalesChart data={data} isLoading={isLoading} />
    </div>
  )
}
