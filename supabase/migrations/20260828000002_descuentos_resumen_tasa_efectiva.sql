-- Decisión de producto de Tano (2026-08-28): documento_bruto() NO tiene
-- excepciones por canal — el ítem sigue siendo la fuente primaria en todos
-- los casos, sin ninguna rama especial. Esta migración NO toca
-- documento_bruto(), el índice sobre sales_items, ni get_descuentos_top_tickets.
--
-- El hallazgo de que APLICACIONES pasa de "perdió $192.082" (fórmula vieja)
-- a "ganó ~$22.267 neto" con items (tasa efectiva negativa) es correcto y se
-- mantiene visible — el campo `descuento` de cabecera de ese canal mezcla
-- comisión de delivery con descuento real (deuda anotada, no investigada
-- acá). Tano decidió NO taparlo: el canal se excluye del TOTAL de plata
-- perdida y se muestra aparte marcado como pendiente de revisión — pero esa
-- exclusión vive en la UI, no en la función canónica ni en esta RPC.
--
-- get_descuentos_resumen expone tasa_efectiva = (bruto_total - neto_total) /
-- NULLIF(bruto_total, 0) por canal, sin filtrar ni excluir nada — la RPC
-- informa, no editorializa. Criterio de exclusión (que decide la UI, no
-- acá): tasa_efectiva < 0 significa que el bruto de lista es MENOR a lo
-- cobrado — hay recargo, no descuento. No se hardcodea 'APLICACIONES' en
-- ningún lado: el criterio es por evidencia (el signo), así detecta el caso
-- solo, sirve si mañana otro canal se comporta igual, y se apaga solo si
-- Apps se normaliza — mismo principio que sacar la config de negocio
-- hardcodeada en H3.
--
-- Reemplaza tasa_efectiva_pct (agregado en 20260828000001, todavía no
-- consumido por ninguna UI) por tasa_efectiva sin escalar a porcentaje, para
-- matchear la fórmula tal cual la pidió el CTO. avg_descuento_pct sigue sin
-- cambios por compatibilidad.
--
-- Idempotente: Postgres no permite CREATE OR REPLACE cuando cambia el
-- RETURNS TABLE, así que va con DROP FUNCTION + CREATE FUNCTION + GRANT
-- explícito (mismo patrón que 20260828000001). Aplicado en STG únicamente.

DROP FUNCTION IF EXISTS public.get_descuentos_resumen(uuid);

CREATE FUNCTION public.get_descuentos_resumen(p_location_id uuid)
RETURNS TABLE(
  mes_inicio            date,
  tipo_zona             text,
  plata_perdida         numeric,
  bruto_total           numeric,
  tickets               bigint,
  tickets_con_descuento bigint,
  avg_descuento_pct     numeric,
  tasa_efectiva         numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH docs AS (
    SELECT
      d.fecha_caja,
      d.tipo_zona,
      d.total,
      d.descuento,
      d.tipo_documento,
      public.documento_bruto(i.bruto_items, d.total, d.descuento, d.tipo_documento) AS bruto
    FROM sales_documents d
    LEFT JOIN LATERAL (
      SELECT SUM(si.cantidad * si.precio_unitario) AS bruto_items
      FROM sales_items si
      WHERE si.location_id  = d.location_id
        AND si.numero_ticket = d.external_id
        AND si.fecha_caja    = d.fecha_caja
    ) i ON true
    WHERE d.location_id = p_location_id
      AND d.tipo_zona IS NOT NULL
      AND d.fecha_caja IS NOT NULL
      AND user_has_membership(d.location_id)
  )
  SELECT
    DATE_TRUNC('month', fecha_caja)::date AS mes_inicio,
    tipo_zona,
    SUM(bruto - total) AS plata_perdida,
    SUM(bruto)         AS bruto_total,
    SUM(public.documento_peso(tipo_documento, total))::bigint AS tickets,
    SUM(public.documento_peso(tipo_documento, total)) FILTER (WHERE descuento > 0)::bigint AS tickets_con_descuento,
    ROUND(AVG(descuento) FILTER (WHERE descuento > 0), 1) AS avg_descuento_pct,
    (SUM(bruto) - SUM(total)) / NULLIF(SUM(bruto), 0) AS tasa_efectiva
  FROM docs
  GROUP BY 1, 2
  ORDER BY 1 DESC, 2
$function$;

GRANT EXECUTE ON FUNCTION public.get_descuentos_resumen(uuid)
  TO anon, authenticated, service_role;
