# Pulse Growth Platform

**v2.0 — Campaign Distribution & Incentive Platform · Production Complete · Architecture Frozen · January 2027**

*"Boost V2" was the epic name; the shipped result is a platform. Its four integrity strengths: **transactional** (immutable snapshots, escrow, ledger-based settlement), **operational** (structured delivery, runbooks, reconciliation, Campaign Timeline), **analytical** (single delivery fact table, explainable health scoring, measurable KPIs), and **governance** (permanent platform principles, ADR-controlled change management, versioning, documentation, pilot gates). See Final Sign-off at the end of this document.*

*A short, non-technical product overview. This document is meant to evolve phase by phase rather than be replaced — see `docs/decisions.md` (ADR-009) for the underlying architectural decisions, the migration files under `supabase/migrations/2026122*`–`2027010*` for implementation detail, and `docs/PULSE_GROWTH_CHANGELOG.md` for the version history going forward.*

**This document's ownership:** platform architecture, governance (principles, freeze, change policy), Final Sign-off. Pilot entry gates and rehearsal evidence live in `docs/PILOT_ENTRY_VALIDATION.md`. Release history and deferred items live in `docs/PULSE_GROWTH_CHANGELOG.md`.

## Pilot Baseline (unified operating model)

One operating model covers both major workstreams. Both are **operational platforms** — not active feature development — under the same change policy.

| Workstream | Scope |
|---|---|
| **Pulse Growth Platform v2.0** | Campaign Engine · Marketplace Engine · Financial Engine · Intelligence Layer |
| **Admin Console** | Credits · Referrals · Reward Rules · Boost Control Center · Verification · Team · Document Preview |

**Unified change policy** (same for Growth and Admin Console) — answer in order:

1. **Preserve correctness?** Production defects, reliability, security, performance that blocks ops → implement as operational improvement.
2. **Pilot evidence justifies it?** Repeated operator behaviour, customer feedback, Pilot Reviews, operational metrics, incident learnings → ADR (or equivalent) **before** implementation.
3. **Otherwise** → backlog until recurring operational evidence demonstrates value.

**Lifecycle:** Operate → Observe → Learn → Improve. Success = operational outcomes (efficient KYC, successful campaigns, correct settlement/reconciliation, effective operator workflows, actionable Pilot Reviews, reliable support) — not feature throughput.

**Documentation set:**

| Document | Primary responsibility |
|---|---|
| `docs/PULSE_GROWTH_PLATFORM.md` | Platform architecture, governance, Final Sign-off |
| `docs/PILOT_ENTRY_VALIDATION.md` | Pilot entry criteria, validation gates (P1–P3), rehearsal evidence |
| `docs/PULSE_GROWTH_CHANGELOG.md` (v2.0.3+) | Platform evolution, deferred items, release history |

From here the highest-value work is: execute the documented **P1→P2→P3** rehearsal, begin pilot operations, and let future changes be driven by observed evidence — not anticipated requirements.

**Versioning:** the platform is formally versioned from here on. `2.0.0` is the Boost V2 production milestone; patch releases (`2.0.1`, `2.0.2`, …) cover bug fixes, performance work, analytics improvements, and UI polish under the frozen architecture. A new minor/major version requires a new epic with its own definition of done — "Boost V2" does not grow indefinitely. History: `v0.1` established the core architecture everything else extends (Reach engine, Credits, Wallet, Ledger, Campaigns, Admin adjustments, Platform IAM, Upgrade flow); `2.0.0` completed the campaign engine on top of it.

## The Product in One Diagram

The full loop — why credits exist at all is that using them productively creates more opportunities to earn them again:

```
               Pulse Growth Platform

      Earn Credits
            │
            ▼
      Credits Wallet
            │
            ▼
      Pulse Boost Campaign
            │
            ▼
 More Reach → More Views → More Bids
            │
            ▼
     More Business Won
            │
            ▼
 More Activity on Pulse
            │
            ▼
 More Opportunities to Earn Credits
```

Today, "Earn Credits" is a single manual admin action (Operations grants credits directly) — the loop doesn't close itself yet. Everything from Credits Wallet through More Bids is real and working; the "More Business Won → More Activity → More Opportunities to Earn Credits" return path is the reason Phase 2.4 (Automation) matters, not just a nice-to-have.

## Why Growth Exists

**Growth exists to increase successful business transactions on Pulse — not to maximize campaign impressions.** That sentence is the whole philosophical difference between Reach and an ad platform. Everything should optimize for:

```
More Loads → More Bids → More Trips → More Revenue
```

**Not:**

```
More Clicks → More CTR → More CPM
```

**North Star metric: Additional Qualified Bids Generated.** Not impressions, not clicks, not views — customers ultimately care whether Reach gets them more relevant bids. Every other number in this document supports that one.

## Growth Principles

Eight rules that should keep every future Growth feature aligned, not just Reach:

