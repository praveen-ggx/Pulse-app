-- Equivalence check for 20261125131559_trips_rls_hoist_per_row_checks.sql.
-- READ-ONLY: only SELECTs (runs in a read-only transaction; no temp tables).
-- Run it BEFORE and AFTER the migration against the same database, save both outputs, and diff them:
--   psql "$DB_URL" -X -At -f supabase/tests/trips_rls_equivalence.sql 2>&1 | grep '^psql:.*NOTICE' > before.txt
--   (same with after.txt) ; diff before.txt after.txt     -> must be empty.
-- For every active org member, driver and platform user it impersonates that user (role authenticated +
-- request.jwt.claims) and prints: user_id | visible trips | md5 of the sorted visible trip ids.
-- Write-path equivalence (INSERT/UPDATE/DELETE) uses the same expressions, but must still be
-- exercised by the app flows listed in the PR before prod.
begin transaction read only;
do $$
declare u record; v_n bigint; v_h text;
begin
  for u in
    select user_id from public.organization_members where status = 'active'
    union select user_id from public.drivers where user_id is not null
    union select user_id from public.platform_users where status = 'active'
    order by 1
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', u.user_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*), coalesce(md5(string_agg(t.id::text, ',' order by t.id)), '-') into v_n, v_h from public.trips t;
    execute 'reset role';
    raise notice 'EQ % % %', u.user_id, v_n, v_h;
  end loop;
end $$;
rollback;
