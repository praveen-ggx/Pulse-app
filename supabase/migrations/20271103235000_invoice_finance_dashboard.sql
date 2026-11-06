-- Finance overview: one bounded aggregate per call, computed on the server.
-- Receivables and aging are as of today (India date); the monthly series covers
-- [p_from, p_to] (at most three years). Uses the same settlement rule as every
-- register: confirmed allocations + issued credit notes - refunds of credit-note
-- credit. Cancelled and draft invoices are excluded. No rows leave the database.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.invoice_finance_dashboard(
  p_org_id uuid,
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_receivables jsonb;
  v_months jsonb;
  v_unapplied numeric;
  v_bank jsonb;
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 1100 THEN
    RAISE EXCEPTION 'choose a period of up to three years';
  END IF;

  WITH inv AS (
    SELECT i.client_id,
           coalesce(i.due_date, i.invoice_date) AS anchor,
           round(i.total_amount, 2)
             - coalesce(paid.received, 0) - coalesce(cn.credited, 0) + coalesce(rf.refunded, 0) AS net
    FROM public.invoices i
    LEFT JOIN LATERAL (
      SELECT sum(a.amount) AS received FROM public.invoice_payment_allocations a
      WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'
    ) paid ON true
    LEFT JOIN LATERAL (
      SELECT sum(c.amount) AS credited FROM public.invoice_credit_notes c
      WHERE c.org_id = i.org_id AND c.invoice_id = i.id AND c.status = 'issued'
    ) cn ON true
    LEFT JOIN LATERAL (
      SELECT sum(r.amount) AS refunded FROM public.invoice_customer_refunds r
      WHERE r.org_id = i.org_id AND r.invoice_id = i.id AND r.status = 'recorded' AND r.source_type = 'credit_note'
    ) rf ON true
    WHERE i.org_id = p_org_id
      AND i.status IN ('sent', 'paid')
  ),
  o AS (
    SELECT client_id, greatest(net, 0) AS open_amount, greatest(-net, 0) AS excess, v_today - anchor AS age
    FROM inv
  )
  SELECT jsonb_build_object(
           'outstanding', round(coalesce(sum(open_amount), 0), 2),
           'current', round(coalesce(sum(open_amount) FILTER (WHERE age <= 0), 0), 2),
           'days_1_30', round(coalesce(sum(open_amount) FILTER (WHERE age BETWEEN 1 AND 30), 0), 2),
           'days_31_60', round(coalesce(sum(open_amount) FILTER (WHERE age BETWEEN 31 AND 60), 0), 2),
           'days_61_90', round(coalesce(sum(open_amount) FILTER (WHERE age BETWEEN 61 AND 90), 0), 2),
           'days_over_90', round(coalesce(sum(open_amount) FILTER (WHERE age > 90), 0), 2),
           'open_invoices', count(*) FILTER (WHERE open_amount > 0),
           'customers_owing', count(DISTINCT client_id) FILTER (WHERE open_amount > 0),
           'credit_note_credit', round(coalesce(sum(excess), 0), 2)
         )
    INTO v_receivables
  FROM o;

  SELECT round(coalesce(sum(p.amount
           - coalesce((SELECT sum(a.amount) FROM public.invoice_payment_allocations a
                       WHERE a.org_id = p.org_id AND a.payment_id = p.id AND a.status = 'confirmed'), 0)
           - coalesce((SELECT sum(r.amount) FROM public.invoice_customer_refunds r
                       WHERE r.org_id = p.org_id AND r.payment_id = p.id AND r.status = 'recorded'
                         AND r.source_type = 'payment'), 0)), 0), 2)
    INTO v_unapplied
  FROM public.invoice_payments p
  WHERE p.org_id = p_org_id AND p.status = 'recorded';

  WITH months AS (
    SELECT generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date AS m
  ),
  invoiced AS (
    SELECT date_trunc('month', i.invoice_date)::date AS m, sum(i.total_amount) AS amount, count(*) AS n
    FROM public.invoices i
    WHERE i.org_id = p_org_id AND i.status IN ('sent', 'paid') AND i.invoice_date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  collected AS (
    SELECT date_trunc('month', p.payment_date)::date AS m,
           sum(p.amount - p.tds_amount) AS bank, sum(p.tds_amount) AS tds, count(*) AS n
    FROM public.invoice_payments p
    WHERE p.org_id = p_org_id AND p.status = 'recorded' AND p.payment_date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  credited AS (
    SELECT date_trunc('month', c.credit_date)::date AS m, sum(c.amount) AS amount, count(*) AS n
    FROM public.invoice_credit_notes c
    WHERE c.org_id = p_org_id AND c.status = 'issued' AND c.credit_date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  refunded AS (
    SELECT date_trunc('month', r.refund_date)::date AS m, sum(r.amount) AS amount, count(*) AS n
    FROM public.invoice_customer_refunds r
    WHERE r.org_id = p_org_id AND r.status = 'recorded' AND r.refund_date BETWEEN p_from AND p_to
    GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'month', months.m,
           'invoiced', round(coalesce(invoiced.amount, 0), 2),
           'invoice_count', coalesce(invoiced.n, 0),
           'collected_bank', round(coalesce(collected.bank, 0), 2),
           'collected_tds', round(coalesce(collected.tds, 0), 2),
           'receipt_count', coalesce(collected.n, 0),
           'credit_notes', round(coalesce(credited.amount, 0), 2),
           'refunds', round(coalesce(refunded.amount, 0), 2)
         ) ORDER BY months.m), '[]'::jsonb)
    INTO v_months
  FROM months
  LEFT JOIN invoiced ON invoiced.m = months.m
  LEFT JOIN collected ON collected.m = months.m
  LEFT JOIN credited ON credited.m = months.m
  LEFT JOIN refunded ON refunded.m = months.m;

  SELECT jsonb_build_object(
           'unmatched_credits', count(*) FILTER (WHERE b.status = 'unmatched' AND b.credit > 0),
           'unmatched_amount', round(coalesce(sum(b.credit) FILTER (WHERE b.status = 'unmatched' AND b.credit > 0), 0), 2),
           'matched', count(*) FILTER (WHERE b.status = 'matched'),
           'matched_to_reversed', count(*) FILTER (WHERE b.status = 'matched' AND p.status = 'reversed'),
           'debits', count(*) FILTER (WHERE b.debit > 0)
         )
    INTO v_bank
  FROM public.invoice_bank_lines b
  LEFT JOIN public.invoice_payments p ON p.id = b.matched_payment_id AND p.org_id = b.org_id
  WHERE b.org_id = p_org_id;

  RETURN jsonb_build_object(
    'as_of', v_today,
    'from', p_from,
    'to', p_to,
    'receivables', v_receivables,
    'unapplied_receipts', v_unapplied,
    'months', v_months,
    'bank', v_bank
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoice_finance_dashboard(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_finance_dashboard(uuid, date, date) TO authenticated;
