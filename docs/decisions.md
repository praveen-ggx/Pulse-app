# Architectural Decisions

## Realtime updates
Use Supabase Realtime channels — never poll.
**Reason:** Previous polling caused duplicate messages and unnecessary DB load.

## Query keys
Always use `queryKeys.*` factory from `lib/queryKeys.ts` — never inline arrays.
**Reason:** Inline arrays cause cache inconsistencies; factory ensures key stability across invalidations.

## Realtime invalidation strategy
UPDATE events merge in-place; INSERT/DELETE fully invalidate the list.
**Reason:** GPS pings cause frequent trip UPDATEs — full invalidation on every update caused refetch storms.

## Entity refresh on tab switch
Do not increment `entitiesRefreshKey` on finance tab switch — cache staleTime handles freshness.
**Reason:** Key increment caused `entitiesLoading` flash even when data was cached.

## No service_role key in app
All DB access goes through RLS with the anon key.
**Reason:** Security — service_role bypasses RLS and must never be exposed client-side.

## Platform-specific components
Map and PDF use `.native.tsx` / `.web.tsx` file splits — not runtime Platform.OS checks.
**Reason:** Avoids bundling platform-incompatible native modules into the web bundle.

## Auth storage
SecureStore on native, AsyncStorage on web — selected in `lib/supabase.ts`.
**Reason:** SecureStore is not available on web; AsyncStorage is the correct fallback for Expo Go and web.

## Migrations
Always add new incremental files — never edit existing migrations.
**Reason:** Existing migrations may already be applied in production; editing them causes drift.

## Mobile Identity substrate (ADR-001)
Mobile app Identity (Workspace/Roles/Permissions/Grants, per the Engineering Handbook V5 roadmap) targets the existing `platform.*` schema and its planned Gateway (`oms/docs/ROADMAP.md`, `PLATFORM_PRINCIPLES.md`) as the canonical Identity bounded context — no second, parallel `identity` schema is created for the mobile app.
**Reason:** `oms/docs/PLATFORM_PRINCIPLES.md` already declares Identity a shared, frozen platform bounded context that business domains consume rather than reimplement ("Business domains consume Platform... they do not reimplement platform infrastructure"). Building a separate `identity` schema for mobile would create two competing Identity systems for the same product line.

## Pre-Gateway platform.* access (ADR-002)
Until oms/ Sprint 2 (Gateway) ships, the mobile app may **read** `platform.organizations`/`platform.memberships`/`platform.roles` directly via Supabase (RLS-gated) — the same pre-Gateway state oms/ itself is currently in. Writes remain out of scope for mobile until Gateway exists.
**Reason:** Gateway/Command Store (oms/ Sprints 2–4) have no committed ship date; blocking all mobile Identity work until they land would stall the roadmap indefinitely. Read-only access stays RLS-safe and reversible, and is an explicitly tracked, temporary exception to `PLATFORM_PRINCIPLES.md`'s "UI never writes databases directly" rule — mobile must migrate behind Gateway once Sprint 2 ships.

## Gateway Compatibility Rule (ADR-003)
Only `features/organization/services/platformOrganization.service.ts` may query the `platform` schema (`supabase().schema('platform')`). Every other file — screens, hooks, other features — imports from that service, never the schema directly. Bounded-context folder is `features/organization/` (the business domain), not `features/identity/` (already used for unrelated display-identity/avatar resolution) or `features/platformIdentity/` (named for infrastructure, not a business capability). The service file is named `platformOrganization.service.ts`, not `organization.service.ts`, because that name is already taken by the legacy `public.organizations` service.
**Reason:** Centralizing all `platform.*` access behind one service is what lets the underlying implementation move from direct Supabase reads to Gateway-mediated calls later without touching every call site.

