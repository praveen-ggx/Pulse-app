# Pulse Exchange Transaction Layer — architecture audit and design

**Status:** Design only. Nothing in this document is implemented. No code, SQL,
migration, schema, test, or production change was made to produce it.
Product decisions were frozen on 2026-10-06 (section 13). Implementation is
**not authorized**. The next step is the Phase 0 read-only verification (section 12).

**Evidence base:** repository migrations and services on `V1.0.1` (HEAD
`71c924bc`), plus the live definitions of `award_market_bid`,
`create_market_trip_after_fee_payment` and `accept_driver_direct_bid` captured
read-only on 2026-10-06 08:09. No production queries were run for this audit
(the database is on degraded Nano compute). Every claim about production data
behaviour below is therefore **code-derived** and marked for read-only
verification once the database is stable.

**Product decision this design implements:** Marketplace transactions are not
forced into the party-based Finance ledger. Pulse Exchange owns a trip-level
commercial transaction (obligation, fee, payment workflow, dispute, settlement,
audit). Actual cash movements still post to Finance through
`createLedgerEntry()`. There is no second cash ledger.

---

## 1. Architecture map (what exists today)

```
indents (circulation_target marketplace|both)
  │
  ├── market_bids ............ Marketplace bids (bidder_type dco | organization)
  │     status: pending → accepted | rejected | withdrawn | superseded
  │     fee_payment_status: not_required | required | pending | paid | failed | expired
  │     platform_fee_amount, platform_fee_calc_snapshot   (locked at award)
  │
  ├── driver_direct_bids ..... Reach/post bids by drivers (accept_driver_direct_bid)
  ├── direct_quotes .......... Network quotes (award_direct_quote)
  │
  ├── award_market_bid(bid) .. accept + lock fee + reject others + indent 'awarded'
  │                            org bidder: indents.assigned_supplier_id = bidder org
  │
  ├── marketplace_fee_configs / _components ... fee engine (calculate_marketplace_platform_fee)
  ├── marketplace_fee_payments ................ fee collection (Razorpay | 'cash')
  │     initiate_marketplace_fee_payment_order → razorpay-webhook → confirm_marketplace_fee_payment
  │     settle_marketplace_fee_as_cash[_for_indent]
  │
  ├── identity reveal ........ list_market_bids_for_indent / list_my_org_market_bids:
  │                            bidder_phone non-NULL only when accepted AND fee paid|not_required
  │
  └── trip creation (fee-gated)
        DCO bidder ......... create_market_trip_after_fee_payment(bid)
                             trips.source='market_bid', operating_mode='DCO', dco_payee_id,
                             client_price = supplier_rate = bid.amount, platform_fee
        Org bidder ......... create_trip_from_assigned_indent(indent, driver, vehicle)
                             trips.source='market_bid', supplier_id=NULL,
                             trip_payout_mode='asset', client_price = supplier_rate = bid.amount

Finance (party ledger, org-scoped)
  transactions(organization_id, trip_id, contact_type client|supplier|driver|dco, contact_id,
               amount_in/out, ledger_category, ledger_entity_type, ledger_flow_type,
               payment_ref, payment_reference (UTR), description-encoded mode/ref)
  createLedgerEntry() / updateLedgerEntry()  ← canonical writers
  accountingModel.ts ← double-entry interpretation (dco_payment → DCO_PAYABLE / CASH_BANK)

Trip-level finance: trip_finance_adjustments (org-scoped, revenue|cost, plus|minus)
Audit / timeline:   trip_operational_timeline_events (org-scoped), trip_assignment_audit,
                    trip_status_audit, trip_workflow_events, event_store, activity_stream,
                    LedgerAuditLogFeed (Finance audit UI)
Disputes:           public.dispute (org↔org, keyed on transaction_id) — no app code uses it
```

## 2. Reusable objects (extend, do not duplicate)

| Existing object | Reuse in Exchange as | Notes |
|---|---|---|
| `market_bids` | Source of the agreed amount and bidder identity | The Exchange transaction references it 1:1; bids stay the negotiation record. |
| `market_bids.platform_fee_amount` + `platform_fee_calc_snapshot` | The Exchange fee component | Already locked at award and "never recomputed". Copy into the Exchange row at creation; don't recompute. |
| `marketplace_fee_configs` / `_components` / `calculate_marketplace_platform_fee` | Fee engine | Unchanged. |
| `marketplace_fee_payments` + Razorpay order/webhook + cash settle | **The fee collection rail** | Do not build a second fee-payment table. Exchange reads its status. |
| `trips.source='market_bid'`, `source_market_bid_id` | Anchor from trip to Exchange | Already there for both bidder types. |
| `dco_payees` + `trips.dco_payee_id` | DCO payee identity | Matches the receivables payee invariant (award-established). |
| `transactions.payment_reference` | Ledger copy of the UTR | Already the compliance UTR column; reuse the same convention. |
| `transactions.ledger_category` / `ledger_entity_type` / `ledger_flow_type` | Exchange cash-movement categories | Add categories, not a new ledger. |
| `createLedgerEntry()` / `updateLedgerEntry()` | Only writer for Exchange cash movements | Same rule as compliance payments. |
| Compliance payment pattern (`tripComplianceWrite.service.ts`) | Template for trip-scoped payment writes | Unique index → 23505 = "already posted"; server prerequisites enforced by policy; UTR edits via `updateLedgerEntry`. |
| `tripDocuments.service.uploadTripDocument` / trip documents vault | Payment proof and dispute evidence storage | No new upload pipeline. |
| `allocateAmountsToLargestDueTrips` | Allocation of an unallocated (on-account) bidder receipt | Already approved in the receivables design. |
| `FinanceTableHeader`, `LedgerPaymentDetailTable`, `LedgerAuditLogFeed`, `LedgerTransactionPreviewModal` | Exchange Transactions table, payment history, activity feed | Same visual language as Finance. |
| `useCapabilities()` finance capability | Who may initiate or confirm | No new role strings. |

**Do not reuse:** `public.dispute`. It is org↔org only (cannot represent an
individual DCO), is keyed on a single `transaction_id` rather than a payment
claim, and has no application code. Leave it dormant; Exchange disputes need
their own shape (section 6).

## 3. Flow as implemented today (pool → settlement)

