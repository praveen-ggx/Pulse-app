-- Advance approval must use the trip row locked in this transaction, not a
-- client-computed amount. The issued request stores that freight snapshot.
-- A later compliance_advance cannot exceed the approved amount, and cannot
-- post after supplier_rate, supplier_rate_basis, or load_tons change.
--
-- Not applied. Additive column. issue_payment_request and the link trigger
-- keep their names. Balance requests are unchanged. Existing rows keep a
-- null snapshot; paying one still requires an approved amount.

SET LOCAL lock_timeout = '5s';

alter table public.payment_requests
  add column if not exists terms_snapshot jsonb;

comment on column public.payment_requests.terms_snapshot is
  'Freight terms locked at advance approval: supplier_rate, supplier_rate_basis, load_tons, base_freight. Null on requests issued before this column.';

create or replace function public.tg_payment_requests_immutable()
  returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  if new.request_no is distinct from old.request_no
     or new.trip_id is distinct from old.trip_id
     or new.organization_id is distinct from old.organization_id
     or new.payment_type is distinct from old.payment_type
     or new.approved_amount is distinct from old.approved_amount
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.terms_snapshot is distinct from old.terms_snapshot then
    raise exception 'payment request % is immutable once issued', old.request_no;
  end if;
  if old.status = 'cancelled' then
    raise exception 'payment request % is cancelled', old.request_no;
  end if;
  return new;
end;
$$;

-- Current freight for one trip. per_mt uses rate * load_tons. Anything else
-- uses the rate as the trip total. Missing rate or missing tons returns null.
create or replace function public.compliance_advance_terms(p_trip_id uuid)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $$
declare
  v_rate numeric;
  v_basis text;
  v_tons numeric;
  v_base numeric;
begin
  select supplier_rate, supplier_rate_basis, load_tons
    into v_rate, v_basis, v_tons
    from public.trips
   where id = p_trip_id;

  if v_rate is not null and v_rate > 0 and lower(btrim(coalesce(v_basis, ''))) = 'per_mt' then
    if v_tons is not null and v_tons > 0 then
      v_base := round(v_rate * v_tons, 2);
    end if;
  elsif v_rate is not null and v_rate > 0 then
    v_base := round(v_rate, 2);
  end if;

  return jsonb_build_object(
    'supplier_rate', v_rate,
    'supplier_rate_basis', v_basis,
    'load_tons', v_tons,
    'base_freight', v_base
  );
end;
$$;

revoke all on function public.compliance_advance_terms(uuid) from public, anon, authenticated;

create or replace function public.issue_payment_request(
  p_trip_id uuid,
  p_payment_type text,
  p_approved_amount numeric,
  p_approved_by uuid,
  p_approved_at timestamptz default now()
)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_org_id uuid;
  v_id uuid;
  v_terms jsonb;
  v_base numeric;
  v_amount numeric;
begin
  select organization_id into v_org_id
    from public.trips
   where id = p_trip_id
     for update;
  if v_org_id is null then
    raise exception 'trip not found: %', p_trip_id;
  end if;

  select id into v_id
    from public.payment_requests
   where trip_id = p_trip_id and payment_type = p_payment_type and status <> 'cancelled';
  if v_id is not null then
    return v_id;
  end if;

  v_amount := case when p_approved_amount is null then null else round(p_approved_amount, 2) end;
  v_terms := null;

  if p_payment_type = 'advance' then
    v_terms := public.compliance_advance_terms(p_trip_id);
    v_base := nullif(v_terms->>'base_freight', '')::numeric;
    if v_base is null or v_base <= 0 then
      raise exception 'trip freight is not set; the advance cannot be approved';
    end if;
    if v_amount is null then
      raise exception 'approved amount is required';
    end if;
    if v_amount < 0 then
      raise exception 'approved amount cannot be negative';
    end if;
    if v_amount > v_base then
      raise exception 'approved amount exceeds current trip freight';
    end if;
  end if;

  begin
    insert into public.payment_requests
      (organization_id, trip_id, payment_type, request_no, approved_amount, approved_by, approved_at, terms_snapshot)
    values
      (v_org_id, p_trip_id, p_payment_type, public.generate_payment_request_no(v_org_id),
       v_amount, p_approved_by, coalesce(p_approved_at, now()), v_terms)
    returning id into v_id;
    return v_id;
  exception when unique_violation then
    select id into v_id
      from public.payment_requests
     where trip_id = p_trip_id and payment_type = p_payment_type and status <> 'cancelled';
    if v_id is null then
      raise;
    end if;
    return v_id;
  end;
end;
$$;

revoke all on function public.issue_payment_request(uuid, text, numeric, uuid, timestamptz) from public, anon, authenticated;

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
