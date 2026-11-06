with helpers as (
  select p.oid, p.proname, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc ilike '%organization_members%'
    and p.prorettype in ('bool'::regtype, 'uuid'::regtype, 'uuid[]'::regtype)
),
pol as (
  select schemaname, tablename, policyname, cmd, coalesce(qual,'') || ' ' || coalesce(with_check,'') expr
  from pg_policies where schemaname = 'public'
)
select h.proname helper,
  (h.prosrc ~* 'role\s*(<>|!=)\s*''driver''|role\s+not\s+in|role\s*=\s*any|role\s+in\s*\(|role\s*=\s*''(owner|admin|staff|member|dispatcher)''') role_filtered,
  count(distinct pol.tablename) tables, count(*) policies,
  string_agg(distinct pol.cmd, ',') cmds
from helpers h join pol on pol.expr ilike '%' || h.proname || '(%'
group by 1, 2 order by 3 desc;
