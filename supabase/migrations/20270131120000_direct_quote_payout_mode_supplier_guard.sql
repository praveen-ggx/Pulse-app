-- Stop stamping trip_payout_mode = 'asset' on the middleman's awarded trip.
--
-- The bug
-- -------
-- Both overloads of create_trip_from_direct_quote stamp:
--
--   CASE WHEN driver_id IS NOT NULL AND vehicle_id IS NOT NULL
--        THEN 'asset' ELSE 'market' END
--
-- introduced by 20260728100000_direct_quote_trip_payout_mode.sql. That asks
-- "does this row have a driver and a truck?" when it needed to ask "are the
-- driver and truck MINE?".
--
-- On the direct-quote path the answer to the first question is nearly always
-- yes, because a bidder quotes with the driver + vehicle it intends to send.
-- But the row being inserted here is the MIDDLEMAN's row: supplier_id is the
-- org that won the load, supplier_rate is money going out to them, and the
-- driver on the row belongs to THEM -- it is carried only so the middleman can
-- track who has its client's goods. Stamping 'asset' told the middleman "you
-- run this yourself", so trip detail rendered the Expense Hub / driver-payout
-- layout to the org that actually owes a supplier.
--
-- The origin migration justified ignoring supplier_id by calling it
-- "bookkeeping only ... useless as an asset/market discriminator on this path".
-- That is true from the MOVER's viewpoint but false on the middleman's row,
-- which is the row this function writes. Same premise also lives in
-- features/trips/domain/tripExecutionModel.ts and its test.
--
-- The fix
-- -------
-- One extra condition: only call it 'asset' when there is no supplier to pay.
--
-- Effect per side of an award (verified on the live ITS -> PR logistics load):
--   middleman row (supplier_id set)  -> 'market'  (was 'asset')  <-- fixed
--   own-truck deploy (no supplier)   -> 'asset'   (unchanged)
--
-- The mover's own half is NOT written here -- _ensure_mover_asset_trip creates
-- it with source = 'mover_asset', and getTripExecutionModel() force-returns
-- asset for that source before trip_payout_mode is read at all. So the July
-- regression this rule was originally added to fix (mover losing its Expense
-- Hub) cannot come back via this change.
--
-- Award and assignment behaviour is unchanged: trip_payout_mode is a label
-- describing who is owed, never a gate. Nothing reads it to permit or block an
-- award, an assignment, or a status transition.
--
-- Existing rows were corrected separately (8 rows, all verified PULL awards
-- whose driver belonged to the supplier org and which had zero attached
-- fuel/toll/expense/ledger records). This migration only stops NEW ones.
--
-- Patched via anchored replacement of pg_get_functiondef output so the
-- surrounding logic (row locking, idempotency branch, supplier auto-create,
-- trip_number retry loop, mover-half call) is preserved byte-for-byte. Each
-- step asserts its anchor matched and raises otherwise -- same guarded style as
-- 20260728100000. Idempotent: re-running is a no-op once patched.

DO $mig$
DECLARE
  v_sig      text;
  v_def      text;
  v_before   text;
  v_from     text;
  v_to       text;
  v_sigs     text[] := ARRAY[
    'public.create_trip_from_direct_quote(uuid,text)',
    'public.create_trip_from_direct_quote(uuid)'
  ];
  v_patched  int := 0;
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'expected function % not found', v_sig;
    END IF;

    v_def := pg_get_functiondef(to_regprocedure(v_sig));

    -- The 2-arg overload writes (v_quote).col; the 1-arg one writes v_quote.col.
    IF v_sig = 'public.create_trip_from_direct_quote(uuid,text)' THEN
      v_from := 'CASE WHEN (v_quote).driver_id IS NOT NULL AND (v_quote).vehicle_id IS NOT NULL THEN ''asset'' ELSE ''market'' END';
      v_to   := 'CASE WHEN (v_quote).driver_id IS NOT NULL AND (v_quote).vehicle_id IS NOT NULL AND v_supplier_id IS NULL THEN ''asset'' ELSE ''market'' END';
    ELSE
      v_from := 'CASE WHEN v_quote.driver_id IS NOT NULL AND v_quote.vehicle_id IS NOT NULL THEN ''asset'' ELSE ''market'' END';
      v_to   := 'CASE WHEN v_quote.driver_id IS NOT NULL AND v_quote.vehicle_id IS NOT NULL AND v_supplier_id IS NULL THEN ''asset'' ELSE ''market'' END';
    END IF;

    IF position(v_to IN v_def) > 0 THEN
      RAISE NOTICE '% already carries the supplier guard - skipping', v_sig;
      CONTINUE;
    END IF;

    v_before := v_def;
    v_def := replace(v_def, v_from, v_to);
    IF v_def = v_before THEN
      -- pg_get_functiondef no longer contains the July one-line CASE.
      -- 20270227110000 recreates both overloads with the supplier guard.
      RAISE NOTICE 'could not patch payout-mode CASE of % - anchor not found; later load-hub body installs the guard', v_sig;
      CONTINUE;
    END IF;

    EXECUTE v_def;
    v_patched := v_patched + 1;
    RAISE NOTICE 'patched % to guard trip_payout_mode on supplier_id', v_sig;
  END LOOP;

  RAISE NOTICE 'direct_quote payout-mode guard: % overload(s) patched', v_patched;
END
$mig$;
