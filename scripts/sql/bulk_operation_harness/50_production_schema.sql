-- Disposable reproduction of the production payment surface.
-- No production connection. Tables are the columns, policies, indexes and
-- triggers that a compliance payment update actually runs through.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

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

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY
);

CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL,
  role text NOT NULL,
  permissions jsonb,
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE public.trips (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  supplier_id uuid,
  client_id uuid,
  supplier_rate numeric,
  supplier_rate_basis text,
  load_tons numeric,
  client_price numeric(12, 2),
  amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  operating_mode text,
  dco_payee_id uuid,
  source text,
  indent_id uuid,
  compliance_verified_at timestamptz,
  compliance_declined_at timestamptz,
  compliance_resubmitted_at timestamptz,
  finance_verified_at timestamptz,
  finance_verified_by uuid,
  finance_flagged_at timestamptz,
  finance_flagged_by uuid,
  finance_flag_note text,
  pod_received_at timestamptz
);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  system_party_key text
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id)
);

CREATE TABLE public.entity_bank_accounts (
  id uuid PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  deleted_at timestamptz
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  trip_id uuid,
  ledger_category text,
  description text,
  payment_reference text,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_out numeric,
  amount_in numeric,
  contact_type text,
  contact_id uuid,
  ledger_flow_type text,
  paid_from_account_id uuid REFERENCES public.entity_bank_accounts (id) ON DELETE SET NULL,
  created_by uuid
);

CREATE UNIQUE INDEX ux_transactions_compliance_trip_category
  ON public.transactions (trip_id, ledger_category)
  WHERE trip_id IS NOT NULL
    AND ledger_category IN ('compliance_advance', 'compliance_balance');

CREATE INDEX transactions_paid_from_account_id_idx
  ON public.transactions (paid_from_account_id)
  WHERE paid_from_account_id IS NOT NULL;

CREATE TABLE public.driver_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  driver_id uuid,
  trip_id uuid,
  type text,
  amount numeric,
  description text,
  reference_type text,
  reference_id uuid,
  created_by uuid
);

