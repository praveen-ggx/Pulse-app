-- Compliance payments on Marketplace (Exchange) trips post straight to the
-- payer's ledger (Vasanth decision 2026-11-22, option b: GOGOVAN books these
-- locally; no shared-ledger confirmation by the supplier).
--
-- Before: tg_transactions_pulse_exchange_guard sent any payment to the
-- Exchange counterparty through Pulse Exchange's two gates, and the app turned
-- Compliance's "Confirm payment" into an Exchange claim waiting for the
-- supplier. Compliance never showed that state, so those trips stayed in
-- Pending without a UTR (42 claims, 7-22 Nov 2026, none confirmed).
--
-- 1. Guard: compliance_advance / compliance_balance skip the two Exchange
--    routing checks. Body = live prod definition plus that one early return.
-- 2. Cancel the open payer claims created by Compliance payments (trip has a
--    live advance/balance payment request), the same update
--    cancel_exchange_payment makes, so a later supplier "confirm" cannot post a
--    second payment once Finance re-posts in Compliance.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.tg_transactions_pulse_exchange_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lc record;
BEGIN
  IF public._pulse_exchange_writer_active() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE')
     AND (OLD.ledger_category IN ('EXCHANGE_PAYMENT', 'EXCHANGE_RECEIPT')
          OR public._is_marketplace_fee_party(OLD.contact_type, OLD.contact_id)) THEN
    RAISE EXCEPTION 'exchange_ledger_locked: a confirmed Pulse Exchange entry cannot be edited or deleted from Finance'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.ledger_category IN ('EXCHANGE_PAYMENT', 'EXCHANGE_RECEIPT')
     OR public._is_marketplace_fee_party(NEW.contact_type, NEW.contact_id) THEN
    RAISE EXCEPTION 'exchange_ledger_locked: Pulse Exchange entries post to Finance only after the other side confirms them'
      USING ERRCODE = '42501';
  END IF;

  -- Compliance advance / balance: GOGOVAN pays the supplier and books it in its
  -- own ledger; there is no shared Exchange ledger for these. Only the two
  -- Exchange-routing checks below are skipped. Exchange entries and the
  -- Marketplace fee party above stay locked.
  IF NEW.ledger_category IN ('compliance_advance', 'compliance_balance') THEN
    RETURN NEW;
  END IF;

  IF public._is_marketplace_only_party(NEW.contact_type, NEW.contact_id) THEN
    RAISE EXCEPTION 'exchange_ledger_locked: payments with a Marketplace partner you are not connected to are recorded in Pulse Exchange on the trip'
      USING ERRCODE = '42501';
  END IF;

  -- On an Exchange trip, a direct payment to the counterparty would be a
  -- second obligation next to the Exchange one.
  IF NEW.trip_id IS NOT NULL THEN
    SELECT * INTO v_lc FROM public._exchange_trip_ledger_contact(NEW.trip_id);
    IF v_lc.contact_type IS NOT NULL
       AND lower(coalesce(NEW.contact_type, '')) = v_lc.contact_type
       AND (v_lc.contact_type = 'dco' OR NEW.contact_id IS NOT DISTINCT FROM v_lc.contact_id) THEN
      RAISE EXCEPTION 'exchange_ledger_locked: this trip settles through Pulse Exchange; record the payment in Exchange'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

UPDATE public.exchange_payments ep
   SET status = 'cancelled',
       decided_at = now(),
       decision_reason = 'Compliance pays this trip directly (payer ledger); claim withdrawn 2026-11-22'
 WHERE ep.status = 'claimed'
   AND ep.claimed_by_side = 'payer'
   AND EXISTS (
     SELECT 1
       FROM public.payment_requests pr
      WHERE pr.trip_id = ep.trip_id
        AND pr.payment_type IN ('advance', 'balance')
        AND pr.status <> 'cancelled'
   );
