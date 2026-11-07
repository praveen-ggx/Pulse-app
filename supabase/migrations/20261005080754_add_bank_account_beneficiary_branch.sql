-- Beneficiary (account holder) and branch name on payout accounts.
-- Captured on the supplier Banking card and shown wherever payout details are
-- used (compliance bank docs, Advance Processed payments table, exports).
-- Additive + idempotent: safe to apply out of order.
-- The table is created by 20261029000005. On a fresh database these statements
-- wait for 20261029000006. Where the table already exists, they still run.

DO $guard$
BEGIN
  IF to_regclass('public.entity_bank_accounts') IS NULL THEN
    RAISE NOTICE 'entity_bank_accounts is not present yet; beneficiary columns are added after the table exists';
    RETURN;
  END IF;

  ALTER TABLE public.entity_bank_accounts
    ADD COLUMN IF NOT EXISTS beneficiary_name text,
    ADD COLUMN IF NOT EXISTS branch_name text;

  COMMENT ON COLUMN public.entity_bank_accounts.beneficiary_name IS 'Account holder name the payout is addressed to (as printed on cheque / passbook).';
  COMMENT ON COLUMN public.entity_bank_accounts.branch_name IS 'Bank branch name for ifsc_code; auto-filled from the IFSC directory, editable.';
END
$guard$;
