-- RPC: get_ticket_promedio_full — fecha → fecha_caja
-- Migration: 2026-05-15.

CREATE OR REPLACE FUNCTION public.get_ticket_promedio_full(p_location_id uuid)
 RETURNS TABLE(fecha date, facturacion numeric, tickets bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.fecha_caja, SUM(d.total) AS facturacion, COUNT(*)::bigint AS tickets
  FROM sales_documents d
  WHERE d.location_id = p_location_id
  GROUP BY d.fecha_caja
  ORDER BY d.fecha_caja;
$function$;

GRANT EXECUTE ON FUNCTION public.get_ticket_promedio_full(uuid) TO anon, authenticated, service_role;
