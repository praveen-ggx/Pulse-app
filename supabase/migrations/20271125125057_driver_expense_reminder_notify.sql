-- Driver expense "Remind fleet" — actually notify the fleet.
--
-- Before: Remind only bumped the expense row's updated_at and wrote a timeline
-- entry nobody reads, so the fleet owner was never told.
--
-- Now remind_driver_expense(kind, entry_id):
--   * only the driver who entered the expense, only while it still awaits the
--     fleet (driver-paid, not voided / approved / settled / rejected / posted);
--   * at most once every 6 hours per expense (reminder_too_soon);
--   * records the reminder in driver_expense_reminders (expense rows are NOT
--     touched, so the expense approval guard and ledger are unaffected);
--   * sends the fleet a bell notification (network_notifications,
--     event_type 'expense_reminder').

-- ── 1. Bell event type ──────────────────────────────────────────────────────
ALTER TABLE public.network_notifications
  DROP CONSTRAINT IF EXISTS network_notifications_event_type_chk;

ALTER TABLE public.network_notifications
  ADD CONSTRAINT network_notifications_event_type_chk CHECK (
    event_type = ANY (ARRAY[
      'indent_created'::text,
      'bid_received'::text,
      'awarded'::text,
      'quote_requested'::text,
      'counter_offered'::text,
      'driver_disconnected'::text,
      'expense_reminder'::text
    ])
  );

-- ── 2. Reminder log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_expense_reminders (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_kind     text        NOT NULL CHECK (expense_kind IN ('fuel', 'toll', 'other')),
  entry_id         uuid        NOT NULL,
  trip_id          uuid        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  organization_id  uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  reminded_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminded_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_expense_reminders_entry
  ON public.driver_expense_reminders (expense_kind, entry_id, reminded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_expense_reminders_trip
  ON public.driver_expense_reminders (trip_id);
CREATE INDEX IF NOT EXISTS idx_driver_expense_reminders_org
  ON public.driver_expense_reminders (organization_id);
CREATE INDEX IF NOT EXISTS idx_driver_expense_reminders_by
  ON public.driver_expense_reminders (reminded_by);

ALTER TABLE public.driver_expense_reminders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.driver_expense_reminders FROM anon;
GRANT SELECT ON public.driver_expense_reminders TO authenticated;
GRANT ALL ON public.driver_expense_reminders TO service_role;

DROP POLICY IF EXISTS driver_expense_reminders_select ON public.driver_expense_reminders;
CREATE POLICY driver_expense_reminders_select ON public.driver_expense_reminders
  FOR SELECT TO authenticated
  USING (
    reminded_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = driver_expense_reminders.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
    )
  );
-- Writes only through remind_driver_expense (SECURITY DEFINER).

-- ── 3. Remind ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remind_driver_expense(
  p_expense_kind text,
  p_entry_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_table      text;
  v_row        jsonb;
  v_trip_id    uuid;
  v_org_id     uuid;
  v_amount     numeric;
  v_last       timestamptz;
  v_next       timestamptz;
  v_driver     text;
  v_trip_label text;
  v_kind_label text;
  v_approval   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_table := CASE p_expense_kind
    WHEN 'fuel'  THEN 'trip_fuel_entries'
    WHEN 'toll'  THEN 'trip_toll_entries'
    WHEN 'other' THEN 'trip_other_expenses'
  END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'invalid_expense_kind: %', p_expense_kind;
  END IF;

  EXECUTE format(
    'SELECT to_jsonb(e) FROM public.%I e WHERE e.id = $1', v_table
  ) INTO v_row USING p_entry_id;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'expense_not_found: Expense request not found';
  END IF;

  IF (v_row ->> 'entered_by') IS DISTINCT FROM v_uid::text THEN
    RAISE EXCEPTION 'not_your_expense: You can only remind on your own expense requests';
  END IF;

  v_approval := lower(coalesce(v_row ->> 'approval_state', ''));
  IF lower(coalesce(v_row ->> 'status', '')) = 'voided'
     OR lower(coalesce(v_row ->> 'payment_owner', '')) <> 'driver'
     OR v_approval IN ('approved', 'settled', 'rejected')
     OR lower(coalesce(v_row ->> 'posting_state', '')) = 'posted' THEN
    RAISE EXCEPTION 'not_awaiting_fleet: This request is no longer awaiting fleet approval';
  END IF;

  v_trip_id := (v_row ->> 'trip_id')::uuid;
  v_amount  := coalesce((v_row ->> 'amount_inr')::numeric, 0);

  SELECT coalesce((v_row ->> 'employer_org_id')::uuid, t.organization_id),
         coalesce(nullif(trim(t.trip_operational_code), ''),
                  nullif(trim(t.display_trip_id), ''),
                  nullif(trim(t.trip_code), ''),
                  left(t.id::text, 8))
  INTO v_org_id, v_trip_label
  FROM public.trips t
  WHERE t.id = v_trip_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'no_fleet: This trip has no fleet to remind';
  END IF;

  SELECT max(r.reminded_at) INTO v_last
  FROM public.driver_expense_reminders r
  WHERE r.expense_kind = p_expense_kind AND r.entry_id = p_entry_id;

  IF v_last IS NOT NULL AND v_last > now() - interval '6 hours' THEN
    v_next := v_last + interval '6 hours';
    RAISE EXCEPTION 'reminder_too_soon: %', to_char(v_next AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM');
  END IF;

  INSERT INTO public.driver_expense_reminders
    (expense_kind, entry_id, trip_id, organization_id, reminded_by)
  VALUES (p_expense_kind, p_entry_id, v_trip_id, v_org_id, v_uid);

  SELECT coalesce(nullif(trim(p.full_name), ''), 'Driver')
  INTO v_driver
  FROM public.profiles p
  WHERE p.id = v_uid;
  v_driver := coalesce(v_driver, 'Driver');

  v_kind_label := CASE p_expense_kind
    WHEN 'fuel' THEN 'fuel'
    WHEN 'toll' THEN 'toll'
    ELSE 'expense'
  END;

  PERFORM public.emit_network_notification(
    v_org_id,
    NULL,
    'expense_reminder',
    v_driver || ' reminded you about a ' || v_kind_label || ' expense',
    'Trip ' || v_trip_label || ' · ₹' || trim(to_char(v_amount, 'FM99,99,99,990')),
    v_amount,
    NULL,
    NULL,
    NULL,
    'expense_reminder:' || p_entry_id::text || ':' || floor(extract(epoch FROM now()))::bigint::text,
    jsonb_build_object(
      'driver_user_id', v_uid,
      'driver_name', v_driver,
      'trip_id', v_trip_id,
      'trip_label', v_trip_label,
      'expense_kind', p_expense_kind,
      'entry_id', p_entry_id,
      'amount_inr', v_amount
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reminded_at', now(),
    'next_allowed_at', now() + interval '6 hours'
  );
END;
$function$;

COMMENT ON FUNCTION public.remind_driver_expense(text, uuid) IS
  'Driver reminds the fleet about their own pending expense (fuel / toll / other). Max once per 6 hours per expense; logs driver_expense_reminders and sends the fleet an expense_reminder bell notification. Does not modify the expense row.';

REVOKE ALL ON FUNCTION public.remind_driver_expense(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remind_driver_expense(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remind_driver_expense(text, uuid) TO authenticated;
