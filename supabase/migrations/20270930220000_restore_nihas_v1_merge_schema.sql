-- Restores the remaining schema dropped by 20270930130000_rollback_nihas_v1_merge_schema.sql,
-- at the user's explicit request, now that the actual root cause (an unrelated
-- 20s client-side storage-upload timeout, fixed in lib/supabase.ts) has been
-- identified and fixed independently of this merge. Schema only — no app code
-- for these features is being re-merged, so these objects are inert until
-- that code returns.
--
-- get_trip_documents_lr_pod_batch (+ its index) is intentionally NOT
-- recreated here — a concurrent session already restored it in
-- 20270930183000_restore_trip_documents_lr_pod_batch.sql.

set local lock_timeout = '5s';

-- ── 1. trip_documents document_type: memo + other ───────────────────────────
-- Fully VALID this time (not NOT VALID): the 3 real 'other' rows preserved
-- through the rollback already satisfy this list, so validation passes clean.

alter table public.trip_documents drop constraint if exists trip_documents_document_type_check;
alter table public.trip_documents add constraint trip_documents_document_type_check
  check (document_type in (
    'manifest',
    'pod',
    'soft_pod',
    'pod_soft',
    'invoice',
    'memo',
    'other',
    'eway_bill',
    'loading_slip',
    'odometer_start_photo',
    'odometer_end_photo',
    'fuel_bill_photo',
    'toll_receipt_photo',
    'trip_expense_receipt_photo',
    'maintenance_invoice_photo',
    'lr',
    'insurance',
    'rc'
  ));

-- ── 2. log_trip_hard_copy_pod_courier ────────────────────────────────────────

create or replace function public.log_trip_hard_copy_pod_courier(
  p_trip_id uuid,
  p_courier text,
  p_awb_number text,
  p_dispatch_date date default null,
  p_expected_delivery_date date default null,
  p_courier_contact text default null,
  p_remarks text default null
)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_org_id      uuid;
  v_already     timestamptz;
  v_courier     text := nullif(trim(coalesce(p_courier, '')), '');
  v_awb         text := nullif(trim(coalesce(p_awb_number, '')), '');
  v_contact     text := nullif(trim(coalesce(p_courier_contact, '')), '');
  v_remarks     text := nullif(trim(coalesce(p_remarks, '')), '');
  v_key         text;
  v_payload     jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if v_courier is null then
    raise exception 'courier name is required';
  end if;

  if v_awb is null then
    raise exception 'tracking / AWB number is required';
  end if;

  if p_dispatch_date is null then
    raise exception 'dispatch date is required';
  end if;

  select organization_id, pod_received_at
    into v_org_id, v_already
    from public.trips
   where id = p_trip_id
     for update;

  if v_org_id is null then
    raise exception 'trip not found';
  end if;

  if not public.has_member_surface(v_org_id, 'trip_compliance.pod.manage') then
    raise exception 'not authorized to record hard-copy POD for this organization';
  end if;

  if v_already is not null then
    -- Already RECEIVED — do not demote to courier-in-transit.
    return false;
  end if;

  update public.trips
     set pod_hard_copy_courier = v_courier,
         pod_hard_copy_awb_number = v_awb
         -- intentionally leave pod_received_at and pod_hard_copy_received_by alone
   where id = p_trip_id;

  v_key := p_trip_id::text || ':pod.hard_copy_courier_dispatched';
  v_payload := jsonb_build_object(
    'courier', v_courier,
    'awb_number', v_awb,
    'dispatch_date', p_dispatch_date,
    'expected_delivery_date', p_expected_delivery_date,
    'courier_contact', v_contact,
    'remarks', v_remarks,
    'receipt_method', 'courier'
  );

  begin
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
    values
      (p_trip_id, v_org_id, v_uid, 'pod.hard_copy_courier_dispatched',
       v_payload, v_key);
  exception when unique_violation then
    update public.trip_workflow_events
       set payload = v_payload,
           actor_id = v_uid,
           created_at = now()
     where idempotency_key = v_key;
  end;

  return true;
end;
$$;

