-- RPC: get_facturacion_semana
-- Versioned: 2026-05-14. Versioned from production STG without modifications.
-- Source: extracted via pg_get_functiondef()
-- Note: Spanish comment encoding corrected from API mojibake (UTF-8 decoded as Latin-1).

CREATE OR REPLACE FUNCTION public.get_facturacion_semana(p_location_id uuid, p_week_reference date DEFAULT CURRENT_DATE, p_compare_mode text DEFAULT 'vs_prev_month'::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Semana actual
  v_week_start  date := p_week_reference;
  v_week_end    date := p_week_reference + 6;

  -- Semana comparable en el mes anterior
  -- Ordinal 0-indexed: semana 0 = días 1-7, semana 1 = días 8-14, etc.
  v_week_ordinal      int  := (EXTRACT(DAY FROM p_week_reference)::int - 1) / 7;
  v_prev_month_start  date := DATE_TRUNC('month', p_week_reference - INTERVAL '1 month')::date;
  v_comp_week_start   date;
  v_comp_week_end     date;

  -- Año anterior (disponible desde 2026-04-07 — primer lunes con 1 año de datos)
  v_ya_week_start date := p_week_reference - INTERVAL '1 year';
  v_has_ya_data   bool := (p_week_reference >= '2026-04-07'::date);

  -- Rolling 28 días
  v_roll_end          date := v_week_end;
  v_roll_start        date := v_roll_end - 27;
  v_prev_roll_end     date := v_roll_start - 1;
  v_prev_roll_start   date := v_prev_roll_end - 27;

  -- Resultados
  v_fact_actual   numeric := 0;
  v_fact_comp     numeric := 0;
  v_dias_actual   int     := 0;
  v_dias_comp     int     := 0;
  v_fact_ya       numeric;
  v_rolling       numeric := 0;
  v_rolling_prev  numeric := 0;
BEGIN
  -- Control de acceso: mismo patrón que las RPCs existentes
  IF NOT public.user_has_membership(p_location_id) THEN
    RETURN '{}'::json;
  END IF;

  -- Semana comparable: mismo ordinal en el mes anterior
  v_comp_week_start := v_prev_month_start + (v_week_ordinal * 7);
  v_comp_week_end   := v_comp_week_start + 6;

  -- Semana actual
  SELECT
    COALESCE(SUM(facturacion_neta), 0),
    COUNT(DISTINCT fecha)
  INTO v_fact_actual, v_dias_actual
  FROM daily_sales_summary
  WHERE location_id = p_location_id
    AND fecha BETWEEN v_week_start AND v_week_end;

  -- Semana comparable (mes anterior)
  SELECT
    COALESCE(SUM(facturacion_neta), 0),
    COUNT(DISTINCT fecha)
  INTO v_fact_comp, v_dias_comp
  FROM daily_sales_summary
  WHERE location_id = p_location_id
    AND fecha BETWEEN v_comp_week_start AND v_comp_week_end;

  -- Año anterior (null si datos insuficientes)
  IF v_has_ya_data THEN
    SELECT COALESCE(SUM(facturacion_neta), 0)
    INTO v_fact_ya
    FROM daily_sales_summary
    WHERE location_id = p_location_id
      AND fecha BETWEEN v_ya_week_start AND v_ya_week_start + 6;
  END IF;

  -- Rolling 28 días actual y anterior
  SELECT COALESCE(SUM(facturacion_neta), 0)
  INTO v_rolling
  FROM daily_sales_summary
  WHERE location_id = p_location_id
    AND fecha BETWEEN v_roll_start AND v_roll_end;

  SELECT COALESCE(SUM(facturacion_neta), 0)
  INTO v_rolling_prev
  FROM daily_sales_summary
  WHERE location_id = p_location_id
    AND fecha BETWEEN v_prev_roll_start AND v_prev_roll_end;

  RETURN json_build_object(
    'facturacion_semana_actual',
      v_fact_actual,

    'facturacion_misma_semana_mes_anterior',
      v_fact_comp,

    'pct_vs_mes_anterior',
      CASE WHEN v_fact_comp > 0
        THEN ROUND(((v_fact_actual - v_fact_comp) / v_fact_comp * 100)::numeric, 1)
        ELSE NULL
      END,

    'facturacion_misma_semana_anio_anterior',
      v_fact_ya,   -- NULL si v_has_ya_data = false

    'pct_vs_anio_anterior',
      CASE WHEN v_fact_ya IS NOT NULL AND v_fact_ya > 0
        THEN ROUND(((v_fact_actual - v_fact_ya) / v_fact_ya * 100)::numeric, 1)
        ELSE NULL
      END,

    'promedio_diario_semana_actual',
      CASE WHEN v_dias_actual > 0
        THEN ROUND((v_fact_actual / v_dias_actual)::numeric, 0)
        ELSE 0
      END,

    'promedio_diario_semana_mes_anterior',
      CASE WHEN v_dias_comp > 0
        THEN ROUND((v_fact_comp / v_dias_comp)::numeric, 0)
        ELSE 0
      END,

    'rolling_28_dias',
      v_rolling,

    'rolling_28_dias_anterior',
      v_rolling_prev,

    'pct_rolling',
      CASE WHEN v_rolling_prev > 0
        THEN ROUND(((v_rolling - v_rolling_prev) / v_rolling_prev * 100)::numeric, 1)
        ELSE NULL
      END
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_facturacion_semana(uuid, date, text) TO anon, authenticated, service_role;
