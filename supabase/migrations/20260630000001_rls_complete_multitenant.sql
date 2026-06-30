-- Fase 6: RLS completa multi-tenant (ejecutado en STG+PROD 30/jun/2026)

-- recipes
CREATE POLICY recipes_select ON public.recipes FOR SELECT TO authenticated USING (user_has_membership(location_id));
CREATE POLICY recipes_insert ON public.recipes FOR INSERT TO authenticated WITH CHECK (user_has_membership(location_id));
CREATE POLICY recipes_delete ON public.recipes FOR DELETE TO authenticated USING (user_has_membership(location_id));

-- upload_events
CREATE POLICY upload_events_select ON public.upload_events FOR SELECT TO authenticated USING (user_has_membership(location_id));
CREATE POLICY upload_events_insert ON public.upload_events FOR INSERT TO authenticated WITH CHECK (user_has_membership(location_id));
CREATE POLICY upload_events_delete ON public.upload_events FOR DELETE TO authenticated USING (user_has_membership(location_id));

-- calendar_context (referencia, lectura para todos)
CREATE POLICY calendar_context_select ON public.calendar_context FOR SELECT TO authenticated USING (true);

-- limpieza: duplicada de profiles
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;

-- limpieza: public→authenticated en memberships
DROP POLICY IF EXISTS "Members can view own memberships" ON public.memberships;
CREATE POLICY memberships_select_own ON public.memberships FOR SELECT TO authenticated USING (user_id = auth.uid());

-- limpieza: public→authenticated en organizations
DROP POLICY IF EXISTS "Members can view their orgs" ON public.organizations;
CREATE POLICY organizations_select_own ON public.organizations FOR SELECT TO authenticated USING (id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid() AND is_active = true));

-- limpieza: public→authenticated en profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
