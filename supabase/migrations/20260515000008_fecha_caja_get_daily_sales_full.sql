-- RPC: get_daily_sales_full — fecha → fecha_caja
-- Migration: 2026-05-15.

CREATE OR REPLACE FUNCTION public.get_daily_sales_full(p_location_id uuid)
RETURNS TABLE (
  fecha       date,
  facturacion numeric,
  tickets     bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    d.fecha_caja::date AS fecha,
    SUM(d.total)       AS facturacion,
    COUNT(*)           AS tickets
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN locations l ON l.org_id = m.org_id
      WHERE m.user_id   = auth.uid()
        AND m.is_active = true
        AND l.id        = p_location_id
    )
  GROUP BY d.fecha_caja::date
  ORDER BY fecha;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_sales_full(uuid) TO authenticated;