| Step | Implemented? | Where |
|---|---|---|
| Pool / publish | Yes | `indents.circulation_target`, `list_open_marketplace_loads_*`, `market_indents_for_org` |
| Bid | Yes | `submit_market_bid` (unique per indent+bidder) |
| Acceptance | Yes | `award_market_bid` — locks fee, rejects other bids, supersedes the DCO's other pending bids |
| Terms accepted | **No** | No bidder-side terms acceptance exists. Fee payment acts as implicit acceptance. |
| Marketplace fee | Yes | Razorpay (`confirm_marketplace_fee_payment`) or `settle_marketplace_fee_as_cash` |
| Identity release | **Implicit only** | Derived from `status='accepted' AND fee_payment_status IN ('paid','not_required')` inside two read RPCs. No timestamp, actor, or event. `MARKETPLACE_DOMAIN.md` §Contact visibility still says "award alone unlocks", which is stale vs migration `20270309030000`. |
| Trip | Yes | Two different creators by bidder type (section 1) |
| Shipper payment initiation | **Partial, one-sided** | DCO: shipper can post `contact_type='dco'` via `LedgerSyncScreen` (party context `dco`). Org bidder: there is **no counterparty to post against** (`supplier_id` is NULL by design; `createLedgerEntry` rejects a typed contact without an id). |
| Bidder confirmation / dispute | **No** | Nothing exists. |
| Settlement | **No** | Only `trips.payment_status`/`amount_paid` columns, initialised to `pending`/0 and not driven by any Exchange logic. |

## 4. Gaps and defects found

**Structural gaps (the reason Exchange is needed):**

1. **No bilateral object.** Every Finance row is owned by one organization, so
   the shipper's payable and the bidder's earning are two unrelated rows (or,
   for an individual DCO, there is no bidder-side row at all).
2. **Org-bidder Marketplace trips have no Finance counterparty.** This is
   intentional (ADR-012: awarding must not create a Network connection), but it
   means the shipper cannot record what it pays today without inventing a party.
3. **No confirmation, dispute, or settlement state.**
4. **Identity release isn't auditable.** It's a predicate, not a state.
5. **No bidder-side terms acceptance.**
6. **Timelines are single-organization.** `trip_operational_timeline_events`
   is `organization_id`-scoped. Neither the bidder organization nor an
   individual DCO can read the shipper's timeline.

**Probable defects (code-derived; verify read-only once the DB is stable):**

7. **Org-bidder Marketplace trips are labeled `trip_payout_mode='asset'`.**
   `create_trip_from_assigned_indent` sets `'market'` only when `supplier_id`
   is set, and Marketplace awards deliberately null it. This is the
   "YOUR FLEET" mislabel class seen on TRP065.
8. **`client_price` is overwritten with the bid amount** on org-bidder
   Marketplace trips. The shipper's own customer price (`indents.client_price`)
   is the lower-priority fallback, so the shipper's margin is lost on the trip.
9. **Completion auto-entries post three wrong rows into the shipper's ledger**
   for org-bidder Marketplace trips. Because of (7), `ensureAssetCompletionAutoEntries`
   (`trips.service.ts:2939`) treats them as asset trips and inserts:
   - `TRIP_REVENUE` for `client_price`, which is the bid amount because of (8);
   - `DRIVER_COMMISSION` payable to `trips.driver_id`, a driver who belongs to
     the **bidder** organization;
   - `MARKETPLACE_PLATFORM_FEE` as a **shipper** expense, although the bidder
     pays the fee.

   It only succeeds when a shipper-org member completes the trip. A bidder-org
   user's insert would be rejected by RLS and only `console.error`'d.
10. **Fee ledger posting is inconsistent across the three paths:**

    | Fee path | Ledger row written |
    |---|---|
    | Razorpay | None |
    | Cash-settle | Bidder organization (org bidders only) |
    | Completion (trips labeled `asset`) | Shipper organization |

    The "Marketplace DCO trips only" fee branch in that completion function
    is dead for DCO trips, because `isDcoOperatingTrip` returns early.
11. **Known A8.6.2 gap:** `is_driver_available()` cannot see an
    accepted-but-unpaid award, so a DCO can be awarded twice while one award
    is fee-pending.

Items 7–10 are prerequisites for Exchange (Phase 0 in section 12). Exchange
cannot report a correct payable while the shipper's books carry these rows.

## 5. State machine

One Exchange transaction per accepted `market_bids` row.

```
                 award_market_bid
                        │
                        ▼
                  ┌────────────┐  bidder declines terms / shipper revokes award
                  │  AWARDED   │──────────────────────────────────────┐
                  └─────┬──────┘                                      │
       bidder accepts   │                                             │
       terms            ▼                                             │
                  ┌──────────────┐  fee required                      │
                  │ TERMS_ACCEPTED│─────────────┐                      │
                  └─────┬────────┘              ▼                      │
                        │ fee not_required ┌─────────────┐            │
                        │                  │ FEE_PENDING │──expired──▶│
                        │                  └─────┬───────┘            │
                        │                        │ fee paid           │
                        ▼                        ▼                    ▼
                  ┌────────────────────┐                        ┌───────────┐
                  │ IDENTITY_RELEASED  │  (explicit, audited)   │ CANCELLED │
                  └─────┬──────────────┘                        └───────────┘
                        │ trip created (trip_id set)                  ▲
                        ▼                                             │
                  ┌────────────┐  trip cancelled / reassigned (payee  │
                  │   ACTIVE   │  invariant: never carried forward) ──┘
                  └─────┬──────┘
                        │ trip completed
                        ▼
                  ┌────────────┐◀──────────────────────────────┐
                  │  PAYABLE   │ outstanding > 0               │
                  └─────┬──────┘                               │
                        │ confirmed payments ≥ obligation      │ adjustment raises obligation
                        ▼                                      │
                  ┌────────────┐───────────────────────────────┘
                  │  SETTLED   │
                  └────────────┘
```

**Payment claim sub-machine** (many per transaction):

```
INITIATED ──bidder confirms──▶ CONFIRMED
    │
    ├──bidder disputes──▶ DISPUTED ──resolution──▶ CONFIRMED | REJECTED | AMENDED(→ CONFIRMED at corrected amount)
    │
    └──shipper withdraws (only while INITIATED)──▶ WITHDRAWN
```

Rules:
- **Outstanding** = current obligation − Σ CONFIRMED. **Pending confirmation** =
  Σ INITIATED + Σ DISPUTED, shown separately and never netted from outstanding.
