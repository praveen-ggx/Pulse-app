select pid, usename, application_name, state, wait_event,
       round(extract(epoch from (now()-state_change))::numeric,1) as state_s,
       left(regexp_replace(coalesce(query,''), '\s+', ' ', 'g'), 160) as query
from pg_stat_activity
where datname = current_database()
  and state = 'idle in transaction';

select relname, n_live_tup, n_dead_tup, seq_scan, idx_scan,
       last_autovacuum, last_autoanalyze
from pg_stat_user_tables
where n_dead_tup > 1000 or seq_scan > 10000
order by n_dead_tup desc
limit 15;

select jobid, coalesce(jobname, '') as jobname, schedule, active
from cron.job
order by jobid;
