-- Restores the hub LR/POD/e-way batch read dropped by
-- 20270930130000_rollback_nihas_v1_merge_schema.sql.
-- Without this function, the trips list falls back to chunked REST
-- trip_documents reads under RLS, which is the statement-timeout path.
-- Vendor-onboarding columns and the document_type catalog stay as the
-- rollback left them.

set local lock_timeout = '5s';

create index if not exists idx_trip_documents_trip_id_document_type
  on public.trip_documents (trip_id, document_type);

create or replace function public.get_trip_documents_lr_pod_batch(p_trip_ids uuid[])
returns table (
  trip_id uuid,
  document_type text,
  document_number text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    td.trip_id,
    td.document_type,
    td.document_number
  from public.trip_documents td
  where p_trip_ids is not null
    and cardinality(p_trip_ids) > 0
    and td.trip_id = any (p_trip_ids)
    and td.document_type in ('lr', 'pod', 'soft_pod', 'pod_soft', 'eway_bill')
    and exists (
      select 1
      from public.trips t
      where t.id = td.trip_id
        and (
          public.is_org_member(t.organization_id)
          or exists (
            select 1
            from public.suppliers s
            where s.id = t.supplier_id
              and s.linked_organization_id is not null
              and public.is_org_member(s.linked_organization_id)
          )
          or exists (
            select 1
            from public.clients c
            where c.id = t.client_id
              and c.organization_id is not null
              and public.is_org_member(c.organization_id)
          )
          or exists (
            select 1
            from public.drivers d
            where d.id = t.driver_id
              and d.user_id = (select auth.uid())
          )
        )
    );
$$;

comment on function public.get_trip_documents_lr_pod_batch(uuid[]) is
  'Batch LR/POD/e-way bill trip_documents rows for hub/Overview. SECURITY DEFINER bypasses heavy trip_documents SELECT RLS; caller must be trip owner-org member, supplier-linked org member, client-linked org member, or assigned driver.';

revoke all on function public.get_trip_documents_lr_pod_batch(uuid[]) from public;
grant execute on function public.get_trip_documents_lr_pod_batch(uuid[]) to authenticated;
