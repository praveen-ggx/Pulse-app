-- Resubmit gates. Sorts after 20271008115000 (repo and preprod head).
--
-- 1. Every resubmitted finance reject goes back to Compliance Verification.
--    compliance_reject_return_to stays as the server-derived reason category
--    (audit / display) but no longer routes the trip, so resubmit no longer
--    requires it. Legacy rejects without a return queue can be resubmitted.
-- 2. Verify (normal or with exception) is refused while a hold or finance
--    reject is waiting for the Ground Ops resubmit.
-- 3. Exception approval can re-approve a resubmitted finance reject (it used
--    to return silently or refuse because the trip had been verified before).
-- 4. Resubmit is refused while a required trip document (LR, E-way bill,
--    Invoice) is missing or rejected. Vehicle / driver files stay app-checked.
--
-- No data changes. Posted ledger rows are never touched.

-- ── 1. Shared rule ──────────────────────────────────────────────────────────

create or replace function public.compliance_awaiting_resubmit(
  p_verified_at timestamptz,
  p_declined_at timestamptz,
  p_resubmitted_at timestamptz
)
  returns boolean
  language sql
  immutable
  set search_path = public
as $$
  -- Hold (never verified) or finance reject (declined at/after verify) that
  -- has no resubmit at/after the latest decline.
  select p_declined_at is not null
     and (p_verified_at is null or p_declined_at >= p_verified_at)
     and (p_resubmitted_at is null or p_resubmitted_at < p_declined_at);
$$;

