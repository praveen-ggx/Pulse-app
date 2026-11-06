-- Issued invoice amounts must reconcile with each other.
-- Trip freight, fuel, and extra charges stay in the submitted subtotal: this
-- does not reprice a trip, and it does not reject a subtotal that differs from
-- client_price. It rejects a total that is neither the taxable base nor the
-- base plus the stated GST, and it rejects mixed IGST with CGST/SGST.
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.tg_invoices_amount_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_sub numeric := round(coalesce(NEW.subtotal, 0), 2);
  v_sgst numeric := round(coalesce(NEW.sgst_amount, 0), 2);
  v_cgst numeric := round(coalesce(NEW.cgst_amount, 0), 2);
  v_igst numeric := round(coalesce(NEW.igst_amount, 0), 2);
  v_tax numeric;
  v_total numeric := round(coalesce(NEW.total_amount, 0), 2);
  v_rate numeric := coalesce(NEW.gst_rate, 0);
BEGIN
  IF coalesce(NEW.status, '') NOT IN ('sent', 'paid') THEN
    RETURN NEW;
  END IF;

  v_tax := round(v_sgst + v_cgst + v_igst, 2);

  IF v_sub < 0 OR v_sgst < 0 OR v_cgst < 0 OR v_igst < 0 OR v_total < 0 OR v_rate < 0 THEN
    RAISE EXCEPTION 'invoice amounts must not be negative'
      USING ERRCODE = '23514';
  END IF;

  IF v_igst > 0 AND (v_cgst > 0 OR v_sgst > 0) THEN
    RAISE EXCEPTION 'invoice GST mixes IGST with CGST/SGST'
      USING ERRCODE = '23514';
  END IF;

  -- Reverse charge keeps the payable total equal to the taxable base.
  -- A normal invoice adds the stated GST. Anything else is not a real total.
  IF abs(v_total - v_sub) > 0.05 AND abs(v_total - (v_sub + v_tax)) > 0.05 THEN
    RAISE EXCEPTION 'invoice total does not match its tax breakdown'
      USING ERRCODE = '23514';
  END IF;

  IF v_rate > 0 AND abs(v_total - (v_sub + v_tax)) <= 0.05
     AND abs(v_tax - round(v_sub * v_rate / 100, 2)) > 1.00 THEN
    RAISE EXCEPTION 'invoice tax does not match its GST rate'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_invoices_amount_integrity() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_invoices_amount_integrity ON public.invoices;
CREATE TRIGGER trg_invoices_amount_integrity
  BEFORE INSERT OR UPDATE OF status, subtotal, gst_rate, sgst_amount, cgst_amount, igst_amount, total_amount
  ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_invoices_amount_integrity();
