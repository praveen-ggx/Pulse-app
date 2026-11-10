-- Throwaway schema for the chat status RPC. Never run against a linked project.
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
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text
);

CREATE TABLE public.trip_conversations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  trip_id uuid NOT NULL
);

CREATE TABLE public.trip_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  organization_id uuid,
  sender_user_id uuid,
  sender_role text,
  sender_name text,
  content text,
  message_type text,
  metadata jsonb,
  is_read boolean,
  is_delivered boolean
);

-- Production definition, so inactive and cross-org callers fail closed here.
CREATE OR REPLACE FUNCTION public.is_org_staff(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
      AND role = ANY (ARRAY['owner','admin','member','dispatcher','finance'])
  );
$$;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT ON public.organization_members, public.profiles TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.trips TO authenticated, service_role;
GRANT SELECT ON public.trip_conversations TO authenticated, service_role;
GRANT INSERT, SELECT ON public.trip_messages TO authenticated, service_role;
