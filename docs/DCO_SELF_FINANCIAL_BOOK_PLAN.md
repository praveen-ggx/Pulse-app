# DCO Self financial book — architecture and implementation plan

This is the plan that authorized the dedicated DCO Self book. Do **not** merge the old trip-column / notes / `dco_party_billed` path as the commercial model.

## Verdict

Build a new DCO Self financial book. The existing `vasanth/dco-self-audit-fix` tag/notes writers are not production-ready.

Rollout: schema-first → service and UI → preproduction validation → production migration → app deploy.

November 1 workspace/tag migrations: remote apply status is **UNVERIFIED**. Do not assume they are or are not on preprod/prod.

## Three books (locked)

1. **Organisation** — Party A, operational trip, supplier payable (`supplier_rate`). Never overwrite `client_id`, `client_name`, or `supplier_rate` from DCO Self.
2. **DCO Self** — Party B, billed amount, versioned corrections, outstanding, append-only collections.
3. **Marketplace** — Pulse Exchange only. No Self tag, no second AR.

Outstanding = current billed − Σ collections. Due only when the receivable is **issued**, not when a party is merely named.

## Pre-implementation decisions (resolved)

| Decision | Choice |
|---|---|
| Party B storage | Dedicated `dco_self_parties`. Workspace `clients` isolation and Finance visibility were not proven. |
| Independent / employee drivers | Out of this increment. Self book is DCO / `DCO_VEHICLE_REQUIRED` only. |
| Idempotency | Database `UNIQUE (idempotency_key)` on issue, correct, and collect. Client generates stable keys. Platform command-store is not a durable Driver App outbox. |

## Why the old branch is not the money path

1. It mixed DCO receivables with organisation trip fields and employer-ledger collections.
2. `tag_dco_trip_party` wrote `client_id` / `client_name` / `dco_party_billed`.
3. `dco_tag_denied` and missing-RPC paths fell back to `<!--pulse-dco-party:{json}-->` notes.
4. Fleet and loading `DRIVER` defaults could expose tagging.
5. Shipper capture could post to `driver_ledger` on the trip organisation.

## Target objects

Tables: `dco_self_parties`, `dco_self_receivables`, `dco_self_receivable_versions`, `dco_self_collections`.

RPCs (DEFINER, `is_dco_eligible` + workspace): `upsert_dco_self_party`, `issue_dco_self_receivable`, `correct_dco_self_receivable`, `collect_dco_self_receivable`.

Authenticated: SELECT only. Writes go through RPCs. `source = market_bid` is denied on issue.

Reuse: `ensure_dco_workspace` / `dco_self_workspace_id` (restated in the new migration so this increment does not depend on unverified November 1 apply).

Discard as commercial path: notes markers, `trips.dco_party_billed`, `tag_dco_trip_party` as the writer.

Retain: fleet commission and salary on the employer book; Marketplace Exchange claims.

## File sequence shipped in this increment

1. `supabase/migrations/20271102003100_dco_self_financial_book.sql`
2. `features/dco-self/services/dcoSelfReceivable.service.ts`
3. Driver App issue/collect rebound: Add Client, Collect sheet, Capture (`book: dco_self`)
4. `canTagOfflineParty` / `canManageDcoSelfBook` fail closed until operating mode succeeds; DCO-only
5. Contract and unit tests for the book, outstanding math, Self collect vs employer ledger

Still later: Wallet AR panel still rolls up from trips; full Finance visibility for Self; persist keys beyond client-generated unique keys; remote apply of November 1 files after list confirmation.

## Safeguards

- Fleet trips stay with the assigning business.
- Marketplace stays Exchange-only.
- DCO A cannot use DCO B’s workspace; RPCs deny non-eligible callers.
- No notes write after a server deny.
- Schema must be applied to an environment **before** that environment’s app bundle uses the new RPCs.

## Authorization

The production-execution instruction authorized full DCO Self implementation and release. The original planning report’s “implementation unauthorized” line is historical and is not a new restriction.
