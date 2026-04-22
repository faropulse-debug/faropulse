import type { ComponentType } from 'react'
import type { WidgetFilterSupport } from '@/src/context/dashboard-filters'
import { ElPulsoSection }             from '@/src/components/widgets/sections/ElPulsoSection'
import { PuntoDeEquilibrioSection }   from '@/src/components/widgets/sections/PuntoDeEquilibrioSection'
import { EvolutivoSection }           from '@/src/components/widgets/sections/EvolutivoSection'
import { AlertasSection }             from '@/src/components/widgets/sections/AlertasSection'
import { EstadoNegocioSection }       from '@/src/components/widgets/sections/EstadoNegocioSection'
import { ComensalesSection }          from '@/src/components/widgets/sections/ComensalesSection'
import { TicketPromedioSection }      from '@/src/components/widgets/sections/TicketPromedioSection'
import { ProyeccionSection }          from '@/src/components/widgets/sections/ProyeccionSection'
import { MixCanalesSection }          from '@/src/components/widgets/sections/MixCanalesSection'

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
  | 'investment'
  | 'financial'

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

// ─── Registry ─────────────────────────────────────────────────────────────────

export const WIDGET_REGISTRY: WidgetConfig[] = [
  {
    id:            'estado-negocio',
    title:         'Estado del negocio',
    description:   'Semáforo de KPIs clave: resultado neto, PE diario, ticket promedio, margen delivery y costo laboral',
    enabled:       true,
    component:     EstadoNegocioSection,
    gridSpan:      { mobile: 12, tablet: 12, desktop: 12 },
    priority:      4,
    category:      'kpi',
    refreshPolicy: 'normal',
    filterSupport: {
      required: [],
      optional: [],
      ignored:  ['locationId', 'weekReference', 'monthReference', 'compareMode', 'channel'],
    },
    kind:    'composite',
    section: 'estado-negocio',
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
  {
    id:            'punto-equilibrio',
    title:         'Punto de Equilibrio',
    description:   'Ventas vs PE por granularidad: diario, semanal, mensual y semestral',
    enabled:       true,
    component:     PuntoDeEquilibrioSection,
    gridSpan:      { mobile: 12, tablet: 12, desktop: 12 },
    priority:      6,
    category:      'financial',
    refreshPolicy: 'normal',
    filterSupport: {
      required: [],
      optional: [],
      ignored:  ['locationId', 'weekReference', 'monthReference', 'compareMode', 'channel'],
    },
    kind:    'composite',
    section: 'punto-equilibrio',
  },
  {
    id:            'mix-canales',
    title:         'Mix de Canales',
    description:   'Facturación por canal (Salón, Aplicaciones, Mostrador) con ticket promedio y participación %',
    enabled:       true,
    component:     MixCanalesSection,
    gridSpan:      { mobile: 12, tablet: 12, desktop: 12 },
    priority:      7,
    category:      'diagnostic',
    refreshPolicy: 'slow',
    filterSupport: {
      required: [],
      optional: [],
      ignored:  ['locationId', 'weekReference', 'monthReference', 'compareMode', 'channel'],
    },
    kind:    'composite',
    section: 'mix-canales',
  },
  {
    id:            'evolutivo',
    title:         'Evolutivo 6 meses',
    description:   'Evolución de ventas, resultado neto y punto de equilibrio en los últimos 6 meses',
    enabled:       true,
    component:     EvolutivoSection,
    gridSpan:      { mobile: 12, tablet: 12, desktop: 12 },
    priority:      7,
    category:      'financial',
    refreshPolicy: 'slow',
    filterSupport: {
      required: [],
      optional: [],
      ignored:  ['locationId', 'weekReference', 'monthReference', 'compareMode', 'channel'],
    },
    kind:    'composite',
    section: 'evolutivo',
  },
  {
    id:            'comensales',
    title:         'Comensales',
    description:   'Evolución de comensales por día, semana y mes con comparación vs promedio',
    enabled:       true,
    component:     ComensalesSection,
    gridSpan:      { mobile: 12, tablet: 12, desktop: 12 },
    priority:      8,
    category:      'diagnostic',
    refreshPolicy: 'slow',
    filterSupport: {
      required: [],
      optional: [],
      ignored:  ['locationId', 'weekReference', 'monthReference', 'compareMode', 'channel'],
    },
    kind:    'composite',
    section: 'comensales',
  },
  {
    id:            'ticket-promedio',
    title:         'Ticket Promedio',
    description:   'Evolución del ticket promedio por día, semana y mes',
    enabled:       true,
    component:     TicketPromedioSection,
    gridSpan:      { mobile: 12, tablet: 12, desktop: 12 },
    priority:      9,
    category:      'diagnostic',
    refreshPolicy: 'slow',
    filterSupport: {
      required: [],
      optional: [],
      ignored:  ['locationId', 'weekReference', 'monthReference', 'compareMode', 'channel'],
    },
    kind:    'composite',
    section: 'ticket-promedio',
  },
  {
    id:            'proyeccion-ejecutiva',
    title:         'Proyección Ejecutiva',
    description:   'Facturación real + proyección a 9 meses con recupero de inversión y modelo de comensales/ticket',
    enabled:       true,
    component:     ProyeccionSection,
    gridSpan:      { mobile: 12, tablet: 12, desktop: 12 },
    priority:      10,
    category:      'investment',
    refreshPolicy: 'slow',
    filterSupport: {
      required: [],
      optional: [],
      ignored:  ['locationId', 'weekReference', 'monthReference', 'compareMode', 'channel'],
    },
    kind:    'composite',
    section: 'proyeccion-ejecutiva',
  },
  {
    id:            'alertas-insights',
    title:         'Alertas e Insights',
    description:   'Alertas automáticas sobre resultado neto, PE, ticket promedio, delivery y costo laboral',
    enabled:       true,
    component:     AlertasSection,
    gridSpan:      { mobile: 12, tablet: 12, desktop: 12 },
    priority:      11,
    category:      'alert',
    refreshPolicy: 'slow',
    filterSupport: {
      required: [],
      optional: [],
      ignored:  ['locationId', 'weekReference', 'monthReference', 'compareMode', 'channel'],
    },
    kind:    'composite',
    section: 'alertas',
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
