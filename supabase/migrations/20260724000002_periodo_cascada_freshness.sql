-- 3 RPCs nuevas para comparación por período equivalente + cascada semanal +
-- banner de frescura (Resumen Ejecutivo v2). Todas fecha_caja + documento_peso().
--
-- Deuda anotada (no se toca acá): siguen conviviendo 2 definiciones de
-- "semana" — get_ventas_semana/get_ventas_semanales (rolling 7 días / ISO,
-- ambas ahora sobre fecha_caja tras 20260724000001) y esta cascada nueva
-- (ISO lunes-domingo + fecha_caja, que coincide con get_weekly_sales_full,
-- no agrega un 4º criterio). Unificar las 3 en una sola queda para otro paso.

-- ─── get_ventas_periodo: rango arbitrario, para comparación por período ───
-- equivalente. Calcula su propio corte (`hasta` efectivo = LEAST(p_hasta,
-- MAX(fecha_caja) real de la location)) para que un período "en curso" nunca
-- compare contra días sin datos cargados todavía — no depende de
-- data_freshness (que puede no estar poblada). Devuelve desde/hasta
-- efectivos para que la UI muestre las fechas exactas comparadas.
CREATE OR REPLACE FUNCTION public.get_ventas_periodo(p_location_id uuid, p_desde date, p_hasta date)
RETURNS TABLE (desde date, hasta date, ventas numeric, pedidos bigint, comensales bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH corte AS (
    SELECT LEAST(p_hasta, MAX(d.fecha_caja)) AS hasta_efectivo
    FROM sales_documents d
    WHERE d.location_id = p_location_id
  )
  SELECT
    p_desde                                                                     AS desde,
    corte.hasta_efectivo                                                        AS hasta,
    COALESCE(SUM(d.total), 0)                                                   AS ventas,
    COALESCE(SUM(public.documento_peso(d.tipo_documento, d.total)), 0)::bigint  AS pedidos,
    COALESCE(SUM(d.comensales), 0)                                              AS comensales
  FROM corte
  LEFT JOIN sales_documents d
    ON d.location_id = p_location_id
   AND d.fecha_caja BETWEEN p_desde AND corte.hasta_efectivo
  WHERE public.user_has_membership(p_location_id)
  GROUP BY corte.hasta_efectivo;
$$;
GRANT EXECUTE ON FUNCTION public.get_ventas_periodo(uuid, date, date) TO anon, authenticated, service_role;

-- ─── get_ventas_cascada_semanal: últimas 8 semanas ISO (lun-dom), fecha_caja
CREATE OR REPLACE FUNCTION public.get_ventas_cascada_semanal(p_location_id uuid)
RETURNS TABLE (semana date, ventas numeric, pedidos bigint, comensales bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    DATE_TRUNC('week', d.fecha_caja)::date                        AS semana,
    SUM(d.total)                                                   AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint  AS pedidos,
    SUM(d.comensales)                                              AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha_caja >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 weeks'
    AND public.user_has_membership(p_location_id)
  GROUP BY DATE_TRUNC('week', d.fecha_caja)
  ORDER BY semana;
$$;
GRANT EXECUTE ON FUNCTION public.get_ventas_cascada_semanal(uuid) TO anon, authenticated, service_role;

-- ─── get_data_freshness: wrapper SECURITY DEFINER — data_freshness tiene RLS
-- solo para service_role, el frontend (anon/authenticated) no puede leerla
-- directo. Mismo patrón que el resto del dashboard.
CREATE OR REPLACE FUNCTION public.get_data_freshness(p_location_id uuid)
RETURNS TABLE (dataset text, last_upload timestamptz, rows_affected integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.dataset, f.last_upload, f.rows_affected
  FROM public.data_freshness f
  WHERE f.location_id = p_location_id
    AND public.user_has_membership(p_location_id)
  ORDER BY f.dataset;
$$;
GRANT EXECUTE ON FUNCTION public.get_data_freshness(uuid) TO anon, authenticated, service_role;
