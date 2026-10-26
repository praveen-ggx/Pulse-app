# Marketplace Platform

**v0.2 — Canonical Commercial Domain · Architecture Spec · August 2026**

*Before this, marketplace progress was independently interpreted across Indent status, Story / post activity, Reach campaign status, Load Center filter tabs, Bid Sheet enablement, and feed visibility. They drift. This document describes the replacement: one commercial lifecycle, with every surface consuming a single domain object — `CommercialOpportunity` — not inventing its own interpretation.*

**This document's ownership:** the Marketplace Platform model and the rule that governs extending it. Implementation detail lives in the source files and migrations referenced below; this is the map, not the territory.

**Naming:** Engineering work is tracked as **Platform Milestones (M0–M5)**, not sprints. Same vocabulary as Trip Operations Platform evolution.

**Companion docs (do not fork the model):**

| Doc | Owns |
|-----|------|
| This file | Commercial lifecycle, visibility, pricing, snapshot, `CommercialOpportunity`, milestones |
| `docs/PRODUCT_STRATEGY.md` | Four KPIs, dual streams, M2 impact tiers, weekly eight numbers |
| `docs/ADR-012-commerce-earned-relationship.md` | Relationship earned from commerce (M4) |
| `docs/REACH_STABILITY_SPRINT.md` | M0 incident history + bid-pipeline hardening |
| `docs/REACH_DELIVERY_ENGINE_DESIGN.md` | Reach eligibility / ranking / delivery accounting |
| `docs/MARKETPLACE_P0_VALIDATION.md` | M0 acceptance checklist (lifetime + snapshot) |
| `docs/TRIP_OPERATIONS_PLATFORM.md` | Pattern this platform mirrors after Award → Trip |

---

## What we are building

Not “more Reach UI.” Not more badges. Not more filters.

**A Marketplace Platform** — so later reverse auction, instant booking, AI negotiation, fleet subscriptions, dynamic pricing, insurance, working capital, and credit scoring all consume the **same commercial object**.

---

## The problem this solves

Today there are effectively **two lifecycles**:

```
Indent status          Story / Reach campaign
(open / broadcast /    (is_active, expires_at,
 awarded / …)           campaign.status, …)
```

And multiple surfaces still independently resolve commerce even after M0:

Feed · Story Detail · Bid Sheet · Story Preview · Award dialog · Reach campaign · Snapshot

Each still answers, in its own way: price, visibility, CTA, bidability, lifecycle, ownership.

That is exactly where Trip Operations was before:

```
deriveTripStage()
  → getStageMetadata()
  → TripTimeline
  → Metrics
  → Alerts
```

Marketplace deserves the same architecture.

---

## The layered architecture

```
Indent (source of commercial truth)
  │
  ▼
Commercial Lifecycle      deriveCommercialState()
  │
  ▼
Commercial Opportunity    resolveCommercialOpportunity() → CommercialOpportunity
  │
  ▼
Commercial Snapshot       buildCommercialSnapshot() / validateSnapshot()
  │
  ▼
Bid Pipeline              submit_pulse_bid… (append-only)
  │
  ▼
Commerce Intelligence     funnel metrics per load (M3)
  │
  ▼
Commerce Network          ADR-012 relationship graph (M4)
  │
  ┌──────────┼─────────────┬──────────────┬──────────────┬──────────────┐
  │          │             │              │              │              │
Feed      Story         Bid Sheet      Load Center    Reach           Award /
          Detail                       (Give/Get)     Campaign        Owner Hub
```

Every box under `CommercialOpportunity` is presentation or delivery. None invent commercial state, price, or bid eligibility.

---

## Operating model after M1 (conversion, not platform)

**The platform is no longer the bottleneck. Commercial conversion is.**

Every Marketplace feature from this point must move one step of:

```
Published → Viewed → Bid → Awarded → Executed → Completed
```

