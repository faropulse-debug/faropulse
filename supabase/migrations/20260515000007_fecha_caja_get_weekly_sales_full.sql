-- RPC: get_weekly_sales_full — fecha → fecha_caja
-- Migration: 2026-05-15.

CREATE OR REPLACE FUNCTION public.get_weekly_sales_full(p_location_id uuid)
RETURNS TABLE (
  semana   date,
  ventas   numeric,
  tickets  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    DATE_TRUNC('week', d.fecha_caja)::date AS semana,
    SUM(d.total)                            AS ventas,
    COUNT(*)                                AS tickets
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN locations l ON l.org_id = m.org_id
      WHERE m.user_id   = auth.uid()
        AND m.is_active = true
        AND l.id        = p_location_id
    )
  GROUP BY DATE_TRUNC('week', d.fecha_caja)
  ORDER BY semana;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_sales_full(uuid) TO authenticated;
