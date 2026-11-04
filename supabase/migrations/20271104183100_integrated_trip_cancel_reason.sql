-- Integrated trip cancel: store the reason and who cancelled.
-- The trip row is marked cancelled and unlinked from the indent in the app.
-- The indent is reopened separately so it can be awarded again.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancel_reason_note text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

COMMENT ON COLUMN public.trips.cancel_reason IS
  'Integrated-trip cancel reason id (client_requested, no_driver_vehicle, duplicate_trip, rate_pricing, operational, other).';
COMMENT ON COLUMN public.trips.cancel_reason_note IS
  'Free-text note when cancel_reason is other.';
