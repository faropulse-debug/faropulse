-- RPC: get_comensales_full
-- Versioned: 2026-05-14. Versioned from production STG without modifications.
-- Source: extracted via pg_get_functiondef()

CREATE OR REPLACE FUNCTION public.get_comensales_full(p_location_id uuid)
 RETURNS TABLE(fecha date, comensales bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.fecha, SUM(d.comensales)::bigint AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.comensales > 0
    AND d.tipo_zona = 'SALON'
  GROUP BY d.fecha
  ORDER BY d.fecha;
$function$;

GRANT EXECUTE ON FUNCTION public.get_comensales_full(uuid) TO anon, authenticated, service_role;
