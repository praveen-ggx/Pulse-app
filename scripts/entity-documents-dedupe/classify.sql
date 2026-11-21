-- Read-only classification of duplicate live vehicle / driver document rows.
-- A WITH-clause prefix: dedupe-report.sh appends one SELECT per output and
-- runs it inside a READ ONLY transaction (no temp objects are created).
--
-- Slot = (organization_id, entity_type, entity_id, doc_type). Live = status not
-- in ('replaced','rejected'). Only slots with 2+ live rows are examined.
-- current = newest live row that has an expiry (same rule as the app and
-- private.entity_document_is_superseded); slots with no dated row have no
-- current copy and are never touched.
--
-- Decision per non-current live row (conservative; anything unclear = review):
--   keep_page                    same expiry as current (pages of one document)
--   keep_no_dated_copy           slot has no dated row (e.g. RC front/back)
--   propose_replace              older upload AND earlier expiry than current,
--                                and not verified while current is unverified
--   review_undated               row has no expiry next to a dated current copy
--   review_older_expires_later   older upload but later expiry than current
--   review_verified_older        older row verified, current not yet verified
--   review_same_time             created at the same instant as current
-- Nothing is ever deleted. Proposed rows would only get status='replaced' and
-- replaced_by_id=current; storage objects and history stay.

with dedupe_live as (
  select d.*
  from public.entity_documents d
  where d.status not in ('replaced', 'rejected')
),
dedupe_slots as (
  select organization_id, entity_type, entity_id, doc_type, count(*) as live_rows
  from dedupe_live
  group by 1, 2, 3, 4
  having count(*) > 1
),
dedupe_current as (
  select distinct on (l.organization_id, l.entity_type, l.entity_id, l.doc_type)
    l.organization_id, l.entity_type, l.entity_id, l.doc_type,
    l.id as current_id, l.status as current_status,
    l.expiry_date as current_expiry, l.created_at as current_created_at
  from dedupe_live l
  join dedupe_slots s using (organization_id, entity_type, entity_id, doc_type)
  where l.expiry_date is not null
  order by l.organization_id, l.entity_type, l.entity_id, l.doc_type, l.created_at desc, l.id desc
),
dedupe_plan as (
  select
    l.organization_id, l.entity_type, l.entity_id, l.doc_type,
    l.id, l.status, l.expiry_date, l.created_at, l.storage_path,
    c.current_id, c.current_status, c.current_expiry, c.current_created_at,
    exists (
      select 1 from public.trip_documents t where t.source_entity_document_id = l.id
    ) as used_by_trip_document,
    case
      when c.current_id is null then 'keep_no_dated_copy'
      when l.id = c.current_id then 'current'
      when l.expiry_date is not distinct from c.current_expiry then 'keep_page'
      when l.expiry_date is null then 'review_undated'
      when l.created_at = c.current_created_at then 'review_same_time'
      when l.created_at > c.current_created_at then 'review_undated'
      when l.expiry_date > c.current_expiry then 'review_older_expires_later'
      when l.status = 'verified' and c.current_status <> 'verified' then 'review_verified_older'
      else 'propose_replace'
    end as decision
  from dedupe_live l
  join dedupe_slots s using (organization_id, entity_type, entity_id, doc_type)
  left join dedupe_current c using (organization_id, entity_type, entity_id, doc_type)
)
