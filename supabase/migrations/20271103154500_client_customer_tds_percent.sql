-- One TDS percent per client. Expected bank receipts use this rate.
-- Existing finance profiles stay at 0 until a user saves a rate.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.client_finance_profiles
  ADD COLUMN IF NOT EXISTS customer_tds_percent numeric(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.client_finance_profiles
  DROP CONSTRAINT IF EXISTS client_finance_profiles_customer_tds_percent_range;

ALTER TABLE public.client_finance_profiles
  ADD CONSTRAINT client_finance_profiles_customer_tds_percent_range
  CHECK (customer_tds_percent >= 0 AND customer_tds_percent <= 100);
