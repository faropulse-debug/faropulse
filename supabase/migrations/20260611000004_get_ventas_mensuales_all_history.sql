-- RPC: get_ventas_mensuales — sin límite temporal (all history)
-- Versioned: 2026-06-11. Reemplaza 000003: quita el filtro de 5 meses para que
-- "vs año ant." en EstadoNegocioSection pueda resolver meses del año anterior.

CREATE OR REPLACE FUNCTION public.get_ventas_mensuales(p_location_id uuid)
RETURNS TABLE (
  mes        text,
  ventas     numeric,
  tickets    bigint,
  comensales bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', d.fecha), 'YYYY-MM') AS mes,
    SUM(d.total)                                       AS ventas,
    COUNT(*)                                           AS tickets,
    SUM(d.comensales)                                  AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND public.user_has_membership(p_location_id)
  GROUP BY DATE_TRUNC('month', d.fecha)
  ORDER BY mes;
$$;

GRANT EXECUTE ON FUNCTION public.get_ventas_mensuales(uuid) TO anon, authenticated, service_role;
