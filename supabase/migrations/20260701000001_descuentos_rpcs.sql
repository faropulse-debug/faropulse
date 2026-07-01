-- ============================================================
-- Migration: 20260701000001_descuentos_rpcs.sql
-- RPCs para el tab Análisis de Descuentos (OLA 3 Sprint 1)
--
-- Fuente: sales_documents directa (la matview daily_sales_summary
-- no tiene tickets_con_descuento ni avg_descuento_pct).
--
-- Fórmula plata_perdida (Opción A, validada en datos reales):
--   descuento >= 100 → total   (ticket bonificado al 100%)
--   descuento >  0  → total / (1 - descuento/100) - total
--   else            → 0
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- get_descuentos_resumen
--
-- Resumen mensual de descuentos agrupado por (mes_inicio, tipo_zona).
-- Retorna toda la historia disponible para el location — el frontend
-- construye el selector de meses desde estos datos.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_descuentos_resumen(
  p_location_id uuid
)
RETURNS TABLE(
  mes_inicio            date,
  tipo_zona             text,
  plata_perdida         numeric,
  tickets               bigint,
  tickets_con_descuento bigint,
  avg_descuento_pct     numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.user_has_membership(p_location_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    DATE_TRUNC('month', sd.fecha_caja)::date                        AS mes_inicio,
    sd.tipo_zona,
    SUM(
      CASE
        WHEN sd.descuento >= 100 THEN sd.total
        WHEN sd.descuento >  0   THEN sd.total / (1 - sd.descuento / 100.0) - sd.total
        ELSE 0
      END
    )                                                                AS plata_perdida,
    COUNT(*)                                                         AS tickets,
    COUNT(*) FILTER (WHERE sd.descuento > 0)                        AS tickets_con_descuento,
    COALESCE(
      AVG(sd.descuento) FILTER (WHERE sd.descuento > 0), 0
    )                                                                AS avg_descuento_pct
  FROM public.sales_documents sd
  WHERE sd.location_id = p_location_id
    AND sd.tipo_zona   IS NOT NULL
    AND sd.fecha_caja  IS NOT NULL
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_descuentos_resumen(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- get_descuentos_top_tickets
--
-- Top 10 tickets con mayor plata_perdida en el período indicado.
-- p_desde / p_hasta: primer y último día del mes seleccionado
-- (pasados como date, ej: '2026-06-01' y '2026-06-30').
-- Solo incluye tickets con descuento > 0.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_descuentos_top_tickets(
  p_location_id uuid,
  p_desde       date,
  p_hasta       date
)
RETURNS TABLE(
  fecha_caja    date,
  tipo_zona     text,
  comensales    integer,
  total         numeric,
  descuento     numeric,
  plata_perdida numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.user_has_membership(p_location_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sd.fecha_caja,
    sd.tipo_zona,
    sd.comensales,
    sd.total,
    sd.descuento,
    CASE
      WHEN sd.descuento >= 100 THEN sd.total
      WHEN sd.descuento >  0   THEN sd.total / (1 - sd.descuento / 100.0) - sd.total
      ELSE 0
    END                                                              AS plata_perdida
  FROM public.sales_documents sd
  WHERE sd.location_id = p_location_id
    AND sd.fecha_caja  BETWEEN p_desde AND p_hasta
    AND sd.descuento   > 0
    AND sd.tipo_zona   IS NOT NULL
  ORDER BY plata_perdida DESC
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_descuentos_top_tickets(uuid, date, date) TO authenticated;
