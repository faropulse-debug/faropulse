-- RPC: get_financial_results
-- Versioned: 2026-05-14. Versioned from production STG without modifications.
-- Source: copied from supabase/fn_dashboard_queries.sql (function #4)

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

GRANT EXECUTE ON FUNCTION public.get_financial_results(uuid) TO anon, authenticated, service_role;