revoke all on function public.compliance_awaiting_resubmit(timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.compliance_awaiting_resubmit(timestamptz, timestamptz, timestamptz) from anon;
grant execute on function public.compliance_awaiting_resubmit(timestamptz, timestamptz, timestamptz) to authenticated;

comment on column public.trips.compliance_reject_return_to is
  'Server-derived category of a finance reject (pending_for_docs = document fix, compliance_pending = commercial fix). Audit / display only: after Resubmit every reject returns to Compliance Verification.';

-- ── 2. Verify ───────────────────────────────────────────────────────────────

create or replace function public.mark_trip_compliance_verified(p_trip_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_org_id  uuid;
  v_missing text;
  -- Kept in sync with REQUIRED_COMPLIANCE_DOCUMENT_TYPES in
  -- features/tripCompliance/tripCompliance.types.ts — server re-derives the
  -- gate rather than trusting the client's own check.
  v_required text[] := array['lr', 'invoice', 'eway_bill'];
  v_verified_at   timestamptz;
  v_declined_at   timestamptz;
  v_resubmitted   timestamptz;
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;
  if v_org_id is null then
    raise exception 'trip not found';
  end if;
  if not public.has_member_surface(v_org_id, 'trip_compliance.trip.mark_verified') then
    raise exception 'not authorized to mark compliance verified for this organization';
  end if;

  select compliance_verified_at, compliance_declined_at, compliance_resubmitted_at
    into v_verified_at, v_declined_at, v_resubmitted
    from public.trips
   where id = p_trip_id
     for update;

  if public.compliance_awaiting_resubmit(v_verified_at, v_declined_at, v_resubmitted) then
    raise exception 'this trip is on hold or rejected; Ground Ops must resubmit it before it can be verified';
  end if;

  select string_agg(rt, ', ') into v_missing
    from unnest(v_required) rt
   where not exists (
     select 1 from public.trip_documents td
      where td.trip_id = p_trip_id
        and td.document_type = rt
        and td.status = 'verified'
   );

  if v_missing is not null then
    raise exception 'required documents not yet verified: %', v_missing;
  end if;

  update public.trips
     set compliance_verified_by = v_uid,
         compliance_verified_at = now()
   where id = p_trip_id;
end;
$$;

-- ── 3. Verify with exception ────────────────────────────────────────────────

create or replace function public.approve_trip_compliance_with_exception(
  p_trip_id uuid,
  p_comment text
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_org_id      uuid;
  v_decision    text;
  v_verified_at timestamptz;
  v_comment     text := trim(p_comment);
  v_required    text[] := array['lr', 'invoice', 'eway_bill'];
  v_missing     text[] := array[]::text[];
  v_pending     text[] := array[]::text[];
  v_rejected    text[] := array[]::text[];
  v_outstanding jsonb;
  v_status      text;
  rt            text;
  v_declined_at timestamptz;
  v_resubmitted timestamptz;
  v_reapproval  boolean;
begin
  if coalesce(v_comment, '') = '' then
    raise exception 'a comment is required to approve compliance with an exception';
  end if;

  select organization_id, compliance_decision, compliance_verified_at,
         compliance_declined_at, compliance_resubmitted_at
    into v_org_id, v_decision, v_verified_at, v_declined_at, v_resubmitted
    from public.trips
   where id = p_trip_id
     for update;

  if v_org_id is null then
    raise exception 'trip not found';
  end if;

  if not public.has_member_surface(v_org_id, 'trip_compliance.trip.mark_verified') then
    raise exception 'not authorized to approve compliance for this organization';
  end if;

  if public.compliance_awaiting_resubmit(v_verified_at, v_declined_at, v_resubmitted) then
    raise exception 'this trip is on hold or rejected; Ground Ops must resubmit it before it can be verified';
  end if;

  -- A resubmitted finance reject is re-approved, not a repeat of the old decision.
  v_reapproval := v_verified_at is not null and v_declined_at is not null and v_declined_at >= v_verified_at;

  if not v_reapproval and v_verified_at is not null and v_decision = 'approved' then
    raise exception 'trip compliance was already approved normally; cannot downgrade to an exception approval';
  end if;

  if not v_reapproval and v_verified_at is not null and v_decision = 'approved_with_exception' then
    -- Idempotent retry of the same exception decision.
    return;
  end if;

  foreach rt in array v_required loop
    v_status := null;
    select td.status into v_status
      from public.trip_documents td
     where td.trip_id = p_trip_id
       and td.document_type = rt
     order by case td.status when 'verified' then 0 when 'pending' then 1 when 'rejected' then 2 else 3 end
     limit 1;

    if v_status is null then
      v_missing := array_append(v_missing, rt);
    elsif v_status = 'pending' then
      v_pending := array_append(v_pending, rt);
    elsif v_status = 'rejected' then
      v_rejected := array_append(v_rejected, rt);
    end if;
    -- 'verified' -> satisfied, not outstanding.
  end loop;

  if array_length(v_missing, 1) is null and array_length(v_pending, 1) is null and array_length(v_rejected, 1) is null then
    raise exception 'all required documents are already verified; use mark_trip_compliance_verified instead';
  end if;

  v_outstanding := jsonb_build_object(
    'missing', to_jsonb(v_missing),
    'pending_verification', to_jsonb(v_pending),
    'rejected', to_jsonb(v_rejected)
  );

  update public.trips
     set compliance_verified_by = v_uid,
         compliance_verified_at = now(),
         compliance_decision = 'approved_with_exception',
         compliance_exception_reason = v_comment,
         compliance_outstanding_summary = v_outstanding
   where id = p_trip_id;

  begin
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
    values
      (p_trip_id, v_org_id, v_uid, 'compliance.approved_with_exception',
       jsonb_build_object(
         'comment', v_comment,
         'outstanding', v_outstanding,
         'previous_decision', v_decision
       ),
       p_trip_id::text || ':compliance.approved_with_exception'
         || case when v_reapproval then ':' || extract(epoch from v_declined_at)::text else '' end);
  exception when unique_violation then
    null;
  end;
end;
$$;

grant execute on function public.approve_trip_compliance_with_exception(uuid, text) to authenticated;
revoke all on function public.approve_trip_compliance_with_exception(uuid, text) from public;
revoke all on function public.approve_trip_compliance_with_exception(uuid, text) from anon;

-- ── 4. Resubmit ─────────────────────────────────────────────────────────────

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

  -- Same trip-document rule as the app (REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
  -- classifyTripDocument): each required type needs a row with a file,
  -- reference or typed details, and a rejected file does not count — it must
  -- be replaced first. Vehicle / driver files can come from the vehicle vault
  -- (matched by number), so that part stays an app-side check.
  select string_agg(rt, ', ') into v_missing
    from unnest(array['lr', 'eway_bill', 'invoice']) rt
   where not exists (
     select 1 from public.trip_documents td
      where td.trip_id = p_trip_id
        and td.document_type = rt
        and coalesce(td.status, 'pending') <> 'rejected'
        and (
          nullif(btrim(td.storage_path), '') is not null
          or td.source_entity_document_id is not null
          or nullif(btrim(td.document_number), '') is not null
        )
   );
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
