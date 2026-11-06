-- Disposable local Postgres only. No production access.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT string_to_array(name, '/')
$$;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  name text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  role text NOT NULL DEFAULT 'member',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
  );
$$;

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text,
  linked_organization_id uuid
);

CREATE TABLE public.entity_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  bank_name text,
  account_number text,
  ifsc_code text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  linked_organization_id uuid
);

CREATE TABLE public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid
);

CREATE TABLE public.indents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid,
  sales_order_id uuid,
  execution_plan_id uuid
);

CREATE TABLE public.organization_member_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_member_id uuid NOT NULL,
  warehouse_id uuid NOT NULL
);

CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY,
  pickup_warehouse_id uuid,
  drop_warehouse_id uuid
);

CREATE TABLE public.sales_order_lines (
  id uuid PRIMARY KEY,
  sales_order_id uuid
);

CREATE TABLE public.shipment_allocations (
  id uuid PRIMARY KEY,
  execution_plan_id uuid,
  sales_order_line_id uuid
);

CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  supplier_id uuid,
  client_id uuid,
  driver_id uuid,
  indent_id uuid
);

CREATE TABLE public.trip_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL
);

CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner_id text
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_bank_accounts TO authenticated;
