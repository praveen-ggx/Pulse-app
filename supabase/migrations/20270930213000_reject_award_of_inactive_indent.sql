-- A cancelled, closed, or expired indent stays inactive.
-- Award (status → awarded/assigned/deployed, or accepting a direct quote)
-- is rejected until the indent is reactivated. Open and broadcast awards
-- are unchanged.

CREATE OR REPLACE FUNCTION public.reject_award_of_inactive_indent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(OLD.status, '')) IN ('cancelled', 'closed', 'expired')
     AND lower(coalesce(NEW.status, '')) IN ('awarded', 'assigned', 'deployed')
     AND lower(coalesce(NEW.status, '')) IS DISTINCT FROM lower(coalesce(OLD.status, ''))
  THEN
    RAISE EXCEPTION 'indent_not_active: reactivate this indent before awarding it (status=%)', OLD.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_award_of_inactive_indent ON public.indents;
CREATE TRIGGER trg_reject_award_of_inactive_indent
  BEFORE UPDATE OF status ON public.indents
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_award_of_inactive_indent();

CREATE OR REPLACE FUNCTION public.reject_quote_accept_on_inactive_indent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF lower(coalesce(NEW.status, '')) = 'accepted'
     AND lower(coalesce(OLD.status, '')) IS DISTINCT FROM 'accepted'
  THEN
    SELECT lower(coalesce(status, '')) INTO v_status
    FROM public.indents
    WHERE id = NEW.indent_id;
    IF v_status IN ('cancelled', 'closed', 'expired') THEN
      RAISE EXCEPTION 'indent_not_active: reactivate this indent before awarding it (status=%)', v_status
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_quote_accept_on_inactive_indent ON public.direct_quotes;
CREATE TRIGGER trg_reject_quote_accept_on_inactive_indent
  BEFORE UPDATE OF status ON public.direct_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_quote_accept_on_inactive_indent();

-- Repair awards that landed on an indent already cancelled, with no live trip.
UPDATE public.direct_quotes dq
SET status = 'pending', updated_at = now()
FROM public.indents i
WHERE dq.indent_id = i.id
  AND dq.status = 'accepted'
  AND i.cancel_reason IS NOT NULL
  AND lower(i.status) IN ('awarded', 'assigned', 'deployed')
  AND i.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.indent_id = i.id
      AND coalesce(lower(t.status), '') NOT IN ('cancelled', 'canceled')
  );

UPDATE public.indents i
SET
  status = 'cancelled',
  assigned_supplier_id = NULL,
  assigned_supplier_rate = NULL,
  updated_at = now()
WHERE i.cancel_reason IS NOT NULL
  AND lower(i.status) IN ('awarded', 'assigned', 'deployed')
  AND i.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.indent_id = i.id
      AND coalesce(lower(t.status), '') NOT IN ('cancelled', 'canceled')
  );
