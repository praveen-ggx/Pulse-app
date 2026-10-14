-- Reverse a paid test_online marketplace fee and revoke the award in one transaction.
-- Does not change revoke_indent_award. A paid fee still blocks that function.
-- Razorpay and cash are refused here. cancelled stays "abandoned unpaid checkout".

DO $$
DECLARE
  v_name text;
BEGIN
  SELECT c.conname INTO v_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.market_bids'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%fee_payment_status%'
    AND pg_get_constraintdef(c.oid) ILIKE '%not_required%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.market_bids DROP CONSTRAINT %I', v_name);
  END IF;

  SELECT c.conname INTO v_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.marketplace_fee_payments'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%cancelled%'
    AND pg_get_constraintdef(c.oid) ILIKE '%pending%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.marketplace_fee_payments DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.market_bids
  ADD CONSTRAINT market_bids_fee_payment_status_check
  CHECK (fee_payment_status IN (
    'not_required', 'required', 'pending', 'paid', 'failed', 'expired', 'refunded'
  ));

ALTER TABLE public.marketplace_fee_payments
  ADD CONSTRAINT marketplace_fee_payments_status_check
  CHECK (status IN (
    'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded'
  ));

COMMENT ON CONSTRAINT market_bids_fee_payment_status_check ON public.market_bids IS
  'refunded = a paid test_online platform fee was reversed. Not a paid fee, so revoke_indent_award''s fee_paid check no longer matches.';

CREATE TABLE public.marketplace_fee_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_fee_payment_id uuid NOT NULL REFERENCES public.marketplace_fee_payments (id),
  market_bid_id uuid NOT NULL REFERENCES public.market_bids (id),
  indent_id uuid NOT NULL REFERENCES public.indents (id),
  amount numeric NOT NULL CHECK (amount > 0),
  provider text NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) > 0),
  refund_reference text NOT NULL,
  initiated_by uuid NOT NULL REFERENCES auth.users (id),
  status text NOT NULL DEFAULT 'succeeded' CHECK (status = 'succeeded'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_fee_refunds_provider_test_online CHECK (provider = 'test_online')
);

CREATE UNIQUE INDEX marketplace_fee_refunds_one_succeeded_per_payment
  ON public.marketplace_fee_refunds (marketplace_fee_payment_id);

CREATE UNIQUE INDEX marketplace_fee_refunds_refund_reference_key
  ON public.marketplace_fee_refunds (refund_reference);

CREATE INDEX marketplace_fee_refunds_indent_id_idx
  ON public.marketplace_fee_refunds (indent_id);

COMMENT ON TABLE public.marketplace_fee_refunds IS
  'Audit row for reversing a paid test_online marketplace fee before revoke. Original payment/order/event ids stay on marketplace_fee_payments.';

ALTER TABLE public.marketplace_fee_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_fee_refunds_select ON public.marketplace_fee_refunds;
CREATE POLICY marketplace_fee_refunds_select ON public.marketplace_fee_refunds
  FOR SELECT
  TO authenticated
  USING (
    initiated_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.indents i
      JOIN public.organization_members om
        ON om.organization_id = i.organization_id
      WHERE i.id = marketplace_fee_refunds.indent_id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
        AND om.role <> 'driver'
    )
  );

REVOKE ALL ON public.marketplace_fee_refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.marketplace_fee_refunds TO authenticated;

