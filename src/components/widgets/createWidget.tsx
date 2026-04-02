'use client'

import type { ComponentType, ReactNode } from 'react'
import type { WidgetFilterSupport }      from '@/src/context/dashboard-filters'
import type { WidgetProps }              from '@/src/lib/widget-registry'
import { useWidgetData }                 from '@/src/hooks/useWidgetData'
import { WidgetCard }                    from './WidgetCard'
import { WidgetSkeleton }                from './WidgetSkeleton'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal config required by createWidget at render time.
 * Deliberately does NOT import WidgetConfig from widget-registry to avoid
 * circular dependencies (widget files → createWidget → widget-registry → widget files).
 * WidgetConfig satisfies this interface structurally, so passing a full
 * WidgetConfig entry still works.
 */
export interface WidgetRenderConfig {
  id:            string
  title:         string
  rpcName?:      string
  filterSupport: WidgetFilterSupport
}

interface CreateWidgetOptions {
  config:         WidgetRenderConfig
  renderContent:  (data: any) => ReactNode
  /** Number of skeleton rows to show while loading. Defaults to 1. */
  skeletonLines?: number[]
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createWidget({
  config,
  renderContent,
  skeletonLines,
}: CreateWidgetOptions): ComponentType<WidgetProps> {

  function Widget({ locationId }: WidgetProps) {
    const { data, loading } = useWidgetData(config, locationId)

    return (
      <WidgetCard title={config.title}>
        {loading || !data
          ? <WidgetSkeleton rows={skeletonLines?.length ?? 1} />
          : renderContent(data)
        }
      </WidgetCard>
    )
  }

  Widget.displayName = config.id

  return Widget
}
