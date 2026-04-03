import React                         from 'react'
import type { ComponentType }        from 'react'
import { createWidget }              from './createWidget'
import type { WidgetRenderConfig }   from './createWidget'
import type { WidgetFilterSupport }  from '@/src/context/dashboard-filters'
import type { WidgetProps }          from '@/src/lib/widget-registry'
import { KpiPreset }                 from './presets/KpiPreset'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldMap {
  /** RPC field name for the primary value */
  value:     string
  /** RPC field name for the variation percentage */
  variation: string
  /** Static label shown in the comparison row */
  compLabel: string
  /** RPC field name for the comparison value */
  compValue: string
}

interface CreateKpiWidgetOptions {
  id:            string
  title:         string
  rpcName:       string
  filterSupport: WidgetFilterSupport
  fieldMap:      FieldMap
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createKpiWidget({
  id,
  title,
  rpcName,
  filterSupport,
  fieldMap,
}: CreateKpiWidgetOptions): ComponentType<WidgetProps> {

  const config: WidgetRenderConfig = { id, title, rpcName, filterSupport }

  return createWidget({
    config,
    renderContent: (data: Record<string, number | null>) =>
      React.createElement(KpiPreset, {
        value:     data[fieldMap.value]     ?? null,
        variation: data[fieldMap.variation] ?? null,
        compLabel: fieldMap.compLabel,
        compValue: data[fieldMap.compValue] ?? null,
      }),
    skeletonLines: [1, 2, 3, 4],
  })
}
