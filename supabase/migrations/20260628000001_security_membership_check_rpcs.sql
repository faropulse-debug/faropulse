-- Security: add membership EXISTS check to 4 RPCs (item D)
-- Molde tomado de get_financial_results (ya blindada y en producción).
-- get_facturacion_kpis y get_proyecciones_kpis también agregan SET search_path TO 'public'.
-- No se modifica lógica de negocio ni GRANTs.

-- ─── 1. get_comensales_full ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_comensales_full(p_location_id uuid)
 RETURNS TABLE(fecha date, comensales bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.fecha_caja, SUM(d.comensales)::bigint AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.comensales > 0
    AND d.tipo_zona = 'SALON'
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN locations l ON l.org_id = m.org_id
      WHERE m.user_id   = auth.uid()
        AND m.is_active = true
        AND l.id        = p_location_id
    )
  GROUP BY d.fecha_caja
  ORDER BY d.fecha_caja;
$function$;

GRANT EXECUTE ON FUNCTION public.get_comensales_full(uuid) TO anon, authenticated, service_role;

-- ─── 2. get_ticket_promedio_full ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ticket_promedio_full(p_location_id uuid)
 RETURNS TABLE(fecha date, facturacion numeric, tickets bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.fecha_caja, SUM(d.total) AS facturacion, COUNT(*)::bigint AS tickets
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN locations l ON l.org_id = m.org_id
      WHERE m.user_id   = auth.uid()
        AND m.is_active = true
        AND l.id        = p_location_id
    )
  GROUP BY d.fecha_caja
  ORDER BY d.fecha_caja;
$function$;

GRANT EXECUTE ON FUNCTION public.get_ticket_promedio_full(uuid) TO anon, authenticated, service_role;

-- ─── 3. get_facturacion_kpis ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_facturacion_kpis(p_location_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT MAX(fecha_caja) AS ref_date
    FROM sales_documents
    WHERE location_id = p_location_id
      AND fecha_caja IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM memberships m
        JOIN locations l ON l.org_id = m.org_id
        WHERE m.user_id   = auth.uid()
          AND m.is_active = true
          AND l.id        = p_location_id
      )
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
      SUM(CASE WHEN d.fecha_caja BETWEEN s.sem_actual_inicio AND LEAST(s.sem_actual_fin, p.ref_date)
               THEN d.total ELSE 0 END) AS fact_semana,
      COUNT(DISTINCT CASE WHEN d.fecha_caja BETWEEN s.sem_actual_inicio AND LEAST(s.sem_actual_fin, p.ref_date)
                          THEN d.fecha_caja END) AS dias_semana,
      SUM(CASE WHEN d.fecha_caja BETWEEN s.sem_comp_inicio AND s.sem_comp_fin
               THEN d.total ELSE 0 END) AS fact_semana_comp,
      COUNT(DISTINCT CASE WHEN d.fecha_caja BETWEEN s.sem_comp_inicio AND s.sem_comp_fin
                          THEN d.fecha_caja END) AS dias_semana_comp,
      SUM(CASE WHEN d.fecha_caja BETWEEN m.mes_actual_inicio AND m.mes_actual_fin
               THEN d.total ELSE 0 END) AS fact_mes_acum,
      COUNT(DISTINCT CASE WHEN d.fecha_caja BETWEEN m.mes_actual_inicio AND m.mes_actual_fin
                          THEN d.fecha_caja END) AS dias_mes_acum,
      SUM(CASE WHEN d.fecha_caja BETWEEN m.mes_comp_inicio AND m.mes_comp_fin
               THEN d.total ELSE 0 END) AS fact_mes_comp,
      SUM(CASE WHEN d.fecha_caja BETWEEN m.ult_mes_inicio AND m.ult_mes_fin
               THEN d.total ELSE 0 END) AS fact_ult_mes,
      SUM(CASE WHEN d.fecha_caja BETWEEN m.ante_mes_inicio AND m.ante_mes_fin
               THEN d.total ELSE 0 END) AS fact_ante_mes,
      SUM(CASE WHEN d.fecha_caja BETWEEN m.rolling_inicio AND m.rolling_fin
               THEN d.total ELSE 0 END) AS fact_rolling,
      SUM(CASE WHEN d.fecha_caja BETWEEN m.rolling_prev_inicio AND m.rolling_prev_fin
               THEN d.total ELSE 0 END) AS fact_rolling_comp
    FROM sales_documents d
    CROSS JOIN semanas s
    CROSS JOIN meses m
    CROSS JOIN params p
    WHERE d.location_id = p_location_id
      AND d.total IS NOT NULL
      AND d.fecha_caja BETWEEN m.ante_mes_inicio AND p.ref_date
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

-- ─── 4. get_proyecciones_kpis ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_proyecciones_kpis(p_location_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT MAX(fecha_caja) AS ref_date
    FROM sales_documents
    WHERE location_id = p_location_id
      AND fecha_caja IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM memberships m
        JOIN locations l ON l.org_id = m.org_id
        WHERE m.user_id   = auth.uid()
          AND m.is_active = true
          AND l.id        = p_location_id
      )
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
