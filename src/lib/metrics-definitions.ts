/**
 * Documentación de dominio para las métricas del negocio.
 * Define QUÉ significa cada métrica — no CÓMO se calcula ni CÓMO se muestra.
 *
 * Las fórmulas SQL viven en los RPCs de Supabase.
 * El formateo visual vive en los widgets.
 */

export const METRIC_DEFINITIONS = {
  facturacion_neta: {
    label:       'Facturación neta',
    description: 'Total facturado excluyendo bonificaciones completas',
    source:      'sales_documents' as const,
    notes:       'Excluye documentos con descuento = 100 (bonificaciones totales)',
  },

  ticket_promedio: {
    label:       'Ticket promedio',
    description: 'Facturación neta dividida por cantidad de transacciones únicas',
    source:      'sales_documents' as const,
  },

  plata_perdida: {
    label:       'Plata perdida en descuentos',
    description: 'Monto resignado por descuentos parciales y bonificaciones totales',
    source:      'sales_documents' as const,
  },

  semana_comparable: {
    label:       'Semana comparable',
    description: 'Misma posición de semana en el mes anterior',
    notes:       'Semana 1 de marzo se compara contra Semana 1 de febrero',
  },

  periodo_comparable: {
    label:       'Período comparable',
    description: 'Días transcurridos del mes actual vs la misma cantidad de días del mes anterior',
    notes:       'Si hoy es día 21, se compara contra días 1–21 del mes anterior',
  },

  na_anio_anterior: {
    label:       'N/A año anterior',
    description: 'Comparación contra el mismo período del año anterior no disponible aún',
    notes:       'Datos disponibles desde abril 2025. Año anterior accesible recién desde abril 2026',
  },
} as const

export type MetricKey = keyof typeof METRIC_DEFINITIONS
