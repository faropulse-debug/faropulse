import type { ComponentType } from 'react'
import type { WidgetFilterSupport } from '@/src/context/dashboard-filters'
import { FacturacionSemanaWidget }  from '@/src/components/widgets/FacturacionSemanaWidget'
import { FacturacionMesWidget }     from '@/src/components/widgets/FacturacionMesWidget'
import { ElPulsoSection }           from '@/src/components/widgets/sections/ElPulsoSection'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Props every widget component must accept */
export interface WidgetProps {
  locationId: string
}

/** Responsive column span (out of 12) per breakpoint */
export interface GridSpan {
  mobile:   number   // default: 12 (full width)
  tablet?:  number   // default: 6
  desktop?: number   // default: 4
}

export type WidgetCategory =
  | 'kpi'
  | 'diagnostic'
  | 'ranking'
  | 'alert'
  | 'action'
  | 'narrative'

export type RefreshPolicy = 'fast' | 'normal' | 'slow' | 'manual'

/** Maps RefreshPolicy to milliseconds for use in hooks */
export const REFRESH_POLICY_MS: Record<RefreshPolicy, number> = {
  fast:   60_000,      // 1 min  — alertas operativas
  normal: 300_000,     // 5 min  — ventas semanales
  slow:   1_800_000,   // 30 min — comparativos históricos
  manual: Infinity,
}

export interface WidgetConfig {
  /** Unique stable identifier — never change after creation */
  id:            string
  /** Display title shown in WidgetCard header */
  title:         string
  /** Brief description for admin/settings UI */
  description:   string
  /** Whether this widget renders on the dashboard */
  enabled:       boolean
  /** The React component to render */
  component:     ComponentType<WidgetProps>
  /** Responsive grid sizing */
  gridSpan:      GridSpan
  /** Execution order hint for layout (lower = earlier/more important) */
  priority:      number
  /** Functional category — used for grouping and filtering in admin UI */
  category:      WidgetCategory
  /** How often the widget should re-fetch data */
  refreshPolicy: RefreshPolicy
  /** Declares which DashboardFilters this widget uses */
  filterSupport: WidgetFilterSupport
  /** Dashboard section this widget belongs to — used for grouped rendering */
  section?:      string
  /** Supabase RPC function name — required when dataSource is 'rpc' */
  rpcName?:      string
  /** Where the widget fetches its data from */
  dataSource?:   'rpc' | 'view'
  /** Render strategy — 'kpi' = single RPC value, 'composite' = multiple sources */
  kind?:         'kpi' | 'composite'
  /** Optional formatter for the widget's primary numeric value */
  formatValue?:  (value: number | null) => string
  /** Semantic thresholds for coloring/alerting (domain-specific units) */
  thresholds?:   { good: number; warning: number }
}

// ─── Placeholder component ────────────────────────────────────────────────────
// Used for widgets whose full implementation is pending.
// Replace each entry's `component` field as widgets are built.

