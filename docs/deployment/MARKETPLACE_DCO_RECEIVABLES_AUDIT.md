# Marketplace DCO receivables: Phase 1 read-only audit (2026-10-06)

Scope: what already exists for award → trip → driver → payment for Marketplace and
Reach DCO awards. Read-only (function definitions, `information_schema`, row reads). No
production writes.

Model principle (product decision 2026-10-06): a Marketplace award is a commercial,
per-transaction relationship. The shipper is not the DCO's fleet or employer. Wallet →
Self shows **Fleet** (genuine employment/roster only) and **Account Receivables**
(what each shipper owes the DCO).

> **Superseded for Marketplace awards (2026-10-06).** The Marketplace DCO receivable
> is the Pulse Exchange obligation itself (migration `20271006144616`, section 8): the
> Driver App reads, claims, and confirms the same `exchange_payments` rows as the
> shipper. Don't build a separate Driver-App receivable for Marketplace trips. See
> `PULSE_EXCHANGE_TRANSACTION_LAYER_AUDIT.md` §7. Reach direct-bid DCO trips are
> unchanged by that migration.

## 1. What an award writes today

| Path | Function | Trip fields for a DCO |
|---|---|---|
| Marketplace indent | `award_market_bid` → fee → `create_market_trip_after_fee_payment` | `operating_mode='DCO'`, `trip_payout_mode='market'`, `dco_payee_id`, `supplier_rate = bid amount` ("the DCO's settlement amount"), `client_price = bid amount`, `driver_commission=0`, `payment_status='pending'`, `amount_paid=0`, `owner_vehicle_id` |
| Reach story | `accept_driver_direct_bid` | Same DCO fields **only if `is_dco_eligible(bidder)` at acceptance**; otherwise booked `FLEET` / `asset` with `driver_commission = bid amount` |

Both call `_resolve_or_create_market_driver(shipper_org, bidder)`, which creates or
re-attaches a `tracking_only`, `market_award`, `independent` `drivers` row in the shipper
org, because `trips.driver_id` must reference a row in the trip's org. That row is a
trip-assignment identity. Awards write no `organization_members` row.

Risk: on the Reach path a DCO wrongly in `DCO_EMPLOYMENT_CONFLICT` (e.g. `f3beccae`
today) would have a Reach award booked as a FLEET trip with driver commission, not as a
DCO receivable. The predicate fix should land before Reach awards to such DCOs resume.

## 2. Canonical commercial facts that already exist

| Fact | Source | Notes |
|---|---|---|
| Payee identity | `dco_payees (id, user_id)` | Global, person-owned; no `organization_id` |
| Shipper | `trips.organization_id` | The awarding org |
| Agreed amount | `trips.supplier_rate` where `operating_mode='DCO'` | Set at award; never recomputed |
| Payment to DCO | `transactions` with `contact_type='dco'`, `contact_id = dco_payee_id`, `amount_out`, optional `trip_id`, `transaction_date`, `description`, `created_by` | Entered by shipper finance staff; accounting model posts `DCO_PAYABLE` against `CASH_BANK` (`dco_payment`) |
| Shipper-side balance | `get_dco_ledger_aggregation(p_org_id)` | due = Σ `supplier_rate` of DCO trips; paid = Σ `amount_out` of `dco` transactions; outstanding = `greatest(0, due − paid)`. Guarded by `is_org_staff(p_org_id)`, so it returns nothing to drivers. Used by `features/finance/services/ledgerAggregationRpc.service.ts`. |
| Adjustments | `trip_finance_adjustments (trip_id, organization_id, type, amount)` | TRP037 has 1 row; not part of the aggregation today |

Conclusion: the driver's receivable is the mirror of the shipper's existing DCO payable.
No second ledger is needed. Payment authority already exists (shipper finance records a
`dco` transaction); the driver should not record payments.

## 3. Production state

All DCO trips (`operating_mode='DCO'`), all with Godrej India (`dc771ec3`):

| Trip | DCO | Source | Status | Agreed | `driver_id` | Notes |
|---|---|---|---|---|---|---|
| TRP037 | `f3beccae` | market_bid | assigned | 36,500 | stub `4d1f42cb` | 1 finance adjustment |
| TRP047 | `1026422b` | direct_bid | completed | 25,000 | stub `808d19a0` | |
| TRP049 | `1026422b` | direct_bid | completed | 6,000 | stub | |
| TRP051 | `1026422b` | direct_bid | completed | 15,000 | stub | |
| TRP053 | `1026422b` | direct_bid | completed | 45,000 | stub | |
| TRP063 | `1026422b` | direct_bid | assigned | 25,000 | **NULL** | Driver rejected at 02:07:58; `dco_payee_id` still set |
| TRP065 | `1026422b` | direct_bid | assigned | 25,000 | stub | |