## Clarification to ADR-001 — what actually happened (recorded at PR-008)
ADR-001 anticipated mobile Identity's real business logic eventually running on oms/'s `platform.*` Postgres schema. In practice, a separate, richer domain model (`lib/platform-identity/`, `lib/onboarding/` — `platformIdentityService`, `membershipPolicyEngineV1`, identity providers) was built independently on top of the **existing `public.*` tables** (`organization_team_invites`, `organizations`, `organization_members`), not on `platform.*`. `platformOrganization.service.ts` and `platformIdentityShadowCheck.util.ts` (ADR-001–003) were **not abandoned** — they're the live shadow-mode comparison layer, called from `platformIdentityService.acceptInvitation()` on every real accept, exactly as originally designed. The cutover to `platform.*` as the authoritative store (ADR-001's original mechanism) has not happened and isn't scheduled; ADR-001's underlying intent — never build a second, competing Identity system — still held, it just resolved as "richer domain model over `public.*`, with `platform.*` kept live for comparison" rather than "adopt `platform.*` directly."
**Reason:** Recording this now, precisely, so a future reader doesn't read ADR-001 and assume the mobile app's business logic runs on `platform.*` — it doesn't, and `platformOrganization.service.ts`'s only real caller is the shadow checker.

## Clarification / extension to ADR-001 — Pulse V2 Identity plane (2026-09-20)

**Kind:** Approved Architecture clarification and extension (C2-B). ADR-001 and the PR-008 clarification above are **unchanged** and remain in force for the **production/OMS identity plane**.

**Record:** `docs/ADR-013-pulse-v2-identity-plane.md`.

ADR-001 continues to forbid a second, parallel Identity schema **on the production database** for the mobile/OMS product line. `public.*` remains production Identity. `platform.*` remains shadow until an independently approved cutover.