- Payments may be initiated from ACTIVE onward (advances allowed). Outstanding
  is shown as "Upcoming" until completion, consistent with the approved
  receivables rule (completed-only Outstanding).
- SETTLED is derived and reversible. A later obligation adjustment re-opens
  PAYABLE. It is never set manually.
- **Terms acceptance is explicit and separate from the fee.** Fee payment
  never implies TERMS_ACCEPTED. Fee and terms may complete in either order,
  but identity release requires both: terms accepted, and fee paid or not
  required.
- **No auto-confirm.** An unanswered INITIATED claim stays pending until the
  bidder confirms or Exchange operations resolve it. Elapsed time never moves
  a claim to CONFIRMED. A confirmation SLA (e.g. 48h) only raises a
  `confirmation_overdue` flag and an ops escalation event. The status itself
  does not change.

## 6. Data model (design only — no SQL)

### `exchange_transactions` — the single commercial object

| Column | Meaning |
|---|---|
| `id`, `exchange_ref` | Display ref, e.g. `EXC-…`, from the existing operational-identity sequence pattern |
| `market_bid_id` | **Unique, unconditionally** (cancelled rows included). One Exchange transaction per award, ever |
| `indent_id`, `trip_id` | `trip_id` is **unique when set**; set by trip creation. At most one non-cancelled Exchange transaction per `indent_id` (partial unique) |
| `shipper_org_id` | Indent owner |
| `bidder_type`, `bidder_user_id`, `bidder_org_id`, `dco_payee_id` | Copied from the bid/award; shape check mirrors `market_bids_bidder_shape` |
| `agreed_amount` | Locked from `market_bids.amount`. **Immutable**: never updated. All changes are adjustment rows |
| `platform_fee_amount`, `fee_calc_snapshot` | Copied from the bid; never recomputed |
| `fee_bearer`, `fee_collection_mode` | Today: `bidder` / `prepaid` (the fee is collected separately, not deducted from the payable) |
| `status` | Section 5 |
| `terms_version`, `terms_snapshot`, `terms_accepted_at`, `terms_accepted_by` | Frozen commercial terms (snapshot law in `MARKETPLACE_DOMAIN.md`) |
| `identity_released_at`, `identity_release_basis` | Basis: `fee_paid`, `fee_not_required`, or `admin` |
| `cancelled_at`, `cancel_reason`, `settled_at` | |
| `version` | Optimistic concurrency for every transition |
| `created_at`, `updated_at` | |

**Derived, not stored:** current obligation (immutable `agreed_amount` ± accepted
adjustments), confirmed paid, pending confirmation, outstanding, and the
bidder's net economic earning (bidder-only view).

