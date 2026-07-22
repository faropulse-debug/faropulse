-- Versiona get_ventas_semana y get_ventas_semanales, ya existentes en STG+PROD
-- (aplicadas a mano vía supabase/fn_dashboard_queries.sql, nunca versionadas).
-- Definición copiada verbatim de fn_dashboard_queries.sql — documenta lo que hay,
-- no cambia comportamiento.

-- ─── Ventas diarias: últimos 7 días ───────────────────────────────────────
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

-- ─── Ventas semanales: últimas 6 semanas ──────────────────────────────────
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

GRANT EXECUTE ON FUNCTION public.get_ventas_semana(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ventas_semanales(uuid) TO authenticated;
