-- RPC: get_facturacion_mes — fecha → fecha_caja
-- Migration: 2026-05-15. Builds on no-MV refactor (000001); switches fecha to fecha_caja.

CREATE OR REPLACE FUNCTION public.get_facturacion_mes(p_location_id uuid, p_month_reference date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date, p_compare_mode text DEFAULT 'vs_prev_month'::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Mes actual
  v_month_start  date := DATE_TRUNC('month', p_month_reference)::date;
  v_month_end    date := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_dias_totales int  := EXTRACT(DAY FROM v_month_end)::int;
  v_today        date := CURRENT_DATE;
  -- Días acumulados en el mes (1-based; nunca supera v_dias_totales)
  v_dias_acum    int  := LEAST(v_today, v_month_end) - v_month_start + 1;

  -- Mes anterior
  v_prev_month_start     date := (v_month_start - INTERVAL '1 month')::date;
  -- Mes ante-anterior (para pct_ultimo_mes_vs_anterior)
  v_ante_prev_month_start date := (v_prev_month_start - INTERVAL '1 month')::date;

  -- Año anterior
  v_ya_month_start date := (v_month_start - INTERVAL '1 year')::date;
  v_has_ya_data    bool := (v_month_start >= '2026-04-01'::date);

  -- Pesos DOW (índice 1=dom, 2=lun, 3=mar, 4=mié, 5=jue, 6=vie, 7=sáb)
  v_dow_weights numeric[] := ARRAY[14.7, 8.1, 8.8, 10.3, 11.8, 21.6, 24.7];

  -- Resultados
  v_fact_acum        numeric := 0;
  v_fact_comp        numeric := 0;  -- mismo período mes anterior
  v_fact_prev        numeric := 0;  -- mes anterior completo
  v_fact_ante_prev   numeric := 0;  -- mes ante-anterior completo
  v_fact_ya          numeric;

  v_weight_elapsed   numeric := 0;
  v_weight_total     numeric := 0;
  v_proy_lineal      numeric := 0;
  v_proy_ponderada   numeric := 0;
BEGIN
  IF NOT public.user_has_membership(p_location_id) THEN
    RETURN '{}'::json;
  END IF;

  -- Facturación acumulada del mes actual (hasta hoy o fin de mes si ya cerró)
  SELECT COALESCE(SUM(total), 0)
  INTO v_fact_acum
  FROM sales_documents
  WHERE location_id = p_location_id
    AND tipo_zona IS NOT NULL
    AND fecha_caja >= v_month_start
    AND fecha_caja <= LEAST(v_today, v_month_end);

  -- Mismo período en el mes anterior (igual cantidad de días transcurridos).
  -- fecha_caja < v_month_start replica el tope implícito de mes_inicio = v_prev_month_start
  -- cuando v_dias_acum desborda al mes siguiente (ej: marzo 31d vs feb 28d).
  SELECT COALESCE(SUM(total), 0)
  INTO v_fact_comp
  FROM sales_documents
  WHERE location_id = p_location_id
    AND tipo_zona IS NOT NULL
    AND fecha_caja >= v_prev_month_start
    AND fecha_caja <  v_month_start
    AND fecha_caja <= v_prev_month_start + (v_dias_acum - 1);

  -- Mes anterior completo
  SELECT COALESCE(SUM(total), 0)
  INTO v_fact_prev
  FROM sales_documents
  WHERE location_id = p_location_id
    AND tipo_zona IS NOT NULL
    AND fecha_caja >= v_prev_month_start
    AND fecha_caja < v_month_start;

  -- Mes ante-anterior completo (para pct_ultimo_mes_vs_anterior)
  SELECT COALESCE(SUM(total), 0)
  INTO v_fact_ante_prev
  FROM sales_documents
  WHERE location_id = p_location_id
    AND tipo_zona IS NOT NULL
    AND fecha_caja >= v_ante_prev_month_start
    AND fecha_caja < v_prev_month_start;

  -- Año anterior mismo mes (null si datos insuficientes)
  IF v_has_ya_data THEN
    SELECT COALESCE(SUM(total), 0)
    INTO v_fact_ya
    FROM sales_documents
    WHERE location_id = p_location_id
      AND tipo_zona IS NOT NULL
      AND fecha_caja >= v_ya_month_start
      AND fecha_caja < (v_ya_month_start + INTERVAL '1 month')::date;
  END IF;

  -- Proyección lineal: ritmo diario actual extrapolado al mes completo
  IF v_dias_acum > 0 THEN
    v_proy_lineal := ROUND((v_fact_acum / v_dias_acum * v_dias_totales)::numeric, 0);
  END IF;

  -- Proyección ponderada por DOW
  -- Peso de los días ya transcurridos
  SELECT COALESCE(SUM(v_dow_weights[EXTRACT(DOW FROM d.day)::int + 1]), 0)
  INTO v_weight_elapsed
  FROM generate_series(v_month_start, LEAST(v_today, v_month_end), '1 day'::interval) AS d(day);

  -- Peso total del mes
  SELECT COALESCE(SUM(v_dow_weights[EXTRACT(DOW FROM d.day)::int + 1]), 0)
  INTO v_weight_total
  FROM generate_series(v_month_start, v_month_end, '1 day'::interval) AS d(day);

  IF v_weight_elapsed > 0 THEN
    v_proy_ponderada := ROUND((v_fact_acum / v_weight_elapsed * v_weight_total)::numeric, 0);
  END IF;

  RETURN json_build_object(
    'facturacion_mes_actual_acumulada',
      v_fact_acum,

    'facturacion_mismo_periodo_mes_anterior',
      v_fact_comp,

    'pct_vs_mes_anterior',
      CASE WHEN v_fact_comp > 0
        THEN ROUND(((v_fact_acum - v_fact_comp) / v_fact_comp * 100)::numeric, 1)
        ELSE NULL
      END,

    'facturacion_mes_anterior_cerrado',
      v_fact_prev,

    'pct_ultimo_mes_vs_anterior',
      CASE WHEN v_fact_ante_prev > 0
        THEN ROUND(((v_fact_prev - v_fact_ante_prev) / v_fact_ante_prev * 100)::numeric, 1)
        ELSE NULL
      END,

    'facturacion_mismo_mes_anio_anterior',
      v_fact_ya,   -- NULL si v_has_ya_data = false

    'proyeccion_cierre_lineal',
      v_proy_lineal,

    'proyeccion_cierre_ponderada',
      v_proy_ponderada,

    'promedio_diario_mes_actual',
      CASE WHEN v_dias_acum > 0
        THEN ROUND((v_fact_acum / v_dias_acum)::numeric, 0)
        ELSE 0
      END,

    'meta_diaria_igualar_mes_anterior',
      CASE WHEN v_dias_totales > 0
        THEN ROUND((v_fact_prev / v_dias_totales)::numeric, 0)
        ELSE 0
      END,

    'meta_diaria_superar_10pct',
      CASE WHEN v_dias_totales > 0
        THEN ROUND((v_fact_prev * 1.1 / v_dias_totales)::numeric, 0)
        ELSE 0
      END,

    'desvio_acumulado_pct',
      CASE WHEN v_fact_comp > 0
        THEN ROUND(((v_fact_acum - v_fact_comp) / v_fact_comp * 100)::numeric, 1)
        ELSE NULL
      END
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_facturacion_mes(uuid, date, text) TO anon, authenticated, service_role;
