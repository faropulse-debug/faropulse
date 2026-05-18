-- RPC: get_comensales_full — fecha → fecha_caja
-- Migration: 2026-05-15.

CREATE OR REPLACE FUNCTION public.get_comensales_full(p_location_id uuid)
 RETURNS TABLE(fecha date, comensales bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.fecha_caja, SUM(d.comensales)::bigint AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.comensales > 0
    AND d.tipo_zona = 'SALON'
  GROUP BY d.fecha_caja
  ORDER BY d.fecha_caja;
$function$;

GRANT EXECUTE ON FUNCTION public.get_comensales_full(uuid) TO anon, authenticated, service_role;
