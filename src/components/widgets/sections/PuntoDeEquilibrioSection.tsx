'use client'

import { useDashboardDataCtx } from '@/providers/DashboardDataProvider'
import { SectionLabel }        from '@/components/dashboard/SectionLabel'
import PEEvolutivoChart        from '../../charts/PEEvolutivoChart'
import PESemanalChart          from '../../charts/PESemanalChart'
import PEDiarioChart           from '../../charts/PEDiarioChart'

interface Props {
  locationId: string
}

export function PuntoDeEquilibrioSection({ locationId: _ }: Props) {
  const { data, isLoading, isRefreshing } = useDashboardDataCtx()

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Punto de Equilibrio</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.3s' }}>
        <PEEvolutivoChart
          data={data?.financialResults ?? []}
          isLoading={isLoading}
        />
        <PESemanalChart
          salesData={data?.weeklyFull ?? []}
          financialData={data?.financialResults ?? []}
          isLoading={isLoading}
        />
        <PEDiarioChart
          salesData={data?.dailyFull ?? []}
          financialData={data?.financialResults ?? []}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
