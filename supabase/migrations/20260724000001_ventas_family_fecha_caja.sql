-- Migra la familia get_ventas_* de `fecha` a `fecha_caja` (día operativo).
-- Decisión: fecha_caja ya era el estándar dominante (10 RPCs desde el
-- 2026-05-15: get_facturacion_*, get_comensales_full, get_daily_sales_full,
-- get_weekly_sales_full, etc.) — esta familia get_ventas_* (creada desde
-- 2026-06-11 para el widget v2) era la única rezagada en `fecha`.
--
-- Medido contra el histórico completo de STG antes de decidir (16 meses,
-- 15.291 filas): un único documento cambia de mes (turno NOCHE que cruza
-- medianoche, B 00002-00006182, $7.900) — ene 2026 pasa de 1101→1102 pedidos,
-- feb 2026 de 893→892. Ningún otro mes se mueve. fecha_caja es el criterio
-- correcto: replica "Inicio de Caja" de CucinaGo (principio del proyecto:
-- replicar el POS), no el timestamp crudo del documento.
--
-- Único cambio en cada función: el campo de fecha usado en SELECT/GROUP BY/
-- WHERE/ORDER BY/EXTRACT. Nada más se toca (documento_peso, membership check,
-- columnas de salida, nombres) — CREATE OR REPLACE preserva firma y grants.
--
-- FUERA DE ALCANCE (explícito): la ventana de get_ventas_semana sigue siendo
-- rolling 7 días (CURRENT_DATE - 6 days) — solo cambia el campo que compara,
-- no el criterio de "semana". La deuda de las 3 definiciones de semana
-- conviviendo (rolling+fecha_caja, ISO+fecha_caja, ISO+fecha_caja tras esta
-- migración) se ataca aparte — ver comentario en 20260724000002.

-- ─── get_ventas_mensuales ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_mensuales(p_location_id uuid)
RETURNS TABLE (mes text, ventas numeric, tickets bigint, comensales bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', d.fecha_caja), 'YYYY-MM')        AS mes,
    SUM(d.total)                                                  AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS tickets,
    SUM(d.comensales)                                             AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND public.user_has_membership(p_location_id)
  GROUP BY DATE_TRUNC('month', d.fecha_caja)
  ORDER BY mes;
$$;
GRANT EXECUTE ON FUNCTION public.get_ventas_mensuales(uuid) TO anon, authenticated, service_role;

-- ─── get_ventas_por_canal ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_por_canal(p_location_id uuid)
RETURNS TABLE (mes text, canal text, ventas numeric, pedidos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', d.fecha_caja), 'YYYY-MM') AS mes,
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END                                                    AS canal,
    SUM(d.total)                                            AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS pedidos
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND public.user_has_membership(p_location_id)
  GROUP BY
    DATE_TRUNC('month', d.fecha_caja),
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END
  ORDER BY mes, ventas DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_ventas_por_canal(uuid) TO anon, authenticated, service_role;

-- ─── get_ventas_por_canal_dia ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_por_canal_dia(p_location_id uuid, p_mes text)
RETURNS TABLE (fecha text, canal text, ventas numeric, pedidos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(d.fecha_caja::date, 'YYYY-MM-DD') AS fecha,
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END                                        AS canal,
    SUM(d.total)                               AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS pedidos
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND TO_CHAR(d.fecha_caja::date, 'YYYY-MM') = p_mes
    AND public.user_has_membership(p_location_id)
  GROUP BY
    d.fecha_caja::date,
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END
  ORDER BY fecha, ventas DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_ventas_por_canal_dia(uuid, text) TO anon, authenticated, service_role;

-- ─── get_ventas_por_canal_semana ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_por_canal_semana(p_location_id uuid)
RETURNS TABLE (semana date, canal text, ventas numeric, pedidos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    DATE_TRUNC('week', d.fecha_caja)::date AS semana,
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END                                     AS canal,
    SUM(d.total)                            AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS pedidos
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha_caja >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '5 weeks'
    AND public.user_has_membership(p_location_id)
  GROUP BY
    DATE_TRUNC('week', d.fecha_caja),
    CASE d.tipo_zona
      WHEN 'SALON'     THEN 'Salón'
      WHEN 'MOSTRADOR' THEN 'TakeAway'
      ELSE                  'Delivery'
    END
  ORDER BY semana, ventas DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_ventas_por_canal_semana(uuid) TO anon, authenticated, service_role;

-- ─── get_ventas_por_dia_semana ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_por_dia_semana(p_location_id uuid)
RETURNS TABLE (mes text, dow int, ventas numeric, pedidos bigint, ocurrencias bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', d.fecha_caja), 'YYYY-MM') AS mes,
    EXTRACT(DOW FROM d.fecha_caja)::int                     AS dow,
    SUM(d.total)                                            AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS pedidos,
    COUNT(DISTINCT d.fecha_caja::date)                      AS ocurrencias
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND public.user_has_membership(p_location_id)
  GROUP BY 1, 2
  ORDER BY mes, dow;
$$;
GRANT EXECUTE ON FUNCTION public.get_ventas_por_dia_semana(uuid) TO anon, authenticated, service_role;

-- ─── get_ventas_por_franja ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_por_franja(p_location_id uuid)
RETURNS TABLE (mes text, franja text, ventas numeric, pedidos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(d.fecha_caja::date, 'YYYY-MM') AS mes,
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
    END                                     AS franja,
    SUM(d.total)                            AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS pedidos
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha_caja >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
    AND public.user_has_membership(p_location_id)
  GROUP BY
    TO_CHAR(d.fecha_caja::date, 'YYYY-MM'),
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
$$;
GRANT EXECUTE ON FUNCTION public.get_ventas_por_franja(uuid) TO anon, authenticated, service_role;

-- ─── get_ventas_semana ────────────────────────────────────────────────────
-- FUERA DE ALCANCE la definición de "semana" en sí: sigue rolling 7 días
-- (CURRENT_DATE - 6 days). Solo cambia el campo que se compara y se agrupa.
CREATE OR REPLACE FUNCTION public.get_ventas_semana(p_location_id uuid)
RETURNS TABLE (fecha date, ventas numeric, tickets bigint, comensales bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    d.fecha_caja::date              AS fecha,
    SUM(d.total)                    AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS tickets,
    SUM(d.comensales)               AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha_caja >= CURRENT_DATE - INTERVAL '6 days'
    AND d.fecha_caja <= CURRENT_DATE
    AND public.user_has_membership(p_location_id)
  GROUP BY d.fecha_caja::date
  ORDER BY d.fecha_caja::date;
$$;
GRANT EXECUTE ON FUNCTION public.get_ventas_semana(uuid) TO anon, authenticated, service_role;

-- ─── get_ventas_semanales ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_semanales(p_location_id uuid)
RETURNS TABLE (semana date, ventas numeric, tickets bigint, comensales bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    DATE_TRUNC('week', d.fecha_caja)::date AS semana,
    SUM(d.total)                            AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS tickets,
    SUM(d.comensales)                       AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha_caja >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '5 weeks'
    AND public.user_has_membership(p_location_id)
  GROUP BY DATE_TRUNC('week', d.fecha_caja)
  ORDER BY semana;
$$;
GRANT EXECUTE ON FUNCTION public.get_ventas_semanales(uuid) TO anon, authenticated, service_role;