If it does not improve view rate, bid rate, award conversion, time-to-first-bid, time-to-award, or completion — it is not this cycle’s work.

### Effort split (same transition as Trip Operations)

| Effort | Focus |
|--------|--------|
| **~20%** | Platform maintenance, consistency bugs, consumer-rule violations |
| **~80%** | UX, conversion optimisation, operational intelligence (data pipeline first) |

Once the consistency matrix passes: **Marketplace architecture is feature-complete.** Freeze domain/resolver expansion. Enforce `docs/PLATFORM_CONSUMER_RULE.md`.

### Phase plan (product)

| Phase | What | Not |
|-------|------|-----|
| **1 — Close M1** | Run consistency matrix only. No new Marketplace platform code. | More resolvers, more domain modules |
| **2 — M2 UX** | Receiving Bids workspace, progressive stories, bid comparison, open-market signals | New commercial rules |
| **3 — Intelligence** | Collect publish→view→bid→award→trip metrics (pipeline first) | Dashboards before data |
| **4 — Commerce Network** | Earned relationship (ADR-012) | Connect-first social graph |
| **5 — Financial Platform** | Assist / Escrow / Credit / Insurance after transaction history | Finance on assumptions |

### Internal Marketplace Health Dashboard (compass — not customer UI)

Track weekly:

| KPI | Direction |
|-----|-----------|
| View rate | ↑ |
| Bid rate | ↑ |
| Average bids per load | ↑ |
| Award conversion | ↑ |
| Completion rate | ↑ |
| Time to first bid | ↓ |
| Time to award | ↓ |
| Marketplace vs Network awards | Track mix |

This tells where the next investment goes instead of intuition.

---

## Platform milestones

```
Marketplace Platform

✓ M0 — Stabilization                    (essentially complete)
✓ M1 — Commercial Resolver              (engineering complete — awaiting product validation)
➡ M2 — Marketplace Experience           (next — entirely UX / conversion)
  M3 — Commerce Intelligence            (data pipeline first)
  M4 — Commerce Network
  M5 — Financial Platform
```

| Milestone | Outcome |
|-----------|---------|
| **M0 Stabilization** | Indent-owned lifetime; `quoted` removed as business state; snapshot pricing; visibility predicate; bid pipeline hardened. **Essentially complete.** |
| **M1 Commercial Resolver** | One `CommercialOpportunity`; five consumers + Platform Consumer Rule. **Engineering complete — M1 done only after consistency matrix passes.** |
| **M2 Marketplace Experience** | **Entirely UX / conversion.** Receiving Bids workspace, progressive story evolution, bid comparison, open-market signals, Network vs Marketplace tags — **no new domain services** |
| **M3 Commerce Intelligence** | Collect (then later expose) lane wins, response time, awarded price, conversion — pipeline before dashboards |
| **M4 Commerce Network** | ADR-012: work together → trust → relationship (not Connect-first) |
| **M5 Financial Platform** | Assist, Escrow, Credit, Insurance — on proven commercial behaviour |

**Architecture freeze after M1 validation:** feature-freeze Marketplace platform / domain work. Enforce: *No new Marketplace UI may derive commercial state directly — every surface consumes `resolveCommercialOpportunity()`.* Next cycle ≈ **80% M2 conversion UX**.

**Do not reopen** status-name / `quoted` product work. Do not add more domain layers “while we’re here.”

### M0 — Stabilization (essentially complete)

| Item | Status |
|------|--------|
| Remove `quoted` transition (trigger + backfill) | ✓ |
| Product freeze of `quoted` as deprecated compatibility only | ✓ |
| Get Load RPC / embed fix (`p_org_id`) | ✓ |
| Backend-owned lifetime **rules** (open until Award; no independent story clock) | ✓ |
| Snapshot pricing **rules** (no NULL price / bid CTA on incomplete listing) | ✓ |
| Canonical marketplace visibility predicate | ✓ |
| Campaign lifecycle aligned with marketplace (close on terminal) | ✓ |
| P0 validation checklist | ✓ `docs/MARKETPLACE_P0_VALIDATION.md` |
| Regression suite for the visibility predicate | ✓ `supabase/tests/marketplace_visibility_predicate.sql` |

