-- documento_bruto(): bruto derivado a partir de sales_items, con la fórmula
-- total/(1-descuento/100) como fallback solo cuando no hay items.
--
-- Contexto (informe "Descuentos — bruto derivado" del 2026-08-27, y correcciones
-- del CTO del 2026-08-28):
--   1) La fórmula asume descuento parejo entre líneas. Verificado en STG: 62
--      documentos tienen % de descuento distinto por línea (ej. bebidas al 0%,
--      comida al 10-15% del mismo ticket), y hay casos donde el campo
--      `descuento` de cabecera no es confiable en absoluto — ej. X 00001-00001072
--      (canal APLICACIONES) tiene un RECARGO de ~9,4% modelado como
--      descuento=0,55%; X 00001-00003541 tiene descuento=10% de cabecera contra
--      ~1% real por línea. Los items son la fuente primaria; la fórmula es
--      fallback solo para el ~1,5% de documentos sin items asociados.
--   2) documento_bruto() devuelve BRUTO, nunca "plata perdida" — esa resta
--      (bruto - total) se hace en el callsite (las dos RPCs de abajo), para no
--      repetir la ambigüedad de etiqueta de un local duplicado en STG.
--   3) Huérfanos (sin items) con descuento=100: no hay forma de derivar el
--      bruto ni de aplicar la fórmula (división por cero). Devuelve NULL, no 0
--      — 0 afirmaría "no perdiste plata" cuando la verdad es "no sé". Las RPCs
--      propagan ese NULL sin coercionarlo.
--   4) Guard de reversos: en la única Nota de Crédito de STG, cantidad Y
--      precio_unitario vienen negativos, por lo que SUM(cantidad*precio_unitario)
--      da signo POSITIVO aunque el total sea negativo. Se corrige multiplicando
--      por documento_peso() (ya existe, ya detecta reversos) sobre
--      ABS(bruto_items). Sin notas de crédito con descuento=100 en STG para
--      validar con dato real — cubierto por test sintético en
--      tests/documento-bruto.test.ts.
--
-- Índice nuevo: sales_items no tenía índice sobre (location_id, numero_ticket,
-- fecha_caja), la única clave de cruce con sales_documents (no hay FK — ver
-- deuda anotada abajo). Sin él, cualquier JOIN forzaba un Seq Scan completo de
-- sales_items sin importar cuántos documentos calificaran del otro lado.
--
-- Deuda explícitamente FUERA de este PR (no tocada):
--   - FK sales_items → sales_documents y su backfill (colisión de external_id
--     conocida: 8 claves, 57 documentos, 0 con descuento=100 — no bloquea esto).
--   - Los 10 mismatches de montos redondos (-$9.400, -$8.600) entre
--     SUM(precio_total) e items — posible cargo de servicio no itemizado.
--   - Si "descuento" en canal APLICACIONES es en realidad comisión de delivery.
--   - UI (DescuentosSection.tsx) — la consume Codex en un PR aparte.
--
-- Idempotente: CREATE OR REPLACE para documento_bruto (nueva). Las dos RPCs
-- existentes cambian de forma de retorno (columnas nuevas) — Postgres no
-- permite CREATE OR REPLACE cuando cambia el RETURNS TABLE, así que van con
-- DROP FUNCTION + CREATE FUNCTION + GRANT explícito (grants verificados antes
-- de dropear: PUBLIC, anon, authenticated, postgres, service_role).
-- Aplicado en STG únicamente.

-- ─── índice de cruce sales_items → sales_documents ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_sales_items_ticket_lookup
  ON public.sales_items (location_id, numero_ticket, fecha_caja);

