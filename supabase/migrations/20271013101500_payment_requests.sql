-- Payment requests: an immutable, human-readable reference for each Compliance
-- advance (SAT812-PAY-000123), issued when Finance approves the advance and
-- linked to the Finance ledger rows that pay it. `transactions` stays the only
-- record of money moved; this table only names and tracks the request.
--
-- Sort key is after 20271012140000 (supplier-payable direction) and the
-- Compliance stack it reads (finance_verified_at, compliance_* categories).
--
-- Slice 1 = advance requests. Balance requests (issued at settlement approval),
-- audited reversal and account-number masking are separate migrations.

-- 1. Sequence entity + generator --------------------------------------------

alter table public.operational_sequences
  drop constraint if exists operational_sequences_entity_type_check_v2;
alter table public.operational_sequences
  add constraint operational_sequences_entity_type_check_v3
  check (entity_type = any (array[
    'trip', 'indent', 'vehicle', 'driver', 'invoice', 'pod', 'maintenance', 'driver_tenure', 'payment'
  ]));

-- Fixed six-digit number, unlike generate_operational_code (3 digits below 1000),
-- whose format for trips / indents / vehicles / drivers is left unchanged.
-- allocate_operational_sequence row-locks the counter inside the caller's
-- transaction: concurrent approvals serialize, a rolled-back approval frees its number.
create or replace function public.generate_payment_request_no(p_org_id uuid)
  returns text
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_org_code text;
  v_seq bigint;
begin
  v_org_code := public.ensure_organization_operational_code(p_org_id);
  v_seq := public.allocate_operational_sequence(p_org_id, 'payment');
  return upper(v_org_code) || '-PAY-' || lpad(v_seq::text, greatest(6, length(v_seq::text)), '0');
end;
$$;

revoke all on function public.generate_payment_request_no(uuid) from public, anon, authenticated;

-- 2. Tables -----------------------------------------------------------------

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  payment_type text not null check (payment_type in ('advance', 'balance')),
  request_no text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'partially_paid', 'paid', 'cancelled')),
  -- Snapshot of what Finance approved; the paid amount lives on the linked transactions.
  approved_amount numeric(12, 2) check (approved_amount is null or approved_amount >= 0),
  currency text not null default 'INR',
  approved_at timestamptz not null default now(),
  approved_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  created_at timestamptz not null default now(),
  constraint payment_requests_cancel_fields check (
    (status = 'cancelled') = (cancelled_at is not null)
  )
);

-- One live request per trip and payment type; cancelled ones stay as history.
create unique index ux_payment_requests_live_trip_type
  on public.payment_requests (trip_id, payment_type)
  where status <> 'cancelled';
create index ix_payment_requests_org on public.payment_requests (organization_id, created_at desc);

-- Several Finance rows may settle one request; a ledger row pays at most one request.
create table public.payment_request_transactions (
  request_id uuid not null references public.payment_requests(id) on delete cascade,
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (request_id, transaction_id)
);

alter table public.payment_requests enable row level security;
alter table public.payment_request_transactions enable row level security;

-- Read-only to org staff; every write goes through the SECURITY DEFINER functions below.
create policy payment_requests_select_org_staff on public.payment_requests
  for select using (public.is_org_staff(organization_id));
create policy payment_request_transactions_select_org_staff on public.payment_request_transactions
  for select using (
    exists (
      select 1 from public.payment_requests r
      where r.id = payment_request_transactions.request_id
        and public.is_org_staff(r.organization_id)
    )
  );

revoke insert, update, delete, truncate on public.payment_requests from anon, authenticated;
revoke insert, update, delete, truncate on public.payment_request_transactions from anon, authenticated;
grant select on public.payment_requests to authenticated;
grant select on public.payment_request_transactions to authenticated;

-- Request number and approval snapshot never change once issued.
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
     or new.approved_by is distinct from old.approved_by then
    raise exception 'payment request % is immutable once issued', old.request_no;
  end if;
  if old.status = 'cancelled' then
    raise exception 'payment request % is cancelled', old.request_no;
  end if;
  return new;
end;
$$;

create trigger trg_payment_requests_immutable
  before update on public.payment_requests
  for each row execute function public.tg_payment_requests_immutable();

-- 3. Status from linked payments -------------------------------------------

