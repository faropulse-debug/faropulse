-- Fase 0: versionar RLS que en PROD está aplicado a mano y en STG falta.
-- Alinea STG con PROD: habilita RLS en las 5 tablas de negocio que quedaron
-- sin versionar, crea las policies de sales_items (nunca existieron en el
-- repo) y elimina la policy anon huérfana de sales_documents (aplicada a
-- mano solo en STG). Idempotente: seguro de re-ejecutar.

-- 1. Habilitar RLS (ALTER TABLE ... ENABLE ROW LEVEL SECURITY es idempotente)
ALTER TABLE public.memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_events ENABLE ROW LEVEL SECURITY;

-- 2. Policies de sales_items — naming real de PROD (creadas a mano vía
--    Studio, confirmado por lectura directa de pg_policies en PROD el
--    2026-07-12: 'members can select/insert/delete sales_items', todas
--    TO authenticated USING/WITH CHECK user_has_membership(location_id)).
--    Se limpian los nombres sales_items_* de un apply anterior de esta
--    misma migración en STG (no existen en PROD, DROP IF EXISTS es no-op ahí)
--    y se crean con el nombre real para evitar duplicar en PROD.
DROP POLICY IF EXISTS sales_items_select ON public.sales_items;
DROP POLICY IF EXISTS sales_items_insert ON public.sales_items;
DROP POLICY IF EXISTS sales_items_delete ON public.sales_items;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'sales_items'
      AND policyname = 'members can select sales_items'
  ) THEN
    CREATE POLICY "members can select sales_items"
      ON public.sales_items
      FOR SELECT
      TO authenticated
      USING (public.user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'sales_items'
      AND policyname = 'members can insert sales_items'
  ) THEN
    CREATE POLICY "members can insert sales_items"
      ON public.sales_items
      FOR INSERT
      TO authenticated
      WITH CHECK (public.user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'sales_items'
      AND policyname = 'members can delete sales_items'
  ) THEN
    CREATE POLICY "members can delete sales_items"
      ON public.sales_items
      FOR DELETE
      TO authenticated
      USING (public.user_has_membership(location_id));
  END IF;
END $$;

-- 3. Eliminar policy anon huérfana (sin versionar, solo aplicada a mano en STG)
DROP POLICY IF EXISTS anon_select_sales_documents ON public.sales_documents;

-- 4. Policies de memberships/organizations/profiles/upload_events.
--    Ya estaban escritas en 20260630000001_rls_complete_multitenant.sql pero
--    ese archivo nunca corrió contra STG (confirmado: RLS on + 0 políticas
--    tras el paso 1 de esta migración). Mismo contenido, ahora idempotente.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'upload_events' AND policyname = 'upload_events_select'
  ) THEN
    CREATE POLICY upload_events_select ON public.upload_events FOR SELECT TO authenticated USING (user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'upload_events' AND policyname = 'upload_events_insert'
  ) THEN
    CREATE POLICY upload_events_insert ON public.upload_events FOR INSERT TO authenticated WITH CHECK (user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'upload_events' AND policyname = 'upload_events_delete'
  ) THEN
    CREATE POLICY upload_events_delete ON public.upload_events FOR DELETE TO authenticated USING (user_has_membership(location_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'memberships' AND policyname = 'memberships_select_own'
  ) THEN
    CREATE POLICY memberships_select_own ON public.memberships FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'organizations_select_own'
  ) THEN
    CREATE POLICY organizations_select_own ON public.organizations FOR SELECT TO authenticated USING (id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid() AND is_active = true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_own'
  ) THEN
    CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_own'
  ) THEN
    CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
  END IF;
END $$;
