-- Compliance flow hardening. Sorts after 20271008116000 (repo and preprod head).
--
-- 1. Resubmit checks every required file the app checks: trip LR / E-way bill /
--    Invoice (stored object present, not rejected), vehicle RC / Insurance / FC
--    (entity documents or the vehicle vault, not expired) and the driver
--    licence (entity documents or driver KYC).
-- 2. Finance flag: Finance (trip_compliance.finance.manage) can flag a trip for
--    Compliance review with a note. While flagged, Approve Advance and a new
--    compliance_advance are refused. Compliance clears the flag or Rejects
--    (Reject clears it). Finance still cannot Reject.
-- 3. transactions.paid_from_account_id: the org bank account an advance was
--    paid from; must be one of the org's own accounts.
-- 4. Required trip documents (LR / E-way bill / Invoice) cannot be deleted from
--    a compliance-verified trip unless it is back with Ground Ops; approved
--    files cannot be deleted at all.
--
-- No data changes. Posted ledger rows are never modified.

-- ── 1. Required files ───────────────────────────────────────────────────────

create or replace function public.compliance_missing_required_files(p_trip_id uuid)
  returns text[]
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_trip     record;
  v_vehicle  uuid;
  v_missing  text[] := array[]::text[];
  v_type     text;
begin
  select id, organization_id, vehicle_id, vehicle_display_number, driver_id
    into v_trip
    from public.trips where id = p_trip_id;
  if not found then
    return array['trip'];
  end if;

  -- Trip documents (mirror of classifyTripDocument + "not rejected").
  foreach v_type in array array['lr', 'eway_bill', 'invoice'] loop
    if not exists (
      select 1
        from public.trip_documents td,
             lateral (select split_part(btrim(coalesce(td.storage_path, '')), '?', 1) as path) p,
             lateral (select regexp_replace(p.path, '^.*/', '') as base) b
       where td.trip_id = p_trip_id
         and td.document_type = v_type
         and coalesce(td.status, 'pending') <> 'rejected'
         and (
           td.source_entity_document_id is not null
           or p.path like 'ref:vehicle-document:%'
           or p.path ~* '^https?://'
           or ((b.base = 'fields.json' or b.base like '%-fields.json')
               and nullif(btrim(td.document_number), '') is not null)
           or (b.base <> 'fields.json' and b.base not like '%-fields.json'
               and p.path <> '' and right(p.path, 1) <> '/'
               and exists (select 1 from storage.objects o
                            where o.bucket_id = 'trip-documents' and o.name = p.path))
         )
    ) then
      v_missing := array_append(v_missing, v_type);
    end if;
  end loop;

  -- Vehicle: the trip's vehicle, or the org vehicle with the same number.
  v_vehicle := v_trip.vehicle_id;
  if v_vehicle is null and nullif(btrim(v_trip.vehicle_display_number), '') is not null then
    select v.id into v_vehicle
      from public.vehicles v
     where v.organization_id = v_trip.organization_id
       and upper(regexp_replace(coalesce(v.vehicle_number, ''), '[^A-Za-z0-9]', '', 'g'))
         = upper(regexp_replace(v_trip.vehicle_display_number, '[^A-Za-z0-9]', '', 'g'))
     limit 1;
  end if;

  foreach v_type in array array['rc', 'insurance', 'fitness'] loop
    if v_vehicle is null or not (
      exists (
        select 1 from public.entity_documents ed
         where ed.entity_type = 'vehicle'
           and ed.entity_id = v_vehicle
           and ed.doc_type = v_type
           and nullif(btrim(ed.storage_path), '') is not null
           and (ed.expiry_date is null or ed.expiry_date >= current_date)
      )
      or exists (
        select 1 from public.vehicles v
         where v.id = v_vehicle
           and nullif(btrim(v.documents -> v_type ->> 'url'), '') is not null
           and (
             coalesce(v.documents -> v_type ->> 'expiryDate', '') !~ '^\d{4}-\d{2}-\d{2}'
             or left(v.documents -> v_type ->> 'expiryDate', 10)::date >= current_date
           )
      )
    ) then
      v_missing := array_append(v_missing, 'vehicle ' || v_type);
    end if;
  end loop;

  -- Driver licence: entity documents or driver KYC.
  if v_trip.driver_id is null or not (
    exists (
      select 1 from public.entity_documents ed
       where ed.entity_type = 'driver'
         and ed.entity_id = v_trip.driver_id
         and ed.doc_type = 'license'
         and nullif(btrim(ed.storage_path), '') is not null
    )
    or exists (
      select 1 from public.driver_kyc_documents k
       where k.deleted_at is null
         and k.doc_type = 'license'
         and nullif(btrim(k.storage_path), '') is not null
         and k.driver_user_id in (
           select d.user_id from public.drivers d where d.id = v_trip.driver_id and d.user_id is not null
           union all
           select v_trip.driver_id
         )
    )
  ) then
    v_missing := array_append(v_missing, 'driver licence');
  end if;

  return v_missing;
