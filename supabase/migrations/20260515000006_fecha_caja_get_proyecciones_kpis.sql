-- RPC: get_proyecciones_kpis — fecha → fecha_caja
-- Migration: 2026-05-15.

CREATE OR REPLACE FUNCTION public.get_proyecciones_kpis(p_location_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH params AS (
    SELECT MAX(fecha_caja) AS ref_date
    FROM sales_documents
    WHERE location_id = p_location_id
      AND fecha_caja IS NOT NULL
  ),

  mes_info AS (
    SELECT
      ref_date,
      date_trunc('month', ref_date)::date AS mes_inicio,
      (date_trunc('month', ref_date) + interval '1 month' - interval '1 day')::date AS mes_fin,
      EXTRACT(day FROM ref_date)::int AS dias_transcurridos,
      EXTRACT(day FROM (date_trunc('month', ref_date) + interval '1 month' - interval '1 day'))::int AS dias_totales,
      (date_trunc('month', ref_date) - interval '1 month')::date AS mes_ant_inicio,
      (date_trunc('month', ref_date) - interval '1 day')::date AS mes_ant_fin
    FROM params
  ),

  acum_actual AS (
    SELECT SUM(total) AS fact_acum
    FROM sales_documents
    WHERE location_id = p_location_id
      AND fecha_caja BETWEEN (SELECT mes_inicio FROM mes_info) AND (SELECT ref_date FROM mes_info)
      AND total IS NOT NULL
  ),

  mes_anterior AS (
    SELECT SUM(total) AS fact_mes_ant
    FROM sales_documents
    WHERE location_id = p_location_id
      AND fecha_caja BETWEEN (SELECT mes_ant_inicio FROM mes_info) AND (SELECT mes_ant_fin FROM mes_info)
      AND total IS NOT NULL
  ),

  mes_ant_al_mismo_dia AS (
    SELECT SUM(total) AS fact_mes_ant_parcial
    FROM sales_documents d
    CROSS JOIN mes_info mi
    WHERE d.location_id = p_location_id
      AND d.fecha_caja BETWEEN mi.mes_ant_inicio
                           AND LEAST(mi.mes_ant_inicio + (mi.dias_transcurridos - 1), mi.mes_ant_fin)
      AND d.total IS NOT NULL
  ),

  pesos_dia AS (
    SELECT
      EXTRACT(isodow FROM fecha_caja)::int AS dow,
      SUM(total) AS total_dow,
      SUM(SUM(total)) OVER () AS total_general
    FROM sales_documents
    WHERE location_id = p_location_id
      AND fecha_caja BETWEEN (SELECT ref_date FROM params) - 89 AND (SELECT ref_date FROM params)
      AND total IS NOT NULL
    GROUP BY EXTRACT(isodow FROM fecha_caja)::int
  ),

  dias_restantes AS (
    SELECT
      generate_series::date AS dia,
      EXTRACT(isodow FROM generate_series)::int AS dow
    FROM mes_info mi,
      generate_series(mi.ref_date + 1, mi.mes_fin, '1 day'::interval)
  ),

  proy_ponderada AS (
    SELECT
      SUM(
        (SELECT SUM(total) FROM sales_documents
         WHERE location_id = p_location_id
           AND fecha_caja BETWEEN (SELECT ref_date FROM params) - 89 AND (SELECT ref_date FROM params)
           AND total IS NOT NULL)
        / 90.0
        * (pd.total_dow / NULLIF(pd.total_general, 0))
        * 7.0
      ) AS fact_ponderada_restante
    FROM dias_restantes dr
    JOIN pesos_dia pd ON pd.dow = dr.dow
  )

  SELECT json_build_object(
    'ref_date', mi.ref_date,
    'dias_transcurridos', mi.dias_transcurridos,
    'dias_totales', mi.dias_totales,
    'dias_restantes', (mi.dias_totales - mi.dias_transcurridos),
    'fact_acum', aa.fact_acum,

    'proy_lineal', ROUND((aa.fact_acum / NULLIF(mi.dias_transcurridos, 0) * mi.dias_totales)::numeric, 0),
    'proy_lineal_var_pct', CASE WHEN ma.fact_mes_ant > 0
      THEN ROUND((((aa.fact_acum / NULLIF(mi.dias_transcurridos, 0) * mi.dias_totales) - ma.fact_mes_ant)
        / ma.fact_mes_ant * 100)::numeric, 1) ELSE NULL END,

    'proy_ponderada', ROUND((aa.fact_acum + COALESCE(pp.fact_ponderada_restante, 0))::numeric, 0),
    'proy_ponderada_var_pct', CASE WHEN ma.fact_mes_ant > 0
      THEN ROUND((((aa.fact_acum + COALESCE(pp.fact_ponderada_restante, 0)) - ma.fact_mes_ant)
        / ma.fact_mes_ant * 100)::numeric, 1) ELSE NULL END,

    'meta_diaria_igualar', CASE WHEN (mi.dias_totales - mi.dias_transcurridos) > 0
      THEN ROUND(((ma.fact_mes_ant - aa.fact_acum)
        / (mi.dias_totales - mi.dias_transcurridos))::numeric, 0) ELSE NULL END,

    'meta_diaria_plus10', CASE WHEN (mi.dias_totales - mi.dias_transcurridos) > 0
      THEN ROUND(((ma.fact_mes_ant * 1.10 - aa.fact_acum)
        / (mi.dias_totales - mi.dias_transcurridos))::numeric, 0) ELSE NULL END,

    'desvio_absoluto', ROUND((aa.fact_acum - COALESCE(map.fact_mes_ant_parcial, 0))::numeric, 0),
    'desvio_pct', CASE WHEN map.fact_mes_ant_parcial > 0
      THEN ROUND(((aa.fact_acum - map.fact_mes_ant_parcial)
        / map.fact_mes_ant_parcial * 100)::numeric, 1) ELSE NULL END,

    'ritmo_diario_actual', ROUND((aa.fact_acum / NULLIF(mi.dias_transcurridos, 0))::numeric, 0),
    'fact_mes_ant', ma.fact_mes_ant,
    'fact_mes_ant_parcial', map.fact_mes_ant_parcial
  )
  FROM mes_info mi
  CROSS JOIN acum_actual aa
  CROSS JOIN mes_anterior ma
  CROSS JOIN mes_ant_al_mismo_dia map
  CROSS JOIN proy_ponderada pp;
$function$;

GRANT EXECUTE ON FUNCTION public.get_proyecciones_kpis(uuid) TO anon, authenticated, service_role;