- `contact_type='dco'` transactions in production: **0**. No DCO payment has ever been
  recorded; `amount_paid = 0`, `payment_status = 'pending'` on every DCO trip.
- `driver_ledger` and `accounting_books` rows for DCO trips: 0.
- `1026422b`'s stub row also carries 7 pre-DCO trips booked `FLEET`
  (TRP003/005/007/009 `market` manual; TRP011/033/137 `asset` bids with
  `driver_commission`). These are fleet-era earnings, not DCO receivables.
- Wallet "To collect ₹1,71,000" for `1026422b` is computed client-side from trips and
  payout heuristics and mixes these populations. It does not match the server's
  DCO due (Σ ₹1,41,000 including TRP063, or ₹1,16,000 assigned to the driver).

## 4. Gaps found

1. **Recognition rule undefined.** `get_dco_ledger_aggregation` counts every DCO trip as
   due regardless of status, including unstarted and driver-rejected trips.
2. **Rejected trip keeps the payee.** `driver_reject_trip` leaves `dco_payee_id` on
   TRP063 while `driver_id` is NULL.
3. **No driver-scoped read.** The only aggregation is staff-only and per shipper org.
4. **No allocation rule.** `transactions.trip_id` is optional, so payments can be
   per-trip or on-account.
5. **Client-derived wallet totals.** The Wallet hero figure is not server truth.
6. **Reach misbooking risk** while the predicate fix is pending (section 1).
7. **Org-wide RLS via stub memberships** (see `DCO_EMPLOYMENT_PREDICATE_REVIEW.md`,
   open follow-up): unrelated to AR facts, but AR access must be transaction-scoped
   (trip `dco_payee_id` → `dco_payees.user_id = auth.uid()`), never org membership.

## 5. Decisions needed for Phase 2 (AR domain design)

1. When a DCO trip becomes **earned** and when it becomes **due** (assigned, completed,
   POD verified, or a contractual due date).
2. Whether driver rejection / reassignment clears `dco_payee_id`, or AR excludes trips
   whose `driver_id` is not the payee's row.
3. Allocation: per-trip when `transactions.trip_id` is set; unallocated payee payments
   shown on-account or applied oldest-first.
4. Whether `trip_finance_adjustments` (deductions, detention, etc.) adjust the receivable.
5. Where pre-DCO FLEET trips of a DCO user appear (Fleet earnings vs nowhere in AR).
6. Payment status vocabulary (`Due`, `Partially received`, `Paid`) and whether the
   shipper's `transaction_date` / `description` is the reference shown to the driver.

Proposed shape for later phases (not built): a driver-scoped, read-only RPC keyed by
`auth.uid()` → `dco_payees`, returning per-shipper totals (agreed, received, outstanding,
status) and per-trip/payment lines from the same facts `get_dco_ledger_aggregation` uses,
so shipper payable and driver receivable always reconcile.

---

# Phase 2: AR domain design (proposed, not implemented)

## Decisions (2026-10-06)

| # | Decision |
|---|---|
| Recognition | A DCO trip becomes **Due** on `status = 'completed'`. Assigned / in-progress statuses (`assigned`, `loading`, `in_transit`, `at_drop`, `unloading`, `in_progress`) are **Upcoming**: shown, but not in outstanding. `cancelled` / `draft` are excluded. |
| Rejection | When a DCO trip loses its DCO driver, the server clears `dco_payee_id`. |
| Allocation | Same as the business app's Finance party page (`SupplierDetailScreen`): payments with `trip_id` apply to that trip; payments without one are spread to the **largest-due** trips (`allocateAmountsToLargestDueTrips`). The shipper-level table plus the trip-level detail view mirror that page. |

