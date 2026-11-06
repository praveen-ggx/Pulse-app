-- Gate 1A evidence: read-only catalog dump (no writes).
with fns as (
  select p.oid, n.nspname, p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'award_market_bid','award_direct_quote','award_indent_to_trip',
    'set_updated_at','set_indent_assigned_supplier_on_quote_accepted',
    'notify_direct_quote_lifecycle','reject_quote_accept_on_inactive_indent',
    'enforce_indent_draft_broadcast_rules','deactivate_posts_for_terminal_indent',
    'notify_indent_broadcast','notify_indent_supplier_requested',
    'tg_clear_award_revoked_on_award','trg_complete_reach_campaigns_on_indent_terminal',
    'reject_award_of_inactive_indent',
    'is_org_staff','is_approved_supplier','is_marketplace_indent_award',
    'ensure_awarded_bidder_supplier','indent_has_convertible_sale'
  )
)
select 'A_function' as section, proname as name,
       oid::regprocedure::text as detail,
       pg_get_functiondef(oid) as body
from fns
union all
select 'B_trigger', c.relname || '.' || t.tgname,
       case t.tgenabled when 'O' then 'enabled' when 'D' then 'disabled' else t.tgenabled::text end,
       pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname in ('direct_quotes','indents','market_bids') and c.relnamespace = 'public'::regnamespace
  and not t.tgisinternal
union all
select 'C_policy', tablename || '.' || policyname,
       cmd || ' roles=' || roles::text || ' permissive=' || permissive,
       'USING: ' || coalesce(qual, '<none>') || E'\nWITH CHECK: ' || coalesce(with_check, '<none>')
from pg_policies
where schemaname = 'public' and tablename in ('direct_quotes','indents','market_bids')
union all
select 'D_rls', c.relname, 'rls_enabled=' || c.relrowsecurity || ' forced=' || c.relforcerowsecurity, null
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relname in ('direct_quotes','indents','market_bids')
union all
select 'E_table_grant', table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('direct_quotes','indents','market_bids')
  and grantee in ('anon','authenticated','PUBLIC','service_role')
group by table_name, grantee
union all
select 'F_function_acl', p.proname,
       p.oid::regprocedure::text,
       'owner=' || pg_get_userbyid(p.proowner) || ' secdef=' || p.prosecdef
         || ' config=' || coalesce(p.proconfig::text, '<none>')
         || ' acl=' || coalesce(p.proacl::text, '<default: PUBLIC EXECUTE>')
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('award_market_bid','award_direct_quote','award_indent_to_trip','accept_market_bid')
union all
select 'G_missing_check', x.name, case when to_regprocedure(x.name) is null then 'DOES NOT EXIST' else 'exists' end, null
from (values ('public.accept_direct_quote(uuid)'), ('public.accept_direct_quote(uuid,uuid)'),
             ('private.get_user_org_id()'), ('public.get_user_org_id()')) x(name)
union all
select 'H_role_setting', r.rolname, array_to_string(r.rolconfig, ', '), null
from pg_roles r where r.rolname in ('anon','authenticated','authenticator','service_role')
order by 1, 2;
