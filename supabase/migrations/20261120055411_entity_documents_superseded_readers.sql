-- Vehicle / driver document readers ignore superseded copies.
--
-- Why: a document slot (organization, entity, doc_type) can hold several live
-- rows — pages of one document (RC front/back share an expiry), and legacy
-- copies that were never marked `replaced` when a renewed file was uploaded.
-- These readers counted every live row, so an old expired insurance next to
-- a newer valid one still showed as expired / expiring / blocking.
--
-- Rule (same as features/compliance/utils/currentDocument.util.ts):
--   live        = status not in ('replaced', 'rejected')
--   superseded  = a live row older than another live row of the same slot
--                 that has a non-null expiry different from this row's
--   Pages of one document share an expiry, so they never supersede each
--   other. The newest copy is not assumed valid: its own expiry decides.
--
-- Changes (bodies otherwise identical to 20260828010000 / prod today):
--   * new private.entity_document_is_superseded(...)
--   * get_compliance_summary   — superseded rows are not counted; expired also
--                                ignores replaced and rejected rows.
--   * get_expiring_documents   — superseded rows are not listed.
--   * compute_compliance_score — superseded rows are not counted; rejected rows
--                                are not expired; a slot with only rejected
--                                rows counts as missing.
--   * is_compliance_blocking   — superseded / rejected rows do not block as expired.
-- No data, table or policy is changed.

create or replace function private.entity_document_is_superseded(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_doc_type text,
  p_created_at timestamptz,
  p_expiry_date date
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.entity_documents n
    where n.organization_id = p_organization_id
      and n.entity_type = p_entity_type
      and n.entity_id = p_entity_id
      and n.doc_type = p_doc_type
      and n.status not in ('replaced', 'rejected')
      and n.expiry_date is not null
      and n.expiry_date is distinct from p_expiry_date
      and n.created_at > p_created_at
  );
$$;

comment on function private.entity_document_is_superseded(uuid, text, uuid, text, timestamptz, date) is
  'True when a newer live copy of the same document slot carries a different expiry. Mirrors isSupersededEntityDoc in features/compliance/utils/currentDocument.util.ts.';

revoke all on function private.entity_document_is_superseded(uuid, text, uuid, text, timestamptz, date) from public;
revoke all on function private.entity_document_is_superseded(uuid, text, uuid, text, timestamptz, date) from anon;
revoke all on function private.entity_document_is_superseded(uuid, text, uuid, text, timestamptz, date) from authenticated;