1. **Simple for customers.** Customers should never configure campaigns like an ad platform — pick a plan, pay, done.
2. **Configurable for operations.** Credits, rewards, promotions, and plans are configuration (database rows an admin edits), not application code.
3. **Everything is event-driven.** Business events (verification approved, invitation accepted, campaign published) trigger rules — rules don't poll for state.
4. **One wallet.** Every growth incentive — however earned, however spent — moves through the same `pulse_credit_wallets` ledger. No parallel currencies.
5. **Reach is reusable.** Stories are the first consumer. Marketplace, Vehicles, Drivers, and future products reuse the same campaign/payment/lifecycle/analytics engine (see ADR-009) instead of each building their own.
6. **Customers buy outcomes, not advertising.** Don't expose CPM, CPC, an audience builder, demographics, or keywords. Expose Reach, Views, Bids, Upgrade — that's it. This is a permanent constraint, not a temporary MVP simplification.
7. **Snapshots are immutable.** A campaign becomes an immutable marketing artifact at publish time. Editing a story doesn't alter active campaigns; deleting a story doesn't alter active campaigns; campaign analytics always refer to the snapshot that was published. This one sentence explains the campaign/content boundary: content authoring and campaign execution are separate concerns, and the customer bought distribution, not a story row. (Shipped: `20261230000000` snapshot columns, `20270108000000` snapshot lifecycle.)
8. **One delivery record.** `reach_campaign_targets` is the canonical delivery fact table — one row per (campaign, org) carries the full lifecycle: released → viewed → bid → converted. Every future analytics feature joins dimensions (organization, wave, campaign, reward) onto this table; no dashboard re-derives delivery truth from scattered event tables. That keeps reporting consistent across every surface that answers "did this campaign deliver?"

## Phase 2.1 — Reach MVP (this milestone)

### Problem Statement

Loads often don't reach enough fleet owners. A broadcast load sits in the network feed alongside everyone else's — there's no way for an organization to say "this one matters more, put it in front of more people."

### Solution

Pulse Boost lets an organization promote a broadcast to a wider audience, paying with Pulse Credits or cash. Three plans — Starter, Growth, Business — each promise a reach range (up to 25 / 60 / 150 verified fleet owners) and a fixed duration (24h / 48h / 72h).

### Customer Journey

```
Broadcast  →  Boost  →  Campaign  →  Analytics
```

1. **Broadcast** — org posts a load (existing Stories flow, unchanged).
2. **Boost** — from that story, pick a plan and pay with credits (instant) or cash (recorded, not yet gateway-confirmed — see Out of Scope).
3. **Campaign** — the load is promoted for its plan's duration; a progress sheet shows status, reach delivered, and time remaining, and offers an in-place upgrade to a higher plan (charging only the price difference).
4. **Analytics** — Reach History shows every campaign (active and past) with exactly four numbers: Impressions, Views, Bids, Credits Used. No CTR/CPM/CPC — this is an operations audience, not a marketing one.

### Operations Journey

```
Grant Credits  →  Wallet  →  Ledger  →  Customer Boost
```

Since customers currently have no way to *earn* credits (see Out of Scope), Operations grants them manually from the existing admin console (`analytics/`, `Growth › Credits`): search an org, grant a preset or custom amount with a standardized reason, and the org can immediately boost. Every grant is auditable in the ledger (who — self-reported today, no login yet; when; why; how much).

**Manual credit adjustments are an operational bootstrap mechanism, not the end-state** — expected to decrease over time as automated reward rules (Phase 2.4) are introduced.

### What's Intentionally Out of Scope (this phase)

