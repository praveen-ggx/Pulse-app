-- Minimal stand-ins for the Supabase objects migration 20261029171316 reads.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE TABLE public.organizations (id uuid primary key);
CREATE TABLE public.organization_members (id uuid primary key, organization_id uuid, user_id uuid, role text, status text, permissions jsonb);
CREATE TABLE public.clients (id uuid primary key, organization_id uuid, deleted_at timestamptz);
CREATE TABLE public.client_warehouses (id uuid primary key, organization_id uuid, client_id uuid, deleted_at timestamptz);
CREATE TABLE public.organization_member_warehouses (id uuid primary key default gen_random_uuid(), organization_member_id uuid, warehouse_id uuid, UNIQUE (organization_member_id, warehouse_id));
CREATE TABLE public.workspace_audit_log (org_id uuid, actor_id uuid, event_type text, payload jsonb);
CREATE FUNCTION public.is_org_admin(org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = org_id AND user_id = auth.uid() AND role IN ('owner','admin') AND status = 'active'); $$;
ALTER TABLE public.organization_member_warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_member_warehouses_self_select" ON public.organization_member_warehouses FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.id = organization_member_warehouses.organization_member_id AND om.user_id = (SELECT auth.uid())));
CREATE POLICY "org_member_warehouses_staff_manage" ON public.organization_member_warehouses FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
