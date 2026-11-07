set transaction read only;
select 'constraint' as kind, conrelid::regclass::text as tbl, conname as name, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid in ('public.transactions'::regclass, 'public.suppliers'::regclass, 'public.clients'::regclass)
  and contype in ('c', 'u', 'f')
union all
select 'trigger', tgrelid::regclass::text, tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid in ('public.transactions'::regclass, 'public.suppliers'::regclass, 'public.clients'::regclass)
  and not tgisinternal
union all
select 'notnull_nodefault', c.table_name, c.column_name, c.data_type
from information_schema.columns c
where c.table_schema = 'public' and c.table_name in ('suppliers', 'clients')
  and c.is_nullable = 'NO' and c.column_default is null
union all
select 'index', tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('suppliers', 'clients') and indexdef ilike '%unique%'
order by 1, 2, 3;
