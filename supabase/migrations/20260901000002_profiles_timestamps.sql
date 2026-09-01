-- profiles no tenia ninguna columna temporal (ni created_at ni updated_at).
-- Consecuencia: un alta de usuario o un cambio de rol en profiles.role es
-- estructuralmente indetectable -- no hay forma de saber cuando paso, ni de
-- reconstruirlo despues del hecho. Ninguna otra tabla del esquema tiene este
-- problema en su forma completa (ver auditoria en la descripcion del PR).
--
-- Columnas aditivas, mismo patron que user_widget_config
-- (20260328000000_widget_system.sql): created_at + updated_at + trigger
-- set_updated_at() -- la funcion ya existe (creada en esa migracion), no
-- hace falta redefinirla, solo agregar el trigger sobre profiles.
--
-- Backfill de filas existentes:
--
--   created_at <- auth.users.created_at (via el JOIN por profiles.id =
--   auth.users.id, que es 1:1 por el FK de la tabla). No es un valor
--   inventado: auth.users.created_at es un hecho historico real y
--   confiable -- el trigger on_auth_user_created inserta la fila de
--   profiles en la misma transaccion que crea el usuario en Auth (ver
--   20260728000001_fix_handle_new_user_avatar_url.sql), asi que para todo
--   usuario dado de alta por ese camino los dos timestamps coinciden.
--   Para usuarios mas viejos, dados de alta antes de que ese trigger
--   existiera (via el INSERT manual documentado en
--   project_provision_membership), es la mejor cota disponible: la fila
--   de profiles no pudo haberse creado antes que la de auth.users.
--   Preferible a now() (que afirmaria "se crearon todos hoy", falso) o a
--   NULL (que tira la pregunta para adelante sin necesidad, cuando el
--   dato SI existe en auth.users).
--
--   updated_at <- mismo valor que created_at para filas existentes. No hay
--   ninguna fuente para "cuando fue el ultimo cambio real" de una fila
--   historica -- inventar una fecha de "ultima edicion" seria peor que no
--   tener el dato. Sentar updated_at = created_at dice, honestamente,
--   "no hay ningun cambio confirmado desde el alta" -- que es exactamente
--   lo que se sabe hoy. De ahi en adelante el trigger la mantiene al dia.

ALTER TABLE public.profiles
  ADD COLUMN created_at timestamptz,
  ADD COLUMN updated_at timestamptz;

UPDATE public.profiles p
SET created_at = u.created_at,
    updated_at = u.created_at
FROM auth.users u
WHERE p.id = u.id;

-- Fallback defensivo: si por algun motivo el JOIN no encontro fila en
-- auth.users (no deberia pasar, profiles.id es FK a auth.users.id), no
-- dejar la columna en NULL silencioso -- usar now() como ultimo recurso
-- explicito, y que quede a la vista via el propio valor (va a ser
-- notoriamente mas reciente que el resto).
UPDATE public.profiles
SET created_at = now(), updated_at = now()
WHERE created_at IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'profiles_updated_at'
  ) THEN
    CREATE TRIGGER profiles_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.created_at IS
  'Backfill desde auth.users.created_at para filas preexistentes (ver detalle arriba). De ahi en mas, DEFAULT now() al insertar.';
COMMENT ON COLUMN public.profiles.updated_at IS
  'Backfill = created_at para filas preexistentes (sin fuente de ultima edicion real). Mantenida por el trigger profiles_updated_at desde esta migracion en adelante.';
