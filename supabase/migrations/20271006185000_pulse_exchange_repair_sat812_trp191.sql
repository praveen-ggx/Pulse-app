-- Pulse Exchange historical repair: one Marketplace award, two trips.
--
--   Indent  SAT812-IND-489 (5c691889-5574-46f1-9daf-617877781898)
--   Award   market_bids cb27ca19-5da0-4650-8906-ce460554c1ff, ₹43,500, platform fee paid
--   Shipper GOGOVAN INDIA PVT LTD trip SAT812-TRP-191 (31d183e5-3a57-4b4f-9dcd-781db2b0662c)
--           supplier_id NULL -> GOGOVAN's account for DEVANATHAN
--   Bidder  DEVANATHAN TRANSPORT MANIVANNAN execution trip DEV766-TRP-003
--           (22222d50-f085-4a1c-a609-3ffc52d633af)
--           customer GOGOVAN by name -> DEVANATHAN's account for GOGOVAN
--
-- The two orgs are already connected, so both accounts are their existing
-- linked rows (read 2026-10-06): supplier a438f4c0-9037-48fc-bf00-dc86b64865fd
-- and client f4d02e47-1ed8-4976-b782-1fe97ecaea4a. The repair aborts if the
-- canonical resolver returns anything else; it creates no party rows.
--
-- Requires 20271006184500 (canonical counterparty accounts). Touches exactly
-- these two trips rows and adds one exchange_trips enrollment. Writes no
-- transactions and no exchange_payments: the ₹43,500 becomes an open Exchange
-- obligation that the parties settle through claim/confirm.
--
-- Safe to re-run: an already-repaired award is left as is. Any other drift from
-- the reviewed state (different supplier/customer, Finance rows on either trip,
-- award or fee changes, test-style names) aborts the whole migration.
--
-- Side effect from the existing trip-room trigger (additive only): because both
-- accounts are linked, SAT812-TRP-191's room (0045ed5d) gains DEVANATHAN's
-- active members as supplier, and DEV766-TRP-003's room (5e1bd9fd) gains
-- GOGOVAN's active members as client, as for any connected partner on a trip.
-- Supplier guards checked 2026-10-06: vendor active, no load-chain loop.

SET LOCAL lock_timeout = '5s';

DO $repair$
DECLARE
  c_indent      constant uuid := '5c691889-5574-46f1-9daf-617877781898';
  c_bid         constant uuid := 'cb27ca19-5da0-4650-8906-ce460554c1ff';
  c_shipper_org constant uuid := '5b471ecb-fbfb-470e-95cf-525d789c761a';
  c_bidder_org  constant uuid := 'e906cf1e-34c9-40e3-95d8-f6fc8c1168eb';
  c_ship_trip   constant uuid := '31d183e5-3a57-4b4f-9dcd-781db2b0662c';
  c_exec_trip   constant uuid := '22222d50-f085-4a1c-a609-3ffc52d633af';
  c_supplier    constant uuid := 'a438f4c0-9037-48fc-bf00-dc86b64865fd';
  c_client      constant uuid := 'f4d02e47-1ed8-4976-b782-1fe97ecaea4a';
  c_amount      constant numeric := 43500;

  v_ship        public.trips%ROWTYPE;
  v_exec        public.trips%ROWTYPE;
  v_supplier    uuid;
  v_client      uuid;
  v_client_name text;
  v_ship_done   boolean;
  v_exec_done   boolean;
  v_enrolled    boolean;
  v_names       text;
