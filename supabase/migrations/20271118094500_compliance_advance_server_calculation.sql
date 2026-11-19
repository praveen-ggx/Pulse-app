-- Server-authoritative compliance advance. The client sends an advance
-- percent. This function reads the locked trip, the Indian financial-year
-- TDS rate, and the organisation documentation slabs, then stores the
-- payable. It does not edit 20271117194500.
--
-- Null terms_snapshot rows stay on the legacy payment rule. A snapshot
-- from that earlier guard, which has no formula_version, stays on that
-- guard's rule. Formula version 1 requires the payment to equal the
-- approved payable and rejects changed freight or calculation inputs.
-- Balance requests are unchanged. No historical row is rewritten.

SET LOCAL lock_timeout = '5s';

create or replace function public.compliance_indian_financial_year(p_at timestamptz)
  returns text
  language sql
  stable
  set search_path to 'public'
as $$
  select case
    when extract(month from timezone('Asia/Kolkata', p_at)) >= 4
      then extract(year from timezone('Asia/Kolkata', p_at))::int
    else extract(year from timezone('Asia/Kolkata', p_at))::int - 1
  end::text
  || '-'
  || lpad((
    (case
      when extract(month from timezone('Asia/Kolkata', p_at)) >= 4
        then extract(year from timezone('Asia/Kolkata', p_at))::int
      else extract(year from timezone('Asia/Kolkata', p_at))::int - 1
    end + 1) % 100
  )::text, 2, '0');
$$;

revoke all on function public.compliance_indian_financial_year(timestamptz) from public, anon, authenticated;

