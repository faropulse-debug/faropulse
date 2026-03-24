ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'locations_select_own_org' AND tablename = 'locations') THEN
    CREATE POLICY locations_select_own_org ON public.locations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.is_active = true AND m.org_id = locations.org_id));
  END IF;
END $$;

GRANT SELECT ON public.locations TO authenticated;
