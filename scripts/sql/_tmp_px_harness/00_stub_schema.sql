-- Minimal stand-in for the production objects the Pulse Exchange migration
-- touches. Hand-written; contains no production data or schema dump.
\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.users (id uuid PRIMARY KEY, name text);
CREATE TABLE public.org_members (organization_id uuid, user_id uuid, staff boolean DEFAULT true);

CREATE FUNCTION public.is_org_member(org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members m WHERE m.organization_id = org_id AND m.user_id = auth.uid())
$$;
CREATE FUNCTION public.is_org_staff(org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members m WHERE m.organization_id = org_id AND m.user_id = auth.uid() AND m.staff)
$$;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid), public.is_org_staff(uuid) TO authenticated;

CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text, company_name text, contact text, contact_person text, phone text,
  supplier_type text CHECK (supplier_type = ANY (ARRAY['integrated','offline','marketplace'])),
  is_active boolean DEFAULT true,
  vendor_status text DEFAULT 'active' CHECK (vendor_status = ANY (ARRAY['active','inactive','blacklisted'])),
  linked_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX uq_suppliers_org_linked_org ON public.suppliers (organization_id, linked_organization_id) WHERE linked_organization_id IS NOT NULL;
CREATE TRIGGER set_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE FUNCTION public.suppliers_block_deprecated_fields() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.company_name IS NOT NULL OR NEW.contact IS NOT NULL) THEN
    RAISE EXCEPTION 'suppliers: deprecated columns';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_suppliers_block_deprecated_fields BEFORE INSERT OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.suppliers_block_deprecated_fields();

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL, phone text NOT NULL, notes text,
  client_status text DEFAULT 'customer' CHECK (client_status = ANY (ARRAY['prospect','customer','inactive','blacklisted'])),
  status text DEFAULT 'active' CHECK (status = ANY (ARRAY['active','inactive'])),
  linked_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, phone)
);

CREATE TABLE public.drivers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, name text);
CREATE TABLE public.vehicles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid);
CREATE TABLE public.organization_counters (organization_id uuid PRIMARY KEY, trip_seq bigint DEFAULT 0);

CREATE TABLE public.indents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  owner_user_id uuid, status text DEFAULT 'open',
  assigned_supplier_id uuid, assigned_supplier_rate numeric, supplier_target numeric,
  client_price numeric, circulation_target text,
  pickup_area text DEFAULT 'A', drop_location text DEFAULT 'B', client_name text DEFAULT 'Customer',
  pickup_date date, load_type text, indent_code text, deleted_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.market_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indent_id uuid REFERENCES public.indents(id),
  bidder_type text, bidder_organization_id uuid, bidder_user_id uuid,
  status text, amount numeric, fee_payment_status text,
  platform_fee_amount numeric, platform_fee_calc_snapshot jsonb,
  accepted_at timestamptz, updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.direct_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indent_id uuid REFERENCES public.indents(id), bidder_organization_id uuid,
  amount numeric, notes text, status text, driver_id uuid, vehicle_id uuid, counter_amount numeric,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  owner_user_id uuid, created_by_user_id uuid, trip_number text, booking_ref text UNIQUE,
  indent_id uuid, source text, source_market_bid_id uuid, source_indent_id uuid, source_indent_code text,
  pickup_area text, drop_location text, client_name text, client_id uuid,
  client_price numeric(12,2), supplier_rate numeric, supplier_id uuid,
  trip_payout_mode text, driver_id uuid, vehicle_id uuid, status text,
  pickup_date date, load_type text, vehicle_display_number text,
  platform_fee numeric, driver_commission numeric, payment_status text, amount_paid numeric(12,2),
  platform_fee_calc_snapshot jsonb, sale_rate_basis text, deleted_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX trips_one_per_indent ON public.trips (indent_id) WHERE indent_id IS NOT NULL AND status <> 'cancelled';
CREATE FUNCTION public.tg_stub_trip_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(NEW.trip_number, '') = '' THEN NEW.trip_number := 'TRP' || substr(NEW.id::text, 1, 6); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_stub_trip_number BEFORE INSERT ON public.trips FOR EACH ROW EXECUTE FUNCTION public.tg_stub_trip_number();

