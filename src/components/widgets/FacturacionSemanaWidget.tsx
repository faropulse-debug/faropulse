'use client'

import { createKpiWidget } from './createKpiWidget'

export const FacturacionSemanaWidget = createKpiWidget({
  id:       'facturacion-semana',
  title:    'Facturación Semana',
  rpcName:  'get_facturacion_semana',
  filterSupport: {
    required: ['locationId', 'weekReference'],
    optional: ['compareMode', 'channel'],
    ignored:  ['monthReference'],
  },
  fieldMap: {
    value:      'facturacion_semana_actual',
    variation:  'pct_vs_mes_anterior',
    compLabel:  'vs sem. anterior',
    compValue:  'facturacion_misma_semana_mes_anterior',
  },
})