create or replace function public.compliance_advance_calculation(
  p_trip_id uuid,
  p_advance_percent numeric
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $$
declare
  v_org uuid;
  v_supplier uuid;
  v_rate numeric;
  v_basis text;
  v_tons numeric;
  v_base numeric;
  v_percent numeric;
  v_fy text;
  v_tds_fy text;
  v_tds_rate numeric;
  v_tds numeric;
  v_enabled boolean;
  v_from numeric;
  v_to numeric;
  v_charge numeric;
  v_doc numeric := 0;
  v_slab jsonb;
  v_raw numeric;
  v_payable numeric;
begin
  if p_advance_percent is null or p_advance_percent < 0 or p_advance_percent > 100 then
    raise exception 'advance percent must be between 0 and 100';
  end if;
  v_percent := p_advance_percent;

  select organization_id, supplier_id, supplier_rate, supplier_rate_basis, load_tons
    into v_org, v_supplier, v_rate, v_basis, v_tons
    from public.trips
   where id = p_trip_id;
  if v_org is null then
    raise exception 'trip not found: %', p_trip_id;
  end if;

  v_basis := lower(btrim(coalesce(v_basis, '')));
  if v_basis = 'per_mt' then
    if v_rate is not null and v_rate > 0 and v_tons is not null and v_tons > 0 then
      v_base := v_rate * v_tons;
    end if;
  elsif v_basis = 'per_trip' then
    if v_rate is not null and v_rate > 0 then
      v_base := v_rate;
    end if;
  else
    raise exception 'supplier rate basis is not valid';
  end if;
  if v_base is null or v_base <= 0 then
    raise exception 'trip freight is not set; the advance cannot be approved';
  end if;

  v_fy := public.compliance_indian_financial_year(now());
  if v_supplier is not null then
    select financial_year, rate_percent
      into v_tds_fy, v_tds_rate
      from public.supplier_tds_rates
     where organization_id = v_org
       and supplier_id = v_supplier
       and deleted_at is null
       and financial_year = v_fy
     limit 1;
    if v_tds_rate is null then
      select financial_year, rate_percent
        into v_tds_fy, v_tds_rate
        from public.supplier_tds_rates
       where organization_id = v_org
         and supplier_id = v_supplier
         and deleted_at is null
         and financial_year < v_fy
       order by financial_year desc
       limit 1;
    end if;
  end if;
  if v_tds_rate is not null and v_tds_rate > 0 then
    v_tds := round(v_base * (least(100, greatest(0, v_tds_rate)) / 100), 2);
  else
    v_tds := 0;
  end if;

  select enabled into v_enabled
    from public.org_document_charge_settings
   where organization_id = v_org;
  if coalesce(v_enabled, false) then
    select min_freight, max_freight, charge
      into v_from, v_to, v_charge
      from public.org_document_charge_slabs
     where organization_id = v_org
       and v_base >= min_freight
       and (max_freight is null or v_base <= max_freight)
     order by sort_order
     limit 1;
    if v_charge is not null then
      v_doc := greatest(0, v_charge);
      v_slab := jsonb_build_object('from', v_from, 'to', v_to, 'charge', v_doc);
    end if;
  else
    v_enabled := false;
  end if;

  v_raw := v_base * (v_percent / 100) - v_doc - v_tds;
  if v_raw is null or v_raw <= 0 then
    raise exception 'calculated advance is not positive';
  end if;
  v_payable := round(v_raw, 2);
  if v_payable <= 0 then
    raise exception 'calculated advance is not positive';
  end if;

  return jsonb_build_object(
    'formula_version', 1,
    'supplier_rate', v_rate,
    'supplier_rate_basis', v_basis,
    'load_tons', v_tons,
    'base_freight', v_base,
    'advance_percent', v_percent,
    'tds_financial_year', v_tds_fy,
    'tds_rate_percent', v_tds_rate,
    'tds_amount', v_tds,
    'documentation_enabled', v_enabled,
    'documentation_charges', v_doc,
    'documentation_slab', v_slab,
    'payable', v_payable
  );
end;
$$;

revoke all on function public.compliance_advance_calculation(uuid, numeric) from public, anon, authenticated;

create or replace function public.mark_trip_finance_verified(
  p_trip_id uuid,
  p_idempotency_key text default null::text,
  p_approved_amount numeric default null::numeric
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  raise exception 'advance approval requires an explicit advance percent';
end;
$$;

create or replace function public.mark_trip_finance_verified(
  p_trip_id uuid,
  p_idempotency_key text,
  p_advance_percent numeric,
  p_formula_version integer
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_verified_at timestamptz;
  v_finance_at timestamptz;
  v_flagged_at timestamptz;
  v_declined_at timestamptz;
  v_resubmitted_at timestamptz;
  v_key text := nullif(trim(p_idempotency_key), '');
  v_quote jsonb;
  v_request uuid;
  v_existing jsonb;
  v_amount numeric;
begin
  if p_formula_version is distinct from 1 then
    raise exception 'unsupported advance formula version';
  end if;

  select organization_id into v_org_id from public.trips where id = p_trip_id;
  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.finance.manage') then
    raise exception 'not authorized to finance-verify this trip';
  end if;

  select compliance_verified_at, compliance_declined_at, compliance_resubmitted_at,
         finance_verified_at, finance_flagged_at
    into v_verified_at, v_declined_at, v_resubmitted_at, v_finance_at, v_flagged_at
    from public.trips
   where id = p_trip_id
     and organization_id = v_org_id
   for update;
  if not found then
    raise exception 'not authorized to finance-verify this trip';
  end if;

  select id, terms_snapshot, approved_amount
    into v_request, v_existing, v_amount
    from public.payment_requests
   where trip_id = p_trip_id
     and payment_type = 'advance'
     and status <> 'cancelled'
   for update;
  if v_request is not null then
    return coalesce(v_existing, '{}'::jsonb) || jsonb_build_object(
      'payment_request_id', v_request,
      'approved_amount', v_amount,
      'idempotent_replay', true
    );
  end if;

  if v_verified_at is null then
    raise exception 'compliance must be verified before finance verify';
  end if;
  if not public.compliance_cleared(v_verified_at, v_declined_at, v_resubmitted_at) then
    raise exception 'this trip was rejected; Ground Ops must resubmit it before the advance can be approved';
  end if;
  if v_flagged_at is not null then
    raise exception 'this trip is flagged for compliance review; the advance cannot be approved until the flag is cleared';
  end if;
  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category = 'compliance_advance'
  ) then
    raise exception 'an advance is already posted for this trip';
  end if;

  v_quote := public.compliance_advance_calculation(p_trip_id, p_advance_percent);
  v_amount := (v_quote->>'payable')::numeric;

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'finance.verified',
         jsonb_build_object('compliance_verified_at', v_verified_at, 'advance_calculation', v_quote),
         p_trip_id::text || ':finance.verified:' || v_key);
    exception when unique_violation then
      null;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'finance.verified',
       jsonb_build_object('compliance_verified_at', v_verified_at, 'advance_calculation', v_quote));
  end if;

  if v_finance_at is null then
    update public.trips
       set finance_verified_at = now(),
           finance_verified_by = v_uid
     where id = p_trip_id;
  end if;

  begin
    insert into public.payment_requests
      (organization_id, trip_id, payment_type, request_no, approved_amount, approved_by, approved_at, terms_snapshot)
    values
      (v_org_id, p_trip_id, 'advance', public.generate_payment_request_no(v_org_id),
       v_amount, v_uid, now(), v_quote)
    returning id into v_request;
  exception when unique_violation then
    select id, terms_snapshot, approved_amount
      into v_request, v_existing, v_amount
      from public.payment_requests
     where trip_id = p_trip_id
       and payment_type = 'advance'
       and status <> 'cancelled';
    if v_request is null then
      raise;
    end if;
    return coalesce(v_existing, '{}'::jsonb) || jsonb_build_object(
      'payment_request_id', v_request,
      'approved_amount', v_amount,
      'idempotent_replay', true
    );
  end;

  return v_quote || jsonb_build_object(
    'payment_request_id', v_request,
    'approved_amount', v_amount,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.mark_trip_finance_verified(uuid, text, numeric, integer) from public, anon;
grant execute on function public.mark_trip_finance_verified(uuid, text, numeric, integer) to authenticated;

create or replace function public.tg_transactions_link_payment_request()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
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
      select supplier_rate, lower(btrim(coalesce(supplier_rate_basis, ''))), load_tons
        into v_rate, v_basis, v_tons
        from public.trips
       where id = new.trip_id;
      if v_rate is distinct from nullif(v_snapshot->>'supplier_rate', '')::numeric
         or v_basis is distinct from coalesce(v_snapshot->>'supplier_rate_basis', '')
         or v_tons is distinct from nullif(v_snapshot->>'load_tons', '')::numeric then
        raise exception 'trip terms changed after approval; reapprove the advance';
      end if;
      v_now := public.compliance_advance_calculation(new.trip_id, (v_snapshot->>'advance_percent')::numeric);
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
$$;
