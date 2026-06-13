-- Drill-down diario por canal para el tab Mix de Canales.
-- Mismo CASE de canal que get_ventas_por_canal: SALON→Salón, MOSTRADOR→TakeAway, ELSE→Delivery.
-- d.fecha::date garantiza agrupación día-a-día aunque la columna sea timestamptz.
-- Smoke-test mayo 2026: 31 días × 3 canales ≤ 93 filas; totales == get_ventas_por_canal para p_mes='2026-05'.

CREATE OR REPLACE FUNCTION public.get_ventas_por_canal_dia(
  p_location_id uuid,
  p_mes         text   -- 'YYYY-MM'
)
RETURNS TABLE (
  fecha   text,
  canal   text,
  ventas  numeric,
  pedidos bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(d.fecha::date, 'YYYY-MM-DD')   AS fecha,
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END                                     AS canal,
    SUM(d.total)                            AS ventas,
    COUNT(*)::bigint                        AS pedidos
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND TO_CHAR(d.fecha::date, 'YYYY-MM') = p_mes
    AND public.user_has_membership(p_location_id)
  GROUP BY
    d.fecha::date,
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END
  ORDER BY fecha, ventas DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_ventas_por_canal_dia(uuid, text) TO anon, authenticated, service_role;