Inferred from the business app (to be confirmed at review):
- The trip amount is `adjustedCost(supplier_rate, adjustments)`: only non-voided `type='cost'` adjustments, `plus`/`minus`, floored at 0. Revenue adjustments (e.g. TRP037's −1,500) belong to the shipper's client side and do not change the DCO amount.
- Fleet-era trips on a DCO's stub row (`operating_mode <> 'DCO'`) are excluded from AR.

## Canonical sources (no new tables)

| Concept | Source |
|---|---|
| DCO account holder | `dco_payees.user_id = auth.uid()` |
| Shipper account | `trips.organization_id` over the payee's DCO trips, plus `organizations.name` / logo |
| Receivable line | `trips` where `operating_mode='DCO'` and `dco_payee_id = payee` |
| Agreed | `supplier_rate` adjusted by cost adjustments |
| Payment line | `transactions` where `contact_type='dco'`, `contact_id = payee`, `organization_id = shipper` |
| Received | trip-linked payments plus the largest-due allocation of unlinked payments |
| Outstanding | Σ (Agreed − Received) over Due trips only |
| On account | Unlinked payments exceeding total Due (credit at shipper level) |
| Status | `Upcoming` (not completed) · `Due` (received = 0) · `Partially received` · `Received` (received ≥ agreed) |

Payment recording stays with the shipper's finance (existing `dco_payment` posting). The driver
surface is read-only.

## Server artefacts (Phase 3/4 implementation, separate release set)

1. **`get_my_dco_receivables()`**, read-only, `SECURITY DEFINER`, `search_path ''`, EXECUTE to
   `authenticated` only. One row per shipper: `organization_id, name, logo, trips_due,
   trips_upcoming, agreed_due, received, outstanding, on_account, upcoming_amount,
   last_payment_at, status`.
2. **`get_my_dco_receivable_account(p_organization_id)`**, same security. Returns trip lines
   (`trip_id, trip_number, route, completed_at, status, agreed, received, balance,
   settled_pct, receivable_status`) and payment lines (`transaction_id, transaction_date,
   amount, trip_id or null, description`).
3. **Authorization** is transaction-scoped: rows are reachable only through
   `trips.dco_payee_id → dco_payees.user_id = auth.uid()`. Org membership, `drivers`
   rows and `is_org_member` are not used. Empty result for non-DCO callers.
4. **Payee integrity trigger on `trips`** (`BEFORE UPDATE OF driver_id`): on a DCO trip,
   if `driver_id` becomes NULL or a `drivers` row whose `user_id` is not the payee's
   user, set `dco_payee_id = NULL`. This covers `driver_reject_trip`,
   `driver_decline_pending_assignment` and dispatcher reassignment in one place. One-time
   data fix: TRP063 (rejected, payee still set). DDL on `trips` uses `lock_timeout` (see
   `docs/incidents/2026-10-06-release-probe-trips-lock.md`).
5. Allocation lives in one SQL helper, so the driver RPCs and a later alignment of
   `get_dco_ledger_aggregation` give identical numbers.

## Shipper Finance total: unchanged (decided 2026-10-06)

`get_dco_ledger_aggregation` and the business-app Finance total are **not changed** in this
release. The driver Wallet shows Outstanding (completed only) and Upcoming separately. If
Finance later adopts completed-only accounting, that ships as a separate Finance
product/accounting change, not bundled with Marketplace AR.

Driver card (Wallet → Self → Account Receivables), per shipper:

```text
GODREJ INDUSTRIES
Outstanding  ₹91,000   4 completed trips
Upcoming     ₹25,000   1 active trip
Received     ₹0
```

Hierarchy: Receivables → Shipper → Trip receivables → Payment history (with allocation
context, never raw payment rows alone).

## Payee invariant

> Only an award establishes the DCO payee. A trip reassignment clears the previous payee;
> the previous bid is never carried forward.

## Payee-clearing rule: acceptance conditions

A simplistic "any driver change → NULL payee" rule is not acceptable. Proposed semantics:

- Fires only when `OLD.driver_id IS DISTINCT FROM NEW.driver_id` on a row where
  `OLD.operating_mode = 'DCO'` and `OLD.dco_payee_id IS NOT NULL`. A SET that rewrites the
  same value is a no-op.
- **Keep** the payee when the new `drivers` row belongs to the payee's own user (e.g. the
  stub was re-resolved).
- **Keep** the payee on `completed` trips: an earned receivable is never removed by a
  driver-column change. A correction there is a Finance decision.
- **Clear** the payee otherwise (driver removed, or replaced by a different person).
- **Never set** a payee. Under the existing award model a payee is established only by
  the award functions (`create_market_trip_after_fee_payment`,
  `accept_driver_direct_bid`) together with the agreed amount. A dispatcher reassignment
  to another DCO is not an award, so it must not inherit the previous bidder's amount.
  A new DCO payee requires a new award.

