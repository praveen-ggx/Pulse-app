-- 20270930213000_reject_award_of_inactive_indent (team V1) defines an older,
-- weaker reject_quote_accept_on_inactive_indent(). Vasanth's later
-- 20271005200741_gate1a_award_lock_order_and_commercial_integrity_guards
-- replaced it with the Gate 1A version (indent lock, owner-only accept,
-- already-awarded checks). If gate1a is already applied on a database and
-- 20270930213000 is pushed after it, the older body would win.
--
-- Re-apply the Gate 1A body verbatim so the final state is the same in any
-- push order. No-op where gate1a is already live (e.g. preprod).

CREATE OR REPLACE FUNCTION public.reject_quote_accept_on_inactive_indent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_status   text;
  v_indent   public.indents%ROWTYPE;
  v_uid      uuid := (SELECT auth.uid());
  v_other    uuid;
BEGIN
  IF lower(coalesce(NEW.status, '')) = 'accepted'
     AND lower(coalesce(OLD.status, '')) IS DISTINCT FROM 'accepted'
  THEN
    -- Gate 1A: take the indent lock before reading its state, so this
    -- serializes against award_market_bid / award_direct_quote /
    -- award_indent_to_trip instead of racing them on a stale read.
    SELECT * INTO v_indent
    FROM public.indents
    WHERE id = NEW.indent_id
    FOR UPDATE;

    v_status := lower(coalesce(v_indent.status, ''));
    IF v_status IN ('cancelled', 'closed', 'expired') THEN
      RAISE EXCEPTION 'indent_not_active: reactivate this indent before awarding it (status=%)', v_status
        USING ERRCODE = '23514';
    END IF;

    -- Only the indent-owning organization awards. Closes bidder self-accept:
    -- the bidder UPDATE policy on direct_quotes checks bidder-org membership
    -- only, so without this a bidder could accept its own quote.
    IF v_uid IS NULL OR NOT public.is_org_staff(v_indent.organization_id) THEN
      RAISE EXCEPTION 'unauthorized: only staff of the load-owning organization can accept a quote'
        USING ERRCODE = '42501';
    END IF;

    IF v_status NOT IN ('open', 'broadcast') THEN
      RAISE EXCEPTION 'indent_not_open: indent % is not open for award (status=%)', NEW.indent_id, v_indent.status
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.market_bids mb
      WHERE mb.indent_id = NEW.indent_id
        AND mb.status = 'accepted'
    ) THEN
      RAISE EXCEPTION 'already_awarded: indent % already has an accepted Marketplace bid', NEW.indent_id
        USING ERRCODE = '23514';
    END IF;

    IF v_indent.assigned_supplier_id IS NOT NULL
       AND v_indent.assigned_supplier_id IS DISTINCT FROM NEW.bidder_organization_id THEN
      v_other := v_indent.assigned_supplier_id;
      RAISE EXCEPTION 'already_awarded: indent % is already assigned to organization %', NEW.indent_id, v_other
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
