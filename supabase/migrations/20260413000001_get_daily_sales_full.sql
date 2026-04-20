-- get_daily_sales_full: facturación diaria histórica sin límite de fecha
-- Usada por PEDiarioChart para el selector de mes

CREATE OR REPLACE FUNCTION public.get_daily_sales_full(p_location_id uuid)
RETURNS TABLE (
  fecha       date,
  facturacion numeric,
  tickets     bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    d.fecha::date      AS fecha,
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
  GROUP BY d.fecha::date
  ORDER BY fecha;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_sales_full(uuid) TO authenticated;
