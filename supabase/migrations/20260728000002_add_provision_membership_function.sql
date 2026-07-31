-- ============================================================
-- Migration: provision_membership() — alta de usuario reutilizable
-- Fecha: 2026-07-28
--
-- Contexto: supabase/prod-add-readonly-user-20260724.sql daba de alta
-- usuarios con INSERT INTO profiles + INSERT INTO memberships, copiado
-- a mano por cada usuario nuevo. Desde 20260728000001
-- (fix_handle_new_user_avatar_url), el trigger on_auth_user_created ya
-- inserta la fila de profiles (id, email, full_name) apenas se crea el
-- usuario en Supabase Auth — el INSERT manual sobre profiles ahora
-- pisa esa fila y rompe con "duplicate key value violates unique
-- constraint profiles_pkey" (lo que le pasó a Tano el 2026-07-28).
--
-- Esta función reemplaza el copy/paste de INSERTs por una sola llamada
-- SELECT, evitando que el próximo fix a handle_new_user() vuelva a
-- desincronizar un script suelto. Es el primer paso hacia "alta sin
-- SQL manual" (Sprint F) — una función versionada es lo que un futuro
-- endpoint de administración terminaría llamando de todos modos.
--
-- No se expone a anon/authenticated: permitir que un usuario logueado
-- llame esto vía PostgREST le dejaría auto-asignarse cualquier role/
-- org_id/location_id. Solo service_role (y postgres/SQL Editor, que
-- ignora GRANT) puede ejecutarla.
-- ============================================================

CREATE OR REPLACE FUNCTION public.provision_membership(
  p_user_id     uuid,
  p_org_id      uuid,
  p_location_id uuid,
  p_role        text,
  p_full_name   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- profiles: la fila ya existe (trigger on_auth_user_created la crea
  -- con id/email/full_name al alta en Supabase Auth) — solo completamos
  -- lo que el trigger no sabe.
  UPDATE public.profiles
  SET role        = p_role,
      org_id      = p_org_id,
      location_id = p_location_id,
      full_name   = COALESCE(p_full_name, full_name)
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'profiles.id = % no existe. El usuario debe crearse primero en Supabase Auth (dispara handle_new_user) antes de llamar a provision_membership().',
      p_user_id;
  END IF;

  -- memberships: el trigger no la toca, hay que crearla (o
  -- reactivarla/actualizarla si ya existía para esa location).
  INSERT INTO public.memberships (user_id, org_id, location_id, role, is_active)
  VALUES (p_user_id, p_org_id, p_location_id, p_role, true)
  ON CONFLICT (user_id, location_id) DO UPDATE SET
    org_id    = EXCLUDED.org_id,
    role      = EXCLUDED.role,
    is_active = true;
END;
$$;

-- REVOKE ALL FROM PUBLIC alone is not enough: Supabase's default privileges
-- grant EXECUTE directly to anon/authenticated (not via PUBLIC) on every new
-- function, so those explicit grants survive a PUBLIC-only revoke. Verified
-- against STG — without these two extra REVOKEs, proacl still showed
-- anon=X and authenticated=X after the "PUBLIC" revoke below.
REVOKE ALL ON FUNCTION public.provision_membership(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_membership(uuid, uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.provision_membership(uuid, uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provision_membership(uuid, uuid, uuid, text, text) TO service_role;
