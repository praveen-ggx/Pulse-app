-- Fresh Marketplace bid after an individual bid expires. Disposable DB only.
-- Requires t.mk_indent / t.as_user / t.ok and 20271117144500 applied.
-- Rolled back.
\set ON_ERROR_STOP 1
\set VERBOSITY terse
BEGIN;
SELECT t.mk_indent('RS_OPEN', 'SHIP', 'U_SHIP', 'Pune', 'Wardha') AS rs_open;
SELECT t.mk_indent('RS_LOCK', 'SHIP', 'U_SHIP', 'Pune', 'Nagpur') AS rs_lock;
SELECT t.mk_indent('RS_REJ', 'SHIP', 'U_SHIP', 'Pune', 'Nashik') AS rs_rej;
SELECT t.mk_indent('RS_ACC', 'SHIP', 'U_SHIP', 'Pune', 'Solapur') AS rs_acc;
DO $$
DECLARE
  r jsonb;
  v_old public.market_bids%ROWTYPE;
  v_new public.market_bids%ROWTYPE;
  v_amount numeric;
  v_created timestamptz;
  v_expires timestamptz;
BEGIN
  r := t.as_user(t.id('U_CAR'), format(
    'SELECT public.submit_market_bid(%L, 30000, NULL, %L, NULL)', t.id('RS_OPEN'), t.id('CAR')));
  PERFORM t.ok('Setup: first bid placed', (r->>'ok')::boolean, r::text);
  SELECT * INTO v_old FROM public.market_bids
  WHERE indent_id = t.id('RS_OPEN') AND bidder_user_id = t.id('U_CAR');
  PERFORM t.ok('Setup: own 48-hour clock', v_old.expires_at = v_old.created_at + interval '48 hours');

  -- Unexpired edit stays on the same row and does not move the clock.
  v_expires := v_old.expires_at;
  r := t.as_user(t.id('U_CAR'), format(
    'SELECT public.submit_market_bid(%L, 29500, NULL, %L, NULL)', t.id('RS_OPEN'), t.id('CAR')));
  SELECT * INTO v_old FROM public.market_bids WHERE id = v_old.id;
  PERFORM t.ok('Unexpired edit: same row, new amount, same clock',
    (r->>'ok')::boolean AND v_old.amount = 29500 AND v_old.expires_at = v_expires
    AND (SELECT count(*) FROM public.market_bids WHERE indent_id = t.id('RS_OPEN')) = 1, r::text);

  -- Expired edit does not revive the historical row.
  UPDATE public.market_bids
  SET created_at = now() - interval '50 hours', expires_at = now() - interval '2 hours'
  WHERE id = v_old.id;
  v_amount := v_old.amount;
  v_created := now() - interval '50 hours';
  v_expires := now() - interval '2 hours';
  r := t.as_user(t.id('U_CAR'), format(
    'SELECT public.submit_market_bid(%L, 28000, NULL, %L, NULL)', t.id('RS_OPEN'), t.id('CAR')));
  SELECT * INTO v_old FROM public.market_bids WHERE id = v_old.id;
  SELECT * INTO v_new FROM public.market_bids
  WHERE indent_id = t.id('RS_OPEN') AND status = 'pending';
  PERFORM t.ok('Expired edit is not a revival: history keeps amount and clock',
    v_old.status = 'expired' AND v_old.amount = v_amount
    AND v_old.expires_at = v_expires AND v_old.created_at = v_created, r::text);
  PERFORM t.ok('Fresh submission: new pending row, own 48-hour clock, new id',
    (r->>'ok')::boolean AND (r->'v'->'submit_market_bid'->>'bid_id')::uuid = v_new.id
    AND v_new.id <> v_old.id AND v_new.amount = 28000
    AND v_new.expires_at = v_new.created_at + interval '48 hours'
    AND v_new.expires_at > now(), r::text);
  PERFORM t.ok('One actionable pending bid',
    (SELECT count(*) FROM public.market_bids
      WHERE indent_id = t.id('RS_OPEN') AND bidder_user_id = t.id('U_CAR') AND status = 'pending') = 1);

  -- A second submission edits the fresh bid; it does not add another pending row.
  r := t.as_user(t.id('U_CAR'), format(
    'SELECT public.submit_market_bid(%L, 27000, NULL, %L, NULL)', t.id('RS_OPEN'), t.id('CAR')));
  PERFORM t.ok('Repeat submission edits the fresh bid only',
    (r->>'ok')::boolean
    AND (SELECT count(*) FROM public.market_bids
      WHERE indent_id = t.id('RS_OPEN') AND status = 'pending') = 1
    AND (SELECT amount FROM public.market_bids WHERE id = v_new.id) = 27000
    AND (SELECT expires_at FROM public.market_bids WHERE id = v_new.id) = v_new.expires_at, r::text);

  -- The closed bid still cannot be awarded. The fresh one can be selected by id.
  r := t.as_user(t.id('U_SHIP'), format('SELECT public.award_market_bid(%L)', v_old.id));
  PERFORM t.ok('Closed expired bid cannot be awarded',
    NOT (r->>'ok')::boolean AND r->>'error' LIKE 'invalid_state%', r::text);

  -- A pending row whose clock has passed, and which nobody has resubmitted,
  -- is still refused by the expiry guard.
  r := t.as_user(t.id('U_CAR'), format(
    'SELECT public.submit_market_bid(%L, 31000, NULL, %L, NULL)', t.id('RS_LOCK'), t.id('CAR')));
  SELECT * INTO v_new FROM public.market_bids WHERE indent_id = t.id('RS_LOCK') AND status = 'pending';
  UPDATE public.market_bids SET expires_at = now() - interval '1 minute' WHERE id = v_new.id;
  r := t.as_user(t.id('U_SHIP'), format('SELECT public.award_market_bid(%L)', v_new.id));
  PERFORM t.ok('Pending bid past its own clock is refused as bid_expired',
    NOT (r->>'ok')::boolean AND r->>'error' LIKE 'bid_expired%', r::text);
  r := t.as_user(t.id('U_CAR'), format(
    'SELECT public.submit_market_bid(%L, 31500, NULL, %L, NULL)', t.id('RS_LOCK'), t.id('CAR')));
  PERFORM t.ok('Resubmit after that refusal opens a new bid', (r->>'ok')::boolean, r::text);
  SELECT * INTO v_new FROM public.market_bids WHERE indent_id = t.id('RS_LOCK') AND status = 'pending';
  r := t.as_user(t.id('U_SHIP'), format('SELECT public.award_market_bid(%L)', v_new.id));
  PERFORM t.ok('Award of a valid fresh bid still succeeds', (r->>'ok')::boolean, r::text);
  PERFORM t.ok('Award leaves no second pending bid',
    (SELECT count(*) FROM public.market_bids
      WHERE indent_id = t.id('RS_LOCK') AND status = 'pending') = 0);

  -- An accepted row while the load is still open cannot be replaced.
  r := t.as_user(t.id('U_CAR'), format(
    'SELECT public.submit_market_bid(%L, 33000, NULL, %L, NULL)', t.id('RS_ACC'), t.id('CAR')));
  UPDATE public.market_bids SET status = 'accepted', accepted_at = now()
  WHERE indent_id = t.id('RS_ACC') AND status = 'pending';
  r := t.as_user(t.id('U_CAR'), format(
    'SELECT public.submit_market_bid(%L, 34000, NULL, %L, NULL)', t.id('RS_ACC'), t.id('CAR')));
  PERFORM t.ok('Accepted bid cannot be bypassed while the load is still open',
    NOT (r->>'ok')::boolean AND r->>'error' LIKE 'bid_locked%', r::text);
  PERFORM t.ok('No pending bid appeared beside that accepted bid',
    (SELECT count(*) FROM public.market_bids
      WHERE indent_id = t.id('RS_ACC') AND status = 'pending') = 0);

  -- A rejected bid does not block a fresh offer, and it is not rewritten.
  r := t.as_user(t.id('U_CAR'), format(
    'SELECT public.submit_market_bid(%L, 26000, NULL, %L, NULL)', t.id('RS_REJ'), t.id('CAR')));
  SELECT * INTO v_old FROM public.market_bids WHERE indent_id = t.id('RS_REJ');
  r := t.as_user(t.id('U_SHIP'), format('SELECT public.reject_market_bid(%L)', v_old.id));
  PERFORM t.ok('Reject setup', (r->>'ok')::boolean, r::text);
  r := t.as_user(t.id('U_CAR'), format(
    'SELECT public.submit_market_bid(%L, 26500, NULL, %L, NULL)', t.id('RS_REJ'), t.id('CAR')));
  SELECT * INTO v_old FROM public.market_bids WHERE indent_id = t.id('RS_REJ') AND status = 'rejected';
  SELECT * INTO v_new FROM public.market_bids WHERE indent_id = t.id('RS_REJ') AND status = 'pending';
  PERFORM t.ok('Rejected history does not block a fresh bid and is not rewritten',
    (r->>'ok')::boolean AND v_old.amount = 26000 AND v_new.amount = 26500
    AND v_new.expires_at = v_new.created_at + interval '48 hours'
    AND (SELECT count(*) FROM public.market_bids
      WHERE indent_id = t.id('RS_REJ') AND status = 'pending') = 1, r::text);
END $$;
ROLLBACK;
