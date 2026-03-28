export interface FacturacionKpis {
  // Semana actual vs comparación
  fact_semana:         number | null
  fact_semana_comp:    number | null
  pct_var_semana:      number | null

  // Mes acumulado vs comparación
  fact_mes_acum:       number | null
  fact_mes_comp:       number | null
  pct_var_mes:         number | null

  // Último mes completo vs anterior
  fact_ult_mes:        number | null
  fact_ante_mes:       number | null
  pct_var_ult_mes:     number | null

  // Promedio diario
  prom_diario_semana:  number | null
  prom_diario_comp:    number | null
  pct_var_prom_diario: number | null

  // Rolling
  fact_rolling:        number | null
  fact_rolling_comp:   number | null
  pct_var_rolling:     number | null

  // Fechas y periodos
  ref_date:            string
  sem_actual_inicio:   string
  sem_actual_fin:      string
  dias_semana:         number | null
  dias_semana_comp:    number | null
  mes_actual_inicio:   string
  dias_mes_acum:       number | null
  ult_mes_inicio:      string
  ult_mes_fin:         string
}

export interface ProyeccionesKpis {
  // Referencia temporal
  ref_date:               string
  dias_transcurridos:     number | null
  dias_totales:           number | null
  dias_restantes:         number | null

  // Facturación acumulada y proyecciones
  fact_acum:              number | null
  proy_lineal:            number | null
  proy_lineal_var_pct:    number | null
  proy_ponderada:         number | null
  proy_ponderada_var_pct: number | null

  // Metas diarias necesarias
  meta_diaria_igualar:    number | null
  meta_diaria_plus10:     number | null

  // Desvío vs mes anterior
  desvio_absoluto:        number | null
  desvio_pct:             number | null

  // Ritmo y comparación
  ritmo_diario_actual:    number | null
  fact_mes_ant:           number | null
  fact_mes_ant_parcial:   number | null
}
