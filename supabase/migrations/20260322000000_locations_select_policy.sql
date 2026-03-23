ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY locations_select_own_org
  ON public.locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.is_active = true
        AND m.org_id = locations.org_id
    )
  );

GRANT SELECT ON public.locations TO authenticated;
