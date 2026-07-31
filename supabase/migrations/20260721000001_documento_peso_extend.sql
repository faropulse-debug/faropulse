-- Extiende documento_peso() (definido en 20260718000001_documento_neto_canonical.sql)
-- a las funciones restantes que cuentan DOCUMENTOS con COUNT(*) crudo, para que
-- todas neteen la Nota de Crédito igual que get_ventas_mensuales (validado en STG:
-- 412 → 410 para julio 2026, paridad exacta con la API de CucinaGo).
--
-- Inventario de funciones que tocan sales_documents (18 totales, live en STG):
--   - Ya migrada:        get_ventas_mensuales
--   - Migradas acá (8):  get_daily_sales_full, get_ventas_por_canal,
--                        get_ventas_por_canal_dia, get_ventas_por_dia_semana,
--                        get_ventas_por_franja, get_ventas_semana,
--                        get_ventas_semanales, get_weekly_sales_full
--   - NO tocadas (6):    get_comensales_full, get_descuentos_top_tickets,
--                        get_facturacion_kpis, get_facturacion_mes,
--                        get_facturacion_semana, get_proyecciones_kpis
--                        (no cuentan documentos — solo SUM(total)/SUM(comensales)
--                        o COUNT(DISTINCT fecha_caja) de días, ya netean por signo)
--   - REVISAR (2, fuera de esta migración — pendiente de decisión):
--       get_descuentos_resumen   (mezcla plata_perdida, que no se toca, con
--                                  tickets/tickets_con_descuento que sí cuentan
--                                  documentos)
--       get_ticket_promedio_full (tickets = COUNT(*) crudo por día; no está
--                                  claro si el promedio debe recalcularse neto)
--
-- Cada función se reemplaza entera (CREATE OR REPLACE) preservando exactamente
-- su firma, filtros de auth/RLS y demás columnas — el único cambio es
-- COUNT(*) → SUM(documento_peso(tipo_documento, total))::bigint en la(s)
-- columna(s) que cuentan documentos. Idempotente: safe to re-run.

-- ─── get_daily_sales_full ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_daily_sales_full(p_location_id uuid)
RETURNS TABLE(fecha date, facturacion numeric, tickets bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    d.fecha_caja::date AS fecha,
    SUM(d.total)       AS facturacion,
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
  GROUP BY d.fecha_caja::date
  ORDER BY fecha;
$function$;

-- ─── get_ventas_por_canal ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_por_canal(p_location_id uuid)
RETURNS TABLE(mes text, canal text, ventas numeric, pedidos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    TO_CHAR(DATE_TRUNC('month', d.fecha), 'YYYY-MM')  AS mes,
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END                                                AS canal,
    SUM(d.total)                                       AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS pedidos
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND public.user_has_membership(p_location_id)
  GROUP BY
    DATE_TRUNC('month', d.fecha),
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END
  ORDER BY mes, ventas DESC;
$function$;

-- ─── get_ventas_por_canal_dia ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_por_canal_dia(p_location_id uuid, p_mes text)
RETURNS TABLE(fecha text, canal text, ventas numeric, pedidos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    TO_CHAR(d.fecha::date, 'YYYY-MM-DD')   AS fecha,
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END                                     AS canal,
    SUM(d.total)                            AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS pedidos
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND TO_CHAR(d.fecha::date, 'YYYY-MM') = p_mes
    AND public.user_has_membership(p_location_id)
  GROUP BY
    d.fecha::date,
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END
  ORDER BY fecha, ventas DESC;
$function$;

-- ─── get_ventas_por_dia_semana ───────────────────────────────────────────────
-- ocurrencias = COUNT(DISTINCT fecha) — cuenta días, no documentos. No se toca.
CREATE OR REPLACE FUNCTION public.get_ventas_por_dia_semana(p_location_id uuid)
RETURNS TABLE(mes text, dow integer, ventas numeric, pedidos bigint, ocurrencias bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    TO_CHAR(DATE_TRUNC('month', d.fecha), 'YYYY-MM')   AS mes,
    EXTRACT(DOW FROM d.fecha)::int                       AS dow,
    SUM(d.total)                                         AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS pedidos,
    COUNT(DISTINCT d.fecha::date)                        AS ocurrencias
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND public.user_has_membership(p_location_id)
  GROUP BY 1, 2
  ORDER BY mes, dow;
$function$;

-- ─── get_ventas_por_franja ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_por_franja(p_location_id uuid)
RETURNS TABLE(mes text, franja text, ventas numeric, pedidos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    TO_CHAR(d.fecha::date, 'YYYY-MM')   AS mes,
    CASE
      WHEN d.hora IS NULL OR d.hora = '' OR d.hora !~ '^\d'
        THEN 'Madrugada'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 12 AND 15
        THEN 'Mediodía'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 16 AND 19
        THEN 'Tarde'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 20 AND 23
        THEN 'Noche'
      ELSE 'Madrugada'
    END                                  AS franja,
    SUM(d.total)                         AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS pedidos
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
    AND public.user_has_membership(p_location_id)
  GROUP BY
    TO_CHAR(d.fecha::date, 'YYYY-MM'),
    CASE
      WHEN d.hora IS NULL OR d.hora = '' OR d.hora !~ '^\d'
        THEN 'Madrugada'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 12 AND 15
        THEN 'Mediodía'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 16 AND 19
        THEN 'Tarde'
      WHEN SPLIT_PART(d.hora, ':', 1)::integer BETWEEN 20 AND 23
        THEN 'Noche'
      ELSE 'Madrugada'
    END
  ORDER BY mes, ventas DESC;
$function$;

-- ─── get_ventas_semana ───────────────────────────────────────────────────────
-- comensales = SUM(comensales) — ya netea solo (la NC llega con signo negativo
-- en comensales). No se toca.
CREATE OR REPLACE FUNCTION public.get_ventas_semana(p_location_id uuid)
RETURNS TABLE(fecha date, ventas numeric, tickets bigint, comensales bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
    SELECT
      d.fecha::date                  AS fecha,
      SUM(d.total)                   AS ventas,
      SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS tickets,
      SUM(d.comensales)              AS comensales
    FROM sales_documents d
    WHERE d.location_id = p_location_id
      AND d.fecha >= CURRENT_DATE - INTERVAL '6 days'
      AND d.fecha <= CURRENT_DATE
      AND public.user_has_membership(p_location_id)
    GROUP BY d.fecha::date
    ORDER BY d.fecha::date;
  $function$;

-- ─── get_ventas_semanales ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_semanales(p_location_id uuid)
RETURNS TABLE(semana date, ventas numeric, tickets bigint, comensales bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
    SELECT
      DATE_TRUNC('week', d.fecha)::date AS semana,
      SUM(d.total)                       AS ventas,
      SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS tickets,
      SUM(d.comensales)                  AS comensales
    FROM sales_documents d
    WHERE d.location_id = p_location_id
      AND d.fecha >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '5 weeks'
      AND public.user_has_membership(p_location_id)
    GROUP BY DATE_TRUNC('week', d.fecha)
    ORDER BY semana;
  $function$;

-- ─── get_weekly_sales_full ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_weekly_sales_full(p_location_id uuid)
RETURNS TABLE(semana date, ventas numeric, tickets bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    DATE_TRUNC('week', d.fecha_caja)::date AS semana,
    SUM(d.total)                            AS ventas,
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
  GROUP BY DATE_TRUNC('week', d.fecha_caja)
  ORDER BY semana;
$function$;