-- ─── documento_bruto ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.documento_bruto(
  p_bruto_items    numeric,
  p_total          numeric,
  p_descuento      numeric,
  p_tipo_documento text
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_bruto_items IS NOT NULL
      THEN public.documento_peso(p_tipo_documento, p_total) * ABS(p_bruto_items)
    WHEN p_descuento = 0   THEN p_total
    WHEN p_descuento < 100 THEN ROUND(p_total / (1 - p_descuento/100.0), 2)
    ELSE NULL
  END
$function$;

GRANT EXECUTE ON FUNCTION public.documento_bruto(numeric, numeric, numeric, text)
  TO anon, authenticated, service_role;

-- ─── get_descuentos_top_tickets ───────────────────────────────────────────────
-- Cambios: usa documento_bruto() sobre items (LEFT JOIN LATERAL, aprovecha el
-- índice nuevo). Agrega external_id, bruto, unidades. Saca el LIMIT 10 — pasa
-- a devolver TODOS los tickets con descuento del período, no un top fijo.
-- plata_perdida = bruto - total, calculado acá (el callsite), no en la función.
-- NULLS LAST en el ORDER BY: un ticket con bruto desconocido no debe aparecer
-- primero en una lista ordenada por "mayor pérdida".

DROP FUNCTION IF EXISTS public.get_descuentos_top_tickets(uuid, date, date);

CREATE FUNCTION public.get_descuentos_top_tickets(
  p_location_id uuid,
  p_desde       date DEFAULT NULL::date,
  p_hasta       date DEFAULT NULL::date
)
RETURNS TABLE(
  external_id   text,
  fecha_caja    date,
  tipo_zona     text,
  comensales    integer,
  total         numeric,
  descuento     numeric,
  bruto         numeric,
  unidades      numeric,
  plata_perdida numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    d.external_id,
    d.fecha_caja,
    d.tipo_zona,
    d.comensales,
    d.total,
    d.descuento,
    public.documento_bruto(i.bruto_items, d.total, d.descuento, d.tipo_documento) AS bruto,
    i.unidades,
    public.documento_bruto(i.bruto_items, d.total, d.descuento, d.tipo_documento) - d.total AS plata_perdida
  FROM sales_documents d
  LEFT JOIN LATERAL (
    SELECT
      SUM(si.cantidad * si.precio_unitario) AS bruto_items,
      SUM(si.cantidad)                      AS unidades
    FROM sales_items si
    WHERE si.location_id  = d.location_id
      AND si.numero_ticket = d.external_id
      AND si.fecha_caja    = d.fecha_caja
  ) i ON true
  WHERE d.location_id = p_location_id
    AND d.descuento > 0
    AND d.tipo_zona IS NOT NULL
    AND d.fecha_caja IS NOT NULL
    AND (p_desde IS NULL OR d.fecha_caja >= p_desde)
    AND (p_hasta IS NULL OR d.fecha_caja <= p_hasta)
    AND user_has_membership(d.location_id)
  ORDER BY plata_perdida DESC NULLS LAST
$function$;

GRANT EXECUTE ON FUNCTION public.get_descuentos_top_tickets(uuid, date, date)
  TO anon, authenticated, service_role;

-- ─── get_descuentos_resumen ───────────────────────────────────────────────────
-- Cambios: plata_perdida usa documento_bruto() en vez de la fórmula sola.
-- Agrega bruto_total (lo necesita la UI para la tasa efectiva). Agrega
-- tasa_efectiva_pct = SUM(bruto-total)/SUM(bruto), ponderada por plata en vez
-- de promediar porcentajes de ticket (el simple no distingue una cortesía de
-- $3.000 al 100% de un evento de $500.000 al 15%). avg_descuento_pct se
-- mantiene sin cambios por compatibilidad — Codex migra la UI en otro PR.

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
  tasa_efectiva_pct     numeric
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
    ROUND(SUM(bruto - total) / NULLIF(SUM(bruto), 0) * 100, 1) AS tasa_efectiva_pct
  FROM docs
  GROUP BY 1, 2
  ORDER BY 1 DESC, 2
$function$;

GRANT EXECUTE ON FUNCTION public.get_descuentos_resumen(uuid)
  TO anon, authenticated, service_role;
