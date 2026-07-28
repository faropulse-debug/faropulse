-- ============================================================
-- SUPERADO por supabase/migrations/20260728000001_fix_handle_new_user_avatar_url.sql
--
-- Este script es el origen del bug de "Failed to create user: {}" en
-- PROD: el paso 3 dejaba avatar_url en el INSERT de handle_new_user()
-- sin que esa columna exista nunca en public.profiles. Cada alta de
-- usuario disparaba el trigger, fallaba con "column avatar_url does
-- not exist" y hacía rollback de toda la transacción (incluida la fila
-- de auth.users).
--
-- Se corrige acá abajo (se saca avatar_url) para que si alguien vuelve
-- a correr este archivo en algún ambiente, no reintroduzca el bug —
-- pero la migración versionada de arriba es la fuente de verdad para
-- aplicar el fix; no re-ejecutar este archivo suelto.
-- ============================================================

-- 1. Agregar columna email a profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Poblar email desde auth.users para filas existentes
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND p.email IS NULL;

-- 3. Actualizar el trigger handle_new_user para incluir email
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

-- 4. Verificar que el trigger existe (re-crear si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;