end;
$$;

revoke all on function public.compliance_missing_required_files(uuid) from public;
revoke all on function public.compliance_missing_required_files(uuid) from anon;
revoke all on function public.compliance_missing_required_files(uuid) from authenticated;

create or replace function public.resubmit_trip_compliance(
  p_trip_id uuid,
  p_note text,
  p_idempotency_key text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_org_id       uuid;
  v_verified_at  timestamptz;
  v_declined_at  timestamptz;
  v_resubmitted  timestamptz;
  v_return_to    text;
  v_reason       text;
  v_key          text := nullif(trim(p_idempotency_key), '');
  v_note         text := regexp_replace(coalesce(p_note, ''), '^\s+|\s+$', '', 'g');
  v_missing      text;
begin
  if char_length(v_note) < 3 or char_length(v_note) > 500 then
    raise exception 'a resubmit note between 3 and 500 characters is required';
  end if;

  select organization_id into v_org_id from public.trips where id = p_trip_id;

  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.trip.resubmit') then
    raise exception 'not authorized to resubmit compliance for this trip';
  end if;

  select compliance_verified_at, compliance_declined_at, compliance_resubmitted_at,
         compliance_reject_return_to, compliance_decline_reason
    into v_verified_at, v_declined_at, v_resubmitted, v_return_to, v_reason
    from public.trips
   where id = p_trip_id
     and organization_id = v_org_id
     for update;

  if not found then
    raise exception 'not authorized to resubmit compliance for this trip';
  end if;

  -- Every required file must be on file: trip LR / E-way bill / Invoice
  -- (stored object, not rejected), vehicle RC / Insurance / FC (not expired)
  -- and the driver licence. Same sources the app reads.
  select string_agg(item, ', ') into v_missing
    from unnest(public.compliance_missing_required_files(p_trip_id)) item;
  if v_missing is not null then
    raise exception 'required documents missing or rejected: %', v_missing;
  end if;

  -- Compliance Hold (pre-verify decline): Ground Ops re-uploaded the files and
  -- hands the trip back to Compliance. No return queue, no money check needed
  -- (an advance cannot exist before verification).
  if v_verified_at is null then
    if v_declined_at is null then
      raise exception 'trip is not on compliance hold';
    end if;
    if v_resubmitted is not null and v_resubmitted >= v_declined_at then
      return;
    end if;

    if v_key is not null then
      begin
        insert into public.trip_workflow_events
          (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
        values
          (p_trip_id, v_org_id, v_uid, 'compliance.hold_resubmitted',
           jsonb_build_object('reason', v_reason, 'note', v_note),
           p_trip_id::text || ':compliance.hold_resubmitted:' || v_key);
      exception when unique_violation then
        return;
      end;
    else
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload)
      values
        (p_trip_id, v_org_id, v_uid, 'compliance.hold_resubmitted',
         jsonb_build_object('reason', v_reason, 'note', v_note));
    end if;

    update public.trips
       set compliance_resubmitted_at = now(),
           compliance_resubmit_note = v_note
     where id = p_trip_id;
    return;
  end if;

  if v_declined_at is null or v_declined_at < v_verified_at then
    raise exception 'trip is not an active finance reject';
  end if;

  if v_resubmitted is not null and v_resubmitted >= v_declined_at then
    return;
  end if;

  perform 1
    from public.transactions
   where trip_id = p_trip_id
     and ledger_category in ('compliance_advance', 'compliance_balance')
   for update;

  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category in ('compliance_advance', 'compliance_balance')
  ) then
    raise exception 'an advance or balance is already posted; compliance cannot be resubmitted';
  end if;

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'compliance.resubmitted',
         jsonb_build_object('return_to', v_return_to, 'reason', v_reason, 'note', v_note),
         p_trip_id::text || ':compliance.resubmitted:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'compliance.resubmitted',
       jsonb_build_object('return_to', v_return_to, 'reason', v_reason, 'note', v_note));
  end if;

  update public.trips
     set compliance_resubmitted_at = now(),
         compliance_resubmit_note = v_note
   where id = p_trip_id;
