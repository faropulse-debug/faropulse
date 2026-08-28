-- Bug encontrado por Tano contrastando el KPI de get_descuentos_resumen
-- contra la suma del detalle de get_descuentos_top_tickets (agosto 2026 STG):
-- $1.519.450 vs $1.522.990, diferencia de $3.540. No era drift entre STG y
-- PROD (verificado: los datos son idénticos) -- era un bug de diseño.
--
-- documento_bruto() NO se toca -- hace lo que su nombre promete: devuelve el
-- bruto real derivado de items, CON o SIN descuento. Un ticket sin descuento
-- puede legítimamente tener bruto != total (cargo de servicio, comisión, uno
-- de los 10 mismatches de montos redondos ya documentados) y eso es
-- información real, no un error de la función.
--
-- El bug estaba en el CALLSITE (get_descuentos_resumen): su CTE agregaba
-- SUM(bruto - total) sobre TODOS los documentos, incluidos los que tienen
-- descuento=0. Eso mezclaba plata perdida real por descuento con ruido de
-- reconciliación de ingresos de tickets que nunca tuvieron descuento --
-- "plata perdida fantasma". Verificado en STG agosto 2026, contribución de
-- los tickets con descuento=0 a SUM(bruto-total):
--   SALON          $0
--   MOSTRADOR      -$3.540   (exactamente el gap contra PROD)
--   APLICACIONES   -$214.350 (por esto daba tasa_efectiva negativa)
--
-- Con el filtro, APLICACIONES pasa a ser POSITIVA otra vez ($192.082,53,
-- igual que la fórmula vieja) -- el canal nunca mezcló comisión con
-- descuento real, esa lectura anterior (mía y de Tano) era incorrecta.
--
-- Fix: plata_perdida, bruto_total y tasa_efectiva se agregan SOLO sobre
-- documentos con descuento > 0. tickets y tickets_con_descuento NO cambian
-- -- siguen sobre todos los documentos, es el denominador real de
-- "% tickets con descuento" y no debe filtrarse.
--
-- get_descuentos_top_tickets ya filtraba descuento > 0 desde que existe
-- (20260828000001) -- nunca tuvo este bug, no se toca acá. El índice sobre
-- sales_items tampoco se toca.
--
-- Idempotente: DROP FUNCTION + CREATE FUNCTION + GRANT (mismo patrón que
-- las 2 migraciones anteriores de get_descuentos_resumen). Aplicado en STG
-- únicamente.

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
  ),
  -- Denominador de "% tickets con descuento": sobre TODOS los documentos,
  -- sin filtrar por descuento.
  todos AS (
    SELECT
      DATE_TRUNC('month', fecha_caja)::date AS mes_inicio,
      tipo_zona,
      SUM(public.documento_peso(tipo_documento, total))::bigint AS tickets,
      SUM(public.documento_peso(tipo_documento, total)) FILTER (WHERE descuento > 0)::bigint AS tickets_con_descuento,
      ROUND(AVG(descuento) FILTER (WHERE descuento > 0), 1) AS avg_descuento_pct
    FROM docs
    GROUP BY 1, 2
  ),
  -- Plata perdida, bruto y tasa efectiva: SOLO sobre documentos con
  -- descuento > 0 -- acá vivía el bug (sumaba también los de descuento = 0).
  con_descuento AS (
    SELECT
      DATE_TRUNC('month', fecha_caja)::date AS mes_inicio,
      tipo_zona,
      SUM(bruto - total) AS plata_perdida,
      SUM(bruto)         AS bruto_total
    FROM docs
    WHERE descuento > 0
    GROUP BY 1, 2
  )
  SELECT
    t.mes_inicio,
    t.tipo_zona,
    COALESCE(c.plata_perdida, 0) AS plata_perdida,
    COALESCE(c.bruto_total, 0)   AS bruto_total,
    t.tickets,
    t.tickets_con_descuento,
    t.avg_descuento_pct,
    -- NULLIF, no COALESCE, para la tasa: bruto_total=0 (sin tickets con
    -- descuento ese mes/canal) es "no hay base para calcular una tasa", no
    -- "tasa cero".
    COALESCE(c.plata_perdida, 0) / NULLIF(COALESCE(c.bruto_total, 0), 0) AS tasa_efectiva
  FROM todos t
  LEFT JOIN con_descuento c ON c.mes_inicio = t.mes_inicio AND c.tipo_zona = t.tipo_zona
  ORDER BY t.mes_inicio DESC, t.tipo_zona
$function$;

GRANT EXECUTE ON FUNCTION public.get_descuentos_resumen(uuid)
  TO anon, authenticated, service_role;