---

## Commercial lifecycle (canonical)

```
Draft
  ↓
Published          ← open market
  ↓
Receiving Bids     ← ≥1 bid; indent stays open for other bidders
  ↓
Evaluating         ← optional owner UX; still open unless product freezes
  ↓
Awarded            ← commercial lock; market closes for others
  ↓
Executing          ← trip created (Trip Operations owns stage)
  ↓
Completed
```

**Deprecated:** `indents.status = 'quoted'`. No new writes after `20270128103100`. Keep in DB constraints for history only.

### Visibility (M0 law)

| Event | Open-market visibility for other suppliers |
|-------|--------------------------------------------|
| Publish / first bid / Nth bid | Visible |
| Evaluating (default) | Visible |
| Award / cancel / expire / close / withdraw | Hidden as open market |

**Forbidden:** hiding LOAD solely on `posts.expires_at` while indent is still open for bids; client auto-deactivation on an independent 24h clock; any bid write that mutates shared indent status.

### Pricing (M0 law)

One display/target price across Feed, Story, Bid Sheet, Preview, Award, Reach. Target stays visible while Receiving Bids. A snapshot with NULL price is invalid.

### Snapshot (M0 law)

Frozen commercial listing minimum: target price, vehicle, material, pickup, delivery, quantity, payment terms (if any), bidding metadata, expiry (indent-driven), bid count / join key, story metadata.

Invalid:

```
Destination ✔  Vehicle ✔  Material ✔  Price ❌  Bid button ❌
```

---

## M1 status — engineering complete, awaiting product validation

**This is the platform.** Same inflection as Trip Operations after Stage → Metrics → Alerts → Consumers: stop adding domain services.

```
Commercial Lifecycle
  → Visibility → Pricing → Permissions → Actions
  → resolveCommercialOpportunity()
  → Consumers
```

```
resolveCommercialOpportunity()
├── Feed (PostCard)        ✓
├── Story Detail           ✓
├── Story Preview          ✓
├── Bid Sheet              ✓
└── Award Dialog           ✓
```

Platform Consumer Rule: `docs/PLATFORM_CONSUMER_RULE.md`.

### Cross-surface consistency test (QA / product — required for M1 complete)

**Checklist:** `docs/MARKETPLACE_M1_CONSISTENCY_CHECKLIST.md`. Not another architecture exercise. No new Marketplace platform code while running it.

Create one real LOAD opportunity; open it across all five surfaces. Every surface must match price, can bid, CTA, bid count, visibility, lifecycle, closed state. Disagreement = consumer bug. Pass → **M1 Complete** → platform freeze → 80% M2 conversion UX.

---

## The rule (architectural guardrail)

**No Marketplace UI may interpret commercial lifecycle, visibility, pricing, or bidding rules directly. Every surface must consume `resolveCommercialOpportunity()`.**

Concretely:

- If a screen needs “what state is this load in”, it reads `opportunity.lifecycleState`
- If it needs price, it reads `opportunity.pricing`
- If it needs whether the viewer may bid, it reads `opportunity.permissions` / `opportunity.bidding`
- If it needs a button, it renders `opportunity.actions.primary` / `secondary`

It does **not** branch on raw `indents.status`, `posts.expires_at`, or campaign status to invent Bid CTA, price, or open-market visibility.

This is the same guardrail as Trip Operations: consume `deriveTripStage()` / `getStageMetadata()` — do not re-derive.

**Signal the rule is being skipped:** a new screen that answers commercial questions without calling `resolveCommercialOpportunity()`.

---

## `CommercialOpportunity` (M1)

Richer than a flat bag of booleans. One domain object every surface consumes.