end;
$$;

grant execute on function public.resubmit_trip_compliance(uuid, text, text) to authenticated;
revoke all on function public.resubmit_trip_compliance(uuid, text, text) from public;
revoke all on function public.resubmit_trip_compliance(uuid, text, text) from anon;

-- ── 2. Finance flag ─────────────────────────────────────────────────────────

alter table public.trips
  add column if not exists finance_flagged_at timestamptz,
  add column if not exists finance_flagged_by uuid references auth.users(id) on delete set null,
  add column if not exists finance_flag_note text;

alter table public.trips drop constraint if exists trips_finance_flag_note_check;
alter table public.trips
  add constraint trips_finance_flag_note_check
  check (finance_flag_note is null or char_length(finance_flag_note) <= 500);

comment on column public.trips.finance_flagged_at is
  'Finance flagged the trip for Compliance review (flag_trip_for_compliance). Blocks Approve Advance and a new compliance_advance until cleared or rejected.';
comment on column public.trips.finance_flag_note is
  'What Finance found. Set only by flag_trip_for_compliance.';

create or replace function public.flag_trip_for_compliance(
  p_trip_id uuid,
  p_note text,
  p_idempotency_key text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_org_id      uuid;
  v_verified_at timestamptz;
  v_declined_at timestamptz;
  v_resubmitted timestamptz;
  v_flagged_at  timestamptz;
  v_note        text := regexp_replace(coalesce(p_note, ''), '^\s+|\s+$', '', 'g');
  v_key         text := nullif(trim(p_idempotency_key), '');
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;
  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.finance.manage') then
    raise exception 'not authorized to flag this trip';
  end if;

  if char_length(v_note) < 3 or char_length(v_note) > 500 then
    raise exception 'a flag note between 3 and 500 characters is required';
  end if;

  select compliance_verified_at, compliance_declined_at, compliance_resubmitted_at, finance_flagged_at
    into v_verified_at, v_declined_at, v_resubmitted, v_flagged_at
    from public.trips
   where id = p_trip_id and organization_id = v_org_id
     for update;

  if v_verified_at is null
     or public.compliance_awaiting_resubmit(v_verified_at, v_declined_at, v_resubmitted) then
    raise exception 'only a compliance-verified trip can be flagged';
  end if;

  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category in ('compliance_advance', 'compliance_balance')
  ) then
    raise exception 'an advance or balance is already posted; this trip cannot be flagged';
  end if;

  if v_flagged_at is not null then
    return;
  end if;

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'finance.flagged', jsonb_build_object('note', v_note),
         p_trip_id::text || ':finance.flagged:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'finance.flagged', jsonb_build_object('note', v_note));
  end if;

  update public.trips
     set finance_flagged_at = now(),
         finance_flagged_by = v_uid,
         finance_flag_note = v_note
   where id = p_trip_id;
end;
$$;

revoke all on function public.flag_trip_for_compliance(uuid, text, text) from public;
revoke all on function public.flag_trip_for_compliance(uuid, text, text) from anon;
grant execute on function public.flag_trip_for_compliance(uuid, text, text) to authenticated;

