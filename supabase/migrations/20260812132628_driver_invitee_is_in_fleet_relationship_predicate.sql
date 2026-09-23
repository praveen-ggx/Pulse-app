-- get_driver_invitee_by_phone.is_in_fleet — replace the legacy tracking_only
-- membership test with driver-domain relationship semantics.
--
-- Incident (production, read-only investigation): Add Driver rejected a driver
-- with "This driver is currently connected to another fleet"
-- (locales/en.json → existingDriverInFleetDetail, rendered by
-- AddDriverModal.handleNext, which hard-stops on step 1 before any writer
-- runs). The block came from this RPC's is_in_fleet column, whose predicate
-- tested `d.tracking_only = false`.
--
-- Why that was wrong: tracking_only is a data-completeness / display flag
-- ("real driver row" vs "phone-assignment stub"), not a relationship. It has
-- carried at least three unrelated meanings over time — see
-- 20270210090000_driver_relationship_origin_and_status.sql, which introduced
-- relationship_status precisely to stop tracking_only being overloaded this
-- way. Production proved the two are independent: among the rows this
-- predicate selected, tracking_only = false spanned active_employee (4
-- humans), relationship_status IS NULL (14 humans), AND independent (1
-- human). A flag that takes the same value across all three relationship
-- states cannot discriminate between them, so the gate was blocking and
-- allowing essentially at random with respect to actual fleet membership.
--
-- The one-human independent + tracking_only = false row is the proof case:
-- 20270210091000 defines independent as "no employer relationship exists yet"
-- (deliberately multi-fleet — aggregate and direct-bid drivers are created
-- this way), yet that driver was blocked from being added anywhere.
--
-- New predicate — relationship_status only:
--
--   active_employee  -> BLOCK. Written solely by accept_driver_invite's fresh
--                       INSERT / merge-exception UPDATE (20270210092000),
--                       i.e. a real employer invite was accepted. This is the
--                       only state that positively evidences employment.
--   independent      -> ALLOW. "No employer relationship exists yet"
--                       (20270210091000).
--   NULL             -> BLOCK. Explicitly, see below.
--   disconnected     -> ALLOW. leave_fleet (20270210093000) sets left_at in
--                       the same UPDATE, so the left_at IS NULL guard already
--                       excludes these; the relationship clause never sees
--                       them.
--   superseded       -> ALLOW. No writer sets this value anywhere in the
--                       codebase today (tenure-dedup in 20260830100000 still
--                       marks tracking_only = true instead), so this state is
--                       currently unreachable. Listed for completeness.
--
-- Why NULL is fail-closed rather than allowed:
--
-- 20270210090000 states that relationship_status is "event-driven only" and
-- "never inferred from absence of related data (no invites, no payout terms,
-- etc.)", and that NULL on pre-existing rows is "left honestly unknown rather
-- than guessed". Writing only `= 'active_employee'` would let SQL's
-- three-valued logic silently resolve NULL to "not employed" — an inference
-- from absence, which is exactly the operation that migration prohibits, and
-- exactly what the unapplied 20270208173000 did when it inferred relationship
-- from the absence of a driver_invites row and "produced a false positive on a
-- real, working driver relationship". The `OR relationship_status IS NULL`
-- clause is therefore deliberate and load-bearing: it keeps "unknown" out of
-- the "safe" bucket and makes the decision visible in the SQL instead of
-- emergent from the operator's null semantics.
--
-- Measured effect at time of writing (read-only production queries, 19 humans
-- currently selected by the old predicate):
--   active_employee + tracking_only=false  (4 humans)  block -> block  (same)
--   NULL            + tracking_only=false  (14 humans) block -> block  (same)
--   independent     + tracking_only=false  (1 human)   block -> ALLOW  (the fix)
--   independent     + tracking_only=true              allow -> allow  (same)
--   NULL            + tracking_only=true   (61 rows)   allow -> BLOCK  (new)
-- The last line is the largest behavioural change here and is intended: those
-- rows are active relationships of unknown type, and under the non-inference
-- invariant above they must not be treated as safe. Reviewed and approved as
-- fail-closed before this migration was written.
--
-- Explicitly NOT changed:
--   - The 85-row active NULL relationship_status cohort. No backfill, no
--     UPDATE, no data mutation of any kind. Their behaviour changes only
--     because the reader now classifies them; the rows are untouched.
--   - tracking_only, its value or its meaning, anywhere. It simply no longer
--     participates in the employment decision. Other readers/writers of
--     tracking_only (aggregateDrivers' is_integrated display flag,
--     tenure-dedup, assignment stubs) are unaffected.
--   - relationship_status / relationship_origin values and writers
--     (accept_driver_invite, assign_aggregate_trip_driver, leave_fleet,
--     claim_trip_by_otp, reassign_atomic, createDriver's reconnect path).
--   - No new enum value.
--   - Finance / Network reader filtering
--     (isActiveFleetRelationshipDriver, useDriversQuery, aggregateDrivers,
--     fleetDriversBase). The 85-row Finance-visibility problem is a separate
--     issue with a separate cause and is not addressed here.
--   - Phone normalisation, the auth.users driver-role scan, the profiles
--     lookups, every other returned column, the early RETURN after the first
--     match, and the left_at / owner_id guards — all byte-for-byte identical
--     to 20261130000003_get_driver_invitee_by_phone_avatars.sql.
--
-- DROP + CREATE (not a bare CREATE OR REPLACE): this migration's
-- RETURNS TABLE actually adds avatar_url/avatar_seed relative to the
-- immediately preceding 20260408120000 version — a return-shape change,
-- which Postgres's CREATE OR REPLACE FUNCTION cannot perform (SQLSTATE
-- 42P13, "cannot change return type of existing function"). An earlier
-- version of this migration used CREATE OR REPLACE on the incorrect premise
-- that the return shape hadn't changed; corrected here per Phase 7A's
-- from-scratch-replay verification (fails deterministically on a clean
-- Postgres otherwise). This function is SECURITY DEFINER and is one of only
-- two RPCs intentionally left anon-executable
-- (20260728210000_v2_audit_anon_rpc_revoke.sql) because the driver sign-in
-- path needs it: supabase/functions/link-driver-phone/index.ts calls it to
-- resolve a verified phone to the driver's real account before minting a
-- magic link. DROP would silently revoke those grants if nothing re-granted
-- them afterward — the explicit GRANT statements below (already present in
-- this migration, not newly added by this correction) re-assert
-- authenticated/anon/service_role immediately after CREATE, so the end
-- state — including anon access for driver sign-in — is unchanged.
-- is_in_fleet stays the 10th column of the same single returned row, so
-- link-driver-phone (which reads user_id and email and ignores column 10)
-- is unaffected.

