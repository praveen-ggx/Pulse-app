-- Throwaway schema for the owner status guard. Never run against a linked project.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  permissions jsonb
);

CREATE TABLE public.trips (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  status text,
  source text,
  source_market_bid_id uuid,
  indent_id uuid,
  supplier_id uuid,
  notes text
);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT ON public.organization_members TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.trips TO authenticated, service_role;
