'use client'

import { useState, useEffect }           from 'react'
import { SectionLabel }                  from '@/components/dashboard/SectionLabel'
import PEEvolutivoChart                  from '../../charts/PEEvolutivoChart'
import PESemanalChart, { WeeklySaleRow } from '../../charts/PESemanalChart'
import PEDiarioChart,  { DailySaleRow }  from '../../charts/PEDiarioChart'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const HEADERS = {
  'Content-Type':  'application/json',
  'apikey':        ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
} as const

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
  const [financialData, setFinancialData] = useState<FinancialRow[]>([])
  const [weeklyData,    setWeeklyData]    = useState<WeeklySaleRow[]>([])
  const [dailyData,     setDailyData]     = useState<DailySaleRow[]>([])
  const [isLoading,     setIsLoading]     = useState(true)

  useEffect(() => {
    if (!locationId) return
    setIsLoading(true)

    const body = JSON.stringify({ p_location_id: locationId })

    Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_financial_results`, {
        method: 'POST', headers: HEADERS, body,
      }).then(r => r.json()),

      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_weekly_sales_full`, {
        method: 'POST', headers: HEADERS, body,
      }).then(r => r.json()),

      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_daily_sales_full`, {
        method: 'POST', headers: HEADERS, body,
      }).then(r => r.json()),
    ])
      .then(([fin, wkly, dly]) => {
        setFinancialData(Array.isArray(fin)  ? fin  : [])
        setWeeklyData(   Array.isArray(wkly) ? wkly : [])
        setDailyData(    Array.isArray(dly)  ? dly  : [])
      })
      .catch(() => {
        setFinancialData([])
        setWeeklyData([])
        setDailyData([])
      })
      .finally(() => setIsLoading(false))
  }, [locationId])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Punto de Equilibrio</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <PEEvolutivoChart
          data={financialData}
          isLoading={isLoading}
        />
        <PESemanalChart
          salesData={weeklyData}
          financialData={financialData}
          isLoading={isLoading}
        />
        <PEDiarioChart
          salesData={dailyData}
          financialData={financialData}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
