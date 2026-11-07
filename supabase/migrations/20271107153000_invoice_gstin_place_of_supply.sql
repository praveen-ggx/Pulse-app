-- A rated invoice needs the organization GSTIN.
-- When both GSTINs name a state, intra-state tax is CGST and SGST, and
-- inter-state tax is IGST. Already issued rows are not rechecked.
-- Trip freight validation from 20271107140000 stays in force.
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
  v_freight numeric := 0;
  v_adjust numeric := 0;
  v_issuing boolean := TG_OP = 'INSERT'
    OR coalesce(OLD.status, '') NOT IN ('sent', 'paid');
  v_org_gstin text;
  v_org_na boolean := false;
  v_client_gstin text;
  v_org_code text;
  v_client_code text;
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

  IF abs(v_total - v_sub) > 0.05 AND abs(v_total - (v_sub + v_tax)) > 0.05 THEN
    RAISE EXCEPTION 'invoice total does not match its tax breakdown'
      USING ERRCODE = '23514';
  END IF;

  IF v_rate > 0 AND abs(v_total - (v_sub + v_tax)) <= 0.05
     AND abs(v_tax - round(v_sub * v_rate / 100, 2)) > 1.00 THEN
    RAISE EXCEPTION 'invoice tax does not match its GST rate'
      USING ERRCODE = '23514';
  END IF;

  IF v_issuing AND v_rate > 0 THEN
    SELECT btrim(o.gstin), coalesce(o.gst_not_applicable, false)
      INTO v_org_gstin, v_org_na
    FROM public.organizations o
    WHERE o.id = NEW.org_id;

    IF v_org_na OR v_org_gstin IS NULL OR v_org_gstin = '' THEN
      RAISE EXCEPTION 'a tax invoice needs the organization GSTIN'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.client_id IS NOT NULL THEN
      SELECT btrim(c.gstin)
        INTO v_client_gstin
      FROM public.clients c
      WHERE c.id = NEW.client_id
        AND c.organization_id = NEW.org_id;
    END IF;

    v_org_code := substring(coalesce(v_org_gstin, '') from 1 for 2);
    v_client_code := substring(coalesce(v_client_gstin, '') from 1 for 2);
    IF v_org_code ~ '^[0-9]{2}$' AND v_client_code ~ '^[0-9]{2}$' THEN
      IF v_org_code = v_client_code AND v_igst > 0.05 THEN
        RAISE EXCEPTION 'intra-state invoice cannot carry IGST'
          USING ERRCODE = '23514';
      ELSIF v_org_code <> v_client_code AND (v_cgst > 0.05 OR v_sgst > 0.05) THEN
        RAISE EXCEPTION 'inter-state invoice cannot carry CGST or SGST'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF v_issuing
     AND coalesce(NEW.invoice_source, 'trip') = 'trip'
     AND coalesce(cardinality(NEW.trip_ids), 0) > 0 THEN
    SELECT round(coalesce(sum(t.client_price), 0), 2)
      INTO v_freight
    FROM public.trips t
    WHERE t.id = ANY (NEW.trip_ids)
      AND t.organization_id = NEW.org_id;

    SELECT round(coalesce(sum(
      CASE WHEN a.impact = 'plus' THEN a.amount ELSE -a.amount END
    ), 0), 2)
      INTO v_adjust
    FROM public.trip_finance_adjustments a
    WHERE a.trip_id = ANY (NEW.trip_ids)
      AND a.organization_id = NEW.org_id
      AND a.type = 'revenue'
      AND a.voided_at IS NULL;

    IF abs(v_sub - round(v_freight + v_adjust, 2)) > 0.05 THEN
      RAISE EXCEPTION 'invoice subtotal does not match trip freight'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_invoices_amount_integrity() FROM PUBLIC;