CREATE OR REPLACE FUNCTION public.refund_test_marketplace_fee_and_revoke_indent(
  p_indent_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_indent public.indents%ROWTYPE;
  v_bid public.market_bids%ROWTYPE;
  v_payment public.marketplace_fee_payments%ROWTYPE;
  v_refund public.marketplace_fee_refunds%ROWTYPE;
  v_revoke jsonb;
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_accepted_count integer;
  v_paid_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized: sign in required';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'invalid_reason: a reason is required';
  END IF;

  SELECT * INTO v_indent
  FROM public.indents
  WHERE id = p_indent_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: indent %', p_indent_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = v_indent.organization_id
      AND om.user_id = v_uid
      AND om.status = 'active'
      AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a non-driver member of the owning organization';
  END IF;

  -- Second click: the award is already open and this indent already has one refund.
  SELECT r.* INTO v_refund
  FROM public.marketplace_fee_refunds r
  WHERE r.indent_id = v_indent.id
    AND r.status = 'succeeded'
  ORDER BY r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_refund.id IS NOT NULL
     AND lower(btrim(coalesce(v_indent.status, ''))) <> 'awarded' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'note', 'already_refunded_and_revoked',
      'indent_id', v_indent.id,
      'refund_id', v_refund.id,
      'refund_reference', v_refund.refund_reference,
      'amount', v_refund.amount,
      'status', v_indent.status
    );
  END IF;

  IF v_refund.id IS NOT NULL THEN
    -- Refund committed, award still active. Do not insert a second refund.
    v_revoke := public.revoke_indent_award(v_indent.id);
    RETURN jsonb_build_object(
      'ok', true,
      'note', 'revoke_retried',
      'indent_id', v_indent.id,
      'refund_id', v_refund.id,
      'refund_reference', v_refund.refund_reference,
      'award_revoked_at', v_revoke -> 'award_revoked_at',
      'status', 'open'
    );
  END IF;

  SELECT count(*) INTO v_accepted_count
  FROM public.market_bids
  WHERE indent_id = v_indent.id
    AND status = 'accepted';
  IF v_accepted_count <> 1 THEN
    RAISE EXCEPTION 'invalid_state: expected exactly one accepted bid for indent %, found %',
      p_indent_id, v_accepted_count;
  END IF;

  SELECT * INTO v_bid
  FROM public.market_bids
  WHERE indent_id = v_indent.id
    AND status = 'accepted'
  FOR UPDATE;
  IF NOT FOUND OR v_bid.indent_id IS DISTINCT FROM v_indent.id THEN
    RAISE EXCEPTION 'bid_mismatch: accepted bid is not for indent %', p_indent_id;
  END IF;

  -- The paid row must belong to that accepted bid. Never scan payments by indent alone.
  SELECT count(*) INTO v_paid_count
  FROM public.marketplace_fee_payments
  WHERE market_bid_id = v_bid.id
    AND status = 'paid';
  IF v_paid_count <> 1 THEN
    RAISE EXCEPTION 'invalid_state: expected exactly one paid payment for accepted bid %, found %',
      v_bid.id, v_paid_count;
  END IF;

  SELECT * INTO v_payment
  FROM public.marketplace_fee_payments
  WHERE market_bid_id = v_bid.id
    AND status = 'paid'
  FOR UPDATE;
  IF NOT FOUND
     OR v_payment.market_bid_id IS DISTINCT FROM v_bid.id
     OR v_bid.indent_id IS DISTINCT FROM v_indent.id THEN
    RAISE EXCEPTION 'bid_mismatch: paid payment is not for the accepted bid on indent %', p_indent_id;
  END IF;

  IF v_payment.provider IS DISTINCT FROM 'test_online' THEN
    RAISE EXCEPTION 'unsupported_provider: only a test_online marketplace fee can be reversed this way (provider=%)',
      coalesce(v_payment.provider, 'none');
  END IF;

  INSERT INTO public.marketplace_fee_refunds (
    marketplace_fee_payment_id,
    market_bid_id,
    indent_id,
    amount,
    provider,
    reason,
    refund_reference,
    initiated_by,
    status
  ) VALUES (
    v_payment.id,
    v_bid.id,
    v_indent.id,
    v_payment.amount,
    'test_online',
    v_reason,
    'test_online_refund_' || gen_random_uuid()::text,
    v_uid,
    'succeeded'
  )
  RETURNING * INTO v_refund;

  -- Status only. Original provider order, payment, and event ids stay put.
  UPDATE public.marketplace_fee_payments
  SET status = 'refunded', updated_at = now()
  WHERE id = v_payment.id
    AND market_bid_id = v_bid.id
    AND status = 'paid'
    AND provider = 'test_online';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bid_mismatch: paid test payment did not match the accepted bid';
  END IF;

  UPDATE public.market_bids
  SET fee_payment_status = 'refunded', updated_at = now()
  WHERE id = v_bid.id
    AND indent_id = v_indent.id
    AND status = 'accepted'
    AND fee_payment_status = 'paid';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bid_mismatch: accepted bid fee was not paid for this indent';
  END IF;

  -- Existing fee_paid guard still runs. It passes only because the fee is now refunded.
  -- A failure here aborts this transaction, including the refund insert and status updates.
  v_revoke := public.revoke_indent_award(v_indent.id);

  RETURN jsonb_build_object(
    'ok', true,
    'indent_id', v_indent.id,
    'market_bid_id', v_bid.id,
    'marketplace_fee_payment_id', v_payment.id,
    'refund_id', v_refund.id,
    'refund_reference', v_refund.refund_reference,
    'amount', v_payment.amount,
    'award_revoked_at', v_revoke -> 'award_revoked_at',
    'status', 'open'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.refund_test_marketplace_fee_and_revoke_indent(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_test_marketplace_fee_and_revoke_indent(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.refund_test_marketplace_fee_and_revoke_indent(uuid, text) IS
  'Shipper-only: reverse the accepted bid''s paid test_online marketplace fee, then call revoke_indent_award. One transaction. Idempotent. Does not refund Razorpay or cash.';
