'use client'

import { useDashboardDataCtx }  from '@/providers/DashboardDataProvider'
import { SectionLabel }         from '@/components/dashboard/SectionLabel'
import ProyeccionEjecutivaChart from '../../charts/ProyeccionEjecutivaChart'

interface Props {
  locationId: string
}

export function ProyeccionSection({ locationId: _ }: Props) {
  const { data, isLoading, isRefreshing } = useDashboardDataCtx()

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Proyección Ejecutiva</SectionLabel>
      <div style={{ opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.3s' }}>
        <ProyeccionEjecutivaChart
          data={data?.financialResults ?? []}
          comensalesData={data?.comensalesFull ?? []}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
