-- Completa el inventario de RPCs por canal (mensual/diario ya existían):
--   get_ventas_por_canal      -> mensual, todo el histórico
--   get_ventas_por_canal_dia  -> diario, un mes (p_mes)
--   get_ventas_por_canal_semana (nueva) -> semanal, últimas 6 semanas
--
-- Ventana idéntica a get_ventas_semanales (20260721000001): últimas 6 semanas
-- ISO desde CURRENT_DATE. Mismo patrón de documento_peso que el resto del
-- paquete — la Nota de Crédito resta en "pedidos", nunca en "ventas" (ya
-- netea por signo).
--
-- Parte del reemplazo del fetch crudo de sales_documents en Mix de Canales
-- (MixCanalesSection.tsx) por RPCs agregadas en SQL — el componente no debe
-- traer ni una fila cruda.

CREATE OR REPLACE FUNCTION public.get_ventas_por_canal_semana(p_location_id uuid)
RETURNS TABLE(semana date, canal text, ventas numeric, pedidos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    DATE_TRUNC('week', d.fecha)::date AS semana,
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END                                AS canal,
    SUM(d.total)                       AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS pedidos
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '5 weeks'
    AND public.user_has_membership(p_location_id)
  GROUP BY
    DATE_TRUNC('week', d.fecha),
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END
  ORDER BY semana, ventas DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_ventas_por_canal_semana(uuid) TO anon, authenticated, service_role;
