-- Decisions recorded 2026-10-14. Not applied to production.
--
-- Decision A: an open compliance rejection blocks finance approval.
-- Decision B: finance approval creates an advance payment request.
--
-- 20271013120000 already raises unless compliance_cleared and then calls
-- issue_payment_request. Two paths in that function return without the call:
-- the trip is already finance-verified, or the workflow-event insert hits
-- unique_violation. Both still pass the compliance gate. This replacement
-- issues the request on those paths. issue_payment_request returns the live
-- row, so a repeated approval does not create a second request.
--
-- Apply only after 20271013101500 and 20271013120000. Do not apply
-- 20271013101500 later: its older mark_trip_finance_verified has no
-- compliance_cleared check.

SET LOCAL lock_timeout = '5s';

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
  v_resubmitted_at timestamptz;
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

  if v_verified_at is null then
    raise exception 'compliance must be verified before finance verify';
  end if;

  -- Decision A. No payment request is created while a rejection is open.
  if not public.compliance_cleared(v_verified_at, v_declined_at, v_resubmitted_at) then
    raise exception 'this trip was rejected; Ground Ops must resubmit it before the advance can be approved';
  end if;

  if v_flagged_at is not null then
    raise exception 'this trip is flagged for compliance review; the advance cannot be approved until the flag is cleared';
  end if;

  -- Decision B. An earlier approval still leaves exactly one live request.
  if v_finance_at is not null then
    perform public.issue_payment_request(p_trip_id, 'advance', p_approved_amount, v_uid, now());
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
      null;
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
