-- Consecuencia directa del fix anterior (20260828000003): al filtrar
-- descuento > 0 para plata_perdida, bruto_total pasó a ser SOLO el bruto de
-- los tickets con descuento -- eso cambió qué mide tasa_efectiva sin que
-- nadie lo pidiera:
--   SALON          4,2% -> 22,7%
--   MOSTRADOR     10,6% -> 44,0%
--   APLICACIONES  -0,4% -> 19,7%
-- El label de la UI dice "de cada $100 de lista, cuánto no cobré" -- con el
-- denominador filtrado esa frase pasó a ser falsa: mide intensidad del
-- descuento cuando se aplica, no impacto sobre la facturación del canal.
--
-- Decisión de Tano: el KPI mide IMPACTO. Denominador de tasa_efectiva =
-- bruto de TODOS los documentos del canal, no solo los descontados.
--
-- plata_perdida NO cambia -- sigue agregando solo sobre descuento > 0 (eso
-- es correcto, es lo que arregló 20260828000003).
--
-- bruto_total NO se renombra -- sigue siendo el bruto solo de tickets con
-- descuento, exactamente como quedó en el fix anterior. Se agrega
-- bruto_total_canal (bruto de TODOS los documentos del canal, viene del CTE
-- `todos` que ya existía) como el denominador correcto para tasa_efectiva.
-- Elegido para minimizar ruptura: bruto_total ya está en el contrato que
-- lee la UI de Codex (PR #59) -- renombrarlo rompe esa lectura sin avisar.
-- OJO Codex: la tasa efectiva a nivel KPI que arma DescuentosSection.tsx
-- sumando bruto_total client-side también estaba usando, sin saberlo, el
-- bruto filtrado a solo-con-descuento (mismo problema que este fix corrige
-- acá) -- para medir impacto correctamente en la UI hay que sumar
-- bruto_total_canal, no bruto_total.
--
-- documento_bruto(), el índice sobre sales_items y get_descuentos_top_tickets
-- no se tocan. Aplicado en STG únicamente.

DROP FUNCTION IF EXISTS public.get_descuentos_resumen(uuid);

CREATE FUNCTION public.get_descuentos_resumen(p_location_id uuid)
RETURNS TABLE(
  mes_inicio            date,
  tipo_zona             text,
  plata_perdida         numeric,
  bruto_total           numeric,
  bruto_total_canal     numeric,
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
  -- Denominador de "% tickets con descuento" (sin filtrar) y ahora también
  -- de tasa_efectiva: bruto de TODOS los documentos del canal.
  todos AS (
    SELECT
      DATE_TRUNC('month', fecha_caja)::date AS mes_inicio,
      tipo_zona,
      SUM(public.documento_peso(tipo_documento, total))::bigint AS tickets,
      SUM(public.documento_peso(tipo_documento, total)) FILTER (WHERE descuento > 0)::bigint AS tickets_con_descuento,
      ROUND(AVG(descuento) FILTER (WHERE descuento > 0), 1) AS avg_descuento_pct,
      SUM(bruto) AS bruto_total_canal
    FROM docs
    GROUP BY 1, 2
  ),
  -- Plata perdida y bruto_total (bruto de los tickets con descuento, sin
  -- cambios de nombre/semántica respecto al fix anterior): solo sobre
  -- documentos con descuento > 0.
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
    COALESCE(c.plata_perdida, 0)      AS plata_perdida,
    COALESCE(c.bruto_total, 0)        AS bruto_total,
    COALESCE(t.bruto_total_canal, 0)  AS bruto_total_canal,
    t.tickets,
    t.tickets_con_descuento,
    t.avg_descuento_pct,
    -- Denominador = bruto del canal ENTERO (impacto sobre la facturación),
    -- no solo el de los tickets con descuento (eso sería intensidad).
    COALESCE(c.plata_perdida, 0) / NULLIF(COALESCE(t.bruto_total_canal, 0), 0) AS tasa_efectiva
  FROM todos t
  LEFT JOIN con_descuento c ON c.mes_inicio = t.mes_inicio AND c.tipo_zona = t.tipo_zona
  ORDER BY t.mes_inicio DESC, t.tipo_zona
$function$;

GRANT EXECUTE ON FUNCTION public.get_descuentos_resumen(uuid)
  TO anon, authenticated, service_role;
