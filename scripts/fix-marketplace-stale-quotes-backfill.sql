-- DRAFT one-time backfill for prod. DO NOT RUN until reviewed.
-- Runs in a transaction that ENDS IN ROLLBACK by default. Change the final
-- ROLLBACK to COMMIT only after the owner approves the preview counts.
-- Take a fresh pg_dump of public/supabase_migrations within 1 h before running.
begin;

-- Preview: rows to change
select 'b1 pool-exhausted' as bucket, count(*) from public.direct_quotes dq
  join public.network_pool_bid_commits c on c.id = dq.pool_commit_id
 where dq.status = 'pending' and c.status = 'exhausted';

select 'b2 indent has accepted market bid' as bucket, count(*) from public.direct_quotes dq
 where dq.status = 'pending'
   and exists (select 1 from public.market_bids mb
                where mb.indent_id = dq.indent_id and mb.status = 'accepted');

-- B1: pending quotes on exhausted pool commits -> rejected (no 'superseded' in schema)
with b1 as (
  update public.direct_quotes dq
     set status = 'rejected', updated_at = now()
    from public.network_pool_bid_commits c
   where c.id = dq.pool_commit_id
     and c.status = 'exhausted'
     and dq.status = 'pending'
  returning dq.id
)
select 'b1 updated' as bucket, count(*) from b1;

-- B2: pending quotes on indents that already have an accepted market bid -> rejected
with b2 as (
  update public.direct_quotes dq
     set status = 'rejected', updated_at = now()
   where dq.status = 'pending'
     and exists (select 1 from public.market_bids mb
                  where mb.indent_id = dq.indent_id and mb.status = 'accepted')
  returning dq.id
)
select 'b2 updated' as bucket, count(*) from b2;

-- Verify: nothing left in either bucket
select 'remaining b1' as check_name, count(*) from public.direct_quotes dq
  join public.network_pool_bid_commits c on c.id = dq.pool_commit_id
 where dq.status = 'pending' and c.status = 'exhausted';
select 'remaining b2' as check_name, count(*) from public.direct_quotes dq
 where dq.status = 'pending'
   and exists (select 1 from public.market_bids mb
                where mb.indent_id = dq.indent_id and mb.status = 'accepted');

rollback;  -- change to: commit;  only after approval
