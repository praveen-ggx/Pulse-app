-- Prerequisite for 20261113104714 on a clean replay.
--
-- That file replaces get_direct_quotes_with_bidder_names with a row type that
-- includes counter_amount. PostgreSQL cannot change a function's return type
-- with CREATE OR REPLACE. On existing databases the January migration
-- 20270111000000 had already dropped and recreated the function, so the
-- November file matched. A filename-order replay still has the March return
-- type, which has no counter_amount.
--
-- Drop only that older return type. A database whose function already returns
-- counter_amount is left in place, because this file can be applied later and
-- must not remove the live function. The column uses the same type and check
-- as 20270111000000, which still adds them with IF NOT EXISTS.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.direct_quotes
  ADD COLUMN IF NOT EXISTS counter_amount numeric(12, 2);

ALTER TABLE public.direct_quotes
  DROP CONSTRAINT IF EXISTS direct_quotes_counter_amount_check;

ALTER TABLE public.direct_quotes
  ADD CONSTRAINT direct_quotes_counter_amount_check
  CHECK (counter_amount IS NULL OR counter_amount > 0);

DO $drop_old_quote_names$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_direct_quotes_with_bidder_names'
      AND pg_get_function_identity_arguments(p.oid) = 'p_indent_id uuid'
      AND position('counter_amount' in pg_get_function_result(p.oid)) = 0
  ) THEN
    DROP FUNCTION public.get_direct_quotes_with_bidder_names(uuid);
  END IF;
END
$drop_old_quote_names$;