DROP FUNCTION IF EXISTS public.get_driver_invitee_by_phone(text);

CREATE FUNCTION public.get_driver_invitee_by_phone(p_phone text)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  phone text,
  email text,
  emergency_contact_name text,
  emergency_contact_phone text,
  license_number text,
  avatar_url text,
  avatar_seed text,
  is_in_fleet boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_name text;
  v_phone text;
  v_input_digits text;
  v_input_canon text;
  v_stored_digits text;
  v_stored_canon text;
BEGIN
  v_input_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_input_canon := CASE
    WHEN length(v_input_digits) >= 12 AND left(v_input_digits, 2) = '91' THEN right(v_input_digits, 10)
    WHEN length(v_input_digits) >= 10 THEN right(v_input_digits, 10)
    ELSE v_input_digits
  END;
  IF v_input_canon = '' THEN RETURN; END IF;

  FOR v_user_id, v_name, v_phone IN
    SELECT u.id,
           trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')),
           trim(coalesce(u.raw_user_meta_data->>'phone', ''))
      FROM auth.users u
      WHERE coalesce(u.raw_user_meta_data->>'role', '') = 'driver'
        AND coalesce(u.raw_user_meta_data->>'phone', '') <> ''
  LOOP
    v_stored_digits := regexp_replace(v_phone, '\D', '', 'g');
    v_stored_canon := CASE
      WHEN length(v_stored_digits) >= 12 AND left(v_stored_digits, 2) = '91' THEN right(v_stored_digits, 10)
      WHEN length(v_stored_digits) >= 10 THEN right(v_stored_digits, 10)
      ELSE v_stored_digits
    END;
    IF v_stored_canon = v_input_canon THEN
      RETURN QUERY
      SELECT
        v_user_id,
        (CASE WHEN v_name <> '' THEN v_name ELSE v_phone END),
        v_phone,
        (SELECT p.email FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        (SELECT p.emergency_contact_name FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        (SELECT p.emergency_contact_phone FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        (SELECT p.license_number FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        (SELECT p.avatar_url FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        (SELECT p.avatar_seed FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        EXISTS (
          SELECT 1
          FROM public.drivers d
          JOIN public.organizations o ON d.organization_id = o.id
          WHERE d.user_id = v_user_id
            AND d.left_at IS NULL
            AND o.owner_id <> v_user_id
            AND (
              d.relationship_status = 'active_employee'
              OR d.relationship_status IS NULL
            )
        );
      RETURN;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_driver_invitee_by_phone(text) IS
  'Returns driver profile by normalized phone: profile fields (incl. avatar_url/avatar_seed) plus is_in_fleet. is_in_fleet = an active driver row (left_at IS NULL) in an organisation the driver does not own, whose relationship_status is active_employee OR NULL (unknown — fail-closed, never inferred as not-employed; see 20270210090000). independent/disconnected/superseded do not block. tracking_only is deliberately NOT part of this predicate — it is a data-completeness flag, not a relationship.';

-- Re-asserted defensively; CREATE OR REPLACE already preserves them.
-- anon is required by the driver sign-in path (link-driver-phone edge function).
GRANT EXECUTE ON FUNCTION public.get_driver_invitee_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_invitee_by_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_driver_invitee_by_phone(text) TO service_role;