create or replace function public.clear_trip_finance_flag(
  p_trip_id uuid,
  p_idempotency_key text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_org_id     uuid;
  v_flagged_at timestamptz;
  v_note       text;
  v_key        text := nullif(trim(p_idempotency_key), '');
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;
  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.trip.mark_verified') then
    raise exception 'not authorized to clear the finance flag on this trip';
  end if;

  select finance_flagged_at, finance_flag_note into v_flagged_at, v_note
    from public.trips
   where id = p_trip_id and organization_id = v_org_id
     for update;

  if v_flagged_at is null then
    return;
  end if;

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'finance.flag_cleared',
         jsonb_build_object('note', v_note, 'flagged_at', v_flagged_at),
         p_trip_id::text || ':finance.flag_cleared:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'finance.flag_cleared',
       jsonb_build_object('note', v_note, 'flagged_at', v_flagged_at));
  end if;

  update public.trips
     set finance_flagged_at = null,
         finance_flagged_by = null,
         finance_flag_note = null
   where id = p_trip_id;
end;
$$;

revoke all on function public.clear_trip_finance_flag(uuid, text) from public;
revoke all on function public.clear_trip_finance_flag(uuid, text) from anon;
grant execute on function public.clear_trip_finance_flag(uuid, text) to authenticated;

-- Approve Advance refuses while flagged.
create or replace function public.mark_trip_finance_verified(
  p_trip_id uuid,
  p_idempotency_key text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
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
         jsonb_build_object('compliance_verified_at', v_verified_at),
         p_trip_id::text || ':finance.verified:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'finance.verified',
       jsonb_build_object('compliance_verified_at', v_verified_at));
  end if;

  update public.trips
     set finance_verified_at = now(),
         finance_verified_by = v_uid
   where id = p_trip_id;
end;
$$;

-- Reject clears the flag (Compliance acted on it).
create or replace function public.reject_trip_compliance(
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
  v_dest            text;
  v_payload         jsonb;
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;

  if v_org_id is null
     or not public.has_member_surface(v_org_id, 'trip_compliance.trip.mark_verified') then
    raise exception 'not authorized to reject compliance for this trip';
  end if;

  select compliance_verified_at, compliance_decline_reason
    into v_verified_at, v_previous_reason
    from public.trips
   where id = p_trip_id
     and organization_id = v_org_id
     for update;

  if not found then
    raise exception 'not authorized to reject compliance for this trip';
  end if;

  if v_verified_at is null then
    raise exception 'trip compliance is not verified; use decline instead';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'a reject reason between 3 and 500 characters is required';
  end if;

  -- Lock posted ledger rows, then refuse before any event or column write.
  perform 1
    from public.transactions
   where trip_id = p_trip_id
     and ledger_category in ('compliance_advance', 'compliance_balance')
   for update;

  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category in ('compliance_advance', 'compliance_balance')
  ) then
    raise exception 'an advance or balance is already posted; compliance cannot be rejected';
  end if;

  v_dest := public.compliance_reject_return_queue(v_reason);
  v_payload := jsonb_build_object(
    'reason', v_reason,
    'previous_reason', v_previous_reason,
    'mode', 'reject_verified',
    'return_to', v_dest
  );

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'compliance.rejected', v_payload,
         p_trip_id::text || ':compliance.rejected:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'compliance.rejected', v_payload);
  end if;

  -- compliance_verified_at stays. A later decline time reopens the inbox
  -- even if compliance_resubmitted_at is already set.
  update public.trips
     set compliance_declined_at = now(),
         compliance_declined_by = v_uid,
         compliance_decline_reason = v_reason,
         compliance_reject_return_to = v_dest,
         finance_verified_at = null,
         finance_verified_by = null,
         finance_flagged_at = null,
         finance_flagged_by = null,
         finance_flag_note = null
   where id = p_trip_id;
end;
$$;

