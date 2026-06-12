-- Canal mapping: SALON→Salón, MOSTRADOR→TakeAway, ELSE→Delivery
-- ELSE robusto a valores futuros (PedidosYa, Rappi, delivery propio, etc.)
-- Distinct tipo_zona confirmados en STG: SALON, APLICACIONES, MOSTRADOR
-- Campo: fecha (validado Sprint de Datos). Sin límite temporal.
-- Smoke-test mayo 2026: Salón 381/$27.6M + Delivery 218/$8.9M + TakeAway 92/$3.7M = 691/$40.2M

CREATE OR REPLACE FUNCTION public.get_ventas_por_canal(p_location_id uuid)
RETURNS TABLE (
  mes     text,
  canal   text,
  ventas  numeric,
  pedidos bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', d.fecha), 'YYYY-MM')  AS mes,
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END                                                AS canal,
    SUM(d.total)                                       AS ventas,
    COUNT(*)::bigint                                   AS pedidos
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND public.user_has_membership(p_location_id)
  GROUP BY
    DATE_TRUNC('month', d.fecha),
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END
  ORDER BY mes, ventas DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_ventas_por_canal(uuid) TO anon, authenticated, service_role;
