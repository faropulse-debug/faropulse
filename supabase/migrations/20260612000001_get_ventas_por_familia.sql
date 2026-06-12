-- RPC: get_ventas_por_familia — ventas por familia de producto, todos los meses.
-- Versioned: 2026-06-12. Tabla: sales_items (≠ sales_documents).
-- Total validado PASO 0 mayo 2026 = $40.197.357 (22 familias, 1 null).
-- Patrón de seguridad: user_has_membership + GRANT anon/authenticated/service_role.

CREATE OR REPLACE FUNCTION public.get_ventas_por_familia(p_location_id uuid)
RETURNS TABLE (
  mes      text,
  familia  text,
  ventas   numeric,
  cantidad bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(fecha_caja, 'YYYY-MM')          AS mes,
    COALESCE(familia, '(sin familia)')       AS familia,
    SUM(precio_total)                        AS ventas,
    SUM(cantidad)::bigint                    AS cantidad
  FROM sales_items
  WHERE location_id = p_location_id
    AND public.user_has_membership(p_location_id)
  GROUP BY TO_CHAR(fecha_caja, 'YYYY-MM'), COALESCE(familia, '(sin familia)')
  ORDER BY mes, ventas DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_ventas_por_familia(uuid) TO anon, authenticated, service_role;