CREATE TABLE public.trip_finance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid, organization_id uuid,
  type text, impact text, amount numeric, voided_at timestamptz
);
CREATE TABLE public.trip_subcontracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid, supplier_id uuid, rate numeric, viewer_org_id uuid
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  booking_ref text REFERENCES public.trips(booking_ref) ON DELETE SET NULL,
  party_name text, description text,
  amount_in numeric DEFAULT 0, amount_out numeric DEFAULT 0,
  transaction_date date DEFAULT current_date,
  contact_id uuid, contact_type text, ledger_entity_type text, ledger_flow_type text, ledger_category text,
  payment_ref text, payment_reference text, created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  CHECK (((amount_in > 0) AND (amount_out = 0)) OR ((amount_out > 0) AND (amount_in = 0))),
  CONSTRAINT transactions_contact_type_check CHECK (contact_type IS NULL OR contact_type = ANY (ARRAY['client','supplier','driver','dco'])),
  CONSTRAINT transactions_ledger_entity_type_check CHECK (ledger_entity_type IS NULL OR ledger_entity_type = ANY (ARRAY['client','supplier','driver','vehicle','platform','dco'])),
  CONSTRAINT transactions_ledger_flow_type_check CHECK (ledger_flow_type IS NULL OR ledger_flow_type = ANY (ARRAY['receivable','payable','expense']))
);
CREATE UNIQUE INDEX idx_transactions_trip_auto_category ON public.transactions (trip_id, ledger_category)
  WHERE ledger_category = ANY (ARRAY['TRIP_REVENUE','DRIVER_COMMISSION','MARKETPLACE_PLATFORM_FEE']);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage transactions" ON public.transactions FOR ALL
  USING (public.is_org_staff(organization_id)) WITH CHECK (public.is_org_staff(organization_id));
CREATE TABLE public.marketplace_fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_bid_id uuid, bidder_type text, bidder_user_id uuid, bidder_organization_id uuid,
  amount numeric, provider text, provider_order_id text, provider_payment_id text, provider_event_id text,
  status text, paid_at timestamptz, failed_at timestamptz, failure_reason text,
  updated_at timestamptz DEFAULT now()
);

CREATE FUNCTION public.is_approved_supplier(p_owner uuid, p_bidder uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.organization_id = p_owner AND s.linked_organization_id = p_bidder AND coalesce(s.is_active, true))
$$;
CREATE FUNCTION public.indent_has_convertible_sale(p_indent public.indents) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(p_indent.client_price, 0) > 0
$$;
CREATE FUNCTION public._ensure_mover_asset_trip(uuid, uuid, uuid, text, uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.extract_ledger_meta_trip_number(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::text $$;

-- DCO award surface.
CREATE VIEW public.organization_members AS
  SELECT organization_id, user_id, 'active'::text AS status,
         CASE WHEN staff THEN 'member' ELSE 'driver' END AS role
  FROM public.org_members;
CREATE TABLE public.dco_payees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.owner_vehicles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid, deleted_at timestamptz);
CREATE TABLE public.driver_direct_bids (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), driver_user_id uuid, status text, updated_at timestamptz);
ALTER TABLE public.trips ADD COLUMN operating_mode text, ADD COLUMN dco_payee_id uuid, ADD COLUMN owner_vehicle_id uuid;
-- Production definition (pg_get_constraintdef, 2026-10-06).
ALTER TABLE public.trips ADD CONSTRAINT trips_dco_consistency_check CHECK (
  ((operating_mode = 'DCO' AND dco_payee_id IS NOT NULL AND supplier_id IS NULL)
   OR (operating_mode = 'FLEET' AND dco_payee_id IS NULL)));
ALTER TABLE public.market_bids ADD COLUMN owner_vehicle_id uuid;
ALTER TABLE public.drivers ADD COLUMN user_id uuid;
CREATE FUNCTION public.is_driver_available(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.get_dco_payee_id(p_user uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.dco_payees WHERE user_id = p_user
$$;
CREATE FUNCTION public._resolve_or_create_market_driver(p_org uuid, p_user uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v uuid;
BEGIN
  SELECT id INTO v FROM public.drivers WHERE organization_id = p_org AND user_id = p_user;
  IF v IS NULL THEN
    INSERT INTO public.drivers (organization_id, user_id, name) VALUES (p_org, p_user, 'DCO') RETURNING id INTO v;
  END IF;
  RETURN v;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions, public.suppliers, public.clients, public.trips TO authenticated;
GRANT SELECT ON public.indents, public.market_bids, public.organizations TO authenticated;
