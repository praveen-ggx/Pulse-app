-- Fleet ↔ driver invite: job description, terms & conditions, unlimited
-- revise/resend rounds, decline with reason, fleet withdraw, one fleet only.
--
-- ADDITIVE ONLY. Existing columns, rows and functions keep working:
--   * new nullable columns on driver_invites (no backfill)
--   * status list gains 'countered' and 'withdrawn' (old values unchanged)
--   * new table driver_invite_rounds (history of every offer / counter)
--   * new RPCs; reject_driver_invite / get_driver_invites_* stay as they are
--   * accept_driver_invite: same body as 20271005120000 plus
--       (a) one fleet only — refuse while active_employee in another org
--       (b) agreed terms REPLACE old ones (no stale commission on reconnect)
--       (c) stamps terms_accepted_at
--
-- Flow
--   fleet sends (pending) → driver: accept | decline(reason) | request changes
--   request changes → 'countered' → fleet: agree | revise | withdraw
--   agree / revise → back to 'pending' with the new terms → driver again …
--   Unlimited rounds; either side can end it (decline / withdraw).

-- ── 1. Columns ─────────────────────────────────────────────────────────────
ALTER TABLE public.driver_invites
  ADD COLUMN IF NOT EXISTS job_description   text,
  ADD COLUMN IF NOT EXISTS terms_text        text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason    text,
  ADD COLUMN IF NOT EXISTS last_action_by    text;

COMMENT ON COLUMN public.driver_invites.job_description IS 'Fleet: vehicle, route, shift / working hours, duties.';
COMMENT ON COLUMN public.driver_invites.terms_text IS 'Fleet terms & conditions the driver must agree to before accepting.';
COMMENT ON COLUMN public.driver_invites.terms_accepted_at IS 'When the driver agreed to terms_text (set on accept).';
COMMENT ON COLUMN public.driver_invites.decline_reason IS 'Optional reason given when the driver declines.';
COMMENT ON COLUMN public.driver_invites.last_action_by IS 'fleet | driver — who acted last in the revise rounds.';

ALTER TABLE public.driver_invites
  DROP CONSTRAINT IF EXISTS driver_invites_status_check;
ALTER TABLE public.driver_invites
  ADD CONSTRAINT driver_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'consumed', 'expired', 'countered', 'withdrawn'));

