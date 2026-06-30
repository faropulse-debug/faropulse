'use client'

import { useDashboardDataCtx } from '@/providers/DashboardDataProvider'
import { SectionLabel }        from '@/components/dashboard/SectionLabel'
import TicketPromedioChart     from '../../charts/TicketPromedioChart'

interface Props {
  locationId: string
}

export function TicketPromedioSection({ locationId: _locationId }: Props) {
  const { data, isLoading, isRefreshing } = useDashboardDataCtx()

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Ticket Promedio</SectionLabel>
      <div style={{ opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.3s' }}>
        <TicketPromedioChart data={data?.ticketPromedioFull ?? []} isLoading={isLoading} />
      </div>
    </div>
  )
}
