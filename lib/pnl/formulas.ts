export interface PnLInputs {
  // Ventas
  ventas_salon:        number
  ventas_dely:         number
  // Volumen
  tickets_salon:       number
  tickets_takeaway:    number
  tickets_dely:        number
  // Costos Variables (12)
  proteinas:           number
  lacteos_fiambres:    number
  almacen:             number
  postres_cafe:        number
  pastas_empanadas:    number
  verduras:            number
  bollos:              number
  porcion_muzza:       number
  descartable:         number
  bebidas:             number
  quilmes:             number
  limpieza:            number
  // Costos Fijos (11)
  sueldos_cargas:      number
  liq_final:           number
  alquiler:            number
  servicios:           number
  honorarios:          number
  gastos_varios:       number
  mantenimiento:       number
  impuestos:           number
  tarjetas:            number
  app_dely:            number
  gs_bancarios:        number
  // % regalías
  regalias_pct:        number
}

export interface PnLComputed {
  total_ventas:   number
  total_costos:   number
  total_gastos:   number
  regalias:       number
  resultado_neto: number
  pct_costos:     number
  pct_gastos:     number
  pct_regalias:   number
  pct_resultado:  number
  pesos_x_ticket: number
  pesos_x_pedido: number
}

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export function computePnL(i: PnLInputs): PnLComputed {
  const total_ventas = r2(i.ventas_salon + i.ventas_dely)

  const total_costos = r2(
    i.proteinas + i.lacteos_fiambres + i.almacen + i.postres_cafe +
    i.pastas_empanadas + i.verduras + i.bollos + i.porcion_muzza +
    i.descartable + i.bebidas + i.quilmes + i.limpieza,
  )

  const total_gastos = r2(
    i.sueldos_cargas + i.liq_final + i.alquiler + i.servicios +
    i.honorarios + i.gastos_varios + i.mantenimiento + i.impuestos +
    i.tarjetas + i.app_dely + i.gs_bancarios,
  )

  const regalias      = r2((i.regalias_pct / 100) * total_ventas)
  const resultado_neto = r2(total_ventas - total_costos - total_gastos - regalias)

  const pct = (v: number) => total_ventas > 0 ? r2((v / total_ventas) * 100) : 0

  return {
    total_ventas,
    total_costos,
    total_gastos,
    regalias,
    resultado_neto,
    pct_costos:     pct(total_costos),
    pct_gastos:     pct(total_gastos),
    pct_regalias:   pct(regalias),
    pct_resultado:  pct(resultado_neto),
    pesos_x_ticket: i.tickets_salon > 0 ? r2(i.ventas_salon / i.tickets_salon) : 0,
    pesos_x_pedido: i.tickets_dely  > 0 ? r2(i.ventas_dely  / i.tickets_dely)  : 0,
  }
}