-- ── get_compliance_summary ────────────────────────────────────────────────
create or replace function public.get_compliance_summary(p_org_id uuid)
 returns table(entity_type text, total_docs bigint, active_docs bigint, expired_docs bigint, expiring_7d bigint, expiring_30d bigint, pending_docs bigint, verified_docs bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    d.entity_type,
    count(*)                                                                as total_docs,
    count(*) filter (where d.status = 'active' or d.status = 'verified')    as active_docs,
    count(*) filter (
      where d.status not in ('replaced', 'rejected')
        and (
          d.status = 'expired'
          or (d.expiry_date is not null and d.expiry_date < current_date)
        )
    )                                                                       as expired_docs,
    count(*) filter (
      where d.expiry_date is not null
        and d.expiry_date >= current_date
        and d.expiry_date <= current_date + interval '7 days'
        and d.status not in ('replaced', 'rejected')
    )                                                                       as expiring_7d,
    count(*) filter (
      where d.expiry_date is not null
        and d.expiry_date >= current_date
        and d.expiry_date <= current_date + interval '30 days'
        and d.status not in ('replaced', 'rejected')
    )                                                                       as expiring_30d,
    count(*) filter (where d.status = 'pending')                            as pending_docs,
    count(*) filter (where d.status = 'verified')                           as verified_docs
  from public.entity_documents d
  where d.organization_id = p_org_id
    and public.is_org_staff(p_org_id)
    and not private.entity_document_is_superseded(
      d.organization_id, d.entity_type, d.entity_id, d.doc_type, d.created_at, d.expiry_date
    )
  group by d.entity_type;
$function$;

-- ── get_expiring_documents ────────────────────────────────────────────────
create or replace function public.get_expiring_documents(p_org_id uuid, p_days_ahead integer default 30)
 returns table(id uuid, entity_type text, entity_id uuid, doc_type text, doc_label text, doc_number text, expiry_date date, days_until integer, status text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    d.id, d.entity_type, d.entity_id, d.doc_type, d.doc_label, d.doc_number, d.expiry_date,
    (d.expiry_date - current_date)::int as days_until,
    d.status
  from public.entity_documents d
  where d.organization_id = p_org_id
    and d.expiry_date is not null
    and d.expiry_date >= current_date - interval '1 day'
    and d.expiry_date <= current_date + (p_days_ahead || ' days')::interval
    and d.status not in ('replaced', 'rejected')
    and public.is_org_staff(p_org_id)
    and not private.entity_document_is_superseded(
      d.organization_id, d.entity_type, d.entity_id, d.doc_type, d.created_at, d.expiry_date
    )
  order by d.expiry_date asc;
$function$;

-- ── compute_compliance_score ──────────────────────────────────────────────
create or replace function public.compute_compliance_score(p_entity_type text, p_entity_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_required          text[];
  v_total             int;
  v_active            int;
  v_expired           int;
  v_expiring_7d       int;
  v_expiring_30d      int;
  v_verified          int;
  v_pending           int;
  v_missing           int;
  v_validity          int;
  v_completeness      int;
  v_verification      int;
  v_score             int;
  v_level             text;
begin
  v_required := case p_entity_type
    when 'vehicle'      then array['rc','insurance','fitness','permit','pollution']
    when 'driver'       then array['license','medical']
    when 'supplier'     then array['gst','pan']
    when 'organization' then array[]::text[]
    else                     array[]::text[]
  end;

  select
    count(*),
    count(*) filter (where d.status in ('active','verified')),
    count(*) filter (
      where d.status <> 'rejected'
        and (
          d.status = 'expired'
          or (d.expiry_date is not null and d.expiry_date < current_date)
        )
    ),
    count(*) filter (
      where d.expiry_date is not null
        and d.expiry_date between current_date and current_date + interval '7 days'
        and d.status not in ('replaced','rejected')
    ),
    count(*) filter (
      where d.expiry_date is not null
        and d.expiry_date between current_date and current_date + interval '30 days'
        and d.status not in ('replaced','rejected')
    ),
    count(*) filter (where d.status = 'verified'),
    count(*) filter (where d.status = 'pending')
  into
    v_total, v_active, v_expired, v_expiring_7d, v_expiring_30d, v_verified, v_pending
  from public.entity_documents d
  where d.entity_type = p_entity_type
    and d.entity_id   = p_entity_id
    and d.status     <> 'replaced'
    and not private.entity_document_is_superseded(
      d.organization_id, d.entity_type, d.entity_id, d.doc_type, d.created_at, d.expiry_date
    );

  v_missing := (
    select count(*)
    from unnest(v_required) as r(doc)
    where not exists (
      select 1 from public.entity_documents ed
      where ed.entity_type = p_entity_type
        and ed.entity_id   = p_entity_id
        and ed.doc_type    = r.doc
        and ed.status not in ('replaced', 'rejected')
    )
  );

  v_validity := case
    when v_total > 0
      then round(((v_total - v_expired)::numeric / v_total) * 100)
    when cardinality(v_required) = 0 then 100
    else 0
  end;

  v_completeness := case
    when cardinality(v_required) > 0
      then round(((cardinality(v_required) - v_missing)::numeric / cardinality(v_required)) * 100)
    else 100
  end;

  v_verification := case
    when v_total > 0 then round((v_verified::numeric / v_total) * 100)
    else 100
  end;

  v_score := round(v_validity * 0.40 + v_completeness * 0.35 + v_verification * 0.25);

  v_level := case
    when v_score >= 90 then 'excellent'
    when v_score >= 70 then 'good'
    when v_score >= 50 then 'warning'
    else                    'critical'
  end;

  return jsonb_build_object(
    'score',              v_score,
    'level',              v_level,
    'validityScore',      v_validity,
    'completenessScore',  v_completeness,
    'verificationScore',  v_verification,
    'breakdown', jsonb_build_object(
      'total',        v_total,
      'active',       v_active,
      'expired',      v_expired,
      'expiring7d',   v_expiring_7d,
      'expiring30d',  v_expiring_30d,
      'verified',     v_verified,
      'pending',      v_pending,
      'missing',      v_missing
    )
  );
end;
$function$;

-- ── is_compliance_blocking ────────────────────────────────────────────────
create or replace function public.is_compliance_blocking(p_vehicle_id uuid default null::uuid, p_driver_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_reasons   jsonb := '[]'::jsonb;
  v_vehicle_required constant text[] := array['insurance','permit','fitness'];
  v_driver_required  constant text[] := array['license'];
  r record;
begin
  if p_vehicle_id is not null then
    -- Expired vehicle docs that count as blockers (current copies only).
    for r in
      select d.doc_type, d.expiry_date
      from public.entity_documents d
      where d.entity_type = 'vehicle'
        and d.entity_id   = p_vehicle_id
        and d.doc_type    = any (v_vehicle_required)
        and d.status not in ('replaced', 'rejected')
        and (
          d.status = 'expired'
          or (d.expiry_date is not null and d.expiry_date < current_date)
        )
        and not private.entity_document_is_superseded(
          d.organization_id, d.entity_type, d.entity_id, d.doc_type, d.created_at, d.expiry_date
        )
    loop
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'vehicle',
        'entity_id',   p_vehicle_id,
        'doc_type',    r.doc_type,
        'reason',      'expired',
        'expiry_date', r.expiry_date
      );
    end loop;

    -- Missing required vehicle docs.
    for r in
      select d as doc_type
      from unnest(v_vehicle_required) as d
      where not exists (
        select 1 from public.entity_documents ed
        where ed.entity_type = 'vehicle'
          and ed.entity_id   = p_vehicle_id
          and ed.doc_type    = d
          and ed.status not in ('replaced', 'rejected', 'expired')
      )
    loop
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'vehicle',
        'entity_id',   p_vehicle_id,
        'doc_type',    r.doc_type,
        'reason',      'missing',
        'expiry_date', null
      );
    end loop;
  end if;

  if p_driver_id is not null then
    for r in
      select d.doc_type, d.expiry_date
      from public.entity_documents d
      where d.entity_type = 'driver'
        and d.entity_id   = p_driver_id
        and d.doc_type    = any (v_driver_required)
        and d.status not in ('replaced', 'rejected')
        and (
          d.status = 'expired'
          or (d.expiry_date is not null and d.expiry_date < current_date)
        )
        and not private.entity_document_is_superseded(
          d.organization_id, d.entity_type, d.entity_id, d.doc_type, d.created_at, d.expiry_date
        )
    loop
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'driver',
        'entity_id',   p_driver_id,
        'doc_type',    r.doc_type,
        'reason',      'expired',
        'expiry_date', r.expiry_date
      );
    end loop;

    for r in
      select d as doc_type
      from unnest(v_driver_required) as d
      where not exists (
        select 1 from public.entity_documents ed
        where ed.entity_type = 'driver'
          and ed.entity_id   = p_driver_id
          and ed.doc_type    = d
          and ed.status not in ('replaced', 'rejected', 'expired')
      )
    loop
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'driver',
        'entity_id',   p_driver_id,
        'doc_type',    r.doc_type,
        'reason',      'missing',
        'expiry_date', null
      );
    end loop;
  end if;

  return jsonb_build_object(
    'blocked', jsonb_array_length(v_reasons) > 0,
    'reasons', v_reasons
  );
end;
$function$;
