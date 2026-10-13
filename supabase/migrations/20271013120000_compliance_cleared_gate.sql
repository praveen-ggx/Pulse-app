-- Advance only after Compliance has cleared the trip.
--
-- A Finance reject keeps compliance_verified_at (history) and sets a later
-- compliance_declined_at. Ground Ops resubmits, then Compliance must verify
-- again (a newer compliance_verified_at) before the trip is Verified. Until then
-- the advance could still be approved and posted, because both checks only
-- looked at compliance_verified_at being set (SAT812GOGTRIP000970 was approved
-- one minute after its resubmit).

create or replace function public.compliance_cleared(p_verified_at timestamptz, p_declined_at timestamptz)
  returns boolean
  language sql
  immutable
  set search_path to 'public'
as $$
  select p_verified_at is not null and (p_declined_at is null or p_declined_at < p_verified_at);
$$;

grant execute on function public.compliance_cleared(timestamptz, timestamptz) to authenticated;

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
  v_declined_at timestamptz;
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

  select compliance_verified_at, compliance_declined_at, finance_verified_at, finance_flagged_at
    into v_verified_at, v_declined_at, v_finance_at, v_flagged_at
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

  -- A reject after verification stands until Compliance verifies the trip again
  -- (a newer compliance_verified_at). Ground Ops resubmitting is not enough.
  if not public.compliance_cleared(v_verified_at, v_declined_at) then
    raise exception 'this trip was rejected; Compliance must verify it again before the advance can be approved';
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

-- Posting an advance needs the same: a cleared trip, not just a past verification.
drop policy if exists compliance_advance_requires_compliance_approved on public.transactions;
create policy compliance_advance_requires_compliance_approved on public.transactions
  as restrictive
  for insert
  to authenticated
  with check (
    ledger_category is distinct from 'compliance_advance'
    or exists (
      select 1 from public.trips t
       where t.id = transactions.trip_id
         and public.compliance_cleared(t.compliance_verified_at, t.compliance_declined_at)
    )
  );
