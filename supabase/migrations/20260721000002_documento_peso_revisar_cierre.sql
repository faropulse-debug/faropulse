-- Cierra los 2 casos marcados REVISAR en 20260721000001_documento_peso_extend.sql.
-- Decisión del negocio (no ambigua ya):
--
--   get_ticket_promedio_full: el divisor de "ticket promedio" era COUNT(*) crudo
--   (dividía facturación neta por 412 en vez de por 410 para julio 2026) — mismo
--   bug original, escondido en el denominador de un promedio en vez de en un
--   COUNT visible. Se migra tickets a SUM(documento_peso(...)). facturacion
--   (numerador) NO cambia — ya netea por signo.
--
--   get_descuentos_resumen: SOLO se migran los dos conteos de documentos
--   (tickets, tickets_con_descuento). plata_perdida y avg_descuento_pct quedan
--   intactos — son sumas/promedios de plata, ya netean por signo.
--
-- Idempotente: CREATE OR REPLACE. Aplicado en STG únicamente.

-- ─── get_ticket_promedio_full ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ticket_promedio_full(p_location_id uuid)
RETURNS TABLE(fecha date, facturacion numeric, tickets bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT d.fecha_caja, SUM(d.total) AS facturacion,
         SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS tickets
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN locations l ON l.org_id = m.org_id
      WHERE m.user_id   = auth.uid()
        AND m.is_active = true
        AND l.id        = p_location_id
    )
  GROUP BY d.fecha_caja
  ORDER BY d.fecha_caja;
$function$;

-- ─── get_descuentos_resumen ──────────────────────────────────────────────────
-- plata_perdida y avg_descuento_pct: sin cambios (ya netean por signo).
CREATE OR REPLACE FUNCTION public.get_descuentos_resumen(p_location_id uuid)
RETURNS TABLE(mes_inicio date, tipo_zona text, plata_perdida numeric, tickets bigint, tickets_con_descuento bigint, avg_descuento_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    DATE_TRUNC('month', fecha_caja)::date AS mes_inicio,
    tipo_zona,
    SUM(CASE
      WHEN descuento >= 100 THEN total
      WHEN descuento > 0 THEN ROUND(total / (1 - descuento/100.0) - total, 2)
      ELSE 0
    END) AS plata_perdida,
    SUM(public.documento_peso(tipo_documento, total))::bigint AS tickets,
    SUM(public.documento_peso(tipo_documento, total)) FILTER (WHERE descuento > 0)::bigint AS tickets_con_descuento,
    ROUND(AVG(descuento) FILTER (WHERE descuento > 0), 1) AS avg_descuento_pct
  FROM sales_documents
  WHERE location_id = p_location_id
    AND tipo_zona IS NOT NULL
    AND fecha_caja IS NOT NULL
    AND user_has_membership(location_id)
  GROUP BY 1, 2
  ORDER BY 1 DESC, 2
$function$;