Required transition tests, all on a disposable local DB (never production):

| # | Transition | Expected |
|---|---|---|
| T1 | DCO trip, driver → NULL (reject / decline) | payee cleared |
| T2 | DCO trip, driver → a different person's row | old payee cleared |
| T3 | DCO trip, driver → another eligible DCO's row | old payee cleared; no payee is inherited (a new payee only via award) |
| T4 | DCO trip, driver → another row of the same payee user | payee kept |
| T5 | DCO trip, `driver_id` SET to the same value / other columns updated | payee kept |
| T6 | Completed DCO trip, driver changed | payee kept |
| T7 | Non-DCO trip, any driver change | untouched |
| T8 | Award `INSERT` (both award functions) | payee set by the award, unaffected |

T3 confirmed 2026-10-06: only an award establishes a payee; a reassignment never inherits
the previous bid.

Timing confirmed 2026-10-06: implementation (including local files) starts only after the
daytime check is accepted.

Out of scope, flagged: after T1/T2 the trip keeps `operating_mode='DCO'` and the old
`supplier_rate`. Reclassifying such a trip is part of the dispatch/award model, not AR.

TRP063 correction: a separate migration in the same release set, targeting the single
trip id. It asserts the expected pre-state (DCO, `driver_id` NULL, payee =
`1026422b`'s payee, status `assigned`, no `dco` payments) and exactly 1 row updated, and
raises an error otherwise.

## Release boundary

Release **Marketplace DCO Receivables** (separate from `dco-employment-predicate` and from
RLS remediation) ships the complete product surface, not only the backend:

```text
Marketplace DCO Receivables
├── Transaction-scoped read functions
├── Payee-clearing rule
├── TRP063 correction
├── Wallet Self → Receivables summary
├── Shipper receivables table
├── Trip-level receivables
├── Payment history / allocation
└── Marketplace Job Card correction
```

### Server (release set `marketplace-dco-receivables`)

1. Transaction-scoped read functions (`get_my_dco_receivables`, `get_my_dco_receivable_account`).
2. Payee-clearing rule on `trips` (T1–T8 on a local DB first).
3. TRP063 correction (separate, asserted, single-row).

### Client (one commit)

4. **Wallet → Self summary.** Replaces the legacy client-computed "To collect" total
   (not patched separately) with Outstanding / Upcoming / Received from the server, e.g.
   Outstanding ₹91,000 · Upcoming ₹25,000 · Received ₹0. The Fleet section stays strictly
   genuine fleet/roster relationships; Marketplace shippers never appear as fleets.
5. **Shipper receivables table.** Columns: Shipper · Agreed · Received · Outstanding ·
   Status (Due / Partially received / Received / Upcoming only), plus On account where
   present.
6. **Trip-level receivables** (tap a shipper). Columns: Trip · Agreed · Settled % ·
   Received · Balance; Upcoming trips listed separately and outside the totals.
7. **Payment history / allocation.** Each payment with date, amount and the trip(s) it
   was allocated to (trip-linked, largest-due allocation, or On account). Raw payment
   rows are never shown without allocation context.
8. **Marketplace Job Card correction.** The TRP065 card today shows "YOUR FLEET" /
   "PAY N/A". Target: **MARKETPLACE** · Godrej India · ₹25,000 agreed · *Marketplace
   award*. Its identity comes from the trip's commercial fields (`operating_mode='DCO'`,
   `dco_payee_id`, shipper org, agreed amount), never from the `tracking_only`
   assignment row.

### Dependency: Multi-Order Commerce job card

The Commerce job-card commits (`f3ed5963`, `987569dd` on `V1.0.1` after the 2026-10-06
reconciliation; formerly `9fbeb792`, `1fad280c`, kept on
`backup/V1.0.1-before-reconciliation`) remain separate and unchanged and
ship earlier in the sequence. If item 8 reuses their components or contracts, the
dependency is declared explicitly in the Receivables commit; the UI is not duplicated.

Nothing is implemented or applied before the daytime authority check has been accepted
(Step A + Step B + Accept).

## Expected values for today's data (read-only derivation)

`1026422b` · Godrej: Due = TRP047/049/051/053 = ₹91,000; Received ₹0; Outstanding
₹91,000; Upcoming = TRP065 ₹25,000 (TRP063 excluded after the payee fix).
`f3beccae` · Godrej: Due ₹0; Upcoming = TRP037 ₹36,500.