```ts
type CommercialOpportunity = {
  lifecycleState:
    | 'draft'
    | 'published'
    | 'receiving_bids'
    | 'evaluating'
    | 'awarded'
    | 'executing'
    | 'completed';

  visibility: {
    /** Viewer may see this as an open-market opportunity */
    isOpenMarketVisible: boolean;
    /** Why hidden / shown (for debug + telemetry, not for UI branching) */
    reason?: string;
  };

  pricing: {
    targetPrice: number | null;
    displayPrice: number | null;
    currentBestBid: number | null;
    bidCount: number;
    currency: 'INR';
  };

  bidding: {
    canBid: boolean;
    canEditBid: boolean;
    hasBid: boolean;
    acceptsNewBids: boolean;
    myBidAmount: number | null;
  };

  campaign: {
    isSponsored: boolean;
    campaignId: string | null;
    planKey: string | null;
    /** Delivery / cap context when Reach is involved */
    delivery?: Record<string, unknown>;
  };

  relationship: {
    stage:
      | 'none'
      | 'consent'
      | 'execution_partner'
      | 'verified_partner';
    /** Strength / trust when M4 lands */
    strength?: number | null;
  };

  permissions: {
    canAward: boolean;
    canWithdraw: boolean;
    canBoost: boolean;
    isOwner: boolean;
  };

  actions: {
    primary: CommercialAction | null;
    secondary: CommercialAction | null;
  };
};

type CommercialAction = {
  kind: 'bid' | 'edit_bid' | 'award' | 'view_bids' | 'deploy' | 'boost' | 'open_story' | …;
  label: string;
};
```

Screens do **not** ask “Should I show Bid?”. They render `actions.primary` / `actions.secondary`.

### Resolver entry point

```ts
resolveCommercialOpportunity(input): CommercialOpportunity
```

`input` includes viewer org, indent (and/or snapshot), quotes/bids summary, campaign row if any, relationship stage if known.

### The rule

**A new marketplace surface consumes `CommercialOpportunity`. It does not derive its own interpretation of price, bid eligibility, commercial status, visibility, or CTA.**

Signal the rule is being skipped: a screen branches on raw `indents.status`, `posts.expires_at`, or campaign status for Bid / price / open-market visibility without calling the resolver.

### Proposed module home

```
features/marketplace/domain/
  commercialLifecycle.ts
  commercialVisibility.ts
  commercialPricing.ts
  commercialPermissions.ts
  commercialActions.ts
  commercialRelationship.ts
  commercialOpportunity.ts
  resolveCommercialOpportunity.ts
  index.ts
```

Services fetch (`features/network|indents|reach/services/`); domain interprets.
---

## M2 — Marketplace Experience (conversion UX)

**No new commercial rules. No new domain services.** Everything consumes `CommercialOpportunity`. Highest ROI surfaces for shipper time-on-task and award conversion:

### 1. Receiving Bids Workspace (highest ROI)

Passive bid list → evaluation / mission control:

- Suppliers reached · viewed · interested · bids
- Best Value · Fastest · Existing Partner · Marketplace · Network
- Compare · Award

### 2. Progressive Story Evolution

```
Published → Receiving Bids → Evaluating → Awarded → Executing → Completed
```

Each stage exposes richer information; the card does not stay static or vanish early.

### 3. Bid Comparison

Table: Supplier · Source · Price · ETA · Rating · Trips → Compare / Award / Negotiate. Likely bigger award-conversion impact than more bidding features.

### 4. Open Market Signals

Immediate confidence without extra taps: reached / viewed / interested / bids / still accepting bids.

### 5. Relationship Journey (UI only in M2)

Unknown → Bid → Execution Partner → Verified → Trusted. Writes remain M4 / ADR-012.

---

## M3 — Commerce Intelligence (pipeline before dashboards)

**Collect, don’t expose first.**

