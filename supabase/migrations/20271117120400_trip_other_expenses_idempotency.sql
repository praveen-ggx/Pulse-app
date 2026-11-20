-- "Other" trip expenses could be saved twice when the network timed out and the
-- driver tapped Save again. Fuel and toll already prevent this
-- (20261203120000_trip_operations_idempotency.sql); same pattern here.
--
-- The app sends one key per expense being added and reuses it on a retry.
-- UNIQUE on non-null keys -> the second insert fails with 23505 and the app
-- returns the row that was already saved. Existing rows (key = NULL) are unaffected.
-- Additive only.

ALTER TABLE public.trip_other_expenses
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS trip_other_expenses_idempotency_key_unique
  ON public.trip_other_expenses (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

NOTIFY pgrst, 'reload schema';
