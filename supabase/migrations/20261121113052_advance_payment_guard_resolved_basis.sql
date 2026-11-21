-- Advance payment guard: compare the resolved supplier rate basis.
-- Since 20271118094500 (formula_version 1) the guard compared the raw
-- trips.supplier_rate_basis (blank on most trips) with the snapshot's resolved
-- basis ('per_trip'), so every blank-basis advance failed at payment with
-- "trip terms changed after approval" (prod 2026-11-21: 132 pending, no advance
-- posted since 18 Nov 18:40). Body = live prod definition except that check.
-- Rate, tons, amount, TDS and documentation checks are unchanged.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.tg_transactions_link_payment_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text;
  v_request uuid;
  v_approved numeric;
  v_snapshot jsonb;
  v_now jsonb;
  v_paid numeric;
  v_trip_org uuid;
  v_rate numeric;
  v_basis text;
  v_tons numeric;
begin
  if tg_op = 'DELETE' then
    if old.ledger_category in ('compliance_advance', 'compliance_balance') then
      select l.request_id into v_request
        from public.payment_request_transactions l
       where l.transaction_id = old.id;
      if v_request is null then
        select id into v_request from public.payment_requests
         where trip_id = old.trip_id
           and payment_type = case old.ledger_category when 'compliance_advance' then 'advance' else 'balance' end
           and status <> 'cancelled';
      end if;
      if v_request is not null then
        delete from public.payment_request_transactions where transaction_id = old.id;
        perform public.refresh_payment_request_status(v_request);
      end if;
    end if;
    return old;
  end if;

  if new.trip_id is null or new.ledger_category not in ('compliance_advance', 'compliance_balance') then
    return new;
  end if;
  v_type := case new.ledger_category when 'compliance_advance' then 'advance' else 'balance' end;

  select organization_id into v_trip_org from public.trips where id = new.trip_id;
  if v_trip_org is null or new.organization_id is distinct from v_trip_org then
    raise exception 'payment organization does not match the trip';
  end if;

  if v_type = 'advance' then
    select id, approved_amount, terms_snapshot
      into v_request, v_approved, v_snapshot
      from public.payment_requests
     where trip_id = new.trip_id
       and payment_type = 'advance'
       and status <> 'cancelled'
     for update;
    if v_request is null then
      raise exception 'advance cannot be paid before it is approved';
    end if;
    if v_approved is null then
      raise exception 'approved amount is missing; reapprove the advance';
    end if;
    v_paid := round(coalesce(new.amount_out, 0), 2);
    if coalesce(v_snapshot->>'formula_version', '') = '1' then
      if v_paid is distinct from v_approved then
        raise exception 'payment amount must equal the approved advance';
      end if;
      select supplier_rate, load_tons
        into v_rate, v_tons
        from public.trips
       where id = new.trip_id;
      v_now := public.compliance_advance_calculation(new.trip_id, (v_snapshot->>'advance_percent')::numeric);
      -- Compare the basis as the calculation resolves it (a blank trip basis is
      -- per_trip). That is the value the approval snapshot stored; the raw
      -- blank column never matched it and blocked every blank-basis advance.
      v_basis := coalesce(v_now->>'supplier_rate_basis', '');
      if v_rate is distinct from nullif(v_snapshot->>'supplier_rate', '')::numeric
         or v_basis is distinct from coalesce(v_snapshot->>'supplier_rate_basis', '')
         or v_tons is distinct from nullif(v_snapshot->>'load_tons', '')::numeric then
        raise exception 'trip terms changed after approval; reapprove the advance';
      end if;
      if coalesce(v_now->>'tds_financial_year', '') is distinct from coalesce(v_snapshot->>'tds_financial_year', '')
         or nullif(v_now->>'tds_rate_percent', '')::numeric is distinct from nullif(v_snapshot->>'tds_rate_percent', '')::numeric
         or nullif(v_now->>'tds_amount', '')::numeric is distinct from nullif(v_snapshot->>'tds_amount', '')::numeric
         or coalesce(v_now->>'documentation_enabled', '') is distinct from coalesce(v_snapshot->>'documentation_enabled', '')
         or nullif(v_now->>'documentation_charges', '')::numeric is distinct from nullif(v_snapshot->>'documentation_charges', '')::numeric
         or coalesce(v_now#>>'{documentation_slab,from}', '') is distinct from coalesce(v_snapshot#>>'{documentation_slab,from}', '')
         or coalesce(v_now#>>'{documentation_slab,to}', '') is distinct from coalesce(v_snapshot#>>'{documentation_slab,to}', '')
         or coalesce(v_now#>>'{documentation_slab,charge}', '') is distinct from coalesce(v_snapshot#>>'{documentation_slab,charge}', '')
         or nullif(v_now->>'payable', '')::numeric is distinct from v_approved then
        raise exception 'approval inputs changed; reapprove the advance';
      end if;
    else
      if v_paid > v_approved then
        raise exception 'payment amount exceeds the approved advance';
      end if;
      if v_snapshot is not null then
        v_now := public.compliance_advance_terms(new.trip_id);
        if nullif(v_now->>'supplier_rate', '')::numeric is distinct from nullif(v_snapshot->>'supplier_rate', '')::numeric
           or coalesce(v_now->>'supplier_rate_basis', '') is distinct from coalesce(v_snapshot->>'supplier_rate_basis', '')
           or nullif(v_now->>'load_tons', '')::numeric is distinct from nullif(v_snapshot->>'load_tons', '')::numeric then
          raise exception 'trip terms changed after approval; reapprove the advance';
        end if;
      end if;
    end if;
  else
    v_request := public.issue_payment_request(new.trip_id, v_type, null, new.created_by, now());
  end if;

  insert into public.payment_request_transactions (request_id, transaction_id)
  values (v_request, new.id)
  on conflict (transaction_id) do nothing;

  perform public.refresh_payment_request_status(v_request);
  return new;
end;
$function$;