function createPlaceholder(name: string): ComponentType<WidgetProps> {
  function PlaceholderWidget({ locationId }: WidgetProps) {
    void locationId
    return null
  }
  PlaceholderWidget.displayName = `Placeholder(${name})`
  return PlaceholderWidget
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const WIDGET_REGISTRY: WidgetConfig[] = [
  {
    id:            'facturacion-semana',
    title:         'Facturación Semana',
    description:   'Ventas acumuladas de la semana actual vs semana anterior',
    enabled:       true,
    component:     FacturacionSemanaWidget,
    gridSpan:      { mobile: 12, tablet: 6, desktop: 4 },
    priority:      1,
    category:      'kpi',
    refreshPolicy: 'normal',
    filterSupport: {
      required: ['locationId', 'weekReference'],
      optional: ['compareMode', 'channel'],
      ignored:  ['monthReference'],
    },
    rpcName:    'get_facturacion_semana',
    dataSource: 'rpc',
    kind:       'kpi',
    section:    'facturacion',
  },
  {
    id:            'facturacion-mes',
    title:         'Facturación Mes',
    description:   'Ventas acumuladas del mes actual y proyección',
    enabled:       true,
    component:     FacturacionMesWidget,
    gridSpan:      { mobile: 12, tablet: 6, desktop: 4 },
    priority:      2,
    category:      'kpi',
    refreshPolicy: 'normal',
    filterSupport: {
      required: ['locationId', 'monthReference'],
      optional: ['compareMode', 'channel'],
      ignored:  ['weekReference'],
    },
    rpcName:    'get_facturacion_mes',
    dataSource: 'rpc',
    kind:       'kpi',
    section:    'facturacion',
  },
  {
    id:            'descuentos',
    title:         'Descuentos',
    description:   'Resumen de descuentos aplicados en el período',
    enabled:       true,
    component:     createPlaceholder('Descuentos'),
    gridSpan:      { mobile: 12, tablet: 6, desktop: 4 },
    priority:      3,
    category:      'diagnostic',
    refreshPolicy: 'normal',
    filterSupport: {
      required: ['locationId', 'monthReference'],
      optional: ['channel'],
      ignored:  ['compareMode', 'weekReference'],
    },
    rpcName:    'get_descuentos_kpis',
    dataSource: 'rpc',
    kind:       'kpi',
    section:    'operaciones',
  },
  {
    id:            'alertas',
    title:         'Alertas',
    description:   'Indicadores fuera de parámetros normales',
    enabled:       true,
    component:     createPlaceholder('Alertas'),
    gridSpan:      { mobile: 12, tablet: 12, desktop: 12 },
    priority:      4,
    category:      'alert',
    refreshPolicy: 'fast',
    filterSupport: {
      required: ['locationId'],
      optional: [],
      ignored:  ['weekReference', 'monthReference', 'compareMode', 'channel'],
    },
    rpcName:    'get_alertas',
    dataSource: 'rpc',
    kind:       'kpi',
    section:    'alertas',
  },
  {
    id:            'el-pulso',
    title:         'El Pulso',
    description:   'Métricas de ventas, tickets y comensales por período',
    enabled:       true,
    component:     ElPulsoSection,
    gridSpan:      { mobile: 12, tablet: 12, desktop: 12 },
    priority:      5,
    category:      'kpi',
    refreshPolicy: 'normal',
    filterSupport: {
      required: [],
      optional: [],
      ignored:  ['locationId', 'weekReference', 'monthReference', 'compareMode', 'channel'],
    },
    kind:    'composite',
    section: 'pulso',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns only enabled widgets sorted by priority */
export function getEnabledWidgets(): WidgetConfig[] {
  return WIDGET_REGISTRY
    .filter(w => w.enabled)
    .sort((a, b) => a.priority - b.priority)
}

/** Returns enabled widgets filtered by category */
export function getWidgetsByCategory(category: WidgetCategory): WidgetConfig[] {
  return getEnabledWidgets().filter(w => w.category === category)
}

/** Look up a widget config by id */
export function getWidget(id: string): WidgetConfig | undefined {
  return WIDGET_REGISTRY.find(w => w.id === id)
}

/** Toggle a widget's enabled state (mutates registry — call from admin UI only) */
export function setWidgetEnabled(id: string, enabled: boolean): void {
  const widget = getWidget(id)
  if (widget) widget.enabled = enabled
}

/** Returns enabled widgets for a given section, sorted by priority */
export function getWidgetsBySection(section: string): WidgetConfig[] {
  return getEnabledWidgets().filter(w => w.section === section)
}

/** Returns unique section names ordered by the minimum priority of their widgets */
export function getSections(): string[] {
  const minPriority = new Map<string, number>()
  for (const w of getEnabledWidgets()) {
    if (!w.section) continue
    const current = minPriority.get(w.section)
    if (current === undefined || w.priority < current) {
      minPriority.set(w.section, w.priority)
    }
  }
  return [...minPriority.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([section]) => section)
}