comment on function public.log_trip_hard_copy_pod_courier(uuid, text, text, date, date, text, text) is
  'Log courier hard-copy POD dispatch (IN TRANSIT). Does not set pod_received_at. '
  'Mark received later via record_trip_hard_copy_pod.';

revoke all on function public.log_trip_hard_copy_pod_courier(uuid, text, text, date, date, text, text) from public;
grant execute on function public.log_trip_hard_copy_pod_courier(uuid, text, text, date, date, text, text) to authenticated;

-- ── 3. client_contract_validity ──────────────────────────────────────────────

alter table public.clients
  add column if not exists valid_from date,
  add column if not exists valid_to date;

alter table public.clients
  drop constraint if exists clients_valid_range_check;

alter table public.clients
  add constraint clients_valid_range_check
  check (valid_from is null or valid_to is null or valid_to >= valid_from);

comment on column public.clients.valid_from is
  'Customer contract validity start (date).';
comment on column public.clients.valid_to is
  'Customer contract validity end (date).';

-- ── 4. trip_compliance_decline ───────────────────────────────────────────────

alter table public.trips
  add column if not exists compliance_declined_at timestamptz,
  add column if not exists compliance_declined_by uuid references auth.users(id) on delete set null,
  add column if not exists compliance_decline_reason text;

alter table public.trips
  drop constraint if exists trips_compliance_decline_reason_length_check;
alter table public.trips
  add constraint trips_compliance_decline_reason_length_check
    check (
      compliance_decline_reason is null
      or char_length(compliance_decline_reason) between 3 and 500
    );

comment on column public.trips.compliance_declined_at is
  'When the latest compliance decline was recorded by decline_trip_compliance(). Null if never declined. Active only while compliance_verified_at is null; kept as history afterwards.';
comment on column public.trips.compliance_declined_by is
  'auth.users id of the reviewer who recorded the latest compliance decline.';
comment on column public.trips.compliance_decline_reason is
  'Trimmed reason (3–500 chars) for the latest compliance decline. Earlier reasons live in trip_workflow_events (event_type = compliance.declined).';

create or replace function public.decline_trip_compliance(
  p_trip_id uuid,
  p_reason text,
  p_idempotency_key text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid             uuid := auth.uid();
  v_org_id          uuid;
  v_verified_at     timestamptz;
  v_previous_reason text;
  v_reason          text := regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g');
  v_key             text := nullif(trim(p_idempotency_key), '');
  v_payload         jsonb;
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;

  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.trip.mark_verified') then
    raise exception 'not authorized to decline compliance for this trip';
  end if;

  select compliance_verified_at, compliance_decline_reason
    into v_verified_at, v_previous_reason
    from public.trips
   where id = p_trip_id
     and organization_id = v_org_id
     for update;

  if not found then
    raise exception 'not authorized to decline compliance for this trip';
  end if;

  if v_verified_at is not null then
    raise exception 'trip compliance already verified; cannot decline';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'a decline reason between 3 and 500 characters is required';
  end if;

  v_payload := jsonb_build_object(
    'reason', v_reason,
    'previous_reason', v_previous_reason
  );

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'compliance.declined', v_payload,
         p_trip_id::text || ':compliance.declined:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'compliance.declined', v_payload);
  end if;

  update public.trips
     set compliance_declined_at = now(),
         compliance_declined_by = v_uid,
         compliance_decline_reason = v_reason
   where id = p_trip_id;
end;
$$;

grant execute on function public.decline_trip_compliance(uuid, text, text) to authenticated;
revoke all on function public.decline_trip_compliance(uuid, text, text) from public;
revoke all on function public.decline_trip_compliance(uuid, text, text) from anon;

create or replace function public.guard_trip_compliance_decline_columns()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.compliance_declined_at    is distinct from old.compliance_declined_at
       or new.compliance_declined_by    is distinct from old.compliance_declined_by
       or new.compliance_decline_reason is distinct from old.compliance_decline_reason) then
    raise exception 'compliance decline fields can only be changed via decline_trip_compliance()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_trip_compliance_decline_columns() from public;
