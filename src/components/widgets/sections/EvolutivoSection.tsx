'use client'

import { useDashboardDataCtx } from '@/providers/DashboardDataProvider'
import { SectionLabel }        from '@/components/dashboard/SectionLabel'
import EvolutivoChart          from '../../charts/EvolutivoChart'

interface Props {
  locationId: string
}

export function EvolutivoSection({ locationId: _locationId }: Props) {
  const { data, isLoading, isRefreshing } = useDashboardDataCtx()

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Evolutivo 12 meses</SectionLabel>
      <div style={{ opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.3s' }}>
        <EvolutivoChart data={data?.financialResults ?? []} isLoading={isLoading} />
      </div>
    </div>
  )
}