create or replace function public.guard_trip_finance_flag_columns()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.finance_flagged_at is distinct from old.finance_flagged_at
       or new.finance_flagged_by is distinct from old.finance_flagged_by
       or new.finance_flag_note  is distinct from old.finance_flag_note) then
    raise exception 'finance flag fields can only be changed via flag_trip_for_compliance(), clear_trip_finance_flag() or reject_trip_compliance()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_trip_finance_flag_columns() from public;
revoke all on function public.guard_trip_finance_flag_columns() from anon;
revoke all on function public.guard_trip_finance_flag_columns() from authenticated;

drop trigger if exists trg_guard_trip_finance_flag_columns on public.trips;
create trigger trg_guard_trip_finance_flag_columns
  before update of finance_flagged_at, finance_flagged_by, finance_flag_note
  on public.trips
  for each row execute function public.guard_trip_finance_flag_columns();

drop policy if exists compliance_advance_requires_no_finance_flag on public.transactions;
create policy compliance_advance_requires_no_finance_flag
  on public.transactions
  as restrictive
  for insert
  to authenticated
  with check (
    ledger_category is distinct from 'compliance_advance'
    or not exists (
      select 1 from public.trips t
       where t.id = transactions.trip_id
         and t.finance_flagged_at is not null
    )
  );

-- ── 3. Paid-from bank account ───────────────────────────────────────────────

alter table public.transactions
  add column if not exists paid_from_account_id uuid references public.entity_bank_accounts(id) on delete set null;

comment on column public.transactions.paid_from_account_id is
  'Org bank account (entity_bank_accounts, entity_type organization) the payment left from. Optional.';

create index if not exists transactions_paid_from_account_id_idx
  on public.transactions (paid_from_account_id)
  where paid_from_account_id is not null;

create or replace function public.check_transaction_paid_from_account()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.paid_from_account_id is not null and not exists (
    select 1 from public.entity_bank_accounts a
     where a.id = new.paid_from_account_id
       and a.entity_type = 'organization'
       and a.entity_id = new.organization_id
       and a.deleted_at is null
  ) then
    raise exception 'paid-from account must be one of this organization''s bank accounts'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.check_transaction_paid_from_account() from public;
revoke all on function public.check_transaction_paid_from_account() from anon;
revoke all on function public.check_transaction_paid_from_account() from authenticated;

drop trigger if exists trg_check_transaction_paid_from_account on public.transactions;
create trigger trg_check_transaction_paid_from_account
  before insert or update of paid_from_account_id on public.transactions
  for each row execute function public.check_transaction_paid_from_account();

-- ── 4. Required trip documents locked after verify ──────────────────────────
-- Not SECURITY DEFINER: current_user must stay the caller's role, like the
-- other guard triggers, so service-role / RPC deletes are not affected.

create or replace function public.guard_trip_document_delete()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_verified_at timestamptz;
  v_declined_at timestamptz;
  v_resubmitted timestamptz;
begin
  if current_user not in ('authenticated', 'anon') then
    return old;
  end if;

  if old.status = 'verified' then
    raise exception 'approved documents cannot be deleted'
      using errcode = '42501';
  end if;

  if old.document_type in ('lr', 'eway_bill', 'invoice') then
    select compliance_verified_at, compliance_declined_at, compliance_resubmitted_at
      into v_verified_at, v_declined_at, v_resubmitted
      from public.trips where id = old.trip_id;
    if v_verified_at is not null
       and not public.compliance_awaiting_resubmit(v_verified_at, v_declined_at, v_resubmitted) then
      raise exception 'required documents are locked after the trip is compliance verified'
        using errcode = '42501';
    end if;
  end if;

  return old;
end;
$$;

revoke all on function public.guard_trip_document_delete() from public;
revoke all on function public.guard_trip_document_delete() from anon;
revoke all on function public.guard_trip_document_delete() from authenticated;

drop trigger if exists trg_guard_trip_document_delete on public.trip_documents;
create trigger trg_guard_trip_document_delete
  before delete on public.trip_documents
  for each row execute function public.guard_trip_document_delete();