create or replace function public.refresh_payment_request_status(p_request_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_req public.payment_requests%rowtype;
  v_links int;
  v_status text;
begin
  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found or v_req.status = 'cancelled' then
    return;
  end if;

  select count(*) into v_links
    from public.payment_request_transactions
   where request_id = p_request_id;

  -- A Compliance advance / balance is one ledger row per trip (unique index), so a
  -- linked row settles the request even when Finance edited the % at posting: the
  -- approved snapshot and the paid amount are kept separately and may differ.
  -- 'partially_paid' is reserved for multi-receipt settlement (balance slice).
  v_status := case when v_links = 0 then 'pending' else 'paid' end;

  if v_status is distinct from v_req.status then
    update public.payment_requests set status = v_status where id = p_request_id;
  end if;
end;
$$;

revoke all on function public.refresh_payment_request_status(uuid) from public, anon, authenticated;

-- Issue a request (or return the live one) for a trip. Internal helper.
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
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;
  if v_org_id is null then
    raise exception 'trip not found: %', p_trip_id;
  end if;

  select id into v_id
    from public.payment_requests
   where trip_id = p_trip_id and payment_type = p_payment_type and status <> 'cancelled';
  if v_id is not null then
    return v_id;
  end if;

  insert into public.payment_requests
    (organization_id, trip_id, payment_type, request_no, approved_amount, approved_by, approved_at)
  values
    (v_org_id, p_trip_id, p_payment_type, public.generate_payment_request_no(v_org_id),
     case when p_approved_amount is null then null else round(p_approved_amount, 2) end,
     p_approved_by, coalesce(p_approved_at, now()))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.issue_payment_request(uuid, text, numeric, uuid, timestamptz) from public, anon, authenticated;

-- 4. Link Compliance payments as they post ----------------------------------

create or replace function public.tg_transactions_link_payment_request()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_type text;
  v_request uuid;
begin
  if tg_op = 'DELETE' then
    if old.ledger_category in ('compliance_advance', 'compliance_balance') then
      -- Link row is removed by ON DELETE CASCADE; recompute the request it paid.
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

  -- Advances are approved before payment, so a live request normally exists.
  -- Without one (paid outside the approval step), issue it now so the payment
  -- still carries a reference.
  v_request := public.issue_payment_request(new.trip_id, v_type, null, new.created_by, now());

  insert into public.payment_request_transactions (request_id, transaction_id)
  values (v_request, new.id)
  on conflict (transaction_id) do nothing;

  perform public.refresh_payment_request_status(v_request);
  return new;
end;
$$;

create trigger trg_transactions_link_payment_request
  after insert or delete on public.transactions
  for each row execute function public.tg_transactions_link_payment_request();

-- 5. Approval issues the advance request; undo cancels it (never deletes) --------

drop function if exists public.mark_trip_finance_verified(uuid, text);

create or replace function public.mark_trip_finance_verified(
  p_trip_id uuid,
  p_idempotency_key text default null::text,
  p_approved_amount numeric default null::numeric
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid         uuid := auth.uid();
  v_org_id      uuid;
  v_verified_at timestamptz;
  v_finance_at  timestamptz;
  v_flagged_at  timestamptz;
  v_key         text := nullif(trim(p_idempotency_key), '');
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;

  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.finance.manage') then
    raise exception 'not authorized to finance-verify this trip';
  end if;

  if p_approved_amount is not null and p_approved_amount < 0 then
    raise exception 'approved amount cannot be negative';
  end if;

  select compliance_verified_at, finance_verified_at, finance_flagged_at
    into v_verified_at, v_finance_at, v_flagged_at
    from public.trips
   where id = p_trip_id
     and organization_id = v_org_id
     for update;

  if not found then
    raise exception 'not authorized to finance-verify this trip';
  end if;

  if v_verified_at is null then
    raise exception 'compliance must be verified before finance verify';
  end if;

  if v_flagged_at is not null then
    raise exception 'this trip is flagged for compliance review; the advance cannot be approved until the flag is cleared';
  end if;

  -- Already verified: nothing to do (safe under retry / double click).
  if v_finance_at is not null then
    return;
  end if;

  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category = 'compliance_advance'
  ) then
    raise exception 'an advance is already posted for this trip';
  end if;

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'finance.verified',
         jsonb_build_object('compliance_verified_at', v_verified_at, 'approved_amount', p_approved_amount),
         p_trip_id::text || ':finance.verified:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'finance.verified',
       jsonb_build_object('compliance_verified_at', v_verified_at, 'approved_amount', p_approved_amount));
  end if;

  update public.trips
     set finance_verified_at = now(),
         finance_verified_by = v_uid
   where id = p_trip_id;

  perform public.issue_payment_request(p_trip_id, 'advance', p_approved_amount, v_uid, now());