- **Earn Credits** (customer-facing referral/verification reward screens)
- **Referral rewards** and **Verification rewards** as automated triggers (the reward *amounts* exist as configurable DB rows — `reward_rules` — but nothing surfaces them to customers or auto-grants beyond the existing KYC-approval hook)
- **Reward Rules / Reach Plans / Invitation Rules / Promotions** as an admin-configurable module
- **A real payment gateway** for cash boosts (cash campaigns are recorded `pending` and stay in `draft` until manually confirmed — no such confirmation flow exists yet either)
- **AI optimization** (best publish time, audience recommendations, campaign health scoring beyond simple rule-based states)
- **Credit expiry / lifecycle rules** (do promotional, purchased, or refunded credits expire? — deferred to a future ADR until there's real commercial need)

### Success Metrics (Phase 2.1)

The document so far says what's being built. This is how leadership will know if it's working — a handful of numbers per area, not a full dashboard:

**Customer Adoption**
```
Broadcasts Created → Boost Conversion % → Credits Used → Campaign Completion
```

**Campaign Performance**
- Reach Delivered
- Views
- Bids
- Upgrade Rate

**Growth**
- Credits Issued
- Credits Spent
- Manual Adjustments (should trend down over time — see the bootstrap statement above)
- Automated Rewards (0 today — becomes real in Phase 2.4)

**Platform Health**
- Campaign Success %
- Wallet Errors
- Failed Payments
- Unauthorized Credit Attempts (should be 0 — this is a security invariant, not a business metric; see the `increment_credit_wallet` auth-bypass bug caught and fixed during Phase 2.1)

### Questions to Validate in the Demo

- Is the pricing (₹250/₹500/₹1000 → Starter/Growth/Business) understood?
- Do people understand "Boost" as an action, and "credits" as a currency? Would they actually pay ₹250 to promote a broadcast?
- Does the 4-metric analytics view answer "how is my campaign doing?"
- Does the Grant Credits admin workflow feel operationally practical to Ops?

## Phase 2.2 — Reach Home *(complete)*

Customer-facing Reach entry in the Pulse app: `/reach` (Credits Balance, Reach Delivered, Active Campaigns, Quick Actions, Recent Campaigns, link to Campaign History), `/reach/earn-credits` (customer-facing placeholder only — no referral/verification automation yet, see Phase 2.4), and a discovery card in the Network screen so Reach doesn't require opening a Story first to be found. No schema, RPC, payment, or lifecycle changes — purely navigation and UI reusing Phase 2.1's existing screens/components (`ReachCampaignCard`, `BoostProgressSheet`, `BoostSheet`).

**Follow-up: Campaign Identity & Lifecycle Integrity** *(complete)* — campaign cards showed only a plan badge with no indication of which load/story was boosted, and deleting a story silently left its campaign in a stale `active` state (or, in a rare RLS-fallback hard-delete path, would have cascade-deleted the campaign and its purchase/event/metrics history outright). Fixed with: a `reach_campaigns` snapshot (route, vehicle, material, post type, posted-at, captured at publish time so it survives the source story being edited or deleted), a `cancel_reach_campaign` RPC wired into the story-deletion flow (with a warning dialog naming the consequence before deleting), the `post_id` foreign key changed from `ON DELETE CASCADE` to `ON DELETE SET NULL` so campaign history is never destroyed by a source-post deletion, and a dedicated Campaign Detail screen (`/reach/campaign/:id`) as the single source of truth for one campaign. **Campaigns cannot be refunded once activated** — cancelling a campaign (including via story deletion) stops delivery but does not reverse any credits or cash already spent; this is a deliberate policy, not a missing feature, since Reach delivery may already have occurred by the time a campaign is cancelled.

**Pilot-period messaging change:** every "Reach up to N verified fleet owners" style copy (plan picker, boost confirmation, campaign progress) has been replaced with outcome language — "Promote your load to relevant fleet owners and shippers across Pulse" — and the customer-facing "Reach Delivered" label has been renamed to **"Campaign Reach"** everywhere (Reach Home, Campaign History, BoostProgressSheet, Campaign Detail). This is a UI-copy-only change, not a computation change: the underlying number is still `min(impressions, plan.estimated_reach_max)` (see Phase 2.3 doc). Exact audience counts implied a delivery guarantee the product doesn't yet enforce — once Phase 2.3 ships real accounted delivery, "Reach Delivered" is the correct name to bring back.

## Phase 2.4 — Growth Activation (Referrals) *(designed, mostly already built — not wired; resequenced ahead of 2.3)*

```
Invite Link/Code
        ↓
Referred org verifies
        ↓
Referrer +500, New org +500
        ↓
Ledger entries + Notification
```

Full design: `docs/GROWTH_REFERRALS_DESIGN.md`. Renamed from "Growth Referrals" — referrals are the first activation rule this exposes, not the only one it will ever support (verification/profile-completion/first-trip/first-bid can follow later without an architecture change).

**Resequenced ahead of Phase 2.3.** Reasoning: today Reach has a way to *spend* credits (boost a load) but almost no way to *earn* them outside a manual admin grant — a credit economy needs both sides working before the spend side gets optimized further. This phase now runs, and the pilot goes live with a working earn+spend loop, *before* Phase 2.3 implementation starts.

**The most important finding while designing this phase: almost the entire backend already exists in production and has never been used.** `reward_rules`, `pulse_credit_referrals`, `record_referral()`, and `platform_approve_verification()` (which already atomically approves KYC, awards the verified org 500 unconditionally, *and* settles any pending referral for the referrer) all shipped in `20261224030000_reach_growth_loop.sql` and are live on the linked project today — `pulse_credit_referrals` simply has zero rows because nothing in the app has ever called `record_referral`. Both parties get 500: the verified org's 500 already fires unconditionally; the referrer's side needs one config change (`reward_rules.referral_milestone_verified` is currently 250, not 500) and no code change, since the existing function already pays both parties in one call.

Remaining real work: an invite link (primary) with the referral code as a visible fallback for manual entry, a `rejected` terminal status (there isn't one yet), replacing the `ReachEarnCreditsScreen` placeholder with the real flow, admin Referrals *and* Reward Rules views (exposing the existing `reward_rules` table for CRUD instead of requiring SQL), and wiring the `ReferralCompleted` platform event (already emitted) to an actual notification. **Not implementing now** — captured in the design doc, to be built next, ahead of the pilot's launch.

**Future simplification, not for this phase:** Reward Rules and Invitation Rules will likely converge into one rule engine with a type field (Verification / Invitation / Promotion / Campaign) rather than staying as separate screens. Don't build this distinction now; build it if/when a third rule type makes the duplication actually hurt.

## Phase 2.3 — Reach Delivery Engine *(substantially delivered as a corrective enhancement — see below)*

`get_network_feed` originally showed any actively-boosted post to every organization on the platform, unfiltered and undeduplicated — see `docs/REACH_DELIVERY_ENGINE_DESIGN.md` for the original design. Its substance shipped early, triggered by a field finding (a real campaign spent 500 credits for 0 impressions and 0 bids), and is classified as a **corrective enhancement, not a new feature** — it makes the original product promise ("reach") operationally true rather than adding capability:

- **Filtering / eligibility** — `reach_campaign_targets` allocation is verified-orgs-first; unverified only fill what the verified pool can't cover.
- **De-duplication** — delivery is counted per distinct target row, not raw impressions.
- **Cap enforcement** — wave sizes derive from the plan's `estimated_reach_max` (40/40/20 pacing + a one-time no-bid escalation of up to +20%).
- **Delivery independent of the source story** — snapshot lifecycle (Growth Principle 7).

Implementation: `20270107000000_boost_v2_structured_delivery.sql`, `20270108000000_campaign_snapshot_lifecycle.sql`; full detail in `docs/BOOST_V2_CAMPAIGN_ENGINE.md`. What remains from the original design is optimization, not correctness — ranking quality within the eligible pool, and whether delivery should optimize for impressions, qualified bids, or verified-audience reach. That question stays gated on pilot evidence and belongs to Pulse Intelligence.

## Phase 3 — Intelligence *(not started, optimization layer only)*

Optimization layers on top of a proven, reliable product — not a prerequisite for anything above: delivery optimization, AI-driven recommendations, campaign performance predictions, fraud detection, best-posting-time suggestions, smart audience ranking (replacing Phase 2.3's deterministic ranking with a scored/learned one). Nothing here is required for Reach to work correctly; it makes an already-working system smarter.

## The Four Platform Layers

The platform's stable structure — three transactional engines, each with one clear ownership, plus an intelligence layer that is deliberately not a fourth engine:

```
1. Campaign Engine            2. Marketplace Engine        3. Financial Engine
   — owns DISTRIBUTION —         — owns DEMAND GENERATION —   — owns MONEY —
   Campaign lifecycle            Fleet stories                Campaign payments
   Immutable snapshots           Driver stories               Incentive budgets
   Structured delivery           Opportunities                Escrow
   Wave pacing                   Direct bidding               Driver rewards
   Delivery escalation           Recommendations              Settlement · Refunds
   Timeline                      Campaign participation       Driver ledger
                    └──────────────┬──────────────┘
        4. Intelligence Layer — owns DECISION SUPPORT
         Health · Suggestions · Opportunity Scoring · Control Center
                     · future Pulse Intelligence
```

Each layer has one purpose: the Campaign Engine delivers campaigns reliably and transparently; the Marketplace Engine generates quality marketplace engagement; the Financial Engine maintains financial correctness and auditability; the Intelligence Layer **explains the platform — it does not control it**. The intelligence layer is built on top of the platform and never becomes transactional: it explains platform truth, it never changes it (Permanent Principle 4 below).

Analytics across all layers reads from the canonical delivery record (Permanent Principle 2):

```
Campaign
    │
    ▼
Target Record  (reach_campaign_targets — the fact table)
    │
    ├── Organization   (who it was delivered to, verified snapshot)
    ├── Wave           (when it was scheduled: 1–3 paced, 4 escalation)
    ├── Delivery       (released_at)
    ├── Engagement     (viewed_at)
    ├── Bid            (bid_at)
    ├── Conversion     (converted_at)
    └── Reward         (via reach_referrals → driver_ledger)
```

## Permanent Platform Principles

Five rules that never change without an Architecture Decision Record in `docs/decisions.md`. The first two restate Growth Principles 7 and 8; the rest are equally binding:

**1. Campaign snapshots are immutable.** Editing stories never changes campaigns; deleting stories never cancels campaigns; analytics always use the published snapshot.

**2. There is only one delivery truth.** `reach_campaign_targets` is the canonical delivery fact table. Every dashboard derives delivery metrics from it; nothing rebuilds delivery from event logs.

**3. Settlement is ledger-driven.** Money is never corrected through direct table updates — corrections are transactions. Every credit, escrow reservation, reward payout, and refund is a row in `pulse_credit_transactions` or `driver_ledger` with a reason; an operator fixing a balance writes a compensating entry, never an `UPDATE` on a balance column.

**4. AI never becomes transactional.** The intelligence layer reads facts and produces explanations and recommendations; it never writes settlement, delivery, or lifecycle state. The only permitted direction of flow:

```
Campaign → Delivery → Marketplace → Settlement → Facts → Intelligence
```

Never `AI → Settlement`. A human (or a deterministic, ADR-approved rule) sits between every recommendation and every transaction.

**5. Authorization separates identity, authority, and data ownership.** Identity establishes organisational belonging. Authority grants permission to act on behalf of an organisation. Data ownership governs access to resources through least-privilege policies. These concerns must remain distinct in schema, helper functions, RLS policies, and application logic.

```
User → Organization Membership (identity / belonging)
         → Operational Authority (staff permissions)
         → Resource Access (RLS)

Separately: Driver → Own-row resources (trips, ledger, salary/reward requests)
```

**Test for every new feature or ADR** — if any question cannot be answered independently, the design likely violates Principle 5:

| Question | Canonical source |
|---|---|
| Does this user belong to the organisation? | `is_org_member()` / `organization_members` |
| Can this user perform this organisational action? | `is_org_staff()` (or another explicit authority helper) |
| Which specific rows may this user access? | Resource-specific RLS (including own-row policies where applicable) |

**Enforceability:** Any proposal that conflates organisational membership, operational authority, and data ownership must either be **redesigned** or **explicitly justify why Principle 5 does not apply**.

**Design review checklist** (every new table, helper, or RLS policy):

- [ ] Does this check **identity**?
- [ ] Does this check **authority**?
- [ ] Does this enforce **least-privilege data ownership**?
- [ ] Could adding a new role inadvertently **widen** access?
- [ ] Is the policy intent **obvious from the helper names**?

**Governance chain for ADR-010:** Principle 5 → ADR-010 → **Approved Role Matrix** (named sign-off) → Helper contract → RLS → P1–P3 → Pilot Entry. Implementation must not start without matrix sign-off (`docs/ADR-010-RLS-AUDIT.md`).

**RLS traceability (security review):** every policy must answer:

1. Which **matrix row** authorizes this policy?  
2. Which Principle 5 concern is enforced — **identity**, **authority**, or **data ownership**?  
3. Does the helper / predicate (`is_org_member`, `is_org_staff`, or resource-specific own-row logic) **match that intent**?

If any answer is missing, the policy is **non-conformant** until corrected or explicitly exempted under Principle 5.

## Milestone: v2.0.0 — Pulse Boost V2 Production Complete ✅

Shipped and live (migrations `20270101000000`–`20270106000000`). What started as the "Reach" promotion feature is now a platform coordinating distribution, recommendations, bidding, incentives, and analytics — without changing the existing marketplace model:

- **Distribution** — campaigns target fleet and/or driver story feeds (`distribution_channels`, default `{fleet}` so every pre-V2 campaign and flow is unchanged). Trip identity fixed to the indent (`snapshot_source_indent_id`).
- **Opportunity Network** — dual driver participation derived from org membership (employed → recommend, independent → direct bid, invited → join-fleet growth loop); Fleet Owner **Opportunities** inbox with priority scoring, structured driver intent, and Approve → pre-filled bid.
- **Incentives** — Referral Escrow reserved from the credits wallet at publish (liability, not revenue), reward released only on conversion (paid to the driver in INR via the existing `driver_ledger` — no new ledger), unused escrow auto-refunded at completion/cancellation.
- **Intelligence (first slice)** — customer-facing Campaign Health + rules-based Smart Suggestions; internal **Boost Control Center** in the admin console (`get_boost_control_center`).

### Definition of Done — Boost V2 (acceptance checklist)

- ✅ **Architecture complete** — one campaign model (`reach_campaigns`) spans both channels; no parallel product, no duplicated ledger.
- ✅ **Security reviewed** — every table RLS-enabled; every RPC is `SECURITY DEFINER` with an explicit caller guard (org membership, driver identity, or platform permission) and `search_path = ''`; internal RPCs revoked from PUBLIC. Reviewed during implementation; no formal external audit yet.
- ✅ **Settlement verified end-to-end** — escrow reservation at publish, reward payout on conversion (INR via `driver_ledger`), and unused-escrow refund on expiry/cancel each verified against the remote database with SQL checks on `pulse_credit_transactions` and `driver_ledger`.
- ✅ **Documentation updated** — this doc, `docs/GROWTH_REFERRALS_DESIGN.md`, and the changelog.
- ✅ **Analytics available** — funnel events emitted at every referral state change; customer-facing Campaign Health card; per-campaign metrics.
- ✅ **Internal operations dashboard available** — Boost Control Center in the admin console (`get_boost_control_center`).
- ✅ **Pilot ready** — publish → distribute → recommend → approve → bid → reward → refund exercised end-to-end on the linked environment.
- ✅ **No known critical bugs** — the two issues found during the epic (inconsistent trip IDs, driver payout path) were fixed in migrations `20270101000000` and `20270103000000`.
- ✅ **Architecture frozen** — no new schema unless bug fixes.

### Pilot Freeze (highest-priority operating rule)

**Pulse Growth Platform v2.0 and the Admin Console are both Pilot Ready and share one freeze.** Changing foundational behaviour during a pilot invalidates customer feedback and makes metrics impossible to interpret — the freeze is what makes pilot data trustworthy.

| Allowed during pilot | Not allowed during pilot (ADR + pilot evidence required) |
|---|---|
| Production bug fixes | New UI features |
| Reliability / security / performance improvements | Workflow redesign |
| Documentation corrections | New campaign mechanics |
| Operational tooling that does **not** alter platform behaviour | Financial model / ledger / settlement changes |
| Accessibility and copy refinements justified by pilot feedback | Marketplace or delivery engine changes |
| **Correctness/security blockers that preserve documented behaviour** (e.g. ADR-010) | AI workflow changes |

Late-cycle operator UX polish (e.g. Reward Rules dirty-state, Control Center refresh) is allowed only when it does not alter campaign evaluation, settlement, ledger behaviour, marketplace logic, delivery, or financial accounting.

NOT changeable under any framing without an ADR (`docs/decisions.md`): campaign lifecycle, delivery engine, wave logic, driver participation model, settlement engine, escrow accounting, campaign snapshots, marketplace workflows.

Two UI rules ride along with the freeze:

- **The Campaign Timeline is read-only and factual.** It reflects actual backend state (`published_at`, released waves, escalation, `expires_at`/completion) and never shows optimistic or planned steps.
- **Intelligence stays explainable.** Campaign Health, Smart Suggestions, and Opportunity Scoring remain explainable, deterministic, and measurable. Later AI enhances these rules with evidence, never replaces them with opaque output.

**Lifecycle:** Architecture Complete → Implementation Complete → **Pilot Ready** → Operational Validation (ADR-010 → P1–P3) → Pilot Review → GA Decision. Remaining before Pilot Entry: implement **ADR-010** (driver `organization_members` + RLS hardening — freeze-allowed correctness/security blocker), then complete live rehearsals in `docs/PILOT_ENTRY_VALIDATION.md`. Do not re-scope to Independent-only without explicit business acceptance criteria.

**Next initiative — Pulse Intelligence** *(separate epic, not Boost V3, gated on pilot evidence)*: optimisation, not workflow. Sequencing: v2.0 → Pilot → Operational Findings → Customer Behaviour → Pulse Intelligence → v3.0.

- **Campaign Intelligence** — best launch time, audience, duration, incentive, tier.
- **Marketplace Intelligence** — best drivers, best fleets, lane recommendations, capacity prediction.
- **Financial Intelligence** — incentive ROI, escrow optimisation, budget forecasting.

**Operations:** `docs/RUNBOOK.md` is the production runbook — health checks, escrow reconciliation, settlement verification, recovery, rollback, and release checklist for whoever gets paged.

## Pilot KPIs — measure adoption before building more

The pilot answers exactly one question: **does Pulse Growth generate better logistics outcomes than standard marketplace distribution?** Success is measured through adoption, conversion, delivery quality, settlement accuracy, and operational stability — not feature count.

The question during the pilot is never "what should we build next?" — it is "how are customers actually using the platform?". These are the numbers that answer it; every one is measurable from the canonical delivery record, `reach_referrals`, or the Control Center today. **Nothing else should be added to this list before the pilot:**

| KPI | Why it matters |
|---|---|
| Campaigns launched | Platform adoption |
| Driver Story adoption % | Channel validation |
| Recommendation → Approval | Fleet trust |
| Approval → Bid | UX friction |
| Bid → Trip | Marketplace quality |
| Incentive utilisation | Budget optimisation |
| Escrow refund % | Incentive sizing |
| Time to first bid | Delivery effectiveness |
| Campaign Health distribution | Product effectiveness |

**Operational readiness precondition:** before onboarding the first pilot customer, run through the Runbook end-to-end — Control Center review, settlement reconciliation, escrow verification, and incident procedures. The documentation is sufficient; the readiness step is using it once for real.

## Pilot Review Process

Every pilot campaign gets a structured review — seven questions, one per concern, so findings accumulate instead of evaporating:

1. **Campaign** — what was launched (plan, channels, incentive, route)?
2. **Delivery** — did all waves release correctly (Delivery panel / `get_reach_campaign_delivery`)?
3. **Marketplace** — were bids generated? Through which channel?
4. **Financial** — were incentives settled correctly (Runbook §3–4 queries clean)?
5. **Customer** — what feedback was received, verbatim?
6. **Operations** — was manual intervention required (Runbook §5)?
7. **Product** — what evidence from this campaign should influence Pulse Intelligence?

## Pilot Exit Criteria

Separate from KPIs, and written down **before** the pilot to prevent hindsight bias. The pilot is
done when all of the following hold. Thresholds below are provisional (engineering's proposal)
and need business sign-off before the pilot starts — but each criterion's *measurement* is
already implemented, so evaluation is mechanical, not anecdotal.

| # | Criterion | Provisional target | Measured by |
|---|---|---|---|
| 1 | Campaigns launched | ≥ 25 campaigns across ≥ 5 distinct orgs | `reach_campaigns` count / distinct `org_id` |
| 2 | Driver Stories adoption | ≥ 40% of campaigns include the `driver` channel | Control Center "Driver Story Adoption" |
| 3 | Recommendation → approval rate | ≥ 30% of decided recommendations approved | `reach_referrals` decided vs approved |
| 4 | Reward settlement success | 100% — every `rewarded` referral has a matching `driver_ledger` entry | Runbook §4 queries return empty |
| 5 | Escrow reconciliation | 0 unreconciled transactions; invariants hold for all campaigns | Runbook §3 queries return empty |
| 6 | Recommendation → decision time | Median below 4 working hours | Control Center funnel timing |
| 7 | Full lifecycle without manual intervention | ≥ 3 pilot customers complete publish → distribute → opportunities/bids → completion → auto-refund with zero operator SQL | Absence of manual recovery actions (Runbook §5) during their campaigns |

If a criterion fails, the pilot produces a finding, not a shrug — e.g. #3 failing points at
inbox UX or reward levels; #6 failing points at fleet-owner notification latency. Findings feed
Pulse Intelligence's evidence base either way.

## Roadmap Status

```
Pulse Growth Platform

v2.0 — Production Platform ──────────────────────────── ✓ COMPLETE (frozen)
  Reach MVP · Reach Home · Boost V2 (driver distribution,
  Opportunities, Referral Escrow, Health, Control Center)

v2.0.x — Operational Excellence ───────────────────────── current
  • Bug fixes  • Performance  • UI polish  • Analytics improvements
  (no new schema unless bug fixes — see RUNBOOK.md release checklist)

Pilot Validation ──────────────────────────────────────── current
  • Customer onboarding  • KPI measurement  • Marketplace tuning
  Exit gate: ALL Pilot Exit Criteria above pass

Pulse Intelligence ────────────────────────── gated by pilot evidence
  • Evidence-driven recommendations  • Campaign optimization
  • Lane intelligence  • Reward optimization  • Capacity prediction

v3.0 ──────────────────────── built only after pilot evidence exists

Parked (re-sequenced against pilot findings, not before):
  Phase 2.4 Growth Activation (docs/GROWTH_REFERRALS_DESIGN.md)
  Phase 2.3 ranking optimization — the delivery engine's correctness
  layer already shipped (structured delivery + snapshot lifecycle);
  only ranking/optimization remains, gated with Pulse Intelligence
```

Pulse Intelligence is deliberately not "next" — it is **gated**. The gate protects the platform
from building sophisticated optimization before the core mechanics are validated. The governance
model that enforces it: **platform versioning** defines what is released, the **Pilot Freeze**
defines what won't change, the **changelog** records how it evolves, the **Definition of Done**
explains why it can be trusted, the **Runbook** keeps it operable, the **Pilot Exit Criteria**
decide when the gate opens, the four **Permanent Platform Principles** are binding engineering
rules, and any change to the campaign lifecycle, settlement, or delivery model starts with an
**ADR**. Future epics earn their place through evidence rather than enthusiasm.

**Change control until the pilot concludes** (Growth Platform **and** Admin Console — same policy):

Every proposed change answers these two questions **in order**:

1. **Does it preserve correctness?**  
   Examples: production bugs, data integrity, security, operational reliability, performance that blocks usability.  
   If yes → treat as an operational improvement and implement through the normal engineering process (no ADR required unless a permanent principle or freeze boundary is touched).

2. **Does pilot evidence justify the change?**  
   Evidence must come from: repeated operator behaviour, customer feedback across multiple accounts, Pilot Review findings, operational metrics, or incident postmortems.  
   If yes → document rationale in an ADR (`docs/decisions.md`) **before** implementation.

**Otherwise** the request stays in the backlog until there is sufficient operational evidence. Speculative enhancements must not compete with verified operational needs.

Commit categories that fit this policy: (1) Pilot Findings, (2) Bug Fixes, (3) Operational Improvements, (4) ADRs that alter a permanent principle, platform layer, or freeze boundary.

**Operating philosophy (lifecycle shift):**

```
Build → Ship          (complete for v2.0 + Admin Console)
         ↓
Operate → Observe → Learn → Improve
```

Engineering effort during the pilot primarily supports **reliability**, **customer success**, **operational excellence**, and **measured learning** — not expanding functionality.

**Success is measured by operational outcomes**, not features delivered / screens redesigned / components added. Examples:

- Operators complete KYC reviews efficiently
- Fleet owners successfully manage campaigns
- Drivers participate as intended
- Rewards and settlements reconcile correctly
- Support resolves issues with existing tooling
- Pilot Reviews produce actionable, evidence-backed improvements

**Post-Pilot Assessment (intentionally unwritten).** One governance artifact is deliberately
deferred until real usage exists: when the pilot ends, create `docs/POST_PILOT_ASSESSMENT.md`
with this structure — Executive Summary · Pilot Objectives vs Outcomes · KPI Results · Customer
Feedback · Operational Incidents · Financial Reconciliation · Architecture Observations ·
Decisions Made · ADRs Raised · Recommended v3.0 Priorities. That document is the bridge between
v2.x and v3.0, ensuring the next evolution is driven by evidence rather than recollection. Do
not create it early; an assessment written before the pilot ends is a plan wearing the wrong
name.

## Not To Be Built Until the Pilot Completes

An explicit deny-list, because every one of these will look tempting and every one requires statistically meaningful production data to be anything other than a guess:

- Driver Reputation (the data model already accumulates everything a score needs — recommendations, conversions, rewards, trips, revenue in `reach_referrals`/`driver_ledger`; a strong differentiator built too early is just noise with a leaderboard)
- Leaderboards, gamification
- AI ranking, behavioural scoring
- Dynamic incentives
- New campaign types
- Additional settlement models

## Recommendation

**Do not add new product capabilities.** Treat v2.0.x as a stable production platform. Success is no longer measured by features shipped — it is measured by customer adoption, marketplace conversion, operational reliability, financial accuracy, and pilot outcomes (the Pilot KPIs and Exit Criteria above). Those results — not assumptions — define the backlog for Pulse Intelligence and, eventually, Pulse Growth Platform v3.0.

**Where engineering time goes now:** more time in the Control Center, the Runbook, pilot reviews, incident reports, and customer interviews than in writing new platform code. That is how mature platforms improve. Pilot review findings become backlog items — not opinions.

**Vision for v3.0:** not a bigger Boost — a smarter Boost. The platform foundation is complete; the next competitive advantage is intelligence:

```
Campaign → Delivery → Marketplace → Settlement → Evidence
         → Pulse Intelligence → Customer Recommendations
```

The differentiator stops being what the platform can do and becomes how well it helps customers make decisions. From this point onward, customer behaviour is the primary design input — every major investment after v2.0 is justified by pilot evidence, not by additional architectural ideas.

## Final Sign-off

**Pilot-ready workstreams (governed as operational platforms — not active feature development):**

| Workstream | Status |
|---|---|
| Pulse Growth Platform v2.0 | ✅ Pilot Ready |
| Admin Console — Credits | ✅ Pilot Ready |
| Admin Console — Referrals | ✅ Pilot Ready |
| Admin Console — Reward Rules | ✅ Pilot Ready |
| Admin Console — Boost Control Center | ✅ Pilot Ready |
| Admin Console — Verification | ✅ Pilot Ready |
| Admin Console — Team | ✅ Pilot Ready |
| Admin Console — Document Preview | ✅ Pilot Ready |

**Pulse Growth Platform v2.0 is formally regarded as a production-ready Campaign Distribution & Incentive Platform.** It is no longer a campaign feature. Its strengths:

- **Transactional integrity** — immutable snapshots, escrow, ledger-based settlement.
- **Operational integrity** — structured delivery, runbooks, reconciliation, the Campaign Timeline.
- **Analytical integrity** — a single delivery fact table, explainable health scoring, measurable KPIs.
- **Governance integrity** — permanent platform principles, ADR-controlled change management, versioning, documentation, pilot gates.

The Admin Console has reached the same maturity: operationally complete for KYC, credits, referrals, reward rules, and Boost ops — with future refinements intentionally deferred until usage data justifies them. Freezing architecture and UI before the pilot creates a stable baseline so genuine product learning can be distinguished from ad hoc feature requests.

With these foundations in place, **the platform has crossed from building to learning** (`Operate → Observe → Learn → Improve`). The next major evolution is shaped by customer behaviour, operational evidence, and pilot outcomes — not by additional architectural expansion.

**Formal approval (architecture review closing statement):**

> Pulse Growth Platform v2.0 and the Admin Console are approved as the production baseline for pilot deployment. The architecture, operations, governance, and documentation are sufficiently complete to support real-world validation. Future evolution should be driven by measured pilot outcomes rather than additional speculative feature development.

From here, the most important document in the repository is no longer a design document — it is the first completed Pilot Review and, eventually, the Post-Pilot Assessment. Those artifacts decide whether v3.0 optimises targeting, delivery, incentives, marketplace dynamics, or something only real usage reveals.
