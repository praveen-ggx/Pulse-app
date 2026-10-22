-- Ground Ops: lock existing trip documents once the trip has moved on.
--
-- A Ground Ops member (organization_members.permissions->>'platformRole' =
-- 'ground_ops') may not replace, renumber or delete an existing trip document,
-- nor add another file of a type that already has one, when the trip is in
-- transit or later, compliance verified, finance (advance) approved, or an
-- advance is posted. Exceptions: a document Compliance rejected, and a trip
-- back with Ground Ops after a hold / finance reject until they resubmit
-- (compliance_awaiting_resubmit). Uploading a missing type is never blocked.
-- Grace: for 15 minutes a Ground Ops user may still change their own new file
-- (fill its number, add more pages of the same type, delete a wrong upload),
-- so multi-file uploads and the post-upload number / OCR write keep working.
--
-- Same rule as features/tripCompliance/utils/groundOpsDocumentLock.util.ts.
-- Other roles (Compliance, Finance, admins, drivers, service role) are unaffected.
-- Additive: two functions and one trigger; no table or data changes.

-- ── 1. Lock reason for the calling user (null = allowed) ────────────────────
-- SECURITY DEFINER so the check can read the trip, membership and ledger even
-- where the caller's own row access is narrower. It only ever answers for
-- auth.uid().

create or replace function public.ground_ops_trip_document_lock_reason(
  p_trip_id uuid,
  p_document_status text
)
  returns text
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_trip record;
begin
  if auth.uid() is null or p_trip_id is null then
    return null;
  end if;

  select t.organization_id, t.status, t.compliance_verified_at, t.compliance_declined_at,
         t.compliance_resubmitted_at, t.finance_verified_at
    into v_trip
    from public.trips t
   where t.id = p_trip_id;
  if not found then
    return null;
  end if;

  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = v_trip.organization_id
       and om.user_id = auth.uid()
       and om.status = 'active'
       and om.permissions ->> 'platformRole' = 'ground_ops'
  ) then
    return null;
  end if;

  if lower(coalesce(p_document_status, '')) = 'rejected' then
    return null;
  end if;

  if public.compliance_awaiting_resubmit(
       v_trip.compliance_verified_at, v_trip.compliance_declined_at, v_trip.compliance_resubmitted_at
     ) then
    return null;
  end if;

  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category = 'compliance_advance'
  ) then
    return 'advance processed';
  end if;
  if v_trip.finance_verified_at is not null then
    return 'advance approved';
  end if;
  if v_trip.compliance_verified_at is not null then
    return 'compliance approved';
  end if;
  if lower(coalesce(v_trip.status, '')) in
     ('in_transit', 'unloading', 'at_drop', 'completed', 'delivered', 'pod_received', 'closed') then
    return 'trip is in transit';
  end if;
  return null;
end;
$$;

revoke all on function public.ground_ops_trip_document_lock_reason(uuid, text) from public;
revoke all on function public.ground_ops_trip_document_lock_reason(uuid, text) from anon;
grant execute on function public.ground_ops_trip_document_lock_reason(uuid, text) to authenticated;

comment on function public.ground_ops_trip_document_lock_reason(uuid, text) is
  'Why the calling Ground Ops member may not change an existing document on this trip (null when allowed). Used by guard_trip_document_ground_ops.';

-- ── 2. Guard on trip_documents ──────────────────────────────────────────────
-- Not SECURITY DEFINER: current_user must stay the caller's role (like
-- guard_trip_document_delete), so service-role / RPC writes are not affected.

create or replace function public.guard_trip_document_ground_ops()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_reason text;
  v_grace constant interval := interval '15 minutes';
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    -- Cheap first: null for everyone who is not a locked Ground Ops member.
    v_reason := public.ground_ops_trip_document_lock_reason(new.trip_id, null);
    if v_reason is null then
      return new;
    end if;
    -- Adding is only locked over an existing file of the type that is neither
    -- rejected nor the caller's own upload from the last few minutes.
    if not exists (
      select 1
        from public.trip_documents td
       where td.trip_id = new.trip_id
         and td.document_type = new.document_type
         and lower(coalesce(td.status, '')) <> 'rejected'
         and not (td.uploaded_by = auth.uid() and td.uploaded_at > now() - v_grace)
    ) then
      return new;
    end if;
    raise exception 'Ground Ops cannot add another % file: %', new.document_type, v_reason
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and new.trip_id is not distinct from old.trip_id
     and new.storage_path is not distinct from old.storage_path
     and new.file_name is not distinct from old.file_name
     and new.document_type is not distinct from old.document_type
     and new.document_number is not distinct from old.document_number then
    -- Not a file / number / type change (e.g. review status by Compliance).
    return new;
  end if;

  -- The caller's own file from the last few minutes stays editable.
  if old.uploaded_by = auth.uid() and old.uploaded_at > now() - v_grace then
    return coalesce(new, old);
  end if;

  v_reason := public.ground_ops_trip_document_lock_reason(old.trip_id, old.status);
  if v_reason is not null then
    raise exception 'Ground Ops cannot change this document: %', v_reason
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_trip_document_ground_ops() from public;
revoke all on function public.guard_trip_document_ground_ops() from anon;
revoke all on function public.guard_trip_document_ground_ops() from authenticated;

drop trigger if exists trg_guard_trip_document_ground_ops on public.trip_documents;
create trigger trg_guard_trip_document_ground_ops
  before insert or update or delete on public.trip_documents
  for each row execute function public.guard_trip_document_ground_ops();
