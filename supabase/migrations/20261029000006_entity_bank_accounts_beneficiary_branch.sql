-- Beneficiary and branch on entity_bank_accounts, after 20261029000005 creates the table.
-- 20261005080754 skips these statements on a fresh database. Where that version
-- already added the columns, ADD COLUMN IF NOT EXISTS is a no-op.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.entity_bank_accounts
  ADD COLUMN IF NOT EXISTS beneficiary_name text,
  ADD COLUMN IF NOT EXISTS branch_name text;

COMMENT ON COLUMN public.entity_bank_accounts.beneficiary_name IS 'Account holder name the payout is addressed to (as printed on cheque / passbook).';
COMMENT ON COLUMN public.entity_bank_accounts.branch_name IS 'Bank branch name for ifsc_code; auto-filled from the IFSC directory, editable.';
