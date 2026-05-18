-- RPC: get_ticket_promedio_full
-- Versioned: 2026-05-14. Versioned from production STG without modifications.
-- Source: extracted via pg_get_functiondef()

CREATE OR REPLACE FUNCTION public.get_ticket_promedio_full(p_location_id uuid)
 RETURNS TABLE(fecha date, facturacion numeric, tickets bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.fecha, SUM(d.total) AS facturacion, COUNT(*)::bigint AS tickets
  FROM sales_documents d
  WHERE d.location_id = p_location_id
  GROUP BY d.fecha
  ORDER BY d.fecha;
$function$;

GRANT EXECUTE ON FUNCTION public.get_ticket_promedio_full(uuid) TO anon, authenticated, service_role;
