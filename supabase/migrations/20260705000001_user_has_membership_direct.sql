-- ============================================================
-- Migration: user_has_membership queries location_id directly
-- Fecha: 2026-07-05
--
-- Multi-location migrate step 3.
--
-- memberships.location_id AHORA existe (columna agregada en la
-- migración multi-location). Antes la relación era indirecta:
-- memberships.org_id → locations.org_id → locations.id, por lo
-- que la función necesitaba un JOIN contra locations para poder
-- filtrar por p_location_id. Con location_id ya presente en
-- memberships, el JOIN se elimina y se filtra directo por
-- m.location_id = p_location_id.
--
-- Mismo SQL ya ejecutado y validado manualmente en STG
-- (owner ve todo, Rival ve cero filas).
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_has_membership(p_location_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships m
    WHERE m.user_id     = auth.uid()
      AND m.is_active    = true
      AND m.location_id  = p_location_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_membership(uuid) TO authenticated;
