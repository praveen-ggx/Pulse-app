-- Disposable schema for the bulk-operation gate. No production data.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL,
  role text NOT NULL,
  permissions jsonb,
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  compliance_verified_at timestamptz,
  pod_received_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  trip_id uuid,
  ledger_category text,
  description text,
  payment_reference text,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_out numeric,
  amount_in numeric
);

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
     WHERE m.organization_id = org_id
       AND m.user_id = auth.uid()
       AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_member_surface(p_org_id uuid, p_surface_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
     WHERE m.organization_id = p_org_id
       AND m.user_id = auth.uid()
       AND m.status = 'active'
       AND (
         m.role IN ('owner', 'admin')
         OR (m.permissions -> 'surfaces' ->> p_surface_id) = 'true'
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_member_surface(uuid, text) TO authenticated;
