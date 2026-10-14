-- Rollback of the schema introduced by reissued migrations 20270925195000
-- through 20270929203000 (nihas/V1 merge + pre-existing vendor-onboarding
-- migrations), at the user's explicit request after the merged code caused
-- problems in production. Reverts back to the schema shape at remote tip
-- 20270925194500.
--
-- Data-preservation note: 3 real trip_documents rows already exist with
-- document_type = 'other' (trip_documents_id 85b86897-15d8-4d5b-bede-55b414776394,
-- 6c3aec7f-8e14-4ac2-94d6-9738e2bd70f5 on TRP025, cc1b6c80-0f3e-4014-82ad-448926f4598f
-- on TRP053) — created during the brief window this was live. These rows are
-- NOT deleted or altered; the reverted document_type constraint is added
-- NOT VALID so it does not retroactively fail on them, while still blocking
-- new 'other'/'memo' inserts going forward. All other new columns/tables
-- introduced by this batch have zero rows (checked before writing this).

set local lock_timeout = '5s';

-- ── 1. trip_compliance_decline (20270929162901) ─────────────────────────────

drop trigger if exists trg_guard_trip_compliance_decline_columns on public.trips;
drop function if exists public.guard_trip_compliance_decline_columns();

drop function if exists public.decline_trip_compliance(uuid, text, text);

alter table public.trips
  drop constraint if exists trips_compliance_decline_reason_length_check;

alter table public.trips
  drop column if exists compliance_declined_at,
  drop column if exists compliance_declined_by,
  drop column if exists compliance_decline_reason;

-- ── 2. trip_documents_lr_pod_batch_rpc (20270925220000, superseded by 20270929194800) ──

drop function if exists public.get_trip_documents_lr_pod_batch(uuid[]);
drop index if exists public.idx_trip_documents_trip_id_document_type;

-- ── 3. log_trip_hard_copy_pod_courier (20270925221500) ──────────────────────

drop function if exists public.log_trip_hard_copy_pod_courier(uuid, text, text, date, date, text, text);

-- ── 4. trip_documents document_type: revert to pre-merge catalog (20270925223000, 20270929203000) ──
-- NOT VALID: the 3 real 'other' rows above stay exactly as they are; new
-- inserts of 'memo'/'other' are blocked going forward, matching pre-merge behavior.

alter table public.trip_documents drop constraint if exists trip_documents_document_type_check;
alter table public.trip_documents add constraint trip_documents_document_type_check
  check (document_type in (
    'manifest',
    'pod',
    'soft_pod',
    'pod_soft',
    'invoice',
    'eway_bill',
    'loading_slip',
    'odometer_start_photo',
    'odometer_end_photo',
    'fuel_bill_photo',
    'toll_receipt_photo',
    'trip_expense_receipt_photo',
    'maintenance_invoice_photo',
    'lr',
    'insurance',
    'rc'
  )) not valid;

-- ── 5. client_contract_validity (20270928114500) ────────────────────────────

alter table public.clients
  drop constraint if exists clients_valid_range_check;

alter table public.clients
  drop column if exists valid_from,
  drop column if exists valid_to;

-- ── 6. vendor_onboarding_pack + vendor_contact_and_gumasta (20270925195000, 20270925195500) ──

drop trigger if exists trg_trips_block_blacklisted_supplier on public.trips;
drop function if exists public.tg_trips_block_blacklisted_supplier();

drop table if exists public.supplier_tds_rates;

alter table public.suppliers
  drop constraint if exists suppliers_vendor_status_check,
  drop constraint if exists suppliers_advance_percentage_check,
  drop constraint if exists suppliers_blacklist_reason_check;

alter table public.suppliers
  drop column if exists vendor_status,
  drop column if exists blacklist_reason,
  drop column if exists status_changed_at,
  drop column if exists status_changed_by,
  drop column if exists advance_percentage,
  drop column if exists aadhaar_number,
  drop column if exists secondary_phone,
  drop column if exists gumasta_number;

alter table public.supplier_kyc_documents
  drop column if exists doc_number;
