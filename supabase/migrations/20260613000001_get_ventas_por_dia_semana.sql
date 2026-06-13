-- RPC: get_ventas_por_dia_semana — distribución semanal por mes (últimos 6 meses).
-- dow = EXTRACT(DOW FROM fecha) → 0=Dom … 6=Sáb (standard ISO/Postgres).
-- ocurrencias = COUNT(DISTINCT fecha::date) de ese DOW en el mes, para calcular
-- el promedio correcto (promedio = ventas / ocurrencias).
-- Campo fecha validado (no fecha_caja) — consistente con get_ventas_mensuales.
-- Smoke-test mayo 2026: 7 filas × Lun(4)→Dom(5); suma total == $40,197,357 / 691 pedidos.

CREATE OR REPLACE FUNCTION public.get_ventas_por_dia_semana(p_location_id uuid)
RETURNS TABLE (
  mes         text,
  dow         int,
  ventas      numeric,
  pedidos     bigint,
  ocurrencias bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(d.fecha::date, 'YYYY-MM')         AS mes,
    EXTRACT(DOW FROM d.fecha::date)::int       AS dow,
    SUM(d.total)                               AS ventas,
    COUNT(*)::bigint                           AS pedidos,
    COUNT(DISTINCT d.fecha::date)::bigint      AS ocurrencias
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
    AND public.user_has_membership(p_location_id)
  GROUP BY
    TO_CHAR(d.fecha::date, 'YYYY-MM'),
    EXTRACT(DOW FROM d.fecha::date)::int
  ORDER BY mes, dow;
$$;

GRANT EXECUTE ON FUNCTION public.get_ventas_por_dia_semana(uuid) TO anon, authenticated, service_role;