Terms acceptance record: `accepted_by`, `accepted_at`, `terms_version`,
`exchange_transaction_id`. A short one-tap acceptance ("I agree to the payment,
dispute, cancellation and settlement terms for this transaction"), not a
long legal flow.

> **₹32,500 / ₹500 example (frozen).** There are two independent cash flows:
> shipper → bidder ₹32,500, and bidder → Pulse ₹500. There is **no ₹32,000
> payment**.
>
> | View | Shows |
> |---|---|
> | Shipper | Payable ₹32,500 only; the fee isn't the shipper's concern |
> | Bidder | Gross earning ₹32,500 · Marketplace fee ₹500 (paid separately) · Net economic earning ₹32,000 |
>
> The net figure is never shown as a settlement amount, and never to the shipper.

### `exchange_obligation_adjustments`

| Column | Meaning |
|---|---|
| `exchange_transaction_id`, `amount`, `impact` (plus/minus), `reason`, `evidence_document_ids` | |
| `initiated_by_side`, `initiated_by`, `created_at`, `status` (proposed/accepted/rejected/voided), `decided_by`, `decided_at` | |

Append-only: an adjustment row is never edited. Corrections are new rows or a
`voided` decision. **Phase 1 (decided):** the current obligation uses the
approved shipper-side `adjustedCost` formula, reading `trip_finance_adjustments`
(type `cost`, not voided). **Phase 2 (decided):** any change to the settlement
obligation requires the counterparty's acceptance through this table.

### `exchange_payments` — a shipper's payment claim

| Column | Meaning |
|---|---|
| `exchange_transaction_id`, `amount`, `method` (bank_transfer, upi, cheque, cash, other), `utr`, `paid_on`, `proof_document_id` | |
| `status` | Section 5 sub-machine |
| `initiated_by`, `confirmed_by`, `confirmed_at`, `withdrawn_at` | |
| `idempotency_key` | **Unique**, client-generated per submit |
| `shipper_ledger_transaction_id` | Unique; **set only on CONFIRMED** (the shipper's `transactions` row) |
| `bidder_ledger_transaction_id` | Unique; set only on CONFIRMED; nullable (individual DCOs have no organization ledger) |
| `confirmation_due_at`, `confirmation_overdue` | SLA flag only; never changes `status` |

Uniqueness: one live claim per (`exchange_transaction_id`, normalized `utr`)
when a UTR is present.

### `exchange_disputes`

| Column | Meaning |
|---|---|
| `exchange_transaction_id`, `exchange_payment_id` (nullable: a dispute can be about the obligation itself) | |
| `raised_by_side`, `raised_by`, `reason_code` (not_received, amount_mismatch, wrong_utr, obligation_disagreement, other), `description`, `evidence_document_ids` | |
| `status` (open, under_review, resolved, withdrawn), `resolution` (confirmed, rejected, amended), `resolved_amount`, `resolution_note`, `resolved_by`, `resolved_at` | |

### `exchange_events` — append-only audit and activity source

| Column | Meaning |
|---|---|
| `exchange_transaction_id`, `event_type`, `actor_user_id`, `actor_side` (shipper, bidder, platform, system), `from_status`, `to_status`, `payload`, `created_at` | |

Insert only through the transition functions; no update or delete grants.
Event types include: `awarded`, `terms_accepted`, `fee_required`, `fee_paid`,
`identity_released`, `trip_linked`, `payment_initiated`, `payment_confirmed`,
`payment_disputed`, `dispute_resolved`, `adjustment_proposed`/`decided`,
`settled`, `reopened`, `cancelled`.

**Projection:** a shipper-side copy of key events into
`trip_operational_timeline_events` (`source_type='exchange'`,
`source_id = exchange event id`) so the existing trip timeline shows them. The
Exchange section itself reads `exchange_events` through a participant-scoped
read function, because the bidder can't read the shipper's timeline.

## 7. Finance boundary

**Exchange owns:** the obligation, fee component, payment claims,
confirmations, disputes, settlement state, and their audit trail.

**Finance owns:** cash. `transactions` means actual cash movement. A payment
**claim** is not cash, so nothing posts to Finance until the bidder confirms
(decision 1). Exchange writes cash movements only through `createLedgerEntry()`,
and only these:

| Moment | Organization ledger | Row |
|---|---|---|
| Shipper initiates a claim | **None** | Exchange only: `exchange_payments` INITIATED + event |
| Bidder disputes, or claim is unanswered | **None** | Exchange only. No cash is settled; no reversal is needed because nothing was posted |
| Bidder confirms | Shipper org | `amount_out`, `ledger_category='EXCHANGE_PAYMENT'`, `ledger_flow_type='payable'`, `payment_reference = utr`, `payment_ref = 'EXP-<exchange_payment_id>'`, `trip_id`, `transaction_date = paid_on`. Contact: the shipper's **Pulse Exchange supplier** for org and Marketplace DCO bidders |
| Bidder confirms (organization bidder) | Bidder org, same database transaction | `amount_in`, `ledger_category='EXCHANGE_RECEIPT'`, `payment_ref = 'EXR-<id>'`, same UTR and date. Contact: the bidder's **Pulse Exchange customer** |
| Bidder confirms (individual DCO) | None on the bidder side | The Driver App reads the same `exchange_payments` rows directly |
| Dispute resolved `confirmed` / `amended` | As "Bidder confirms", at the resolved amount | Posted once, at resolution |
| Dispute resolved `rejected` | None | Claim closes; nothing to reverse |
| Platform fee paid (Razorpay or cash) | Bidder org (org bidders) | `MARKETPLACE_PLATFORM_FEE` expense, keyed by `payment_ref = market_bid_id` (the existing cash-path key), applied to Razorpay as well. Never on the shipper |

Because confirmation is a bidder action that writes into the **shipper's**
ledger, the ledger post must run server-side, in the confirmation function,
as one database transaction with the status change. It can't be a client-side
`createLedgerEntry()` call from the bidder's session (wrong organization; RLS
would reject it). The service layer still goes through the canonical path for
the shipper's own reads and edits. The server-side writer must produce rows
identical in shape to `createLedgerEntry()` output (description encoding,
`payment_reference`, categories), with a parity test.

### Pulse Exchange party (implemented locally, 2026-10-06, migration `20271006144616`)

Superseding "no contact" above: every organization gets one protected system
party, **Pulse Exchange**, seeded as a supplier row (`supplier_type='marketplace'`)
and a customer row, both marked `system_party_key='pulse_exchange'`. Exchange
rows then reuse the party ledgers unchanged, and `accountingModel.ts` needs no
new categories: the shipper row reads as `supplier_payment` (Dr AP · Cr Cash),
the bidder row as `customer_payment` (Dr Cash · Cr AR). Both show in Cash.

- **Shipper side.** A Marketplace trip's `supplier_id` is the shipper's own
  Pulse Exchange supplier; the real payee stays on `indents.assigned_supplier_id`.
  The supplier balance is the trip's `supplier_rate` minus confirmed payments.
- **Bidder side.** When the bidder runs its own driver, its `mover_asset`
  execution trip bills its Pulse Exchange customer (`client_id`, name
  "Pulse Exchange") at the agreed rate. Network awards keep the old
  shipper-name billing. Without an execution trip, `get_customer_ledger_inputs`
  adds the won trip under the Pulse Exchange customer (`is_exchange = true`);
  with one, the execution trip is the receivable and the extra row is skipped.
  The bidder's `EXCHANGE_RECEIPT` posts on the execution trip, and
  `get_mover_asset_client_paid` returns confirmed receipts for those trips.
  Exchange accepts either trip id (claims and summaries resolve to the
  shipper's trip).
- **Counterparty rule.** Pulse Exchange is the Finance counterparty on both
  sides, like DCO. The shipper and bidder are Exchange participants only;
  neither is created or billed as a Finance party for a Marketplace trip.
- **Platform fee.** A trigger on `marketplace_fee_payments` posts
  `MARKETPLACE_PLATFORM_FEE` to the bidder's Pulse Exchange supplier once paid
  (Razorpay or cash), keyed by `payment_ref = market_bid_id`. Unpaid fees on
  accepted bids show as `exchange_fee_due` on that supplier.
- **Both entry points, one record.** Recording a payment from Finance against
  the Pulse Exchange party (with the trip) creates the same `exchange_payments`
  claim as the Exchange panel on Trip Finance. Nothing posts until the other
  side confirms. Direct `transactions` writes against the party are refused by
  a trigger (`exchange_ledger_locked`).
- **Guards.** The party can't be deleted, renamed, deactivated, or created by
  users. A trip may use the Pulse Exchange supplier only for `market_bid` /
  `direct_quote` trips with an indent.
- **Fixed alongside.** `sync_trip_payment_status` counted the partner's client
  receipts into the shipper's `amount_paid`; it now counts only the trip owner's
  rows. Five existing trips (6 rows, ₹2,51,097) still need a recompute.
- **Marketplace DCO bidders.** One Exchange obligation, two surfaces. A
  Marketplace-awarded DCO trip (`source='market_bid'`, `operating_mode='DCO'`)
  now carries the shipper's Pulse Exchange supplier, so it leaves the DCO lane
  (`get_dco_ledger_aggregation` skips it; direct `contact_type='dco'` rows on it
  are refused). `exchange_payments.payee_dco_payee_id` names the DCO as payee;
  the DCO (`dco_payees.user_id = auth.uid()`) can claim, confirm, reject, and
  read the same rows and `get_exchange_trip_summary` (`payee_kind='dco'`) from
  `TripDetailSettlementPanel`. Confirmation posts one Finance row, the
  shipper's `EXCHANGE_PAYMENT`; there is no payee ledger. `trips.amount_paid`
  stays the shipper's customer receipts (the trip is the shipper's); the DCO's
  received amount is the confirmed Exchange total. `trips_dco_consistency_check`
  is widened (`NOT VALID`) to allow a supplier on `market_bid` DCO trips.
  Exchange reads and RLS use `is_org_staff`, so a DCO's tracking-only
  membership in the shipper org doesn't expose the shipper's other payments.
  Reach direct-bid DCO trips stay on the DCO lane.
- **Not in scope (held).** Historical data is not re-pointed (including
  TRP037, the one existing Marketplace DCO trip, ₹36,500, supplier NULL). Read-only dry-run census (2026-10-06, corrected classifier;
  `scripts/sql/_tmp_px_dryrun_populations.sql`):
  - 373 execution trips: 371 are Network awards (shipper-name billing is
    correct), 1 is a Marketplace award (`22222d50…`, no Finance rows), 1 has no
    indent. The earlier "348 / 3 with receipts" counted Network awards on
    'both' indents as Marketplace (defect 12).
  - The "66 trips on a real bidder supplier" are all Network awards by an
    approved supplier: 0 to re-point.
  - 9 supplier-less `market_bid` trips (3 orgs) are true Marketplace awards
    (`scripts/sql/_tmp_px_nine_trip_finance_rows.sql`): 3 organization bids
    (TRP-141, TRP-147, SAT812-TRP-191), TRP037 (DCO bid, `DCO` mode), and 5
    DCO bids stored as `FLEET`/`asset` with no `dco_payee_id` (TRP-135, 137,
    139, 145, GOD684-TRP-033). Those 5 can't be Exchange obligations without
    converting the trip to DCO mode. Both Finance rows are on TRP-135: the
    shipper's cash payment to the DCO's driver contact (₹35,000, the full bid)
    and the shipper's own customer receipt (₹35,000, in `amount_paid`).
    Neither is rewritten.
  - Repair decision (2026-10-06): only SAT812-TRP-191 + DEV766-TRP-003 (the
    one real Marketplace award with an execution trip). The first draft
    (`20271006163527`, pointed the trips at the Pulse Exchange parties) was
    never applied and has been deleted; it is replaced by
    `20271006182730_pulse_exchange_repair_sat812_trp191.sql` (linked party
    rows, release set `pulse-exchange-repair-trp191`). TRP-141 / TRP-147 (QA
    fixtures), GOD684-TRP-037 (test-style), and the 5 legacy DCO/FLEET trips
    stay as they are.
  - 285 defect-12 trips (1 org, 0 Finance rows; 282 indents also have a
    Network execution trip, 0 Finance rows there).
  - 5 trips for the `amount_paid` recompute: 6 partner rows, ₹2,51,097, all
    from the trip's own supplier org; each recomputes to 0 / pending. No notifications for pending confirmations
  yet (claims older than 72h show "overdue" in the panel). Confirmed rows
  cannot be corrected yet.

For Reach direct-bid DCO trips, the existing `dco_payment` interpretation
(`DCO_PAYABLE` / `CASH_BANK`) is kept.

Consequence to surface in the UI: until confirmation, the shipper's Finance
cash book doesn't show the claimed payment. Exchange shows it as "Pending
confirmation", so the shipper sees it in Exchange, not in Finance.

**Stays outside Exchange:** the shipper's revenue from its own customer
(`client_price`, `TRIP_REVENUE`) and its own trip expenses. Exchange never
writes revenue rows.

**Must change (Phase 0):** `ensureAssetCompletionAutoEntries` must skip
`source='market_bid'` trips entirely, and org-bidder trips must stop being
labeled `asset` (defects 7–10).

## 8. Trip Detail integration

- `TripDetailFinanceView` (web) and `TripMobileFinancePanel` (mobile) gain an
  **Exchange Transaction** section, rendered only when the trip has an Exchange
  transaction (`source='market_bid'`). It comes from one shared component,
  also used by the Exchange route, so both entry points open the same object.
- Section contents:
  - **Header:** Exchange ref, role chip ("Payable" for the shipper, "Earning"
    for the bidder), status.
  - **Amounts:** agreed, adjustments, confirmed paid, pending confirmation,
    outstanding (or "Upcoming" before completion). Fee and net economic
    earning appear **only in the bidder view**, labeled "paid separately".
    They're never shown as a settlement amount.
  - **Counterparty:** masked until `identity_released_at`.
  - **Payment list:** reuse the `LedgerPaymentDetailTable` row style — date,
    method, UTR, amount, status, proof.
  - **Actions** by role and capability: shipper sees Record payment and
    Withdraw (while initiated); bidder sees Confirm and Dispute.
  - **Activity:** an `exchange_events` feed in the `LedgerAuditLogFeed` style.
- For org-bidder Marketplace trips, the shipper's existing supplier-payment
  affordances are hidden. Payments go only through Exchange.
- The driver-app `TripDetailSettlementPanel` (DCO) shows the Earning view of
  the same object, which replaces the separately designed DCO receivables trip
  table.

## 9. Exchange Transactions table UX

Tabs: **Marketplace | My Bids | Transactions | Disputes**.

| Column | Notes |
|---|---|
| Exchange ref | Opens the Exchange detail (same component as Trip Detail) |
| Trip | Trip number; links to Trip Detail |
| Counterparty | Masked until identity release |
| Role | Payable / Earning (neutral terms; never "income") |
| Agreed · Outstanding | Right-aligned, ₹ en-IN; "Upcoming" before completion |
| Fee | Bidder (Earning) rows only, labeled "paid separately"; blank on Payable rows |
| Pending confirmation | Separate column, never netted; overdue flag when past SLA |
| Status | Section 5 states |
| Last activity | From `exchange_events` |

- Filters: role, status, date, counterparty.
- Summary cards above the table: Outstanding payable, Outstanding earning,
  Pending confirmation, Open disputes.
- Use the `FinanceTableHeader` and `LedgerTransactionListView` patterns.
- The Disputes tab is the same table filtered to open disputes, with
  reason and age columns.

## 10. Permission model

- **Participants only.**
  - Shipper side: active non-driver members of `shipper_org_id` who hold the
    finance capability (`useCapabilities()`).
  - Bidder side: `bidder_user_id` itself (DCO), or active non-driver members of
    `bidder_org_id` who hold the finance capability.
  - Drivers of either organization, and other organizations, have no access.
- **Actions by side.**
  - Shipper: initiate and withdraw payments; propose adjustments.
  - Bidder: accept terms; confirm or dispute payments; propose adjustments.
  - Platform staff: resolve disputes; record admin identity release.
- **Enforcement.**
  - Every state change goes through `SECURITY DEFINER` functions with an empty
    `search_path` that check `auth.uid()` against the participant sides.
  - Exchange tables have participant-scoped SELECT RLS and no direct
    INSERT/UPDATE/DELETE grants.
  - `service_role` is used only by the Razorpay webhook path, exactly as today.
- **Identity release governs fields, not access.** Before release, read
  functions return masked counterparty fields to both sides (the existing
  `mask_phone_last4` contract).
  - The two existing bid-list RPCs switch their reveal predicate to read
    `exchange_transactions.identity_released_at`, so there is one source of
    truth.
- **Transaction-scoped access.** This is consistent with the RLS remediation
  direction already agreed (transaction-scoped, not organization-wide).

## 11. Idempotency and audit

- **Creation (hard database invariants, not service conventions):**
  - Unconditional unique `market_bid_id`. `award_market_bid` creates the row in
    the same database transaction, under the existing bid-then-indent lock
    order. Insert-or-return-existing on conflict, so retries are no-ops.
  - Unique `trip_id` when set. Both trip creators link it in their own
    transaction, and a trip can never be linked to two Exchange transactions.
  - Partial unique on `indent_id` for non-cancelled rows. A re-award after
    revoke must cancel the previous Exchange transaction first.
  - A consistency check that the linked trip's `source_market_bid_id` equals
    the Exchange row's `market_bid_id`.
- **Transitions:**
  - Lock the row (`FOR UPDATE`), check the expected `from_status` and
    `version`, then write exactly one `exchange_events` row.
  - Repeated calls return the current state, mirroring
    `create_market_trip_after_fee_payment`'s "already exists → return it"
    behaviour.
- **Payments:**
  - Unique `idempotency_key`; unique live claim per UTR.
  - Confirmation is the only ledger-writing step. It locks the claim, checks
    `status = INITIATED` (or a dispute resolving to confirmed/amended), and
    writes the status change, ledger row(s), ledger link columns and event in
    one database transaction.
  - Ledger rows are keyed `payment_ref = exchange_payment_id`, with a unique
    index per (organization, category, `payment_ref`). A retried confirm
    finds the existing row instead of posting twice (the compliance
    unique-index → 23505 pattern, enforced in the database).
- **Fee:** keep `payment_ref = market_bid_id` as the single fee-ledger key on
  every fee path.
- **Audit:**
  - `exchange_events` is append-only.
  - `agreed_amount` and adjustment rows are never edited.
  - Unconfirmed claims never reach the ledger, so disputes need no reversals.
    A correction to an already-confirmed payment is an explicit Exchange ops
    action that posts a reversal row and an event; it never edits the
    original row silently.
  - Proof and evidence documents are referenced by id and never overwritten.
- **Payee invariant (carried from receivables):** an award establishes the
  payee. A reassignment cancels that Exchange transaction (`cancelled`, with
  reason) and never re-points it to another bidder.

## 12. Phases

Phase 0 is a **mandatory gate, separately authorized**, and is not part of
Exchange itself. Phase 1 is not authorized until defects 7–10 are verified
read-only against the live database and function definitions, then corrected.

**Phase 0 invariant.** For an organization bidder: shipper owes bidder, and
bidder owes Pulse (fee). The shipper's operating ledger never carries a driver
commission, platform fee expense, or Marketplace payable for that trip.

**Phase 0 read-only verification plan** (not run yet; needs a healthy
database). It's one file, executed once inside `SET TRANSACTION READ ONLY`,
with no writes and no `service_role`:

| Check | Confirms | Evidence query (shape) |
|---|---|---|
| V1 | Live bodies match the repo | `pg_get_functiondef` for `create_trip_from_assigned_indent`, `ensure_awarded_bidder_supplier`, `settle_marketplace_fee_as_cash`, `confirm_marketplace_fee_payment`, `award_market_bid` |
| V2 | Defect 7 (payout lane) | `source='market_bid'` trips grouped by `operating_mode`, `trip_payout_mode`, `supplier_id IS NULL`, `status` |
| V3 | Defect 8 (`client_price` overwrite) | Same trips: `client_price` vs `indents.client_price` vs `market_bids.amount` |
| V4 | Defect 9 (shipper ledger rows) | `transactions` on those trips by (trip-owner org vs other org) × `ledger_category` in `TRIP_REVENUE`, `DRIVER_COMMISSION`, `MARKETPLACE_PLATFORM_FEE` |
| V5 | Defect 10 (fee posting) | `marketplace_fee_payments` paid, by `provider` × whether a `MARKETPLACE_PLATFORM_FEE` row exists, and in which org |
| V6 | Defect 11 (double award) | DCO bidders with more than one accepted `market_bids` row at once |

The output is a findings table per defect: confirmed / not present / partial,
with affected trip counts and refs. A repair plan for historical rows is a
separate, later authorization.

### Phase 0 verification results — 2026-10-06 ~14:20 UTC (read-only)

Each query file ran once inside `set transaction read only`
(`scripts/sql/_tmp_exchange_p0_v*.sql`). No writes were made.

| Check | Result |
|---|---|
| V1 live functions | Repo matches live. `create_trip_from_assigned_indent` has the `asset`-when-no-supplier rule, sets `client_price` from the bid, and nulls the supplier. `confirm_marketplace_fee_payment` (Razorpay) writes no ledger row; `settle_marketplace_fee_as_cash` does. |
| Defect 7 payout lane | **Confirmed.** All 3 org-bidder Marketplace trips are `FLEET`/`asset` (BKG-vk38ap, BKG-zt8plh, BKG-n16jj1). 5 pre-DCO-4 DCO-bid trips are also `FLEET`/`asset` (BKG-kwsqls, BKG-svymg5, BKG-5a6fql, BKG-2t49h8, BKG-gwik7n). Only BKG-vq38ap is correctly `DCO`/`market`. |
| Defect 8 `client_price` | **Partial.** 1 of 3 org-bidder trips (BKG-zt8plh) has `client_price` = bid ≠ indent. |
| Defect 9 completion auto-entries | **Latent, no rows found.** No `TRIP_REVENUE`, `DRIVER_COMMISSION` or `MARKETPLACE_PLATFORM_FEE` rows exist on any `market_bid` trip. Completions so far bypassed `ensureAssetCompletionAutoEntries`. The code path is still live. Only BKG-5a6fql carries manual shipper rows (₹35,000 client in, ₹35,000 "SUPPLIER PAYMENT" to contact type `driver` out). |
| Defect 10 fee posting | **Confirmed.** Of 5 paid fees (₹10,000), only 1 has a ledger row (BKG-zt8plh, bidder org). DCO cash ₹1,095: none (by design: no org). Org cash 2 × ₹1,000: none. `test_online` ₹3,600: none. |
| Defect 11 double award | **Not present.** No DCO holds more than one live accepted award. |

**New defect 12 (severity high, active in production): Network awards are
misclassified as Marketplace awards.**

`is_marketplace_indent_award()` returns true for any indent with
`circulation_target IN ('marketplace','both')`, even when no Marketplace bid
exists. `create_trip_from_assigned_indent` (and `create_trip_from_direct_quote`)
use it, so a normal Network-supplier deploy on a `both` indent is created as:
- `source='market_bid'`, with no `source_market_bid_id`;
- `supplier_id = NULL` and `trip_payout_mode='asset'`;
- `client_price` overwritten with the supplier's rate.

Production impact:

| Measure | Value |
|---|---|
| Trips affected | **276**, all GOGOVAN INDIA PVT LTD |
| Created | 2026-09-25 → today (since `20270925194500`) |
| Supplier orgs | 52; a Network `suppliers` row exists for every one |
| Status | 232 completed, 44 active |
| Indent `client_price` total | ₹1,79,17,064 |
| Trip `client_price` total | ₹1,54,70,149 |
| Revenue understated on these trips | **₹24,46,915** |
| Supplier payables | Detached from the party ledger (`supplier_id` NULL) |
| Trip labels | "own fleet" |

The same branch also auto-calls `settle_marketplace_fee_as_cash` on deploy.
That marks an unpaid Marketplace fee as paid (provider `cash`) without any
money being collected, which matches the two unbacked org cash fees above.
When the circulation branch fires, the function also falls back to the latest
accepted bid on the indent from **any** bidder.

**Additional defect 12 evidence (V9–V11, read-only):**

- **Onset is exactly 2026-09-25.** Before it (09-22 → 09-24), every GOGOVAN
  Network deploy on a `both` indent was `direct_quote` / `market` with a
  supplier, and `client_price` = customer price. From 09-25 onward, all
  `market_bid`-path deploys are `asset`, have no supplier, and set
  `client_price` = supplier rate.
- **Direct-quote path also affected:** 9 more `direct_quote` trips (6 on 09-25,
  3 on 10-03) are `asset` with no supplier. Their `client_price` is correct.
  Total corrupted: **285 trips** (276 price + supplier + label; 9 supplier + label).
- **Spread:** 52 supplier orgs. Largest by trips: SOURASHTRA ROAD LINES 26,
  SRUNGARAPU VENKATESWARA RAO 23, LOUKYA MINI TRANSPORT 22 (₹2,00,000
  understated), HEMA SAI TRANSPORT 19.
- **Outlier:** VASANTH P (4 trips) accounts for ₹9,73,359 of the ₹24,46,915.
  Its indents carry ₹10,76,859 of customer price against ₹1,03,500 of supplier
  rate, which looks like an indent data-entry problem. Excluding it, the
  understatement is about ₹14,73,556.
- **No cash has been posted:** 0 ledger rows exist on any affected trip, and
  there are 0 GOGOVAN supplier-ledger rows to these suppliers since 09-25.
  The repair is trip-row data only; no ledger reversals are needed.
  `client_id` is set on all 276.
- **Operations are live on these trips:** 725 trip documents are attached.
  A repair must not touch them.
- **Pipeline at risk:**
  - 184 `both` indents are already assigned to a Network supplier and not yet
    deployed. Each will be misclassified on deploy.
  - 405 `both` indents are open.
  - 3 `both`-indent deploys from other orgs since 09-25 still need
    classification.

Defect 12 is outside Exchange. It needs its own urgent, separately
authorized fix and a historical-repair plan. It is a Phase 0 blocker.

### Defect 12 forward fix — written locally, NOT applied

Omni-channel rule (product, 2026-10-06): `both` = one indent, two channels.
The winning offer decides the channel (now in `docs/MARKETPLACE_DOMAIN.md`
§Omni-channel award classification).

| Artifact | Change |
|---|---|
| `supabase/migrations/20271006142659_omnichannel_award_channel_classification.sql` | `is_marketplace_indent_award`: Marketplace = accepted bid from that org, or an open-market win by a non-approved-supplier. `create_trip_from_assigned_indent`: the "latest accepted bid from any bidder" fallback is removed; nothing else changes (contract-tested diff). `create_trip_from_direct_quote` and the quote-accepted trigger inherit the predicate. |
| `supabase/release-sets/omnichannel-award-channel.versions` | `20271006142659` only. `db:push-set --dry-run` passed: "Would push 20271006142659" only. |
| `features/trips/services/trips.service.ts` | Completion never posts shipper auto-entries for `source='market_bid'` (defect 9 closed; the dead fee-auto-post branch is removed). The completion guard accepts a supplier-less Marketplace award (prerequisite for the later lane fix; inert today). |
| Tests | `omnichannelAwardChannel.migration.contract.test.ts`, `updateTripStatus.marketplaceAward.test.ts`; 26 trips-service suites pass (161 tests). Lint and typecheck are clean for the changed files. |

**Production simulation (V12, read-only):** of the trips since 2026-09-25,
the corrected predicate classifies all 285 corrupted trips as Network, leaves
the 27 already-correct Network trips unchanged, and keeps the one genuine
Marketplace award (accepted bid) as Marketplace. The live
`create_trip_from_assigned_indent` body is identical to the body being
replaced.

**Deliberately not in this fix (next steps):**
- Marketplace org-bidder lane → `market`, plus `client_price` = shipper
  customer price (defects 7/8). Ship this only after the client completion
  guard change above is deployed, or old clients will block those completions.
- `getTripExecutionModel()` treatment of supplier-less Marketplace trips.
- Deploy-time `settle_marketplace_fee_as_cash`, which marks a fee paid with no
  money collected.
- `award_market_bid` doesn't close pending Network quotes. The indent status
  already blocks them from winning.

### Defect 12 historical repair plan — design only

Run **after** the forward fix is applied, so no new corrupted trips appear
mid-repair. Ship it as its own migration and release set, with before/after
evidence queries.

1. **Selection is computed, not a frozen list:** `trips` where the indent's
   `assigned_supplier_id` is set and differs from the trip org,
   `source IN ('market_bid','direct_quote')`, `supplier_id IS NULL`, and
   `NOT is_marketplace_indent_award(indent, assigned_supplier_id)`. This
   includes any trips created before the fix is applied.
2. **Per trip:**
   - `supplier_id` := the existing shipper `suppliers` row for the assigned org
     (all 52 exist and are active);
   - `trip_payout_mode` := `'market'`;
   - for `source='market_bid'`: `source` := `'indent'`,
     `client_price` := `indents.client_price`, `sale_rate_basis` := NULL;
   - `direct_quote` rows keep their source and price.

   Nothing else changes: not status, driver, vehicle, documents (725 attached),
   or `supplier_rate`. No ledger rows are written; none exist on these trips.
3. **Exclusion held for ops:** VASANTH P (4 trips; indent `client_price`
   ₹10,76,859 vs supplier rate ₹1,03,500). Repair only after GOGOVAN confirms
   the indent price.
4. **Pre-flight:** inventory every `UPDATE` trigger on `trips` (audit, chat,
   realtime, guard triggers) and confirm none react to these columns in a way
   that posts ledger rows or notifications. Run inside one transaction with
   row-count assertions equal to the pre-count.
5. **Idempotent:** a second run selects zero rows.
6. **Afterwards:** the driver app stops showing these trips as Marketplace
   awards; GOGOVAN supplier pages and trip P&L pick them up through
   `supplier_id`.

| Phase | Scope | Production impact |
|---|---|---|
| **0 — Correctness (gate)** | Verification above. Then: org-bidder Marketplace trips labeled `market`; `client_price` no longer overwritten; completion auto-entries skip `market_bid` trips; fee ledger posting unified on the bidder; a repair plan for wrong historical rows. | Code and migration; its own release set |
| **1 — Read model** | `exchange_transactions` and `exchange_events`, with the hard uniqueness invariants, created at award and backfilled from accepted `market_bids`. Read functions. Read-only Exchange section on Trip Detail, the Transactions tab, and the DCO Wallet. **This is the DCO receivables release** (completed-only Outstanding, Upcoming separate, shipper Finance totals unchanged, shipper-side `adjustedCost`). | Additive schema; no Finance writes |
| **2 — Payments** | `exchange_payments`; shipper claim (UTR, method, date, proof); bidder confirmation; Finance posting **on confirmation only** (section 7); overdue-confirmation flag and ops escalation; bilateral obligation adjustments. | First Exchange → Finance writes |
| **3 — Disputes** | `exchange_disputes`; Disputes tab; Exchange ops resolution. | |
| **4 — Terms and explicit identity release** | Explicit bidder terms acceptance (versioned); `identity_released_at` becomes the reveal source for the bid-list RPCs; `MARKETPLACE_DOMAIN.md` updated. | Changes the contact-visibility contract |
| **Later** | `driver_direct_bids` and `direct_quotes` awards onboarded to Exchange; a fee-deduction model. | |

Phase 4 can move earlier than Phase 2 if product wants terms acceptance before
real payment claims exist. The two have no dependency on each other.

**Sequencing:**
- **Freeze:** nothing here starts before the daytime authority acceptance and
  the post-acceptance order already agreed.
- **Gate 1A:** Phase 1 hooks into `award_market_bid`, whose live definition is
  currently the pre-Gate-1A body (Gate 1A rollback). It must follow the Gate 1A
  decision.
- **Release sets:** each phase is its own release set.
- **Rename:** `LoadCenterOpportunityExchange` → `MarketplaceOpportunityCard`
  is an internal, behaviour-free rename. It ships as its own small commit,
  not bundled with Exchange schema work.

## 13. Must-not-duplicate list, and frozen decisions

**Must not duplicate:**
1. A second cash ledger. All cash goes to `transactions`, either via
   `createLedgerEntry()` or, for bidder-triggered confirmation, a server-side
   writer that is parity-tested against it (section 7).
2. A second fee engine or fee-payment table (`marketplace_fee_*`, the Razorpay
   rail, and the cash settle are the rail).
3. A second bid or negotiation record (`market_bids` stays authoritative for the bid).
4. A second payee model (`dco_payees`, `trips.dco_payee_id`).
5. A second document or proof store (trip documents).
6. Party rows created just to make a payment recordable. No `suppliers` or
   `clients` rows from Exchange (ADR-012).
7. Recomputation of the fee after award.
8. Client-side masking or reveal (the backend-only contract stays).
9. A second allocation algorithm (`allocateAmountsToLargestDueTrips`).
10. Reuse of the dormant `public.dispute` table for a different meaning.
11. A parallel "DCO receivables" read model that Exchange later replaces.
    Ship the receivables views **as** Exchange Phase 1.

**Frozen product decisions (2026-10-06):**

| # | Decision |
|---|---|
| 1 | Finance posting happens **only after bidder confirmation**. A payment claim is not a cash transaction. |
| 2 | **No auto-confirmation.** An SLA only produces "confirmation overdue" and an ops escalation. |
| 3 | Phase 1 uses the shipper-side `adjustedCost` formula; Phase 2 requires bilateral agreement. The original obligation is immutable; adjustments are append-only. |
| 4 | **Explicit, versioned terms acceptance** is mandatory. Fee payment ≠ terms acceptance. One-tap UX. |
| 5 | DCO receivables **is** Exchange Phase 1. |
| 6 | Rename `LoadCenterOpportunityExchange` → `MarketplaceOpportunityCard`. |

**Frozen principles:**
- Marketplace = discovery. Pulse Exchange = post-award commercial lifecycle.
  Trip = operational anchor. Finance = cash and accounting.
- One Exchange transaction per accepted Marketplace bid, anchored to one trip,
  with two party views but one commercial obligation. Uniqueness is enforced
  by database constraints.
- No duplicate fee infrastructure or payment gateway, no use of
  `public.dispute`, and no party relationship required before a transaction.
- Identity release is an explicit recorded event. Dispute is a first-class state.
- The bidder's net economic earning is shown to the bidder only, never as a
  settlement amount.
- Phase 0 defects are resolved before Phase 1. Phase 1 is read-only.
