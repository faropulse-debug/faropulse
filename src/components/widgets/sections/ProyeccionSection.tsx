'use client'

import { useState, useEffect }          from 'react'
import { SectionLabel }                  from '@/components/dashboard/SectionLabel'
import ProyeccionEjecutivaChart          from '../../charts/ProyeccionEjecutivaChart'
import type { RawComensalRow }           from '../../charts/ComensalesChart'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

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

export function ProyeccionSection({ locationId }: Props) {
  const [data,           setData]           = useState<FinancialRow[]>([])
  const [comensalesData, setComensalesData] = useState<RawComensalRow[]>([])
  const [isLoading,      setIsLoading]      = useState(true)

  useEffect(() => {
    if (!locationId) return
    setIsLoading(true)

    const headers = {
      'Content-Type':  'application/json',
      'apikey':        ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    }
    const body = JSON.stringify({ p_location_id: locationId })

    Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_financial_results`, { method: 'POST', headers, body })
        .then(r => r.json()).then(rows => Array.isArray(rows) ? rows : []).catch(() => []),
      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_comensales_full`, { method: 'POST', headers, body })
        .then(r => r.json()).then(rows => Array.isArray(rows) ? rows : []).catch(() => []),
    ]).then(([financial, comensales]) => {
      setData(financial)
      setComensalesData(comensales)
    }).finally(() => setIsLoading(false))
  }, [locationId])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Proyección Ejecutiva</SectionLabel>
      <ProyeccionEjecutivaChart data={data} comensalesData={comensalesData} isLoading={isLoading} />
    </div>
  )
}
