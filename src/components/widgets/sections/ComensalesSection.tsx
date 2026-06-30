'use client'

import { useDashboardDataCtx } from '@/providers/DashboardDataProvider'
import { SectionLabel }        from '@/components/dashboard/SectionLabel'
import ComensalesChart         from '../../charts/ComensalesChart'

interface Props {
  locationId: string
}

export function ComensalesSection({ locationId: _ }: Props) {
  const { data, isLoading, isRefreshing } = useDashboardDataCtx()

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Comensales</SectionLabel>
      <div style={{ opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.3s' }}>
        <ComensalesChart data={data?.comensalesFull ?? []} isLoading={isLoading} />
      </div>
    </div>
  )
}