CREATE TABLE public.trip_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  org_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  payload jsonb,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  payment_type text NOT NULL CHECK (payment_type IN ('advance', 'balance')),
  request_no text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'partially_paid', 'paid', 'cancelled')),
  approved_amount numeric(12, 2) CHECK (approved_amount IS NULL OR approved_amount >= 0),
  currency text NOT NULL DEFAULT 'INR',
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_requests_cancel_fields CHECK (
    (status = 'cancelled') = (cancelled_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX ux_payment_requests_live_trip_type
  ON public.payment_requests (trip_id, payment_type)
  WHERE status <> 'cancelled';

CREATE TABLE public.payment_request_transactions (
  request_id uuid NOT NULL REFERENCES public.payment_requests (id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions (id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, transaction_id)
);

CREATE TABLE public.supplier_tds_rates (
  organization_id uuid,
  supplier_id uuid,
  financial_year text,
  rate_percent numeric,
  deleted_at timestamptz
);

CREATE TABLE public.org_document_charge_settings (
  organization_id uuid PRIMARY KEY,
  enabled boolean
);

CREATE TABLE public.org_document_charge_slabs (
  organization_id uuid,
  min_freight numeric,
  max_freight numeric,
  charge numeric,
  sort_order integer
);

CREATE TABLE public.exchange_trips (
  trip_id uuid PRIMARY KEY,
  market_bid_id uuid,
  enrolled_via text
);

CREATE TABLE public.marketplace_counterparty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  party_kind text NOT NULL,
  counterparty_organization_id uuid NOT NULL,
  supplier_id uuid,
  client_id uuid,
  promoted_at timestamptz
);

CREATE SEQUENCE payment_request_no_seq;

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

CREATE OR REPLACE FUNCTION public.is_org_staff(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_org_member(org_id);
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

CREATE OR REPLACE FUNCTION public.compliance_cleared(
  p_verified_at timestamptz,
  p_declined_at timestamptz,
  p_resubmitted_at timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_verified_at IS NOT NULL
     AND (
       p_declined_at IS NULL
       OR p_declined_at < p_verified_at
       OR (p_resubmitted_at IS NOT NULL AND p_resubmitted_at >= p_declined_at)
     );
$$;

CREATE OR REPLACE FUNCTION public.generate_payment_request_no(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN 'ORG-PAY-' || lpad(nextval('public.payment_request_no_seq')::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_payment_request_status(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req public.payment_requests%ROWTYPE;
  v_links int;
  v_status text;
BEGIN
  SELECT * INTO v_req FROM public.payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status = 'cancelled' THEN
    RETURN;
  END IF;
  SELECT count(*) INTO v_links
    FROM public.payment_request_transactions
   WHERE request_id = p_request_id;
  v_status := CASE WHEN v_links = 0 THEN 'pending' ELSE 'paid' END;
  IF v_status IS DISTINCT FROM v_req.status THEN
    UPDATE public.payment_requests SET status = v_status WHERE id = p_request_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_trip_finance_verified_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.finance_verified_at IS DISTINCT FROM OLD.finance_verified_at
       OR NEW.finance_verified_by IS DISTINCT FROM OLD.finance_verified_by) THEN
    RAISE EXCEPTION 'finance verify fields can only be changed via mark_trip_finance_verified() or unmark_trip_finance_verified()'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_trip_finance_verified_columns
  BEFORE UPDATE OF finance_verified_at, finance_verified_by
  ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.guard_trip_finance_verified_columns();

CREATE OR REPLACE FUNCTION public.lock_trip_for_compliance_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.trip_id IS NOT NULL
     AND NEW.ledger_category IN ('compliance_advance', 'compliance_balance') THEN
    PERFORM 1 FROM public.trips WHERE id = NEW.trip_id FOR UPDATE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_trip_for_compliance_ledger
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.lock_trip_for_compliance_ledger();

CREATE OR REPLACE FUNCTION public.check_transaction_paid_from_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.paid_from_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.entity_bank_accounts a
     WHERE a.id = NEW.paid_from_account_id
       AND a.entity_type = 'organization'
       AND a.entity_id = NEW.organization_id
       AND a.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'paid-from account must be one of this organization''s bank accounts'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_transaction_paid_from_account
  BEFORE INSERT OR UPDATE OF paid_from_account_id ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.check_transaction_paid_from_account();

CREATE OR REPLACE FUNCTION public.sync_trip_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trip_id uuid;
  v_client_price numeric(12, 2);
  v_amount_paid numeric(12, 2);
  v_status text;
BEGIN
  v_trip_id := COALESCE(NEW.trip_id, OLD.trip_id);
  IF v_trip_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT client_price INTO v_client_price FROM public.trips WHERE id = v_trip_id;
  IF v_client_price IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT COALESCE(SUM(amount_in) - SUM(amount_out), 0)
    INTO v_amount_paid
    FROM public.transactions
   WHERE trip_id = v_trip_id
     AND contact_type = 'client';
  v_amount_paid := GREATEST(v_amount_paid, 0);
  v_status := CASE
    WHEN v_amount_paid <= 0 THEN 'pending'
    WHEN v_amount_paid >= v_client_price THEN 'paid'
    ELSE 'partial'
  END;
  UPDATE public.trips
     SET amount_paid = v_amount_paid,
         payment_status = v_status
   WHERE id = v_trip_id
     AND (amount_paid IS DISTINCT FROM v_amount_paid
       OR payment_status IS DISTINCT FROM v_status);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_trip_payment_status
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_trip_payment_status();

CREATE OR REPLACE FUNCTION public.sync_driver_ledger_from_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_desc text;
BEGIN
  IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE') THEN
    DELETE FROM public.driver_ledger dl
     WHERE dl.reference_type = 'transaction'
       AND dl.reference_id = OLD.id
       AND dl.type = 'adjustment';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.contact_type <> 'driver'
     OR NEW.ledger_flow_type <> 'payable'
     OR COALESCE(NEW.amount_out, 0) <= 0
     OR NEW.trip_id IS NULL
     OR NEW.contact_id IS NULL
     OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_desc := COALESCE(NULLIF(TRIM(NEW.description), ''), 'Trip payment');
  INSERT INTO public.driver_ledger
    (organization_id, driver_id, trip_id, type, amount, description, reference_type, reference_id, created_by)
  VALUES
    (NEW.organization_id, NEW.contact_id, NEW.trip_id, 'adjustment', NEW.amount_out,
     v_desc, 'transaction', NEW.id, NEW.created_by);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_driver_ledger_from_transaction
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_driver_ledger_from_transaction();

CREATE OR REPLACE FUNCTION public._pulse_exchange_writer_active()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(current_setting('pulse.exchange_writer', true), '') = 'on';
$$;

CREATE OR REPLACE FUNCTION public._is_marketplace_fee_party(p_contact_type text, p_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_contact_id IS NOT NULL
    AND lower(coalesce(p_contact_type, '')) = 'supplier'
    AND EXISTS (
      SELECT 1 FROM public.suppliers s
       WHERE s.id = p_contact_id AND s.system_party_key = 'pulse_marketplace_fee'
    );
$$;

CREATE OR REPLACE FUNCTION public._is_marketplace_only_party(p_contact_type text, p_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_contact_id IS NOT NULL AND CASE lower(coalesce(p_contact_type, ''))
    WHEN 'supplier' THEN EXISTS (
      SELECT 1 FROM public.marketplace_counterparty_accounts m
       WHERE m.supplier_id = p_contact_id AND m.promoted_at IS NULL
    )
    WHEN 'client' THEN EXISTS (
      SELECT 1 FROM public.marketplace_counterparty_accounts m
       WHERE m.client_id = p_contact_id AND m.promoted_at IS NULL
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public._exchange_settlement_trip_id(p_trip_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT p_trip_id;
$$;

CREATE OR REPLACE FUNCTION public._exchange_trip_ledger_contact(p_trip_id uuid)
RETURNS TABLE (contact_type text, contact_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trip public.trips%ROWTYPE;
  v_anchor uuid;
BEGIN
  SELECT * INTO v_trip FROM public.trips t WHERE t.id = p_trip_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.exchange_trips et WHERE et.trip_id = v_trip.id) THEN
    IF v_trip.operating_mode = 'DCO' THEN
      RETURN QUERY SELECT 'dco'::text, v_trip.dco_payee_id;
    ELSE
      RETURN QUERY SELECT 'supplier'::text, v_trip.supplier_id;
    END IF;
    RETURN;
  END IF;
  IF v_trip.source = 'mover_asset' THEN
    v_anchor := public._exchange_settlement_trip_id(v_trip.id);
    IF v_anchor <> v_trip.id
       AND EXISTS (SELECT 1 FROM public.exchange_trips et WHERE et.trip_id = v_anchor) THEN
      RETURN QUERY SELECT 'client'::text, v_trip.client_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_transactions_pulse_exchange_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lc record;
BEGIN
  IF public._pulse_exchange_writer_active() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND (OLD.ledger_category IN ('EXCHANGE_PAYMENT', 'EXCHANGE_RECEIPT')
          OR public._is_marketplace_fee_party(OLD.contact_type, OLD.contact_id)) THEN
    RAISE EXCEPTION 'exchange_ledger_locked: a confirmed Pulse Exchange entry cannot be edited or deleted from Finance'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.ledger_category IN ('EXCHANGE_PAYMENT', 'EXCHANGE_RECEIPT')
     OR public._is_marketplace_fee_party(NEW.contact_type, NEW.contact_id) THEN
    RAISE EXCEPTION 'exchange_ledger_locked: Pulse Exchange entries post to Finance only after the other side confirms them'
      USING ERRCODE = '42501';
  END IF;
  IF public._is_marketplace_only_party(NEW.contact_type, NEW.contact_id) THEN
    RAISE EXCEPTION 'exchange_ledger_locked: payments with a Marketplace partner you are not connected to are recorded in Pulse Exchange on the trip'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.trip_id IS NOT NULL THEN
    SELECT * INTO v_lc FROM public._exchange_trip_ledger_contact(NEW.trip_id);
    IF v_lc.contact_type IS NOT NULL
       AND lower(coalesce(NEW.contact_type, '')) = v_lc.contact_type
       AND (v_lc.contact_type = 'dco' OR NEW.contact_id IS NOT DISTINCT FROM v_lc.contact_id) THEN
      RAISE EXCEPTION 'exchange_ledger_locked: this trip settles through Pulse Exchange; record the payment in Exchange'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transactions_pulse_exchange_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_transactions_pulse_exchange_guard();

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_request_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage transactions"
  ON public.transactions
  FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY compliance_transactions_insert_requires_finance_surface
  ON public.transactions
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (ledger_category IS DISTINCT FROM 'compliance_advance'
      AND ledger_category IS DISTINCT FROM 'compliance_balance')
    OR public.has_member_surface(organization_id, 'trip_compliance.finance.manage')
  );

CREATE POLICY compliance_transactions_update_requires_finance_surface
  ON public.transactions
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    (ledger_category IS DISTINCT FROM 'compliance_advance'
      AND ledger_category IS DISTINCT FROM 'compliance_balance')
    OR public.has_member_surface(organization_id, 'trip_compliance.finance.manage')
  )
  WITH CHECK (
    (ledger_category IS DISTINCT FROM 'compliance_advance'
      AND ledger_category IS DISTINCT FROM 'compliance_balance')
    OR public.has_member_surface(organization_id, 'trip_compliance.finance.manage')
  );

CREATE POLICY compliance_advance_requires_compliance_approved
  ON public.transactions
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ledger_category IS DISTINCT FROM 'compliance_advance'
    OR EXISTS (
      SELECT 1 FROM public.trips t
       WHERE t.id = transactions.trip_id
         AND public.compliance_cleared(t.compliance_verified_at, t.compliance_declined_at, t.compliance_resubmitted_at)
    )
  );

CREATE POLICY compliance_advance_requires_compliance_approved_on_update
  ON public.transactions
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    ledger_category IS DISTINCT FROM 'compliance_advance'
    OR EXISTS (
      SELECT 1 FROM public.trips t
       WHERE t.id = transactions.trip_id
         AND t.compliance_verified_at IS NOT NULL
    )
  )
  WITH CHECK (
    ledger_category IS DISTINCT FROM 'compliance_advance'
    OR EXISTS (
      SELECT 1 FROM public.trips t
       WHERE t.id = transactions.trip_id
         AND t.compliance_verified_at IS NOT NULL
    )
  );

CREATE POLICY compliance_balance_requires_pod_received
  ON public.transactions
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ledger_category IS DISTINCT FROM 'compliance_balance'
    OR EXISTS (
      SELECT 1 FROM public.trips t
       WHERE t.id = transactions.trip_id
         AND t.pod_received_at IS NOT NULL
    )
  );

CREATE POLICY compliance_balance_requires_pod_received_on_update
  ON public.transactions
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    ledger_category IS DISTINCT FROM 'compliance_balance'
    OR EXISTS (
      SELECT 1 FROM public.trips t
       WHERE t.id = transactions.trip_id
         AND t.pod_received_at IS NOT NULL
    )
  )
  WITH CHECK (
    ledger_category IS DISTINCT FROM 'compliance_balance'
    OR EXISTS (
      SELECT 1 FROM public.trips t
       WHERE t.id = transactions.trip_id
         AND t.pod_received_at IS NOT NULL
    )
  );

CREATE POLICY compliance_advance_requires_finance_verified
  ON public.transactions
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ledger_category IS DISTINCT FROM 'compliance_advance'
    OR EXISTS (
      SELECT 1 FROM public.trips t
       WHERE t.id = transactions.trip_id
         AND t.finance_verified_at IS NOT NULL
    )
  );

CREATE POLICY compliance_advance_requires_no_finance_flag
  ON public.transactions
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ledger_category IS DISTINCT FROM 'compliance_advance'
    OR NOT EXISTS (
      SELECT 1 FROM public.trips t
       WHERE t.id = transactions.trip_id
         AND t.finance_flagged_at IS NOT NULL
    )
  );

CREATE POLICY trips_member_select ON public.trips
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY payment_requests_select_org_staff ON public.payment_requests
  FOR SELECT USING (public.is_org_staff(organization_id));

CREATE POLICY payment_request_transactions_select_org_staff ON public.payment_request_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payment_requests r
       WHERE r.id = payment_request_transactions.request_id
         AND public.is_org_staff(r.organization_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT ON public.trips TO authenticated;
GRANT SELECT ON public.payment_requests TO authenticated;
GRANT SELECT ON public.payment_request_transactions TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_requests FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_request_transactions FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_member_surface(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_cleared(timestamptz, timestamptz, timestamptz) TO authenticated;

INSERT INTO public.organizations (id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('44444444-4444-4444-4444-444444444444');

INSERT INTO public.organization_members (organization_id, user_id, status, role, permissions) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'active', 'member',
   '{"surfaces":{"trip_compliance.finance.view":"true","trip_compliance.finance.manage":"true"}}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'active', 'member',
   '{"surfaces":{"trip_compliance.finance.view":"true"}}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'active', 'member',
   '{"surfaces":{"trip_compliance.finance.view":"true","trip_compliance.finance.manage":"true"}}');

INSERT INTO public.suppliers (id, organization_id) VALUES
  ('12121212-1212-1212-1212-121212121212', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

INSERT INTO public.suppliers (id, organization_id, system_party_key) VALUES
  ('13131313-1313-1313-1313-131313131313', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pulse_marketplace_fee');

INSERT INTO public.entity_bank_accounts (id, entity_type, entity_id) VALUES
  ('14141414-1414-1414-1414-141414141414', 'organization', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

INSERT INTO public.trips (
  id, organization_id, supplier_id, supplier_rate, supplier_rate_basis,
  operating_mode, compliance_verified_at, pod_received_at, client_price, amount_paid, payment_status
) VALUES
  ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '12121212-1212-1212-1212-121212121212', 10000, 'per_trip', 'FLEET', now(), now(), NULL, 0, 'pending'),
  ('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '12121212-1212-1212-1212-121212121212', 8000, 'per_trip', 'FLEET', now(), now(), NULL, 0, 'pending'),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '12121212-1212-1212-1212-121212121212', 10000, 'per_trip', 'FLEET', now(), now(), NULL, 0, 'pending'),
  ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '12121212-1212-1212-1212-121212121212', 8000, 'per_trip', 'FLEET', now(), now(), NULL, 0, 'pending'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '12121212-1212-1212-1212-121212121212', 10000, 'per_trip', 'FLEET', now(), now(), NULL, 0, 'pending'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '12121212-1212-1212-1212-121212121212', 10000, 'per_trip', 'FLEET', now(), now(), 5000, 0, 'pending');

CREATE TABLE public.bulk_prod_ids (
  k text PRIMARY KEY,
  v text NOT NULL
);
GRANT SELECT ON public.bulk_prod_ids TO authenticated;

CREATE TABLE public.bulk_test_state (
  k text PRIMARY KEY,
  v text NOT NULL
);

CREATE TABLE public.bulk_test_log (
  id bigserial PRIMARY KEY,
  who text,
  result jsonb
);

CREATE TABLE public.function_fingerprint (
  name text PRIMARY KEY,
  src text NOT NULL,
  owner oid NOT NULL
);
