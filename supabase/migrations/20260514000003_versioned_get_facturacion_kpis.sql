-- RPC: get_facturacion_kpis
-- Versioned: 2026-05-14. Versioned from production STG without modifications.
-- Source: extracted via pg_get_functiondef()

CREATE OR REPLACE FUNCTION public.get_facturacion_kpis(p_location_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH params AS (
    SELECT MAX(fecha) AS ref_date
    FROM sales_documents
    WHERE location_id = p_location_id
      AND fecha IS NOT NULL
  ),

  semanas AS (
    SELECT
      date_trunc('week', ref_date)::date AS sem_actual_inicio,
      (date_trunc('week', ref_date) + interval '6 days')::date AS sem_actual_fin,
      (date_trunc('week', ref_date) - interval '1 month')::date AS sem_comp_inicio,
      (date_trunc('week', ref_date) - interval '1 month' + interval '6 days')::date AS sem_comp_fin
    FROM params
  ),

  meses AS (
    SELECT
      date_trunc('month', ref_date)::date AS mes_actual_inicio,
      ref_date AS mes_actual_fin,
      EXTRACT(day FROM ref_date)::int AS dia_del_mes,
      (date_trunc('month', ref_date) - interval '1 month')::date AS mes_comp_inicio,
      LEAST(
        (date_trunc('month', ref_date) - interval '1 month')::date + (EXTRACT(day FROM ref_date)::int - 1),
        (date_trunc('month', ref_date) - interval '1 day')::date
      )::date AS mes_comp_fin,
      (date_trunc('month', ref_date) - interval '1 month')::date AS ult_mes_inicio,
      (date_trunc('month', ref_date) - interval '1 day')::date AS ult_mes_fin,
      (date_trunc('month', ref_date) - interval '2 months')::date AS ante_mes_inicio,
      (date_trunc('month', ref_date) - interval '1 month' - interval '1 day')::date AS ante_mes_fin,
      (ref_date - 27) AS rolling_inicio,
      ref_date AS rolling_fin,
      (ref_date - 55) AS rolling_prev_inicio,
      (ref_date - 28) AS rolling_prev_fin
    FROM params
  ),

  fact AS (
    SELECT
      SUM(CASE WHEN d.fecha BETWEEN s.sem_actual_inicio AND LEAST(s.sem_actual_fin, p.ref_date)
               THEN d.total ELSE 0 END) AS fact_semana,
      COUNT(DISTINCT CASE WHEN d.fecha BETWEEN s.sem_actual_inicio AND LEAST(s.sem_actual_fin, p.ref_date)
                          THEN d.fecha END) AS dias_semana,
      SUM(CASE WHEN d.fecha BETWEEN s.sem_comp_inicio AND s.sem_comp_fin
               THEN d.total ELSE 0 END) AS fact_semana_comp,
      COUNT(DISTINCT CASE WHEN d.fecha BETWEEN s.sem_comp_inicio AND s.sem_comp_fin
                          THEN d.fecha END) AS dias_semana_comp,
      SUM(CASE WHEN d.fecha BETWEEN m.mes_actual_inicio AND m.mes_actual_fin
               THEN d.total ELSE 0 END) AS fact_mes_acum,
      COUNT(DISTINCT CASE WHEN d.fecha BETWEEN m.mes_actual_inicio AND m.mes_actual_fin
                          THEN d.fecha END) AS dias_mes_acum,
      SUM(CASE WHEN d.fecha BETWEEN m.mes_comp_inicio AND m.mes_comp_fin
               THEN d.total ELSE 0 END) AS fact_mes_comp,
      SUM(CASE WHEN d.fecha BETWEEN m.ult_mes_inicio AND m.ult_mes_fin
               THEN d.total ELSE 0 END) AS fact_ult_mes,
      SUM(CASE WHEN d.fecha BETWEEN m.ante_mes_inicio AND m.ante_mes_fin
               THEN d.total ELSE 0 END) AS fact_ante_mes,
      SUM(CASE WHEN d.fecha BETWEEN m.rolling_inicio AND m.rolling_fin
               THEN d.total ELSE 0 END) AS fact_rolling,
      SUM(CASE WHEN d.fecha BETWEEN m.rolling_prev_inicio AND m.rolling_prev_fin
               THEN d.total ELSE 0 END) AS fact_rolling_comp
    FROM sales_documents d
    CROSS JOIN semanas s
    CROSS JOIN meses m
    CROSS JOIN params p
    WHERE d.location_id = p_location_id
      AND d.total IS NOT NULL
      AND d.fecha BETWEEN m.ante_mes_inicio AND p.ref_date
  )

  SELECT json_build_object(
    'fact_semana', f.fact_semana,
    'fact_semana_comp', f.fact_semana_comp,
    'pct_var_semana', CASE WHEN f.fact_semana_comp > 0
      THEN ROUND(((f.fact_semana - f.fact_semana_comp) / f.fact_semana_comp * 100)::numeric, 1)
      ELSE NULL END,

    'fact_mes_acum', f.fact_mes_acum,
    'fact_mes_comp', f.fact_mes_comp,
    'pct_var_mes', CASE WHEN f.fact_mes_comp > 0
      THEN ROUND(((f.fact_mes_acum - f.fact_mes_comp) / f.fact_mes_comp * 100)::numeric, 1)
      ELSE NULL END,

    'fact_ult_mes', f.fact_ult_mes,
    'fact_ante_mes', f.fact_ante_mes,
    'pct_var_ult_mes', CASE WHEN f.fact_ante_mes > 0
      THEN ROUND(((f.fact_ult_mes - f.fact_ante_mes) / f.fact_ante_mes * 100)::numeric, 1)
      ELSE NULL END,

    'prom_diario_semana', CASE WHEN f.dias_semana > 0
      THEN ROUND((f.fact_semana / f.dias_semana)::numeric, 0) ELSE 0 END,
    'prom_diario_comp', CASE WHEN f.dias_semana_comp > 0
      THEN ROUND((f.fact_semana_comp / f.dias_semana_comp)::numeric, 0) ELSE 0 END,
    'pct_var_prom_diario', CASE WHEN f.dias_semana_comp > 0 AND f.dias_semana > 0
      THEN ROUND((
        ((f.fact_semana / f.dias_semana) - (f.fact_semana_comp / f.dias_semana_comp))
        / (f.fact_semana_comp / f.dias_semana_comp) * 100
      )::numeric, 1) ELSE NULL END,

    'fact_rolling', f.fact_rolling,
    'fact_rolling_comp', f.fact_rolling_comp,
    'pct_var_rolling', CASE WHEN f.fact_rolling_comp > 0
      THEN ROUND(((f.fact_rolling - f.fact_rolling_comp) / f.fact_rolling_comp * 100)::numeric, 1)
      ELSE NULL END,

    'ref_date', p.ref_date,
    'sem_actual_inicio', s.sem_actual_inicio,
    'sem_actual_fin', LEAST(s.sem_actual_fin, p.ref_date),
    'dias_semana', f.dias_semana,
    'dias_semana_comp', f.dias_semana_comp,
    'mes_actual_inicio', m.mes_actual_inicio,
    'dias_mes_acum', f.dias_mes_acum,
    'ult_mes_inicio', m.ult_mes_inicio,
    'ult_mes_fin', m.ult_mes_fin
  )
  FROM fact f
  CROSS JOIN params p
  CROSS JOIN semanas s
  CROSS JOIN meses m;
$function$;

GRANT EXECUTE ON FUNCTION public.get_facturacion_kpis(uuid) TO anon, authenticated, service_role;
