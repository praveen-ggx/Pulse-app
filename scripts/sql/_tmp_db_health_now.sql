select now() as checked_at;

select count(*) as sessions,
       count(*) filter (where state = 'active') as active,
       count(*) filter (where state = 'idle') as idle,
       count(*) filter (where state = 'idle in transaction') as idle_in_tx,
       count(*) filter (where wait_event_type = 'Lock') as waiting_lock,
       count(*) filter (where state = 'active' and query_start < now() - interval '5 seconds') as active_gt_5s
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid();

select pid,
       usename,
       application_name,
       state,
       wait_event_type,
       wait_event,
       round(extract(epoch from (now() - query_start))::numeric, 1) as query_s,
       round(extract(epoch from (now() - xact_start))::numeric, 1) as xact_s,
       left(regexp_replace(coalesce(query, ''), '\s+', ' ', 'g'), 180) as query
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
  and state is distinct from 'idle'
order by query_start nulls last
limit 25;