-- ── 2. Round history ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_invite_rounds (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id          uuid NOT NULL REFERENCES public.driver_invites(id) ON DELETE CASCADE,
  round_no           integer NOT NULL,
  by_side            text NOT NULL CHECK (by_side IN ('fleet', 'driver')),
  payable_amount     numeric(12,2),
  commission_percent numeric(5,2),
  commission_per_km  numeric(10,2),
  note               text,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_invite_rounds_invite
  ON public.driver_invite_rounds(invite_id, round_no);

-- Read / write only through the SECURITY DEFINER functions below.
ALTER TABLE public.driver_invite_rounds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.driver_invite_rounds FROM anon, authenticated;

-- ── helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._driver_invite_pay_or_null(v numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$ SELECT CASE WHEN v IS NOT NULL AND v > 0 THEN v ELSE NULL END $$;

CREATE OR REPLACE FUNCTION public._driver_invite_next_round(p_invite_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(max(round_no), 0) + 1
  FROM public.driver_invite_rounds
  WHERE invite_id = p_invite_id
$$;

-- ── 3. Driver: request changes (counter-offer) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.driver_request_invite_changes(
  p_invite_id          uuid,
  p_payable_amount     numeric DEFAULT NULL,
  p_commission_percent numeric DEFAULT NULL,
  p_commission_per_km  numeric DEFAULT NULL,
  p_note               text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite  public.driver_invites;
  v_payable numeric := public._driver_invite_pay_or_null(p_payable_amount);
  v_percent numeric := public._driver_invite_pay_or_null(least(coalesce(p_commission_percent, 0), 100::numeric));
  v_per_km  numeric := public._driver_invite_pay_or_null(p_commission_per_km);
BEGIN
  SELECT * INTO v_invite
  FROM public.driver_invites
  WHERE id = p_invite_id AND to_user_id = auth.uid() AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_open: Invite not found or already answered';
  END IF;

  IF v_payable IS NULL AND v_percent IS NULL AND v_per_km IS NULL THEN
    RAISE EXCEPTION 'invite_terms_required: Enter at least one pay term';
  END IF;

  -- First counter: keep the fleet's original offer as round 1.
  IF NOT EXISTS (SELECT 1 FROM public.driver_invite_rounds WHERE invite_id = p_invite_id) THEN
    INSERT INTO public.driver_invite_rounds
      (invite_id, round_no, by_side, payable_amount, commission_percent, commission_per_km, note, created_by)
    VALUES
      (p_invite_id, 1, 'fleet', v_invite.payable_amount, v_invite.commission_percent,
       v_invite.commission_per_km, NULL, v_invite.invited_by);
  END IF;

  INSERT INTO public.driver_invite_rounds
    (invite_id, round_no, by_side, payable_amount, commission_percent, commission_per_km, note, created_by)
  VALUES
    (p_invite_id, public._driver_invite_next_round(p_invite_id), 'driver',
     v_payable, v_percent, v_per_km, nullif(trim(coalesce(p_note, '')), ''), auth.uid());

  UPDATE public.driver_invites
  SET status         = 'countered',
      last_action_by = 'driver',
      responded_at   = now(),
      responded_by   = auth.uid(),
      expires_at     = now() + interval '7 days'
  WHERE id = p_invite_id;

  RETURN jsonb_build_object('ok', true, 'status', 'countered');
END;
$$;

-- ── 4. Fleet: agree to driver's ask, or revise ─────────────────────────────
-- p_action 'agree'  → driver's last asked terms become the offer
-- p_action 'revise' → the given terms become the offer
-- Either way the invite goes back to 'pending' for the driver to accept.
CREATE OR REPLACE FUNCTION public.fleet_respond_invite_changes(
  p_invite_id          uuid,
  p_action             text,
  p_payable_amount     numeric DEFAULT NULL,
  p_commission_percent numeric DEFAULT NULL,
  p_commission_per_km  numeric DEFAULT NULL,
  p_note               text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite  public.driver_invites;
  v_last    public.driver_invite_rounds;
  v_payable numeric;
  v_percent numeric;
  v_per_km  numeric;
BEGIN
  SELECT * INTO v_invite FROM public.driver_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_invite.from_organization_id AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;
  IF v_invite.status <> 'countered' THEN
    RAISE EXCEPTION 'invite_not_countered: The driver has not asked for changes';
  END IF;

  IF p_action = 'agree' THEN
    SELECT * INTO v_last
    FROM public.driver_invite_rounds
    WHERE invite_id = p_invite_id AND by_side = 'driver'
    ORDER BY round_no DESC LIMIT 1;
    v_payable := v_last.payable_amount;
    v_percent := v_last.commission_percent;
    v_per_km  := v_last.commission_per_km;
  ELSIF p_action = 'revise' THEN
    v_payable := public._driver_invite_pay_or_null(p_payable_amount);
    v_percent := public._driver_invite_pay_or_null(least(coalesce(p_commission_percent, 0), 100::numeric));
    v_per_km  := public._driver_invite_pay_or_null(p_commission_per_km);
  ELSE
    RAISE EXCEPTION 'invite_bad_action: Use agree or revise';
  END IF;

  IF v_payable IS NULL AND v_percent IS NULL AND v_per_km IS NULL THEN
    RAISE EXCEPTION 'invite_terms_required: Enter at least one pay term';
  END IF;

  INSERT INTO public.driver_invite_rounds
    (invite_id, round_no, by_side, payable_amount, commission_percent, commission_per_km, note, created_by)
  VALUES
    (p_invite_id, public._driver_invite_next_round(p_invite_id), 'fleet',
     v_payable, v_percent, v_per_km,
     coalesce(nullif(trim(coalesce(p_note, '')), ''),
              CASE WHEN p_action = 'agree' THEN 'Agreed to your terms' END),
     auth.uid());

  UPDATE public.driver_invites
  SET status             = 'pending',
      payable_amount     = v_payable,
      commission_percent = v_percent,
      commission_per_km  = v_per_km,
      last_action_by     = 'fleet',
      expires_at         = now() + interval '7 days'
  WHERE id = p_invite_id;

  RETURN jsonb_build_object('ok', true, 'status', 'pending');
END;
$$;

-- ── 5. Driver: decline with optional reason (pending or countered) ─────────
CREATE OR REPLACE FUNCTION public.driver_decline_invite(
  p_invite_id uuid,
  p_reason    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.driver_invites;
BEGIN
  SELECT * INTO v_invite
  FROM public.driver_invites
  WHERE id = p_invite_id AND to_user_id = auth.uid() AND status IN ('pending', 'countered')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already responded';
  END IF;

  UPDATE public.driver_invites
  SET status         = 'rejected',
      decline_reason = nullif(trim(coalesce(p_reason, '')), ''),
      last_action_by = 'driver',
      responded_at   = now(),
      responded_by   = auth.uid()
  WHERE id = p_invite_id;

  -- Same side effect as reject_driver_invite.
  UPDATE public.driver_signup_matches
  SET state = 'declined',
      acted_at = now(),
      acted_by = auth.uid(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('declined_invite_id', p_invite_id, 'declined_at', now())
  WHERE organization_id = v_invite.from_organization_id
    AND matched_user_id = auth.uid()
    AND state IN ('pending_owner_action', 'invite_sent');
END;
$$;

-- ── 6. Fleet: withdraw (Recall) — there is no DELETE policy on invites ─────
CREATE OR REPLACE FUNCTION public.fleet_withdraw_driver_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.driver_invites;
BEGIN
  SELECT * INTO v_invite FROM public.driver_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_invite.from_organization_id AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;
  IF v_invite.status NOT IN ('pending', 'countered') THEN
    RETURN jsonb_build_object('ok', false, 'status', v_invite.status);
  END IF;

  UPDATE public.driver_invites
  SET status = 'withdrawn', last_action_by = 'fleet', responded_at = now()
  WHERE id = p_invite_id;
  RETURN jsonb_build_object('ok', true, 'status', 'withdrawn');
END;
$$;

-- ── 7. Details for both sides (job, T&C, reason, round history) ────────────
CREATE OR REPLACE FUNCTION public.get_driver_invite_details(p_invite_ids uuid[])
RETURNS TABLE(
  invite_id         uuid,
  job_description   text,
  terms_text        text,
  decline_reason    text,
  last_action_by    text,
  terms_accepted_at timestamptz,
  rounds            jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    di.id,
    di.job_description,
    di.terms_text,
    di.decline_reason,
    di.last_action_by,
    di.terms_accepted_at,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'round_no', r.round_no,
               'by_side', r.by_side,
               'payable_amount', r.payable_amount,
               'commission_percent', r.commission_percent,
               'commission_per_km', r.commission_per_km,
               'note', r.note,
               'created_at', r.created_at
             ) ORDER BY r.round_no)
      FROM public.driver_invite_rounds r
      WHERE r.invite_id = di.id
    ), '[]'::jsonb)
  FROM public.driver_invites di
  WHERE di.id = ANY(p_invite_ids)
    AND (
      di.to_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = di.from_organization_id AND om.user_id = auth.uid()
      )
    );
$$;

-- ── 8. Fleet: save job description / T&C on its own invite ─────────────────
CREATE OR REPLACE FUNCTION public.fleet_set_driver_invite_details(
  p_invite_id       uuid,
  p_job_description text,
  p_terms_text      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT from_organization_id INTO v_org
  FROM public.driver_invites
  WHERE id = p_invite_id AND status IN ('pending', 'countered');
  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_org AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;
  UPDATE public.driver_invites
  SET job_description = nullif(trim(coalesce(p_job_description, '')), ''),
      terms_text      = nullif(trim(coalesce(p_terms_text, '')), '')
  WHERE id = p_invite_id;
END;
$$;

-- ── 9. Accept: one fleet only + clean terms + T&C stamp ────────────────────
CREATE OR REPLACE FUNCTION public.accept_driver_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invite       public.driver_invites;
  v_driver_id    uuid;
  v_name         text;
  v_phone        text;
  v_email        text;
  v_phone_last10 text;
  v_has_terms    boolean;
BEGIN
  IF public._holds_dco_status(auth.uid()) THEN
    RAISE EXCEPTION 'dco_not_employee_driver: DCOs cannot join a business as employee drivers. You can operate independently as a DCO.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT *
  INTO v_invite
  FROM public.driver_invites
  WHERE id = p_invite_id
    AND to_user_id = auth.uid()
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already responded';
  END IF;

  -- (a) One fleet only: an employee works under one company at a time.
  IF EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.user_id = auth.uid()
      AND d.organization_id <> v_invite.from_organization_id
      AND d.left_at IS NULL
      AND d.relationship_status = 'active_employee'
      AND coalesce(d.tracking_only, false) = false
  ) THEN
    RAISE EXCEPTION 'driver_already_in_fleet: You already work under another fleet. Leave that fleet first, then accept this invite.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (b) The accepted invite's terms replace old ones when it carries any.
  v_has_terms := coalesce(v_invite.payable_amount, 0) > 0
              OR coalesce(v_invite.commission_percent, 0) > 0
              OR coalesce(v_invite.commission_per_km, 0) > 0;

  SELECT
    coalesce(
      nullif(trim(p.full_name), ''),
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''),
      'Driver'
    ),
    nullif(trim(coalesce(p.phone, u.raw_user_meta_data->>'phone')), ''),
    nullif(trim(coalesce(p.email, u.email)), '')
  INTO v_name, v_phone, v_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid();

  v_phone_last10 := public.normalize_phone_last10(v_phone);

  IF length(coalesce(v_phone_last10, '')) = 10 THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_invite.from_organization_id::text || ':' || v_phone_last10, 0)
    );
  END IF;

  SELECT id
  INTO v_driver_id
  FROM public.drivers
  WHERE organization_id = v_invite.from_organization_id
    AND user_id = auth.uid()
    AND left_at IS NULL
  LIMIT 1
  FOR UPDATE;

  IF v_driver_id IS NOT NULL THEN
    UPDATE public.drivers
       SET name               = coalesce(nullif(trim(v_name), ''), name),
           email              = coalesce(nullif(trim(v_email), ''), email),
           tracking_only      = false,
           payable_amount     = CASE WHEN v_has_terms THEN v_invite.payable_amount ELSE payable_amount END,
           commission_percent = CASE WHEN v_has_terms THEN v_invite.commission_percent ELSE commission_percent END,
           commission_per_km  = CASE WHEN v_has_terms THEN v_invite.commission_per_km ELSE commission_per_km END,
           relationship_status = 'active_employee',
           updated_at         = now()
     WHERE id = v_driver_id;
  END IF;

  IF v_driver_id IS NULL THEN
    IF length(coalesce(v_phone_last10, '')) = 10 THEN
      SELECT d.id
      INTO v_driver_id
      FROM public.drivers d
      WHERE d.organization_id = v_invite.from_organization_id
        AND d.user_id IS NULL
        AND d.left_at IS NULL
        AND d.phone IS NOT NULL
        AND public.normalize_phone_last10(d.phone) = v_phone_last10
      ORDER BY d.updated_at DESC
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_driver_id IS NOT NULL THEN
      UPDATE public.drivers
      SET user_id          = auth.uid(),
          name             = coalesce(nullif(trim(v_name), ''), name),
          email            = coalesce(nullif(trim(v_email), ''), email),
          tracking_only    = false,
          status           = 'offline',
          payable_amount     = CASE WHEN v_has_terms THEN v_invite.payable_amount ELSE payable_amount END,
          commission_percent = CASE WHEN v_has_terms THEN v_invite.commission_percent ELSE commission_percent END,
          commission_per_km  = CASE WHEN v_has_terms THEN v_invite.commission_per_km ELSE commission_per_km END,
          relationship_status = 'active_employee',
          updated_at       = now()
      WHERE id = v_driver_id;
    ELSE
      INSERT INTO public.drivers (
        organization_id,
        name,
        phone,
        email,
        user_id,
        status,
        tracking_only,
        hired_at,
        payable_amount,
        commission_percent,
        commission_per_km,
        relationship_origin,
        relationship_status
      )
      VALUES (
        v_invite.from_organization_id,
        coalesce(nullif(trim(v_name), ''), 'Driver'),
        v_phone,
        v_email,
        auth.uid(),
        'offline',
        false,
        now(),
        v_invite.payable_amount,
        v_invite.commission_percent,
        v_invite.commission_per_km,
        'invite_accepted',
        'active_employee'
      )
      ON CONFLICT (organization_id, phone) WHERE (left_at IS NULL AND phone IS NOT NULL)
      DO NOTHING
      RETURNING id INTO v_driver_id;

      IF v_driver_id IS NULL THEN
        SELECT id
        INTO v_driver_id
        FROM public.drivers
        WHERE organization_id = v_invite.from_organization_id
          AND phone = v_phone
          AND left_at IS NULL
        LIMIT 1;

        UPDATE public.drivers
        SET user_id    = auth.uid(),
            updated_at = now()
        WHERE id = v_driver_id
          AND user_id IS NULL;
      END IF;
    END IF;
  END IF;

  UPDATE public.driver_invites
  SET status            = 'accepted',
      responded_at      = now(),
      responded_by      = auth.uid(),
      last_action_by    = 'driver',
      terms_accepted_at = CASE WHEN terms_text IS NOT NULL THEN now() ELSE terms_accepted_at END
  WHERE id = p_invite_id;

  RETURN jsonb_build_object(
    'driver_id',       v_driver_id,
    'organization_id', v_invite.from_organization_id
  );
END;
$function$;

COMMENT ON FUNCTION public.accept_driver_invite(uuid) IS
  'Accept a fleet invite as an employee driver. Refuses DCOs (dco_not_employee_driver) and drivers already active in another fleet (driver_already_in_fleet). Invite terms replace old ones.';

-- ── Grants ─────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.driver_request_invite_changes(uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_respond_invite_changes(uuid, text, numeric, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_decline_invite(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_withdraw_driver_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_driver_invite_details(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_set_driver_invite_details(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_request_invite_changes(uuid, numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_respond_invite_changes(uuid, text, numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_decline_invite(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_withdraw_driver_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_invite_details(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_set_driver_invite_details(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
