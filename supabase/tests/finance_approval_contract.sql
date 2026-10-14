\set ON_ERROR_STOP on

-- Executable contract for mark_trip_finance_verified after
-- 20271013101500 → 20271013120000 → 20271014183000.

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);

insert into public.trips (
  id, organization_id,
  compliance_verified_at, compliance_declined_at, compliance_resubmitted_at
) values
  -- Open rejection
  ('21000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '2 days', now() - interval '1 day', null),
  -- Cleared for first approve + amount retry
  ('22000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '1 day', null, null),
  -- Posted advance, not finance-verified (legacy path: trigger off)
  ('23000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '1 day', null, null),
  -- Undo then re-approve
  ('25000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '1 day', null, null);

-- 1. Open compliance rejection cannot approve or issue a request.
do $$
begin
  begin
    perform public.mark_trip_finance_verified(
      '21000000-0000-0000-0000-000000000001', null, 100
    );
    raise exception 'rejected trip was finance-verified';
  exception
    when others then
      if sqlerrm not like 'this trip was rejected; Ground Ops must resubmit it before the advance can be approved' then
        raise;
      end if;
  end;
  if exists (
    select 1 from public.payment_requests
     where trip_id = '21000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'rejected trip created a payment request';
  end if;
  if exists (
    select 1 from public.trips
     where id = '21000000-0000-0000-0000-000000000001'
       and finance_verified_at is not null
  ) then
    raise exception 'rejected trip set finance_verified_at';
  end if;
end $$;

-- 2. Repeated approval returns the same live request and does not change amount.
do $$
declare
  v_first uuid;
  v_second uuid;
  v_amount numeric;
begin
  perform public.mark_trip_finance_verified(
    '22000000-0000-0000-0000-000000000002', 'approve-1', 100
  );
  select id, approved_amount into v_first, v_amount
    from public.payment_requests
   where trip_id = '22000000-0000-0000-0000-000000000002'
     and payment_type = 'advance'
     and status <> 'cancelled';
  if v_first is null or v_amount is distinct from 100 then
    raise exception 'first approval did not issue amount 100';
  end if;

  perform public.mark_trip_finance_verified(
    '22000000-0000-0000-0000-000000000002', 'approve-2', 200
  );
  select id, approved_amount into v_second, v_amount
    from public.payment_requests
   where trip_id = '22000000-0000-0000-0000-000000000002'
     and payment_type = 'advance'
     and status <> 'cancelled';
  if v_second is distinct from v_first then
    raise exception 'retry issued a different live request';
  end if;
  if v_amount is distinct from 100 then
    raise exception 'retry changed approved_amount to %', v_amount;
  end if;
  if (select count(*) from public.payment_requests
       where trip_id = '22000000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'retry duplicated a payment request';
  end if;
end $$;

-- 3. Posted compliance_advance without finance verify: raise, no extra request.
-- Disable the post-link trigger so this matches a row that existed before 131015.
alter table public.transactions disable trigger trg_transactions_link_payment_request;
insert into public.transactions (id, trip_id, ledger_category, created_by)
values (
  '23000000-0000-0000-0000-0000000000aa',
  '23000000-0000-0000-0000-000000000003',
  'compliance_advance',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
alter table public.transactions enable trigger trg_transactions_link_payment_request;

do $$
begin
  begin
    perform public.mark_trip_finance_verified(
      '23000000-0000-0000-0000-000000000003', null, 50
    );
    raise exception 'posted advance was finance-verified';
  exception
    when others then
      if sqlerrm not like 'an advance is already posted for this trip' then
        raise;
      end if;
  end;
  if exists (
    select 1 from public.payment_requests
     where trip_id = '23000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'posted-advance path issued a payment request';
  end if;
end $$;

-- 4. Cancelled request stays historical; a later valid approve issues a new live row.
do $$
declare
  v_old uuid;
  v_new uuid;
begin
  perform public.mark_trip_finance_verified(
    '25000000-0000-0000-0000-000000000005', 'first', 75
  );
  select id into v_old
    from public.payment_requests
   where trip_id = '25000000-0000-0000-0000-000000000005'
     and status <> 'cancelled';
  perform public.unmark_trip_finance_verified(
    '25000000-0000-0000-0000-000000000005', 'undo-1'
  );
  if (select status from public.payment_requests where id = v_old) is distinct from 'cancelled' then
    raise exception 'undone request was not left cancelled';
  end if;
  if (select finance_verified_at from public.trips
       where id = '25000000-0000-0000-0000-000000000005') is not null then
    raise exception 'undo did not clear finance_verified_at';
  end if;

  perform public.mark_trip_finance_verified(
    '25000000-0000-0000-0000-000000000005', 'second', 80
  );
  select id into v_new
    from public.payment_requests
   where trip_id = '25000000-0000-0000-0000-000000000005'
     and status <> 'cancelled';
  if v_new is null or v_new = v_old then
    raise exception 're-approve did not issue a new live request';
  end if;
  if (select approved_amount from public.payment_requests where id = v_new) is distinct from 80 then
    raise exception 'new request did not snapshot 80';
  end if;
  if (select approved_amount from public.payment_requests where id = v_old) is distinct from 75 then
    raise exception 'cancelled request amount changed';
  end if;
end $$;

-- 5. Missing compliance verification and a flagged trip issue nothing.
insert into public.trips (
  id, organization_id,
  compliance_verified_at, finance_flagged_at
) values
  ('27000000-0000-0000-0000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, null),
  ('28000000-0000-0000-0000-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '1 day', now());

do $$
begin
  begin
    perform public.mark_trip_finance_verified(
      '27000000-0000-0000-0000-000000000007', null, 40
    );
    raise exception 'unverified trip was finance-verified';
  exception
    when others then
      if sqlerrm not like 'compliance must be verified before finance verify' then
        raise;
      end if;
  end;
  begin
    perform public.mark_trip_finance_verified(
      '28000000-0000-0000-0000-000000000008', null, 40
    );
    raise exception 'flagged trip was finance-verified';
  exception
    when others then
      if sqlerrm not like 'this trip is flagged for compliance review; the advance cannot be approved until the flag is cleared' then
        raise;
      end if;
  end;
  if exists (
    select 1 from public.payment_requests
     where trip_id in (
       '27000000-0000-0000-0000-000000000007',
       '28000000-0000-0000-0000-000000000008'
     )
  ) then
    raise exception 'missing or flagged trip created a payment request';
  end if;
  if exists (
    select 1 from public.trips
     where id in (
       '27000000-0000-0000-0000-000000000007',
       '28000000-0000-0000-0000-000000000008'
     )
       and finance_verified_at is not null
  ) then
    raise exception 'missing or flagged trip set finance_verified_at';
  end if;
end $$;
