-- Vendor onboarding pack (supplier Verification Vault, vendor status, advance %, TDS by year).
-- Additive and idempotent. Existing rows keep working: vendor_status defaults to 'active',
-- new columns are nullable, and the trips trigger only fires when a supplier is newly assigned.

-- ─── supplier_kyc_documents: optional per-file document number ────────────────
ALTER TABLE public.supplier_kyc_documents
  ADD COLUMN IF NOT EXISTS doc_number text;

-- ─── suppliers: vendor status, advance %, Aadhaar number ─────────────────────
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS vendor_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS blacklist_reason text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS advance_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS aadhaar_number text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_vendor_status_check') THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_vendor_status_check
      CHECK (vendor_status IN ('active', 'inactive', 'blacklisted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_advance_percentage_check') THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_advance_percentage_check
      CHECK (advance_percentage IS NULL OR (advance_percentage >= 0 AND advance_percentage <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_blacklist_reason_check') THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_blacklist_reason_check
      CHECK (vendor_status <> 'blacklisted' OR length(trim(coalesce(blacklist_reason, ''))) > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.suppliers.vendor_status IS
  'Vendor lifecycle: active | inactive | blacklisted. Blacklisted vendors cannot be assigned to new trips.';
COMMENT ON COLUMN public.suppliers.advance_percentage IS
  'Default advance % of the partner rate paid to this vendor (0–100). Informational; no ledger effect.';

-- ─── supplier_tds_rates: TDS rate per financial year ─────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_tds_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  financial_year  text NOT NULL CHECK (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  rate_percent    numeric(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_tds_rates_supplier_fy
  ON public.supplier_tds_rates (supplier_id, financial_year)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_tds_rates_org
  ON public.supplier_tds_rates (organization_id);

ALTER TABLE public.supplier_tds_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members manage supplier tds rates" ON public.supplier_tds_rates;
CREATE POLICY "Org members manage supplier tds rates"
  ON public.supplier_tds_rates FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_tds_rates TO authenticated;
GRANT ALL ON public.supplier_tds_rates TO service_role;

DROP TRIGGER IF EXISTS trg_supplier_tds_rates_updated_at ON public.supplier_tds_rates;
CREATE TRIGGER trg_supplier_tds_rates_updated_at
  BEFORE UPDATE ON public.supplier_tds_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── trips: block assigning a blacklisted vendor ─────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_trips_block_blacklisted_supplier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = NEW.supplier_id AND s.vendor_status = 'blacklisted'
  ) THEN
    RAISE EXCEPTION 'vendor_blacklisted: this vendor is blacklisted and cannot be assigned to a trip'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_trips_block_blacklisted_supplier() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_trips_block_blacklisted_supplier ON public.trips;
CREATE TRIGGER trg_trips_block_blacklisted_supplier
  BEFORE INSERT OR UPDATE OF supplier_id ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.tg_trips_block_blacklisted_supplier();
