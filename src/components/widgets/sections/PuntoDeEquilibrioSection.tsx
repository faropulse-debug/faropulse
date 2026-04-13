'use client'

import { useState, useEffect }  from 'react'
import { SectionLabel }          from '@/components/dashboard/SectionLabel'
import PEEvolutivoChart          from '../../charts/PEEvolutivoChart'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinancialRow {
  periodo:   string
  categoria: string
  concepto:  string
  monto:     number
}

interface Props {
  locationId: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PuntoDeEquilibrioSection({ locationId }: Props) {
  const [data,      setData]      = useState<FinancialRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!locationId) return
    setIsLoading(true)
    fetch(`${SUPABASE_URL}/rest/v1/rpc/get_financial_results`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ p_location_id: locationId }),
    })
      .then(r => r.json())
      .then(rows => setData(Array.isArray(rows) ? rows : []))
      .catch(() => setData([]))
      .finally(() => setIsLoading(false))
  }, [locationId])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Punto de Equilibrio</SectionLabel>
      <PEEvolutivoChart data={data} isLoading={isLoading} />
    </div>
  )
}