- publish → first view · publish → first bid
- bids per load · award rate · completion rate
- supplier response time · lane demand · price variance

Build the data pipeline before customer dashboards. Internal health KPIs (see Operating model) use this pipeline.

---

## M4 — Commerce Network

Only after repeated successful transactions:

```
Unknown → Bid → Execution Partner → Verified Business Partner → Trusted Partner
```

Work together → trust → relationship → network. Owned by ADR-012.

---

## M5 — Financial Platform

Only after transaction history exists: Assist, Escrow, Credit, Insurance, dynamic limits — on proven behaviour, not assumptions.

The transaction history starts with **Pulse Exchange** settlement: every org has a
protected default party, *Pulse Exchange*, as both a supplier and a customer.
Marketplace trips settle against it in two gates (one side records, the other
confirms; only then does it post to both orgs' Finance ledgers and Cash).
Pulse Exchange is the counterparty on both sides, including a bidder's own
execution trip; the shipper and bidder never become each other's Finance
parties. See
`docs/deployment/PULSE_EXCHANGE_TRANSACTION_LAYER_AUDIT.md` §7.

---

## Distribution vs monetization (design intent, locked 2026-09-02)

Not new commercial state — a naming of how the three existing distribution channels monetize once M4/M5 gate open. No platform code implied by this section; it exists so the model isn't re-derived from scratch next time.

The indent is the single commercial object (`CommercialOpportunity`). `circulation_target` (`integrated_supplier` | `marketplace` | `both` | `offline`) decides **who can discover it** — Network vs open Marketplace. Reach is **orthogonal** to `circulation_target`, not a fourth value: it is paid *promotion* of an indent that already has a circulation target, never a separate lifecycle or a second "Reach load."

| Channel | What it is | Monetization |
|---|---|---|
| Network (`integrated_supplier`) | Existing linked-partner distribution | Core platform, no incremental commission |
| Reach | Sponsored/boosted attention on an indent the business already circulated | Credits, spent on promotion |
| Marketplace (`marketplace`/`both`) | Open-market discovery | Subscription entitlement to publish/discover + transaction commission |

**Double-monetization guard:** if an indent is `both` + Reach-boosted and the winning bid comes through the Marketplace side, commission is decided by the transaction's marketplace eligibility/source — never simply because Reach also touched that indent. Reach charges for attention; Marketplace charges for access/transaction. Don't charge both for the same outcome.

**Find Loads scoping (feeds M2 / A4):** a business's "Find Loads" surface must resolve `CommercialOpportunity` for indents where `circulation_target ∈ {marketplace, both}` — not every indent in the org. Reach-boosted marketplace-visible indents get a "Sponsored" affordance in that same feed; it's still the same `CommercialOpportunity`, not a separate list.

### Omni-channel award classification (locked 2026-10-06)

`circulation_target = 'both'` publishes **one indent to two channels**: Network
(the shipper's approved suppliers) and Marketplace (the open market). Where an
indent is published never decides how its trip is classified. The **winning
offer** does:

| Winning offer | Channel | Trip |
|---|---|---|
| Accepted `market_bids` row from the awarded org | Marketplace | `source='market_bid'`, `source_market_bid_id`, no `supplier_id` (ADR-012), fee-gated |
| Offer from an org that is **not** an approved Network supplier, on a `marketplace`/`both` indent | Marketplace (open market) | No `supplier_id` (ADR-012) |
| Anything else (approved Network supplier, `integrated_supplier` indent) | Network | `supplier_id` linked, shipper's `client_price` kept, no Marketplace fee |

The single source of truth is `is_marketplace_indent_award(indent, bidder_org)`
(`20271006142659`). A deploy only binds to the awarded org's own accepted bid,
never to another bidder's.

### Contact visibility (locked 2026-09-02, A4.4)

A Marketplace bidder's contact info (currently: phone) is protected until the two sides have a real transaction relationship, and is enforced **backend-side**, never as client-side masking of an already-unmasked API response. This applies specifically to Marketplace bids between orgs with no prior relationship — not to Network (`integrated_supplier`) indents, which already have one.

- **Permission boundary = award**, via the existing `market_bids`/indent relationship (`accept_market_bid` setting `assigned_supplier_id`) — not a new contact-sharing mechanism, and not the separate Network `connection_requests`/`organization_relations` system. Awarding a Marketplace bid does not create a Network connection.
- **RPC contract:** any read of a `market_bids` row (`list_market_bids_for_indent`, `list_my_org_market_bids`) always returns a masked phone (`mask_phone_last4`, last-4-digits, same display format as the client-side `maskPhone()` in `features/public-profile/mappers.ts`); the unmasked phone column is `NULL` unless that bid's `status = 'accepted'`. The client renders whichever of the two columns is non-null — it never masks or reveals anything itself.
- **V1 (now):** award alone unlocks contact, free — no payment or terms-agreement step.
- **Designed seam for later:** monetization can insert a gate between award and reveal (e.g. commercial terms agreed → payment entitlement → contact revealed) without changing the underlying bid/indent/trip relationship. Not built — the RPC contract above only distinguishes masked vs. revealed, not a payment-gated third state.

### Indent Pool (locked 2026-10-06)

> **Indent Pool is the canonical operational grouping. Network exposes the relationship-aware view of the pool; Marketplace exposes an anonymous Pooled Opportunity derived from the same pool. Marketplace bids are visible to the shipper, but identity remains locked until the agreed acceptance/payment gate.**

- **Pool identity** = canonical pickup + drop + vehicle (`poolKey` / `poolKeyId` in `features/network/utils/pooledOpportunity.util.ts`). Both surfaces derive membership from that one function. A single indent is a pool of one — there is no "not a pool" case.
- **Network** (Trips → Indent → Indent Pool) shows indent IDs, party, bid status, allocation and per-indent Review. Row selection there is a local operational aid; it never creates or changes a pool.
- **Marketplace** (Find Loads → pool) shows only the requirement (route, vehicle, count, window, material, shipper count with identity hidden). The bidder submits one rate for every eligible member; there is no member selection. The full pool is read before bidding, and a pool that cannot be read completely is blocked, never partially submitted.
- **Not yet atomic (backend):** one pooled rate is currently written as one `market_bids` row per member indent, so update/retract, award and the fee gate are per indent. A pool-level bid, pool award/acceptance, terms state and identity release are future backend work; the UI must expose this limitation rather than imply atomicity.

---

## Consumers (today → M1 target)

| Surface | Today | Target |
|---------|-------|--------|
| Network feed | Feed RPC + card-local logic | `CommercialOpportunity` |
| Story Detail | Local bid / price / CTA | `actions` + `pricing` + `bidding` |
| Bid Sheet | Indent + ad-hoc target fallbacks | `bidding` + `pricing` |
| Story Preview | Partial fields | Full opportunity / validated snapshot |
| Award / Review Hub | Indent + quotes panels | `permissions.canAward` + `actions` |
| Load Center | `loadCenter.model` + filters | Same lifecycle / bidding definitions |
| Reach campaign | Campaign + local clamps | `campaign` + delivery engine |
| Trip after award | Trip Operations Platform | Handoff at `executing` |

---

## Extending the platform

1. Read this document (and ADR-012 if relationship).
2. Extend pure domain modules — do not add screen-local commerce interpretation.
3. Wire the surface as a consumer of `CommercialOpportunity`.
4. Lifecycle rule change → update this file in the same PR.
5. Relationship progression → ADR-012, not a third lifecycle story.

---

## In one sentence

Marketplace is a platform with one commercial object — `CommercialOpportunity` — so Feed, Story, Bid, Reach, Load Center, and Award stop inventing commerce, the same way Trip Operations consolidated stage interpretation behind `deriveTripStage()`.
