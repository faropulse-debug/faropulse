'use client'

import { createKpiWidget } from './createKpiWidget'

export const FacturacionMesWidget = createKpiWidget({
  id:       'facturacion-mes',
  title:    'Facturación Mes',
  rpcName:  'get_facturacion_mes',
  filterSupport: {
    required: ['locationId', 'monthReference'],
    optional: ['compareMode', 'channel'],
    ignored:  ['weekReference'],
  },
  fieldMap: {
    value:      'facturacion_mes_actual_acumulada',
    variation:  'pct_vs_mes_anterior',
    compLabel:  'vs mismo período mes ant.',
    compValue:  'facturacion_mismo_periodo_mes_anterior',
  },
})