end;
$function$;

revoke all on function public.mark_trip_finance_verified(uuid, text, numeric) from public, anon;
grant execute on function public.mark_trip_finance_verified(uuid, text, numeric) to authenticated;

create or replace function public.unmark_trip_finance_verified(p_trip_id uuid, p_idempotency_key text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid        uuid := auth.uid();
  v_org_id     uuid;
  v_finance_at timestamptz;
  v_finance_by uuid;
  v_key        text := nullif(trim(p_idempotency_key), '');
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;

  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.finance.manage') then
    raise exception 'not authorized to undo finance verify for this trip';
  end if;

  select finance_verified_at, finance_verified_by
    into v_finance_at, v_finance_by
    from public.trips
   where id = p_trip_id
     and organization_id = v_org_id
     for update;

  if not found then
    raise exception 'not authorized to undo finance verify for this trip';
  end if;

  -- Not verified: nothing to undo (safe under retry / double click).
  if v_finance_at is null then
    return;
  end if;

  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category = 'compliance_advance'
  ) then
    raise exception 'an advance is already posted; finance verify cannot be undone';
  end if;

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'finance.verify_undone',
         jsonb_build_object('finance_verified_at', v_finance_at, 'finance_verified_by', v_finance_by),
         p_trip_id::text || ':finance.verify_undone:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'finance.verify_undone',
       jsonb_build_object('finance_verified_at', v_finance_at, 'finance_verified_by', v_finance_by));
  end if;

  update public.trips
     set finance_verified_at = null,
         finance_verified_by = null
   where id = p_trip_id;

  -- The issued number stays on record as cancelled; a later approval gets a new one.
  update public.payment_requests
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_uid,
         cancel_reason = 'Advance approval undone'
   where trip_id = p_trip_id
     and payment_type = 'advance'
     and status = 'pending';
end;
$function$;

-- 6. Backfill (oldest first so numbers follow approval / payment order) -------

do $$
declare
  r record;
  v_request uuid;
begin
  -- Paid advances / balances: one request per trip and type, linked to its rows.
  for r in
    select t.trip_id, t.ledger_category, min(t.created_at) as first_at,
           (array_agg(t.created_by order by t.created_at))[1] as by_user,
           tr.finance_verified_at, tr.finance_verified_by
      from public.transactions t
      join public.trips tr on tr.id = t.trip_id
     where t.ledger_category in ('compliance_advance', 'compliance_balance')
     group by t.trip_id, t.ledger_category, tr.finance_verified_at, tr.finance_verified_by
     order by min(t.created_at)
  loop
    v_request := public.issue_payment_request(
      r.trip_id,
      case r.ledger_category when 'compliance_advance' then 'advance' else 'balance' end,
      null,
      coalesce(r.finance_verified_by, r.by_user),
      coalesce(r.finance_verified_at, r.first_at)
    );
    insert into public.payment_request_transactions (request_id, transaction_id)
    select v_request, t.id
      from public.transactions t
     where t.trip_id = r.trip_id and t.ledger_category = r.ledger_category
    on conflict (transaction_id) do nothing;
    perform public.refresh_payment_request_status(v_request);
  end loop;

  -- Approved but not yet paid: pending advance requests.
  for r in
    select tr.id as trip_id, tr.finance_verified_at, tr.finance_verified_by
      from public.trips tr
     where tr.finance_verified_at is not null
       and tr.deleted_at is null
       and not exists (
         select 1 from public.transactions t
          where t.trip_id = tr.id and t.ledger_category = 'compliance_advance'
       )
     order by tr.finance_verified_at
  loop
    perform public.issue_payment_request(r.trip_id, 'advance', null, r.finance_verified_by, r.finance_verified_at);
  end loop;
end;
$$;
