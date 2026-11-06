---
description: MIR data analytics — query GOGOVAN trips, indents, compliance, finance, invoices from Supabase prod/preprod
---

# /mir — MIR Data Analytics

Run MIR (Management Information Report) queries against the Pulse Supabase database for GOGOVAN INDIA PVT LTD.

## Organization

- **GOGOVAN INDIA PVT LTD** org ID: `5b471ecb-fbfb-470e-95cf-525d789c761a`
- There is also a lowercase `gogovan` org (`2422b0c6-45ac-420c-acfd-27b57dd5941e`) — this is NOT the one to use unless explicitly asked.

## DB Access Rules

- **Prod** (`nafxpivddesgsrthmosv`): READ-ONLY. Always wrap in `BEGIN TRANSACTION READ ONLY; ... ROLLBACK;`. Never write.
- **Preprod** (`xbisiveavvbifbzyfhgy`): READ-ONLY for Claude. Nihas runs writes.
- Claude cannot read `.env` passwords directly (classifier blocks it). Provide SQL for the user to run, or use `supabase db query "..." --linked` if preprod is linked.
- Never put DB passwords, tokens or service keys in files, chat, commits or PRs.

---

## Complete Schema Reference

### trips (102 columns)
Primary table. Every trip belongs to one `organization_id`.

**Identifiers:**
- `id` (uuid PK), `trip_number` (text, unique display), `trip_code` (text, format `SAT812-TRP-001234`)
- `trip_operational_code` (text, format `SAT812GOGTRIP001234` — no hyphens), `display_trip_id`, `booking_ref`
- `driver_display_trip_id` — driver-facing trip ID

**Status & lifecycle:**
- `status` — known values: `pending`, `assigned`, `draft`, `confirmed`, `in_progress`, `in_transit`, `intransit`, `transit`, `picked_up`, `pickup`, `at_pickup`, `at_drop`, `loading`, `unloading`, `dispatched`, `on_route`, `going_to_pickup`, `moving`, `started`, `s_in`, `s_out`, `d_in`, `d_out`, `pod_pending`, `completed`, `delivered`, `done`, `closed`, `archived`, `cancelled`, `cancelled_by_dispatcher`, `cancelled_by_driver`, `cancelled_by_supplier`, `cancelled_by_client`
- `status_change_origin` — what triggered the last status change
- `operating_mode` — `FLEET`, `MARKET`
- `source` — `indent`, `direct`, `market`
- `execution_type` — nullable