BEGIN
  SELECT * INTO v_ship FROM public.trips WHERE id = c_ship_trip FOR UPDATE;
  SELECT * INTO v_exec FROM public.trips WHERE id = c_exec_trip FOR UPDATE;
  IF v_ship.id IS NULL OR v_exec.id IS NULL THEN
    RAISE EXCEPTION 'px_repair_sat812: trip missing (shipper %, execution %)', v_ship.id, v_exec.id;
  END IF;

  -- Identity of the two trips and the award they belong to.
  IF v_ship.organization_id IS DISTINCT FROM c_shipper_org
     OR v_ship.indent_id IS DISTINCT FROM c_indent
     OR v_ship.source IS DISTINCT FROM 'market_bid'
     OR v_ship.source_market_bid_id IS DISTINCT FROM c_bid
     OR v_ship.deleted_at IS NOT NULL
     OR v_ship.operating_mode IS DISTINCT FROM 'FLEET'
     OR v_ship.supplier_rate IS DISTINCT FROM c_amount THEN
    RAISE EXCEPTION 'px_repair_sat812: shipper trip % no longer matches the reviewed award', c_ship_trip;
  END IF;
  IF v_exec.organization_id IS DISTINCT FROM c_bidder_org
     OR v_exec.source IS DISTINCT FROM 'mover_asset'
     OR v_exec.source_indent_id IS DISTINCT FROM c_indent
     OR v_exec.deleted_at IS NOT NULL
     OR v_exec.client_price IS DISTINCT FROM c_amount THEN
    RAISE EXCEPTION 'px_repair_sat812: execution trip % no longer matches the reviewed award', c_exec_trip;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.indents i
    JOIN public.market_bids mb ON mb.id = c_bid AND mb.indent_id = i.id
    WHERE i.id = c_indent
      AND i.organization_id = c_shipper_org
      AND i.assigned_supplier_id = c_bidder_org
      AND mb.status = 'accepted'
      AND mb.bidder_type = 'organization'
      AND mb.bidder_organization_id = c_bidder_org
      AND mb.amount = c_amount
      AND mb.fee_payment_status = 'paid'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.marketplace_fee_payments f
    WHERE f.market_bid_id = c_bid AND f.status = 'paid'
  ) THEN
    RAISE EXCEPTION 'px_repair_sat812: award % (accepted, ₹%, fee paid) no longer holds', c_bid, c_amount;
  END IF;
  IF NOT public.is_marketplace_indent_award(c_indent, c_bidder_org) THEN
    RAISE EXCEPTION 'px_repair_sat812: indent % is not classified as a Marketplace award', c_indent;
  END IF;

  -- Test-data guard: refuse if any party or customer on this award looks like a fixture.
  SELECT string_agg(n, ', ') INTO v_names
  FROM (
    SELECT o.name AS n FROM public.organizations o WHERE o.id IN (c_shipper_org, c_bidder_org)
    UNION ALL SELECT v_ship.client_name
    UNION ALL SELECT c.name FROM public.clients c WHERE c.id = v_ship.client_id
  ) names
  WHERE n ~* '(\mqa\M|fixture|\mtest|dummy|sample|spacex)';
  IF v_names IS NOT NULL THEN
    RAISE EXCEPTION 'px_repair_sat812: test-style names on this award (%); refusing', v_names;
  END IF;

  -- Lookup only: the reviewed accounts must already exist.
  v_supplier := public._marketplace_counterparty_account_lookup(c_shipper_org, 'supplier', c_bidder_org);
  v_client   := public._marketplace_counterparty_account_lookup(c_bidder_org, 'client', c_shipper_org);
  IF v_supplier IS DISTINCT FROM c_supplier OR v_client IS DISTINCT FROM c_client THEN
    RAISE EXCEPTION 'px_repair_sat812: canonical accounts are % / %; reviewed % / %',
      v_supplier, v_client, c_supplier, c_client;
  END IF;
  SELECT c.name INTO v_client_name FROM public.clients c WHERE c.id = v_client;

  v_ship_done := v_ship.supplier_id IS NOT DISTINCT FROM v_supplier;
  v_exec_done := v_exec.client_id IS NOT DISTINCT FROM v_client;
  v_enrolled  := EXISTS (SELECT 1 FROM public.exchange_trips et WHERE et.trip_id = c_ship_trip);

  IF v_ship_done AND v_exec_done AND v_enrolled THEN
    RAISE NOTICE 'px_repair_sat812: already repaired; nothing to do';
    RETURN;
  END IF;

  -- Pre-repair state must be exactly what was reviewed.
  IF NOT v_ship_done AND v_ship.supplier_id IS NOT NULL THEN
    RAISE EXCEPTION 'px_repair_sat812: shipper trip carries supplier %; expected none', v_ship.supplier_id;
  END IF;
  IF NOT v_exec_done AND (v_exec.client_id IS NOT NULL OR v_exec.client_name IS DISTINCT FROM 'GOGOVAN INDIA PVT LTD') THEN
    RAISE EXCEPTION 'px_repair_sat812: execution trip customer is % / %; expected GOGOVAN by name only',
      v_exec.client_id, v_exec.client_name;
  END IF;
  IF EXISTS (SELECT 1 FROM public.transactions tx WHERE tx.trip_id IN (c_ship_trip, c_exec_trip)) THEN
    RAISE EXCEPTION 'px_repair_sat812: Finance rows now exist on these trips; re-review before repairing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exchange_payments ep WHERE ep.trip_id = c_ship_trip) THEN
    RAISE EXCEPTION 'px_repair_sat812: Exchange payments already exist on trip %', c_ship_trip;
  END IF;

  IF NOT v_ship_done THEN
    UPDATE public.trips SET supplier_id = v_supplier WHERE id = c_ship_trip;
  END IF;
  IF NOT v_exec_done THEN
    UPDATE public.trips SET client_id = v_client, client_name = v_client_name WHERE id = c_exec_trip;
  END IF;
  PERFORM public._exchange_enroll_trip(c_ship_trip, c_bid, 'repair');

  RAISE NOTICE 'px_repair_sat812: shipper trip supplier -> %, execution trip client -> %, enrolled in Exchange', v_supplier, v_client;
END;
$repair$;
