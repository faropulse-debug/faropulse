-- ============================================================
-- Migration: fix handle_new_user() — columna avatar_url inexistente
-- Fecha: 2026-07-28
--
-- supabase/fix-profiles-email.sql (aplicado a mano en PROD) agregó la
-- columna email a profiles pero recreó handle_new_user() dejando
-- avatar_url en el INSERT sin haber creado esa columna nunca.
--
-- public.profiles nunca tuvo avatar_url. Cada alta de usuario disparaba
-- el trigger AFTER INSERT on_auth_user_created -> handle_new_user(),
-- que fallaba con "column avatar_url does not exist" y hacía rollback
-- de toda la transacción, incluida la fila recién insertada en
-- auth.users. El dashboard de Supabase no propaga el mensaje de error
-- de Postgres y muestra "Failed to create user: {}".
--
-- Fix: mismo CREATE OR REPLACE, sin avatar_url en el INSERT. No se
-- agrega la columna — nada en el código (types/auth.ts UserProfile)
-- la referencia.
--
-- Aplicado a mano en PROD por Tano para desbloquear altas de usuario.
-- Esta migración versiona ese mismo fix y lo aplica en STG.
--
-- Verificación previa en STG (2026-07-28): la función handle_new_user()
-- no existía y el trigger on_auth_user_created tampoco estaba creado en
-- auth.users — fix-profiles-email.sql nunca se corrió ahí. No es "el
-- mismo trigger roto" como en PROD, es un gap distinto (trigger
-- ausente por completo), pero el efecto es el mismo problema de fondo:
-- profiles no se poblaba al crear usuarios. Se agrega el CREATE TRIGGER
-- IF NOT EXISTS para dejar STG y PROD consistentes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO UPDATE SET
    email     = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
      AND tgrelid = 'auth.users'::regclass
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;