**FKs (all nullable):**
- `indent_id` → `indents.id` (NULL if not from indent)
- `source_indent_id` → `indents.id` (mover's work row link)
- `client_id` → `clients.id`
- `supplier_id` → `suppliers.id`
- `driver_id` → `drivers.id`
- `vehicle_id` → `vehicles.id`
- `owner_vehicle_id` → `owner_vehicles.id`
- `lane_id` — route lane reference
- `source_bid_id`, `source_market_bid_id` → `market_bids.id`
- `created_by_user_id`, `assigned_by_user_id`, `owner_user_id`, `converted_by`
- `dco_payee_id` — DCO payee party

**Pricing & financials (all numeric):**
- `client_price` (default 0), `client_name` (denormalized text)
- `supplier_rate` (default 0), `supplier_rate_basis` (text: `per_trip`, `per_mt`, etc.)
- `sale_rate_basis`, `sale_unit_rate` — client-side rate structure
- `margin` — stored margin
- `driver_commission` (default 0)
- `platform_fee` (default 0), `platform_fee_calc_snapshot` (JSON)
- `advance_paid` (default 0), `amount_paid` (default 0)
- `dco_party_billed` — DCO amount billed to party

**Payment:**
- `payment_status` — `pending`, `partial`, `paid`, `overdue`
- `trip_payout_mode` — `market`, `fleet`, etc.

**Route:**
- `pickup_area` (text, required), `pickup_lat`, `pickup_lon`
- `drop_location` (text, required), `drop_lat`, `drop_lon`

**Distance (all km, nullable):**
- `distance` — planned distance
- `actual_distance_traveled_km`, `gps_distance_km`, `odometer_distance_km`
- `distance_discrepancy_km`, `distance_source`

**Odometer:**
- `start_odometer_km`, `end_odometer_km`
- `odometer_verification_state` — `none`, `pending`, `verified`, `rejected`
- `odometer_notes`, `odometer_updated_at`, `odometer_updated_by`

**Load:**
- `load_type` (text), `load_tons` (numeric)

**Compliance (on the trip row itself):**
- `compliance_decision` — `approved`, `approved_with_exception`, or NULL (no separate "declined" value — declined is when `compliance_declined_at` is set and `compliance_verified_at` is NULL)
- `compliance_decline_reason` — free text, often multi-field like `LR: ...; E-way Bill: ...; Invoice: ...; Driver Driving License: ...`
- `compliance_verified_at`, `compliance_verified_by`
- `compliance_declined_at`, `compliance_declined_by`
- `compliance_exception_reason` — reason for approved_with_exception
- `compliance_reject_return_to` — which step to return to on reject
- `compliance_resubmit_note`, `compliance_resubmitted_at`
- `compliance_outstanding_summary` (JSON)

**Finance verification:**
- `finance_verified_at`, `finance_verified_by`
- `finance_flagged_at`, `finance_flagged_by`, `finance_flag_note`

**POD (Proof of Delivery):**
- `pod_required` (boolean), `pod_received_at`
- `pod_hard_copy_courier`, `pod_hard_copy_awb_number`, `pod_hard_copy_received_by`

**Dates:**
- `created_at`, `updated_at`, `deleted_at` (soft delete)
- `pickup_date`, `started_at`, `completed_at`
- `converted_from_indent_at`
- `last_location_at`, `last_location_chat_at`
- `estimated_duration`

**Other:**
- `indent_reference_code`, `source_indent_code`
- `is_guaranteed` (boolean)
- `notes` (text, can be multiline with BISIM status history)
- `sequence_number`, `supplier_trip_sequence`
- `driver_display_name`, `vehicle_display_number` — denormalized display values

---

### indents (37 columns)
Source of trips when created via indent flow.

**Identifiers:**
- `id` (uuid PK), `indent_number`, `indent_code` (format `SAT812-IND-002625`)
- `indent_operational_code` (format `SAT812GOGIND002626`), `display_indent_id`

**Status:**
- `status` — `open`, `broadcast`, `awarded`, `completed`, `cancelled`, `closed`, `expired`
- `cancel_reason` — free text when cancelled
- `award_revoked_at` — timestamp if award was revoked

**Client & pricing:**
- `client_id` → `clients.id`, `client_name` (denormalized)
- `client_price`, `sale_rate_basis`, `sale_unit_rate`
- `supplier_target`, `supplier_rate_basis`
- `assigned_supplier_id` → `suppliers.id`, `assigned_supplier_rate`

**Route & load:**
- `pickup_area`, `drop_location`, `pickup_date`
- `vehicle_type` (text, e.g. "Open 12 Wheeler"), `weight` (tons), `load_type`
- `lane_id`, `warehouse_id`

**Other:**
- `organization_id`, `execution_plan_id`, `sales_order_id`
- `created_at`, `updated_at`, `deleted_at`, `last_saved_at`, `shared_at`
- `created_by_user_id`, `owner_user_id`
- `circulation_target` — marketplace circulation target
- `sequence_number`

---

### trip_documents (17 columns)
LR, invoice, e-way bill, POD and other documents attached to trips.

- `id` (uuid PK), `trip_id` → `trips.id`
- `document_type` — `lr`, `invoice`, `eway_bill`, `pod`, `memo`, `weight_slip`, `loading_statement`, etc.
- `document_number` — can be plain text (`AI2676`) or JSON string (`{"lrNumber":"AI2676","date":"29-Aug-26","invoice":""}`)
- `file_name`, `storage_path`, `mime_type`, `size_bytes`
- `status` — `pending`, `verified`, `rejected`
- `rejection_reason` — text
- `stop_id` → `execution_plan_stops.id`
- `uploaded_at`, `uploaded_by`, `verified_at`, `verified_by`
- `source_entity_document_id` → `entity_documents.id`
- `ocr_job_id`

**LR number extraction pattern:**
```sql
(SELECT string_agg(
  CASE
    WHEN td.document_number ~ '^\\{' THEN (td.document_number::json->>'lrNumber')
    ELSE td.document_number
  END, ', '
  ORDER BY td.document_number)
 FROM trip_documents td
 WHERE td.trip_id = t.id AND td.document_type = 'lr' AND td.document_number IS NOT NULL
) AS lr_numbers
```

---

### clients (58 columns)
Join: `trips.client_id = clients.id`

**Identity:**
- `id`, `name`, `legal_name`, `trade_name`, `client_code`, `display_id`
- `client_status`, `status`

**Tax & compliance:**
- `gstin`, `pan_number`, `cin`, `tan_number`, `msme_number`, `iec_number`

**Contact:**
- `contact_person`, `phone`, `email`, `website`
- `kam_name`, `kam_email`, `kam_phone` — Key Account Manager
- `billing_contact_name`, `billing_contact_email`, `billing_contact_phone`

**Address:**
- `address`, `billing_address`, `corporate_address`, `hq_address`, `registered_address`
- `country`, `state`

**Commercial:**
- `industry`, `commodity_types` (text[]), `operating_regions` (text[])
- `annual_revenue`, `expected_monthly_loads`, `potential_volume`, `projected_contract_revenue`
- `payment_terms_label`, `invoice_frequency_label`, `invoice_pod_policy`
- `invoice_style_template_id`
- `contact_percent`

**Other:**
- `organization_id`, `linked_organization_id`, `is_integrated`
- `owner_full_name`, `system_party_key`
- `valid_from`, `valid_to`
- `notes`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`

---

### suppliers (42 columns)
Join: `trips.supplier_id = suppliers.id`

**Identity:**
- `id`, `name`, `company_name`, `owner_full_name`
- `vendor_status` — `active`, `blacklisted`, `pending`, etc.
- `is_active` (boolean), `is_verified` (boolean)
- `supplier_type`
- `blacklist_reason`

**Tax & compliance:**
- `pan_number`, `gstin`, `gst_number`, `cin`, `tan_number`, `msme_number`, `iec_number`
- `aadhaar_number`, `gumasta_number`

**Contact:**
- `contact_person`, `contact`, `phone`, `secondary_phone`, `email`

**Commercial:**
- `address`, `primary_region`, `operating_areas` (text[]), `vehicle_types` (text[])
- `advance_percentage`

**Onboarding:**
- `onboarding_agreement_status`, `onboarding_agreement_signed_at`, `onboarding_agreement_notes`, `onboarding_agreement_storage_path`

**Other:**
- `organization_id`, `linked_organization_id`, `system_party_key`
- `status_changed_at`, `status_changed_by`
- `created_at`, `updated_at`, `deleted_at`

---

### drivers (26 columns)
Join: `trips.driver_id = drivers.id`

- `id`, `name`, `phone`, `phone_normalised`, `email`
- `driver_code`, `license_number`
- `status` — `active`, `inactive`, `left`
- `assigned_vehicle_id` → `vehicles.id`
- `commission_per_km`, `commission_percent`, `payable_amount`
- `hired_at`, `left_at`
- `emergency_name`, `emergency_contact`
- `relationship_origin`, `relationship_status`
- `tracking_only` (boolean)
- `user_id` — linked auth user
- `organization_id`, `created_at`, `updated_at`, `deleted_at`

---

### vehicles (20 columns)
Join: `trips.vehicle_id = vehicles.id`

- `id`, `vehicle_number` (e.g. `TG 12 T 4977`)
- `type` — `owned`, `attached`, `market`
- `vehicle_type` — category (e.g. `truck`, `trailer`)
- `vehicle_size` — capacity label (e.g. `41 MT`, `9 MT`)
- `vehicle_body_type` — `Flatbed`, `Container`, `Tanker`, etc.
- `vehicle_brand`, `vehicle_model`, `vehicle_axle`
- `vehicle_code`, `capacity`
- `status` — `active`, `inactive`
- `supplier_id` → `suppliers.id`
- `documents` (JSON — RC, insurance, FC metadata)
- `organization_id`, `created_at`, `updated_at`, `deleted_at`

---

### transactions (21 columns) — Finance Ledger
Join: `transactions.trip_id = trips.id`

- `id`, `organization_id`, `trip_id` (nullable)
- `amount_in`, `amount_out` — double-entry: one is always 0
- `party_name`, `description`
- `contact_id`, `contact_type` — `client`, `supplier`, `driver`
- `ledger_category` — `freight`, `advance`, `commission`, `platform_fee`, `adjustment`, etc.
- `ledger_entity_type` — `receivable`, `payable`, `expense`, `revenue`
- `ledger_flow_type` — `debit`, `credit`
- `transaction_date`, `booking_ref`, `payment_ref`, `payment_reference`
- `paid_from_account_id`
- `is_opening_balance` (boolean)
- `chat_mirror_of_transaction_id` — linked chat transaction
- `created_at`, `created_by`

---

### invoices (34 columns)
- `id`, `org_id`, `invoice_number`, `invoice_date`, `due_date`
- `client_id`, `client_name` (denormalized), `client_snapshot` (JSON)
- `status` — `draft`, `issued`, `paid`, `cancelled`, `void`
- `subtotal`, `cgst_amount`, `sgst_amount`, `igst_amount`, `total_amount`
- `gst_rate`, `tax_snapshot` (JSON)
- `trip_ids` (text[] — array of trip IDs on this invoice)
- `line_items` (JSON), `issuer_snapshot` (JSON)
- `financial_year`, `invoice_source`
- `billing_period_start`, `billing_period_end`
- `payment_terms`, `notes`
- `plan_id`, `sales_order_id`
- `pdf_storage_path`, `pod_annexure_snapshot` (JSON), `manual_plan_snapshot` (JSON)
- `issue_idempotency_key`
- `created_at`, `created_by`, `updated_at`

---

### entity_documents (19 columns)
Vehicle/driver/supplier compliance documents (RC, insurance, FC, DL, etc.)
- `id`, `entity_id`, `entity_type` — `vehicle`, `driver`, `supplier`
- `doc_type` — `rc`, `insurance`, `fc`, `dl`, `pan`, `aadhaar`, `permit`, etc.
- `doc_number`, `doc_label`
- `storage_path`, `status` — `pending`, `verified`, `rejected`
- `expiry_date`, `issued_date`, `issued_by`
- `verified_at`, `verified_by`, `replaced_by_id`
- `organization_id`, `notes`, `created_at`, `created_by`, `updated_at`

---

### entity_bank_accounts (19 columns)
Bank details for suppliers, drivers, clients.
- `id`, `entity_id`, `entity_type` — `supplier`, `driver`, `client`
- `account_number`, `ifsc_code`, `bank_name`, `branch_name`
- `beneficiary_name`, `account_type`
- `is_primary` (boolean), `cancelled_cheque_url`
- `verification_status` — `pending`, `verified`, `rejected`
- `verified_at`, `verified_by`
- `organization_id`, `created_at`, `created_by`, `updated_at`, `deleted_at`

---

### execution_plans (15 columns)
Route/load planning entity, links indents and stops.
- `id`, `plan_number`, `organization_id`
- `status`, `lifecycle_stage`, `origin`
- `planned_vehicle_type`, `constraints` (JSON), `merge_score`
- `correlation_id`, `published_at`
- `created_at`, `created_by`, `updated_at`, `deleted_at`

### execution_plan_stops (21 columns)
Individual stops in an execution plan.
- `id`, `execution_plan_id` → `execution_plans.id`
- `stop_type` — `pickup`, `drop`, `via`
- `sequence` (integer — stop order)
- `display_name`, `label`, `address_line`, `city`, `state`, `pincode`
- `latitude`, `longitude`
- `contact_name`, `contact_phone`, `notes`
- `pod_required` (boolean)
- `warehouse_id`, `source_id`, `source_type`
- `organization_id`, `created_at`

---

### market_bids (15 columns)
Marketplace bids on indents.
- `id`, `indent_id` → `indents.id`
- `bidder_user_id`, `bidder_organization_id`, `bidder_type`
- `amount`, `status` — `pending`, `accepted`, `rejected`, `withdrawn`
- `owner_vehicle_id`, `note`
- `platform_fee_amount`, `platform_fee_calc_snapshot` (JSON)
- `fee_payment_status`
- `accepted_at`, `created_at`, `updated_at`

---

### payment_requests (14 columns)
Payment request against a trip.
- `id`, `request_no`, `organization_id`, `trip_id` → `trips.id`
- `payment_type`, `currency`, `status`
- `approved_amount`, `approved_at`, `approved_by`
- `cancel_reason`, `cancelled_at`, `cancelled_by`
- `created_at`

### payment_request_transactions (3 columns)
Links payment requests to ledger transactions.
- `request_id` → `payment_requests.id`
- `transaction_id` → `transactions.id`
- `linked_at`

---

### sales_orders (24 columns)
Customer sales orders that can spawn indents.
- `id`, `order_number`, `organization_id`
- `customer_id` → `clients.id`
- `status`, `priority`, `source`
- `pickup_warehouse_id`, `drop_warehouse_id`, `execution_plan_id`
- `expected_dispatch_date`, `delivery_window_start`, `delivery_window_end`
- `subtotal`, `tax_amount`, `total_amount`
- `total_weight_kg`, `total_volume_m3`
- `currency`, `notes`
- `created_at`, `created_by`, `updated_at`, `deleted_at`

---

### client_contacts (21 columns)
- `id`, `client_id`, `organization_id`
- `name`, `mobile`, `email`, `department`, `designation`, `notes`
- Boolean role flags: `is_primary`, `is_billing`, `is_finance`, `is_operations`, `is_dispatch`, `is_procurement`, `is_decision_maker`
- `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`

### supplier_contacts (18 columns)
- `id`, `supplier_id`, `organization_id`
- `name`, `mobile`, `email`, `department`, `designation`, `notes`
- Boolean role flags: `is_primary`, `is_finance`, `is_operations`, `is_dispatch`
- `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`

---

### owner_vehicles (18 columns)
Vehicles owned by marketplace users (not org fleet).
- `id`, `owner_user_id`, `vehicle_number`
- `vehicle_type`, `vehicle_size`, `vehicle_body_type`, `vehicle_brand`, `vehicle_model`, `vehicle_axle`
- `capacity`, `fuel_type`, `status`
- `documents` (JSON)
- `created_at`, `updated_at`, `deleted_at`

---

## Relationship Map

```
sales_orders ──→ execution_plans ──→ execution_plan_stops
     │                  │
     ↓                  ↓
  indents ←─────── (execution_plan_id)
     │
     ├── market_bids (indent_id)
     │
     ↓ (indent_id)
   trips ──→ clients        (client_id)
     │   ──→ suppliers       (supplier_id)
     │   ──→ drivers         (driver_id)
     │   ──→ vehicles        (vehicle_id)
     │   ──→ owner_vehicles  (owner_vehicle_id)
     │
     ├── trip_documents      (trip_id) — LR, invoice, eway_bill, POD
     ├── transactions        (trip_id) — finance ledger entries
     ├── invoices            (trip_ids array contains trip.id)
     └── payment_requests    (trip_id)
              └── payment_request_transactions (request_id ↔ transaction_id)

entity_documents ── (entity_id + entity_type) ──→ vehicles / drivers / suppliers
entity_bank_accounts ── (entity_id + entity_type) ──→ suppliers / drivers / clients

client_contacts ──→ clients (client_id)
supplier_contacts ──→ suppliers (supplier_id)
```

---

## Common Query Patterns

### Indent-to-trip conversion count
```sql
SELECT count(DISTINCT t.indent_id) AS indents_converted
FROM trips t
WHERE t.organization_id = '5b471ecb-fbfb-470e-95cf-525d789c761a'
  AND t.indent_id IS NOT NULL
  AND t.deleted_at IS NULL
  AND t.created_at >= '<start>' AND t.created_at < '<end>';
```

### Full MIR export (all fields)
```sql
SELECT
  t.trip_number AS "Trip Number", t.trip_code AS "Trip Code",
  t.trip_operational_code AS "Operational Code", t.display_trip_id AS "Display Trip ID",
  t.booking_ref AS "Booking Ref", t.status AS "Trip Status",
  t.operating_mode AS "Operating Mode", t.source AS "Trip Source", t.execution_type AS "Execution Type",
  i.indent_number AS "Indent Number", i.indent_code AS "Indent Code",
  i.indent_operational_code AS "Indent Operational Code", i.status AS "Indent Status",
  i.vehicle_type AS "Indent Vehicle Type", i.weight AS "Indent Weight (tons)",
  i.pickup_date AS "Indent Pickup Date",
  t.created_at AS "Trip Created At", t.converted_from_indent_at AS "Converted From Indent At",
  t.pickup_date AS "Pickup Date", t.started_at AS "Started At", t.completed_at AS "Completed At",
  t.pickup_area AS "Pickup Location", t.pickup_lat AS "Pickup Lat", t.pickup_lon AS "Pickup Lon",
  t.drop_location AS "Drop Location", t.drop_lat AS "Drop Lat", t.drop_lon AS "Drop Lon",
  t.distance AS "Planned Distance (km)", t.actual_distance_traveled_km AS "Actual Distance (km)",
  t.gps_distance_km AS "GPS Distance (km)", t.odometer_distance_km AS "Odometer Distance (km)",
  t.distance_discrepancy_km AS "Distance Discrepancy (km)", t.distance_source AS "Distance Source",
  t.load_type AS "Load Type", t.load_tons AS "Load (tons)",
  t.sale_rate_basis AS "Sale Rate Basis", t.sale_unit_rate AS "Sale Unit Rate",
  c.name AS "Client Name", c.client_code AS "Client Code", c.gstin AS "Client GSTIN",
  c.pan_number AS "Client PAN", t.client_price AS "Client Price",
  s.name AS "Supplier Name", s.pan_number AS "Supplier PAN", s.gstin AS "Supplier GSTIN",
  s.gst_number AS "Supplier GST Number", t.supplier_rate AS "Supplier Rate",
  t.supplier_rate_basis AS "Supplier Rate Basis",
  t.margin AS "Margin", (t.client_price - t.supplier_rate) AS "Gross Margin (calculated)",
  d.name AS "Driver Name", d.phone AS "Driver Phone", d.license_number AS "Driver License Number",
  d.driver_code AS "Driver Code", t.driver_display_name AS "Driver Display Name",
  t.driver_commission AS "Driver Commission",
  v.vehicle_number AS "Vehicle Number", v.type AS "Vehicle Type", v.vehicle_size AS "Vehicle Size",
  v.vehicle_body_type AS "Vehicle Body Type", v.vehicle_brand AS "Vehicle Brand",
  v.vehicle_code AS "Vehicle Code", t.vehicle_display_number AS "Vehicle Display Number",
  t.payment_status AS "Payment Status", t.advance_paid AS "Advance Paid",
  t.amount_paid AS "Amount Paid", t.platform_fee AS "Platform Fee",
  t.trip_payout_mode AS "Payout Mode", t.dco_party_billed AS "DCO Party Billed",
  (SELECT string_agg(td.document_number, ', ' ORDER BY td.document_number)
   FROM trip_documents td WHERE td.trip_id = t.id AND td.document_type = 'lr'
   AND td.document_number IS NOT NULL) AS "LR Numbers",
  (SELECT count(*) FROM trip_documents td
   WHERE td.trip_id = t.id AND td.document_type = 'lr') AS "LR Count",
  t.pod_required AS "POD Required", t.pod_received_at AS "POD Received At",
  t.pod_hard_copy_courier AS "POD Courier", t.pod_hard_copy_awb_number AS "POD AWB Number",
  t.compliance_decision AS "Compliance Decision", t.compliance_verified_at AS "Compliance Verified At",
  t.compliance_declined_at AS "Compliance Declined At",
  t.compliance_decline_reason AS "Compliance Decline Reason",
  t.finance_verified_at AS "Finance Verified At", t.finance_flagged_at AS "Finance Flagged At",
  t.finance_flag_note AS "Finance Flag Note",
  t.start_odometer_km AS "Start Odometer (km)", t.end_odometer_km AS "End Odometer (km)",
  t.odometer_verification_state AS "Odometer Verification",
  t.is_guaranteed AS "Is Guaranteed", t.notes AS "Trip Notes"
FROM trips t
LEFT JOIN indents i ON i.id = t.indent_id
LEFT JOIN clients c ON c.id = t.client_id
LEFT JOIN suppliers s ON s.id = t.supplier_id
LEFT JOIN drivers d ON d.id = t.driver_id
LEFT JOIN vehicles v ON v.id = t.vehicle_id
WHERE t.organization_id = '5b471ecb-fbfb-470e-95cf-525d789c761a'
  AND t.indent_id IS NOT NULL
  AND t.created_at >= '<start>' AND t.created_at < '<end>'
  AND t.deleted_at IS NULL
ORDER BY t.created_at ASC;
```

### Compliance rejections with reasons
```sql
SELECT t.trip_code, t.trip_operational_code, t.client_name, t.compliance_decline_reason,
  (SELECT string_agg(td.document_number, ', ') FROM trip_documents td
   WHERE td.trip_id = t.id AND td.document_type = 'lr' AND td.document_number IS NOT NULL) AS lr_numbers
FROM trips t
WHERE t.organization_id = '5b471ecb-fbfb-470e-95cf-525d789c761a'
  AND t.compliance_decline_reason IS NOT NULL AND t.compliance_decline_reason != ''
  AND t.deleted_at IS NULL
ORDER BY t.created_at;
```

### Finance ledger for a trip
```sql
SELECT tx.transaction_date, tx.description, tx.party_name,
  tx.amount_in, tx.amount_out, tx.ledger_category, tx.ledger_entity_type,
  tx.contact_type, tx.payment_ref
FROM transactions tx
WHERE tx.trip_id = '<trip_id>'
  AND tx.organization_id = '5b471ecb-fbfb-470e-95cf-525d789c761a'
ORDER BY tx.transaction_date;
```

### Invoices for trips in a date range
```sql
SELECT inv.invoice_number, inv.invoice_date, inv.client_name,
  inv.subtotal, inv.igst_amount, inv.cgst_amount, inv.sgst_amount, inv.total_amount,
  inv.status, inv.gst_rate, inv.financial_year,
  array_length(inv.trip_ids, 1) AS trip_count
FROM invoices inv
WHERE inv.org_id = '5b471ecb-fbfb-470e-95cf-525d789c761a'
  AND inv.invoice_date >= '<start>' AND inv.invoice_date < '<end>'
ORDER BY inv.invoice_date;
```

### Supplier bank details check
```sql
SELECT s.name AS supplier, eba.bank_name, eba.account_number, eba.ifsc_code,
  eba.beneficiary_name, eba.verification_status, eba.is_primary
FROM entity_bank_accounts eba
JOIN suppliers s ON s.id = eba.entity_id AND eba.entity_type = 'supplier'
WHERE s.organization_id = '5b471ecb-fbfb-470e-95cf-525d789c761a'
  AND eba.deleted_at IS NULL;
```

### Vehicle document expiry check
```sql
SELECT v.vehicle_number, ed.doc_type, ed.doc_number, ed.expiry_date, ed.status
FROM entity_documents ed
JOIN vehicles v ON v.id = ed.entity_id AND ed.entity_type = 'vehicle'
WHERE v.organization_id = '5b471ecb-fbfb-470e-95cf-525d789c761a'
  AND ed.expiry_date < CURRENT_DATE
  AND ed.status != 'replaced'
ORDER BY ed.expiry_date;
```

### Driver document expiry check
```sql
SELECT d.name, d.driver_code, ed.doc_type, ed.doc_number, ed.expiry_date, ed.status
FROM entity_documents ed
JOIN drivers d ON d.id = ed.entity_id AND ed.entity_type = 'driver'
WHERE d.organization_id = '5b471ecb-fbfb-470e-95cf-525d789c761a'
  AND ed.expiry_date < CURRENT_DATE
  AND ed.status != 'replaced'
ORDER BY ed.expiry_date;
```

---

## Output Rules

- Always wrap prod queries in `BEGIN TRANSACTION READ ONLY; ... ROLLBACK;`
- When exporting to Excel: use openpyxl, save to `MIR/` folder
  - Sheet 1: Executive Summary (totals, breakdowns by status/client/supplier/vehicle, financials)
  - Sheet 2: MIR Data (all rows with filters, frozen header)
- LR numbers: extract from JSON format (`lrNumber` key), comma-separate (never range-group)
- Money columns: format `#,##0.00`
- Clean `null` strings to empty
- Always filter `deleted_at IS NULL`
- Date filters: `created_at >= '<start>' AND created_at < '<end>'` (exclusive end)
- Org filter: always `organization_id = '5b471ecb-fbfb-470e-95cf-525d789c761a'` unless told otherwise

---

## CSV → Excel Processing

When user provides a Supabase CSV export (typically named `Supabase Snippet Untitled query (N).csv`):

1. **Move** the CSV into `MIR/` folder first
2. **Process** using the reusable script at `/private/tmp/claude-502/-Users-nihas-Desktop-Pulse-app/ea6caed2-2f14-4d60-bbea-32bd936bf914/scratchpad/mir_excel.py`
   - If the script doesn't exist (new session), recreate it with the same logic below
3. **Run**: `python3 <script> "MIR/<csv_file>" "MIR/GOGOVAN_MIR_<date_range>.xlsx"`
4. **Output naming**: `GOGOVAN_MIR_<StartDate>-<EndDate>_2026.xlsx`

### CSV quirks to handle
- **Multiline rows**: the `notes` column contains BISIM status history with newlines — use `csv.DictReader` which handles quoted multiline fields correctly
- **LR Numbers column**: values can be JSON (`{"lrNumber":"AI2676","date":"...","invoice":""}`) or plain text (`AI2676`) or comma-separated mix — extract `lrNumber` from JSON, keep plain text as-is
- **`null` strings**: CSV exports `null` as literal text — clean to empty
- **87 columns** in the standard MIR export

### Excel generation logic (openpyxl)
```
Sheet 1 — "Executive Summary" (first position):
  - Title: "MIR Report — GOGOVAN INDIA PVT LTD"
  - Subtitle: period + scope
  - Sections (with blue headers, alternating highlight rows):
    1. OVERVIEW: total trips, total load (tons), LR coverage, POD coverage
    2. FINANCIALS: total client revenue, supplier cost, gross margin, avg margin %,
       advance paid, amount paid, platform fee, driver commission
    3. TRIP STATUS BREAKDOWN: count per status
    4. PAYMENT STATUS: count per payment_status
    5. COMPLIANCE DECISION: count per compliance_decision
    6. OPERATING MODE: count per operating_mode
    7. TOP CLIENTS: by trip count (top 10)
    8. TOP SUPPLIERS: by trip count (top 10)
    9. VEHICLE TYPES: count per vehicle type

Sheet 2 — "MIR Data":
  - All rows, all 87 columns
  - Header: dark blue fill (#1F4E79), white bold text, centered, wrap
  - Data: Calibri 10, light border
  - Money columns formatted #,##0.00: Client Price, Supplier Rate, Margin,
    Gross Margin, Driver Commission, Advance Paid, Amount Paid, Platform Fee,
    DCO Party Billed, Sale Unit Rate
  - Number columns formatted #,##0.00: all distance/weight/odometer/LR Count
  - Auto-filter on full range, frozen header row (A2)
  - Column widths: auto-fit capped at 32
```

### If script is missing, recreate with:
- `import csv, openpyxl` (openpyxl installed at `~/Library/Python/3.9/lib/python/`)
- Run with `python3` (not `python3 -I` — user-site packages needed)
- Input: `sys.argv[1]` = CSV path, `sys.argv[2]` = output Excel path
- Parse CSV with `csv.DictReader` (handles multiline)
- LR cleaning: `re.findall(r'"lrNumber"\s*:\s*"([^"]*)"', raw)` to extract from JSON
- `safe_float(v)`: try float, default 0.0
- Counter-based breakdowns for summary stats

---

## What to do when triggered

1. Infer or ask: date range, scope (full MIR / compliance / finance / single trip / custom)
2. Generate + provide SQL (user runs on prod)
3. When user drops a CSV or says "process" / "convert" / "make excel":
   - Move CSV to `MIR/` if not already there
   - Run the processing script
   - Report: row count, output file path
4. For Excel: always Executive Summary + Data sheet, auto-filter, frozen headers
5. For extracts (subset of trips): filter from existing Excel or query fresh