An **isolated V2 deployment** may use schema `v2_identity` as that deployment’s Identity bounded-context store. That is not a third schema on production and is not a second conceptual Identity model (Actor, Membership, Workspace, Law #6). V2 must not query production Identity for runtime authorization.

This clarification does **not** create `v2_identity` tables, modify production migrations, or authorize V2 Auth/membership implementation.

## PR-008 cutover — confirmed-dead code removed (ADR-004)
Per the Architecture Freeze Review, deleted `lib/onboarding/completeOnboarding.util.ts`, `lib/onboarding/employmentPolicy.ts`, the deprecated `lib/onboarding/membershipPolicyEngine.ts` (and its internal `evaluateMembershipPolicyV1` alias), and the orphaned `resolvePendingInvitationsByPhone()` function — all had zero remaining callers, confirmed by direct search immediately before each deletion. `MembershipPolicyRequiredAction` was relocated from the deleted `membershipPolicyEngine.ts` into `lib/platform-identity/policy/policyDecision.ts`, its only real remaining consumer. `platformIdentityService.acceptInvitation()`/`.switchWorkspace()` and `membershipPolicyEngineV1.evaluateJoinPoliciesV1()` are now the sole implementations for onboarding orchestration and membership policy, respectively — no functional behavior changed, this was deletion of already-unreachable code.
**Reason:** Six of eight reviewed domains (Identity, Invitation Resolution, Employment Policy, Organization Status, Audit, Membership Policy after the type move) already had exactly one authoritative implementation each; the two with leftover deprecated code were fully consolidated by the time this PR ran, not by new migration work.

## Platform Architecture reconciliation (ADR-005)
Two independently-frozen "Architecture v1.0" documents existed simultaneously: `docs/architecture/platform/01-platform-principles.md` (new, business/platform architecture — Platform → Identity/Workspace/Shared Services/Products → Experiences) and `oms/docs/PLATFORM_PRINCIPLES.md` (existing, infrastructure architecture — Gateway/Identity Service/Command Store/Timeline/Observatory). They also defined **"Workspace" as opposite concepts**: the new architecture uses Workspace for the tenant operating boundary (consistent with Slack/Notion/Asana/Linear); the existing OMS document used "Workspace" for what the new architecture calls **Product** (Pulse Commerce, Pulse Finance, Pulse Operations, etc.).

**Decision:**
1. `docs/architecture/platform/01-platform-principles.md` is the canonical, governing "Architecture v1.0" for business/platform vocabulary (Platform, Workspace, Product, Experience, Module, Feature, Entity). `oms/docs/PLATFORM_PRINCIPLES.md` is re-scoped as the **Technical Architecture** layer beneath it (Gateway, Identity Service, Command Store, Timeline, Observatory, SDK) — its own "frozen v1.0" claim now applies only to that technical layer, not to business vocabulary.
2. `oms/docs/PLATFORM_PRINCIPLES.md`'s "Workspaces (customer mental model)" table is renamed "Products (customer mental model)" — Pulse Commerce/Finance/Operations/Execution/Network/Intelligence/Admin are Products, not Workspaces.
3. Existing platform infrastructure (`packages/contracts`, the `platform.*` Postgres schema and its migrations `202611060001`–`005`, the Sprint 1–5 roadmap in `oms/docs/ROADMAP.md`) is **reused and extended, not replaced** — see `docs/architecture/platform/00-platform-reconciliation.md` for the full asset-by-asset disposition. Shared Services (`docs/architecture/platform/11-shared-services.md`) sit parallel to Products under Platform, not beneath them — products consume Shared Services, they don't own or sit above them.
**Reason:** Business vocabulary must be stable regardless of implementation progress or which team/document arrived first. The Workspace/Workspace collision was a language conflict, not a technical one, and left unresolved it would cause architecture drift as more engineers read one document or the other. Keeping the new definition (Workspace = tenant boundary) matches established SaaS platform convention; renaming the OMS side was lower-cost than renaming a concept already consistent with industry norms.

## Shared platform master data — Core and Commerce (ADR-006)
Core and Commerce are **two applications over the same Pulse Platform**, not two apps that sync copies of each other's data. Master data is **owned by the workspace** and accessed through **platform services** — products never own duplicate tables or localStorage copies.

**Principle:** Workspace owns business data. Platform services own data access. Products own workflows.

**Layering:**
```
Core UI / Commerce UI
        │
 CustomerService (WarehouseService, ProductService)
        │
   customerRepository
        │
      clients
```
Core keeps `features/clients/services/clients.service.ts` as a **compatibility adapter** that delegates CRUD to `CustomerService` — minimize UI churn; remove adapter when imports migrate.

**Ownership:**

| Layer | Owns |
|-------|------|
| **Platform** | Customers (`clients`), Warehouses (`client_warehouses`), **Products** (`products` — shared catalog), Contacts, Addresses |
| **Commerce** | Sales orders, quotes, invoices, inventory (`commerce_inventory`), pricing, fulfillment workflow |
| **Core** | Trips, drivers, vehicles, indents, tracking, load board |

Products are **platform-owned catalog**, not Commerce-owned — reusable across Warehouse, CRM, Procurement, Analytics, and Core cargo references. Cross-product links use IDs only (`order_id`, `indent_id`, `trip_id`).

**Platform layer:** `lib/platform/{db,repositories,services,events,orchestration,types}/` — Core and Commerce configure via `configurePlatformDb()`. Services perform single-domain CRUD; orchestration (Phase 3) coordinates cross-product workflows (`publishIndent`, domain events).

**Commerce workflow data** (sales_orders, commerce_inventory, execution_plans) remains Commerce-scoped until event pipeline links orders → indents.

**Reason:** Every Commerce-local master data entity increases migration cost and causes Core/Commerce drift. Platform services allow future Gateway/cache swaps without touching product UIs.

## Platform master-data deletion semantics (ADR-007, backlog)

**Current state (acceptable for Phase 2–3):**

| Entity | Delete mechanism | Active filter |
|--------|------------------|---------------|
| Customer (`clients`) | `status = 'inactive'` | `status = 'active'` |
| Warehouse (`client_warehouses`) | `deleted_at` | `deleted_at IS NULL` |
| Product (`products`) | `deleted_at` + `status = 'archived'` | `deleted_at IS NULL` |

**Decision:** Deletion semantics may diverge short-term. Platform deletion should **converge over time** — whether the eventual model is `deleted_at`, `status`, or status + lifecycle timestamps is TBD. This does **not** block orchestration (Phase 3).

**Backlog:** Unify soft-delete representation across `CustomerService`, `WarehouseService`, and `ProductService` when schema migration is scheduled.

## Trip Room vs. legacy chat messaging model (ADR-008, pending product decision)

**Status:** Not decided. Full options analysis, dependency map, and trade-offs in `docs/ADR-008-trip-room-messaging-model.md`. Engineering work on the `trip_messages`/`chat_messages` dual-write (`docs/REALTIME_MESSAGING_ARCHITECTURE_REVIEW.md`) is frozen until this is answered.

**The question:** is Trip Room (`chatPlatform.service.ts`, `chat_messages`/`chat_conversations`) intended to replace legacy per-lane Driver/User/Dispatcher chat (`chat.service.ts`, `trip_messages`/`trip_conversations`), observe it permanently, or is neither schema the right long-term canonical model? The mirror trigger bridging the two tables is either temporary migration scaffolding or permanent, load-bearing sync infrastructure depending on the answer — this is a product-intent question, not something resolvable from code.

## Reach is a platform capability, not a Stories feature (ADR-009)

**Decision:** Pulse Boost (`features/reach/`, `reach_campaigns`/`reach_events`/`reach_plans`/`pulse_credit_*` tables) is a reusable promotion/growth capability. Stories (`posts`, `features/network/`) are its first *consumer*, not its owner. `reach_campaigns.post_id` was deliberately built as a generic FK to `public.posts` rather than a Story-specific table, so any future promotable object — marketplace listings, vehicle/driver listings, business profiles — can become a second consumer without duplicating campaign/payment/lifecycle/analytics logic, as long as it can be represented as (or bridged to) a `posts` row or a future generalization of that FK.

**Reason:** Reach was built inside the Network/Stories surface for delivery speed (Phase 0–2.1), but its actual shape — plans, credits, campaign lifecycle, upgrade, analytics — has no dependency on Stories-specific concepts. Keeping it structurally separate (`features/reach/` already does this) avoids the common failure mode where a feature quietly calcifies around its first UI host and becomes expensive to re-platform later.

**Not decided here:** how Reach's home fits into this repo's existing frozen platform vocabulary (`docs/architecture/platform/01-platform-principles.md` — Platform/Workspace/Product/Experience/Module/Feature/Entity). A separate "Growth" *domain* was proposed in conversation (alongside Identity/Network/Operations/Commerce/Intelligence) — that's a taxonomy decision for whoever owns the platform docs to reconcile with the frozen model, not something this ADR resolves unilaterally.

**Backlog (Growth Platform, not started) — the Growth admin module is exactly these seven children, nothing more:** Credits, Reach Plans, Reward Rules, Invitation Rules, Promotions, Ledger, Analytics — as one module, not split into separate admin products. Plus: customer-facing Reach home (Overview/Campaigns/Earn Credits) as its own nav destination; the Platform Events → Growth Rules → Credits Ledger → Wallet → Notifications pipeline; Growth Experiments (no-code configurable reward campaigns) — deliberately sequenced *before* AI/Control Tower work, per product direction.

**Manual credit adjustments are a bootstrap mechanism, not the end-state.** Today every credit comes from ADMIN (the `analytics/` Credits panel). That's expected to *decrease* over time as SYSTEM-origin rules (verification, invitation, promotion) come online in Phase 2.4 — manual grants become the exception, not the normal workflow.

**Product rule, not implemented — Credit Issuance Hierarchy.** Every `pulse_credit_transactions` row should eventually trace to exactly one of three origins:

- **SYSTEM** — Verification, Invitation, Promotion (automated, once the Growth Engine pipeline exists)
- **ADMIN** — Adjustment, Support, Compensation (today's `analytics/` Credits panel)
- **TRANSACTIONAL** — Purchase, Refund, Campaign Spend (`spend_reach` already fits here; named "transactional" rather than "user" because campaign spend is a business-operations movement, not a thing a user *earns* — this framing also scales better if subscriptions, cashback, or partner-funded credits show up later)

This is currently *derived* in the Credits panel UI from the existing `type` column (see `SOURCE_BY_TYPE` in `analytics/src/components/credits/CreditsPanel.tsx`) rather than stored as its own column — deliberately, to avoid two overlapping fields drifting out of sync. If/when the type vocabulary grows enough that a clean 1:1 mapping onto these three origins stops holding, promoting `source` to a real stored (and ideally generated/computed) column is the natural next step — not before.

**Future ADR (not now, no commercial need yet) — Credit Lifecycle.** Do promotional credits expire? Purchased credits? Refunded credits? These are business rules, not implementation details — deferred until there's a real commercial reason to answer them, but tracked here so the question isn't lost.

**Naming direction, not implemented — "Credit Adjustment" over "Grant/Deduct Credits."** The Credits panel's underlying operation is broader than its two current buttons suggest: Grant, Deduct, Correction, Refund, and Reversal are all the same shape (an admin-initiated ledger entry with a reason). The UI can keep exposing Grant/Deduct as the two buttons that cover 95% of real usage, but if a third action (e.g. Correction) is ever added, model it as another instance of the same "Credit Adjustment" concept rather than a bespoke new flow.

## `organization_members` is canonical for driver participation (ADR-010, accepted — Pilot Entry blocker)

**Status:** Accepted. **Not implemented.** **Pilot Entry blocker** (blocks gate P1; P2 cannot start). Raised by the P1 pilot rehearsal, 2026-07-26 — see `docs/PILOT_ENTRY_VALIDATION.md`.

**Architectural outcome:** elevates **authorization to a first-class platform concern** (Permanent Platform Principle 5). Identity (belonging), operational authority (staff), and data ownership (own-row resources) must remain distinct in schema, helpers, RLS, and application logic. Every new feature must answer independently: belong? (`is_org_member`) · act on behalf? (`is_org_staff`) · which rows? (resource RLS). Design review checklist lives in `docs/ADR-010-RLS-AUDIT.md` and Principle 5.

**Decision:** `organization_members` remains the single canonical identity and authorization model for organization participation, **including drivers**. The driver onboarding flow (`accept_driver_invite`, and invite creation for the pending state) must create/update the membership row. Boost must **not** be changed to read participation from `drivers`, and no `organization_members → drivers → driver_invites` fallback chain may be introduced — cascading identity lookups become permanent technical debt and make permission bugs undiagnosable.

**Why this is not a one-line onboarding fix:**

The root defect is that **`is_org_member()` encodes the wrong security boundary** — it conflates tenancy (“belongs to the org”) with operational authority (“acts on behalf of the org”). The 87 role-blind inline policies and ~95 policies that call that helper are symptoms. ADR-010 is an **authorization model refactor**, not an RLS cleanup count.

1. **The constraint forbids driver memberships today.** `chk_org_members_role` is `CHECK (role = ANY (ARRAY['owner','admin','member','dispatcher','finance']))` — `'driver'` is not an allowed value. Boost V2 predicates on `organization_members.role = 'driver'` can therefore never match.

2. **Populating memberships naively escalates privileges.** Any active membership satisfies `is_org_member` and most OM checks — including finance, banking, master data, and ops.

**Step 1 artifact:** `docs/ADR-010-RLS-AUDIT.md` — inventory, helper contract (`is_org_member` vs `is_org_staff`), role matrix with Read/CUD/own-row columns, and sign-off criteria. **Step 2 must not start until the role matrix is signed off.**

**Required implementation order (do not reorder — partial delivery is a security regression):**

1. **Step 1 (complete — awaiting sign-off):** RLS audit & patch strategy — inventory, role matrix, helper contract (`docs/ADR-010-RLS-AUDIT.md`). **Do not patch policies until the role matrix is signed off.**
2. Introduce `is_org_staff` and patch the 87 role-blind policies **plus** staff policies that call role-blind `is_org_member` (~95) so driver memberships are excluded from staff-scoped access.
3. Widen `chk_org_members_role` to allow `'driver'`.
4. Wire onboarding: invite sent → `organization_members (role='driver', status='pending')`; invite accepted → `status='active'`; `leave_fleet` → `status='inactive'`.
5. Backfill the 38 existing linked drivers that have `drivers` rows but no membership.
6. Re-run P1 (Independent screenshot + Fleet + Pending); only then start P2.

**Freeze classification:** Correctness and security blocker. **Allowed under Pilot Freeze** — preserves correctness and security; does not introduce new product functionality. Pilot Entry is **deferred until ADR-010 is implemented and P1 passes**.

**Do not re-scope the pilot to Independent-only** unless that is an explicit business decision with documented acceptance criteria. Doing so would invalidate documented product behaviour (Fleet / Pending personas) and reduce the value of pilot evidence. Until such a decision is recorded, Pilot Entry waits on ADR-010.

## Trip Operations Platform — one canonical trip-state interpretation (ADR-011, accepted)

**Status:** Accepted, architecture complete. See `docs/TRIP_OPERATIONS_PLATFORM.md` for the full layered design.

**Decision:** Trip stage, timing, and operational exceptions have exactly one derivation each — `deriveTripStage()`, `computeTripStageMetrics()` / `computeJourneyMetrics()`, and `evaluateOperationalAlerts()` (all `features/trips/domain/`) — consumed, not reimplemented, by every surface: driver guidance, the business operations panel, the business stepper, Customer Track & Trace, and the Fleet Operations Dashboard.

**Why:** four independent interpretations of trip progress existed before this (driver map guidance, `DriverTripFlowCard`'s step machine, the business stepper's own status-string mapping plus a heuristic guess at driver acceptance, and an inferred mission log built from raw timestamps). They were converging toward drift, not coincidence — the same trip could show a different stage on different screens.

**The rule:** a new operational surface consumes these services; it does not derive its own interpretation of trip status, timing, or exceptions. See also the repo-wide **Platform Consumer Rule** in `docs/PLATFORM_CONSUMER_RULE.md` (same rule for Marketplace / `resolveCommercialOpportunity()`). `DriverTripFlowCard`'s local state machine remains the one deliberately unconsolidated piece — see `docs/TRIP_OPERATIONS_PLATFORM.md` Deferred section.

## Commerce-earned relationship lifecycle (ADR-012, proposed)

**Status:** Proposed — awaiting product/architecture agreement. Full lifecycle: `docs/ADR-012-commerce-earned-relationship.md`. **M0 Stabilization is complete.** Do not implement Execution Partner / Verified until **M4 Commerce Network** (after M1 Resolver + M3 Intelligence). See `docs/MARKETPLACE_DOMAIN.md`.

**Decision (proposed):** Marketplace / Reach awarding follows *work together → know someone*, not Relationship Guard v1's *know someone → work together*. Relationship evolves: None → Bid Consent → Execution Partner (on Award) → Verified Business Partner (on successful trip completion). Do not write social `organization_relations.status = active` as the first commerce state at completion. Reach/marketplace stays open after bids until Award. Bid drawers show Source + Relationship. Award UI says "Award Supplier" with Business Relationship Consent copy — no Connect language.

**Supersedes for Bid → Award:** `docs/architecture/11-relationship-guard-v1.md` enforcement model (block award until connected). Organic Grow/invite connections remain a parallel path.

**Implementation order:** M0 Stabilization (done) → M1 Commercial Resolver → M2 Experience → M3 Intelligence → **M4 Commerce Network (this ADR)** → M5 Financial Platform.

## Marketplace Platform — one commercial object (architecture spec)

**Status:** Operating north star after M0/M1. Architecture is not the bottleneck — **commercial conversion** is. Full product strategy (four KPIs, dual streams, M2 tiers, weekly eight numbers): **`docs/PRODUCT_STRATEGY.md`**.

**Decision:** Indent / Story / Reach / Load Center / Bid Sheet must not each invent commercial state. There is one commercial lifecycle (Draft → Published → Receiving Bids → Evaluating → Awarded → Executing → Completed). Surfaces consume `CommercialOpportunity` from `resolveCommercialOpportunity()` (**M1**), the same consolidation pattern as Trip Operations' `deriveTripStage()` stack.

**Milestones:** ✓ M0 Stabilization → ✓ M1 Commercial Resolver (engineering complete; **product validation = consistency matrix**) → **M2 Marketplace Experience (next — UX only)** → M3 Intelligence → M4 Commerce Network → M5 Financial Platform.

**After M1 validation:** Marketplace architecture is **feature-complete**. Feature-freeze platform/domain work. **~20%** maintenance / consumer-rule bugs; **~80%** conversion UX (M2) and intelligence pipeline (M3). Dual streams: Marketplace = commercial conversion; Trip Operations = operational excellence. Compass: four business KPIs + weekly eight-number executive review — see `docs/PRODUCT_STRATEGY.md`. Every Marketplace feature must move Published → Viewed → Bid → Awarded → Executed → Completed.

**Shared rule:** `docs/PLATFORM_CONSUMER_RULE.md` — no UI may derive business state when a domain resolver exists (Trip + Marketplace).

**Principle:** Platform eliminates duplicate business logic; Product improves customer outcomes — after a platform milestone, optimize behaviour and KPIs before extending the platform (`docs/PRODUCT_STRATEGY.md`).

**Rule going forward:** a new marketplace surface consumes `CommercialOpportunity`; it does not branch on raw `indents.status`, orphan story clocks, or campaign status for Bid CTA / price / open-market visibility. `status='quoted'` is a deprecated compatibility value only — do not reopen status-name work.

## Pulse V2 Identity plane (ADR-013, accepted — 2026-09-20)

**Status:** Accepted (Architecture). Full text: `docs/ADR-013-pulse-v2-identity-plane.md`.

**Decision:** C1-B and C2-B. Production keeps one Auth authority and one production Identity store (`public.*`, ADR-001 in force, `platform.*` shadow). An isolated V2 data plane may have separate V2 Auth and schema `v2_identity`. One conceptual Identity model. V2 must not use production Identity as its normal authorization path. This ADR does **not** authorize V2 Auth, membership tables, RLS, federation, or Slice 4. Product identity continuity (one identity, Workspace-scoped RBAC) is **ADR-014**. How that continuity is implemented remains Architecture/Security/Infrastructure under this ADR.

## One Pulse identity + one authorized Workspace context (ADR-014, accepted — 2026-09-20, revised)

**Status:** Accepted (Product); revised same date for current V2 one-Workspace-context. Full text: `docs/ADR-014-one-identity-workspace-rbac.md`.

**GATE B — CLOSED: ONE PULSE IDENTITY + ONE AUTHORIZED WORKSPACE CONTEXT.** One customer identity across Pulse services including V2. After authentication, the verified Workspace is the session operating context. RBAC, Products, views, actions, and data are Workspace-scoped. Current V2 does **not** include multi-Workspace switching (deferred). Does **not** prescribe Auth architecture. ADR-013 unchanged. **Gate C not started.**

## Pulse V2 data plane infrastructure (ADR-015, accepted — 2026-09-20)

**Status:** Accepted (Infrastructure posture). Full text: `docs/ADR-015-pulse-v2-data-plane-infrastructure.md`.

**GATE C — CLOSED: LOCAL V2-ONLY.** Current phase uses memory or local Supabase; V2 migrations stay under `packages/pulse-v2/supabase`. Hosted V2 is not provisioned and not required. Production excluded. Provisioning and Slice 4 are **not** authorized. ADR-013/014 unchanged. One-login mechanism not decided here.