revoke all on function public.guard_trip_compliance_decline_columns() from anon;
revoke all on function public.guard_trip_compliance_decline_columns() from authenticated;

drop trigger if exists trg_guard_trip_compliance_decline_columns on public.trips;
create trigger trg_guard_trip_compliance_decline_columns
  before update of compliance_declined_at, compliance_declined_by, compliance_decline_reason
  on public.trips
  for each row execute function public.guard_trip_compliance_decline_columns();

-- ── 5. vendor_onboarding_pack ────────────────────────────────────────────────

alter table public.supplier_kyc_documents
  add column if not exists doc_number text;

alter table public.suppliers
  add column if not exists vendor_status text not null default 'active',
  add column if not exists blacklist_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references auth.users(id) on delete set null,
  add column if not exists advance_percentage numeric(5,2),
  add column if not exists aadhaar_number text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_vendor_status_check') then
    alter table public.suppliers
      add constraint suppliers_vendor_status_check
      check (vendor_status in ('active', 'inactive', 'blacklisted'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'suppliers_advance_percentage_check') then
    alter table public.suppliers
      add constraint suppliers_advance_percentage_check
      check (advance_percentage is null or (advance_percentage >= 0 and advance_percentage <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'suppliers_blacklist_reason_check') then
    alter table public.suppliers
      add constraint suppliers_blacklist_reason_check
      check (vendor_status <> 'blacklisted' or length(trim(coalesce(blacklist_reason, ''))) > 0);
  end if;
end $$;

comment on column public.suppliers.vendor_status is
  'Vendor lifecycle: active | inactive | blacklisted. Blacklisted vendors cannot be assigned to new trips.';
comment on column public.suppliers.advance_percentage is
  'Default advance % of the partner rate paid to this vendor (0–100). Informational; no ledger effect.';

create table if not exists public.supplier_tds_rates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id     uuid not null references public.suppliers(id) on delete cascade,
  financial_year  text not null check (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  rate_percent    numeric(5,2) not null check (rate_percent >= 0 and rate_percent <= 100),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create unique index if not exists uq_supplier_tds_rates_supplier_fy
  on public.supplier_tds_rates (supplier_id, financial_year)
  where deleted_at is null;
create index if not exists idx_supplier_tds_rates_org
  on public.supplier_tds_rates (organization_id);

alter table public.supplier_tds_rates enable row level security;

drop policy if exists "Org members manage supplier tds rates" on public.supplier_tds_rates;
create policy "Org members manage supplier tds rates"
  on public.supplier_tds_rates for all
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select, insert, update, delete on public.supplier_tds_rates to authenticated;
grant all on public.supplier_tds_rates to service_role;

drop trigger if exists trg_supplier_tds_rates_updated_at on public.supplier_tds_rates;
create trigger trg_supplier_tds_rates_updated_at
  before update on public.supplier_tds_rates
  for each row execute function public.set_updated_at();

create or replace function public.tg_trips_block_blacklisted_supplier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.supplier_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.supplier_id is not distinct from old.supplier_id then
    return new;
  end if;
  if exists (
    select 1 from public.suppliers s
    where s.id = new.supplier_id and s.vendor_status = 'blacklisted'
  ) then
    raise exception 'vendor_blacklisted: this vendor is blacklisted and cannot be assigned to a trip'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_trips_block_blacklisted_supplier() from public;

drop trigger if exists trg_trips_block_blacklisted_supplier on public.trips;
create trigger trg_trips_block_blacklisted_supplier
  before insert or update of supplier_id on public.trips
  for each row execute function public.tg_trips_block_blacklisted_supplier();

-- ── 6. vendor_contact_and_gumasta ────────────────────────────────────────────

alter table public.suppliers
  add column if not exists secondary_phone text,
  add column if not exists gumasta_number text;

comment on column public.suppliers.secondary_phone is
  'Secondary / alternate mobile (+91XXXXXXXXXX). Primary stays in suppliers.phone.';
comment on column public.suppliers.gumasta_number is
  'Gumasta (Shop & Establishment licence) registration number — mainly Mumbai / Maharashtra vendors.';
