-- get_weekly_sales_full: todas las semanas históricas (sin límite de fecha)
-- Usada por PESemanalChart para el filtro Q1/Q2/Q3/Q4/Año

CREATE OR REPLACE FUNCTION public.get_weekly_sales_full(p_location_id uuid)
RETURNS TABLE (
  semana   date,
  ventas   numeric,
  tickets  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    DATE_TRUNC('week', d.fecha)::date AS semana,
    SUM(d.total)                       AS ventas,
    COUNT(*)                           AS tickets
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN locations l ON l.org_id = m.org_id
      WHERE m.user_id   = auth.uid()
        AND m.is_active = true
        AND l.id        = p_location_id
    )
  GROUP BY DATE_TRUNC('week', d.fecha)
  ORDER BY semana;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_sales_full(uuid) TO authenticated;
