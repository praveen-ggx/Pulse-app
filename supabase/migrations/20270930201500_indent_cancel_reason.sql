-- Shipper cancel reasons for the Trips hub Failed filter.
-- Codes: client_cancelled | indent_expired | cost_does_not_match

ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.indents
  DROP CONSTRAINT IF EXISTS indents_cancel_reason_check;

ALTER TABLE public.indents
  ADD CONSTRAINT indents_cancel_reason_check
  CHECK (
    cancel_reason IS NULL
    OR cancel_reason IN (
      'client_cancelled',
      'indent_expired',
      'cost_does_not_match'
    )
  );
