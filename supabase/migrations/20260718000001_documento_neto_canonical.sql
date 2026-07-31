-- Definición canónica de "documento neto": UNA función que decide si un
-- sales_documents es un reverso (Nota de Crédito) y debe restar en el
-- conteo de documentos, en vez de que cada RPC repita su propia lógica de
-- COUNT(*) crudo (13 lugares hoy).
--
-- Patrón confirmado sobre TODO el histórico de PROD (15.117 filas, 3
-- tipo_documento distintos): SOLO 'Nota de Crédito Int. Venta' tiene
-- total<0 (1 fila en 15 meses, -64200). 'Factura Venta' y 'Factura Int.
-- Venta' nunca son negativos. El chequeo por total<0 es un refuerzo
-- defensivo (detecta un reverso futuro aunque venga con otro
-- tipo_documento) — no cambia el resultado actual.
--
-- Documentos en $0 (145 en el histórico, mayormente 'Factura Int. Venta'
-- sin ítems) SÍ cuentan como +1 — CucinaGo los cuenta y Tano validó no
-- filtrar por total. Solo la Nota de Crédito resta.
--
-- ventas (SUM(total)) y comensales (SUM(comensales)) NO cambian: ya
-- netean solos, porque la NC llega con signo negativo en esas dos
-- columnas. Solo el conteo de documentos necesita el peso ±1.

CREATE OR REPLACE FUNCTION public.documento_es_reverso(p_tipo_documento text, p_total numeric)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_tipo_documento = 'Nota de Crédito Int. Venta' OR p_total < 0;
$$;

COMMENT ON FUNCTION public.documento_es_reverso(text, numeric) IS
  'Definición canónica de reverso (Nota de Crédito). true = el documento resta en el conteo neto de documentos.';

CREATE OR REPLACE FUNCTION public.documento_peso(p_tipo_documento text, p_total numeric)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN public.documento_es_reverso(p_tipo_documento, p_total) THEN -1 ELSE 1 END;
$$;

COMMENT ON FUNCTION public.documento_peso(text, numeric) IS
  'Peso de un documento para conteo neto: +1 venta/factura, -1 Nota de Crédito. SUM(documento_peso(tipo_documento, total)) reemplaza COUNT(*) crudo.';

GRANT EXECUTE ON FUNCTION public.documento_es_reverso(text, numeric) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.documento_peso(text, numeric)       TO anon, authenticated, service_role;

-- ─── get_ventas_mensuales: alimenta "Resumen Ejecutivo" (widget v2) ──────────
-- Antes: COUNT(*) contaba la Nota de Crédito como +1 (238 en vez de 236
-- para jul 2026 01-12). Ahora: SUM(documento_peso(...)) la cuenta como -1.
-- ventas y comensales quedan igual que antes (ya neteaban por signo).

CREATE OR REPLACE FUNCTION public.get_ventas_mensuales(p_location_id uuid)
RETURNS TABLE (
  mes        text,
  ventas     numeric,
  tickets    bigint,
  comensales bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', d.fecha), 'YYYY-MM')             AS mes,
    SUM(d.total)                                                  AS ventas,
    SUM(public.documento_peso(d.tipo_documento, d.total))::bigint AS tickets,
    SUM(d.comensales)                                             AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND public.user_has_membership(p_location_id)
  GROUP BY DATE_TRUNC('month', d.fecha)
  ORDER BY mes;
$$;

GRANT EXECUTE ON FUNCTION public.get_ventas_mensuales(uuid) TO anon, authenticated, service_role;
