-- Per-account verification for entity bank accounts.
-- pending: not checked yet. verified: accepted. failed: check did not pass.

ALTER TABLE public.entity_bank_accounts
  ADD COLUMN IF NOT EXISTS verification_status text;

ALTER TABLE public.entity_bank_accounts
  DROP CONSTRAINT IF EXISTS entity_bank_accounts_verification_status_check;

ALTER TABLE public.entity_bank_accounts
  ADD CONSTRAINT entity_bank_accounts_verification_status_check
  CHECK (
    verification_status IS NULL
    OR verification_status IN ('pending', 'verified', 'failed')
  );

UPDATE public.entity_bank_accounts
SET verification_status = CASE
  WHEN verified_at IS NOT NULL THEN 'verified'
  ELSE 'pending'
END
WHERE verification_status IS NULL;

ALTER TABLE public.entity_bank_accounts
  ALTER COLUMN verification_status SET DEFAULT 'pending';

COMMENT ON COLUMN public.entity_bank_accounts.verification_status IS
  'Account verification: pending, verified, or failed.';
