'use client'

import { useState, useEffect, useCallback } from 'react'
import { SectionLabel }                  from '@/components/dashboard/SectionLabel'
import PEEvolutivoChart                  from '../../charts/PEEvolutivoChart'
import PESemanalChart, { WeeklySaleRow } from '../../charts/PESemanalChart'
import PEDiarioChart,  { DailySaleRow }  from '../../charts/PEDiarioChart'
import { getSupabase }                   from '@/lib/supabase'

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

  const load = useCallback(async () => {
    if (!locationId) return
    setIsLoading(true)
    const [fin, wkly, dly] = await Promise.all([
      getSupabase().rpc('get_financial_results', { p_location_id: locationId }),
      getSupabase().rpc('get_weekly_sales_full',  { p_location_id: locationId }),
      getSupabase().rpc('get_daily_sales_full',   { p_location_id: locationId }),
    ])
    if (fin.error)  console.error('[PuntoDeEquilibrioSection] financial:', fin.error.message)
    if (wkly.error) console.error('[PuntoDeEquilibrioSection] weekly:',   wkly.error.message)
    if (dly.error)  console.error('[PuntoDeEquilibrioSection] daily:',    dly.error.message)
    setFinancialData(fin.data  ?? [])
    setWeeklyData(   wkly.data ?? [])
    setDailyData(    dly.data  ?? [])
    setIsLoading(false)
  }, [locationId])

  useEffect(() => { load() }, [load])

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
