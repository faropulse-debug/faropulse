-- Dashboard aggregate functions
-- Run this in the Supabase SQL editor
--
-- Security note: All functions use SECURITY DEFINER to bypass RLS for aggregation.
-- Each function validates that the authenticated caller has an active membership
-- for the requested location before returning any data. If the caller does not
-- have permission, the function returns empty results (no error raised).

-- ─── 1. Ventas diarias: últimos 7 días ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_semana(p_location_id uuid)
RETURNS TABLE (
  fecha       date,
  ventas      numeric,
  tickets     bigint,
  comensales  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    d.fecha::date,
    SUM(d.total)       AS ventas,
    COUNT(*)           AS tickets,
    SUM(d.comensales)  AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha >= CURRENT_DATE - INTERVAL '6 days'
    AND d.fecha <= CURRENT_DATE
    -- Ensure caller has an active membership for this location
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN locations l ON l.org_id = m.org_id
      WHERE m.user_id   = auth.uid()
        AND m.is_active = true
        AND l.id        = p_location_id
    )
  GROUP BY d.fecha::date
  ORDER BY d.fecha::date;
$$;

-- ─── 2. Ventas semanales: últimas 6 semanas ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_semanales(p_location_id uuid)
RETURNS TABLE (
  semana      date,
  ventas      numeric,
  tickets     bigint,
  comensales  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    DATE_TRUNC('week', d.fecha)::date AS semana,
    SUM(d.total)                       AS ventas,
    COUNT(*)                           AS tickets,
    SUM(d.comensales)                  AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '5 weeks'
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN locations l ON l.org_id = m.org_id
      WHERE m.user_id   = auth.uid()
        AND m.is_active = true
        AND l.id        = p_location_id
    )
  GROUP BY DATE_TRUNC('week', d.fecha)
  ORDER BY semana;
$$;

-- ─── 3. Ventas mensuales: últimos 6 meses ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_mensuales(p_location_id uuid)
RETURNS TABLE (
  mes         text,
  ventas      numeric,
  tickets     bigint,
  comensales  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', d.fecha), 'YYYY-MM') AS mes,
    SUM(d.total)                                       AS ventas,
    COUNT(*)                                           AS tickets,
    SUM(d.comensales)                                  AS comensales
  FROM sales_documents d
  WHERE d.location_id = p_location_id
    AND d.fecha >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN locations l ON l.org_id = m.org_id
      WHERE m.user_id   = auth.uid()
        AND m.is_active = true
        AND l.id        = p_location_id
    )
  GROUP BY DATE_TRUNC('month', d.fecha)
  ORDER BY mes;
$$;

-- ─── 4. Financial results ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_financial_results(p_location_id uuid)
RETURNS TABLE (
  periodo   text,
  categoria text,
  concepto  text,
  monto     numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT periodo, categoria, concepto, monto
  FROM financial_results
  WHERE location_id = p_location_id
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN locations l ON l.org_id = m.org_id
      WHERE m.user_id   = auth.uid()
        AND m.is_active = true
        AND l.id        = p_location_id
    )
  ORDER BY periodo ASC, categoria ASC;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_ventas_semana(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ventas_semanales(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ventas_mensuales(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_results(uuid) TO authenticated;
