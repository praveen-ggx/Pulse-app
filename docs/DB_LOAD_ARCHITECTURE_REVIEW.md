# DB Load Architecture Review — Request Efficiency & the Requests Moderator

Status: **implemented** (Moderator ships in observe-only mode) · Date: 2026-09-22
Scope: client→Supabase request path · Branch: `new-fix-adhi` · No DB/schema changes

---

## 1. Summary of findings

The transport layer is **not** the problem. `lib/supabase.ts` already has
timeout+retry, statement-timeout (57014) retry suppression, JWT-expiry
single-flight recovery, jittered auth backoff, and a 30s realtime heartbeat.
`lib/queryClient.ts` has conditional retry that refuses to retry timeouts and
origin-down errors. Both carry scars from the 2026-07-05 and 2026-09-19
incidents and are well-tuned.

The unhealthy-DB pressure comes from **four layers above** the transport:

| # | Cause | Evidence |
|---|-------|----------|
| 1 | Screen-level query fan-out | `TripsScreen` mounts **11** concurrent query hooks |
| 2 | Unbounded reads | `trips.service.ts`: 60 `.from()` vs **18** `.limit()/.range()`; `finance.service.ts`: 34 vs 10 |
| 3 | Over-selection | **74** `select('*')` calls in services/query hooks |
| 4 | No global concurrency ceiling | nothing bounds in-flight requests per device |

Each is individually modest. Together, on a cold open with a warm org, one
device can issue 30–50 requests in a few seconds — several of them unbounded
full-table scans holding a pool connection for a full statement-timeout window.
Multiply by concurrent users and the pool saturates before CPU does. This is the
same amplifier the `isStatementTimeoutResponse` comment describes, but at the
*query-shape* level rather than the retry level.

**The core structural gap:** every one of the ~132 service files can call
`supabase()` directly. There is no chokepoint where request volume, shape, or
priority can be observed or governed. Fixes 1–4 below are worth doing on their
own; the Moderator (§3) is what stops the problem from returning.

---

## 2. Fixes, ranked by load reduction per unit of risk

### Fix 1 — Bound every list read (highest impact, lowest risk)

~2/3 of reads in the two hottest services have no `.limit()`. An org with 20k
trips fetches 20k rows to render ~30. Unbounded scans are what turn a busy
minute into a statement timeout.

- Add an explicit `.limit(DEFAULT_PAGE)` to every list read, default **200**.
- Make it enforceable rather than a convention: a repo lint rule that errors on
  a `.from().select()` chain with no `.limit()`, `.range()`, `.single()`, or
  `.maybeSingle()`.
- Convert the screens that genuinely need more to the existing infinite-query
  pattern (`transactions.infinite` already does this).

Expect the largest single drop in rows scanned and pool-hold time.

### Fix 2 — Replace `select('*')` with explicit column lists

74 sites. `select('*')` on wide tables (trips especially) pulls JSON/text
columns no screen renders, inflating egress and PostgREST serialization time.
`getTripLedgerEmbed` is the model to copy — it selects exactly 4 columns.

Do the hot paths first: `trips`, `transactions`, `vehicles`, `subcontracts`.
Generate the column lists from `lib/database.types.ts` so they stay honest.

### Fix 3 — Collapse screen-level fan-out into bundled reads

`TripsScreen` issues 11 parallel queries; the budget in
`performanceBudgets.ts` allows far fewer subscriptions than this screen implies.
Clients, suppliers, and drivers are near-static lookup data being refetched
alongside the hot trip list.

- Move the 3–4 lookup queries to `STALE.slow` (30 min) — they are already
  invalidated by mutations, so freshness is unaffected.
- Bundle the genuinely trip-coupled reads into one RPC returning a composite
  payload, following the existing `useTripDetailBundleQuery` precedent.
- Target: **11 queries → 4** on the trips tab.

### Fix 4 — Eliminate the realtime-triggered N+1

`applyTransactionRealtimeEvent` calls `getTripLedgerEmbed(tripId)` per event.
It is correctly guarded (skips when no observer, reuses the cached embed when
`trip_id` is unchanged), but under a burst of inserts across distinct trips it
is still one round-trip per event, on the realtime hot path.

- Wrap the embed fetch in the existing `runSingleflight` (`lib/cache/singleflight.ts`).
- Micro-batch embeds on a ~50ms window, fetching with `.in('id', tripIds)`.
- Cache embeds under a dedicated query key — trip labels are effectively immutable.

### Fix 5 — Gate queries on a settled org context

60 of 73 query hooks use `enabled:`; **13 do not.** Those fire during auth
restore — a phase `AuthContext` already flags as multi-path and fragile — and
can execute against a not-yet-valid session, producing wasted round-trips plus
the 401→refresh→retry path in `fetchWithTimeoutAndRetry`. Audit the 13 and gate
them on `orgId && sessionReady`.

---

## 3. The Requests Moderator

### Verdict: build it — and the codebase has already reserved its home

`packages/platform/gateway/README.md` states: *"Every client request enters
here. No service is directly callable."* — Implementation: TBD. The Moderator is
that gateway, scoped to reads. It is a natural fit rather than a new concept,
and `lib/platform/scalability/` already defines the budgets it would enforce.

Critically, it must **not** be a second cache or a reimplementation of TanStack
Query. It sits *below* TanStack Query and *above* `supabase()`: a scheduling and
admission-control layer for the request stream.

### Responsibilities

**Outbound (client → DB)**

1. **Concurrency ceiling** — a semaphore capping in-flight DB requests per
   device (start at **6**). This is the single highest-value control: it converts
   a 30-request burst into a bounded stream and directly protects the pool.
   No such limiter exists today.
2. **Priority queue** — three lanes: `interactive` (user-blocking reads),
   `background` (prefetch, warmup), `bulk` (exports). Under saturation,
   background yields to interactive instead of competing with it.
3. **Coalescing** — extend `runSingleflight` from opt-in to default for all
   reads, keyed by table+filter+columns, so duplicate in-flight reads collapse.
4. **Shape guard** — reject/warn in dev on unbounded or `select('*')` reads,
   making Fixes 1 and 2 permanent instead of a one-time cleanup.

**Inbound (DB → client)**

5. **Invalidation debouncing** — batch `invalidateQueries` calls on a ~100ms
   window. `queryCacheMetrics` already detects invalidation storms
   (20/sec threshold) but only *reports* them; the Moderator can absorb them.
6. **Backpressure on degradation** — on 57014 or repeated 5xx, trip a circuit
   breaker: shed `background`/`bulk` lanes, keep `interactive` alive at reduced
   concurrency. Today a degraded DB receives the same load as a healthy one,
   which is precisely how "unhealthy" becomes self-sustaining.

### Placement

```
Screen → useXQuery → [ Requests Moderator ] → XService → supabase() → Postgres
                              ↑                                          │
                     invalidation debounce ←── Realtime CDC ←────────────┘
```

### Why this is safe to adopt incrementally

The Moderator can wrap `supabase()` behind the existing singleton without
touching any of the 132 service files: `configurePlatformDb` already injects the
client accessor, so the wrapper is installed in one place. Services keep their
current API; the chokepoint appears underneath them.

Suggested sequence:

1. Land it in **observe-only** mode — count in-flight requests, log queue depth
   and shape violations. No behavior change, and it measures the real request
   profile instead of relying on the estimates in this document.
2. Enable **coalescing + invalidation debouncing** (pure wins, no shed risk).
3. Enable the **concurrency ceiling**, tuned from step 1's data.
4. Enable the **circuit breaker** last, since it is the only part that
   deliberately drops work.

### Honest cost

- A new chokepoint is a new failure mode: a bug in the semaphore stalls the app.
  Step 1 and a hard "never queue longer than N seconds, then pass through"
  escape hatch are what make this acceptable.
- It adds a layer to debug through when a query misbehaves. Per-request lane and
  queue-wait tracing in dev is not optional.
- It does **not** fix bad query shapes — it only makes them visible and bounds
  their concurrency. Fixes 1–4 still have to be done.

---

## 4. Recommended order

| Phase | Work | Rationale |
|-------|------|-----------|
| 1 | Fixes 1 + 2 on hot tables | Biggest load drop, no architectural change |
| 2 | Moderator in observe-only | Measure before governing |
| 3 | Fixes 3 + 4 + 5 | Fan-out and N+1, informed by phase 2 data |
| 4 | Moderator: coalesce + debounce | Pure wins |
| 5 | Moderator: ceiling, then breaker | Protects the pool under real load |

Phases 1 and 2 are independent and can run in parallel.

---

## 5. Measurement

Existing instrumentation covers most of this — extend rather than replace:

- `getPlatformHealthSnapshot()` / `queryCacheMetrics` — already track
  invalidations and storms.
- Add: requests/minute per device, in-flight peak, queue wait p95, rows returned
  per query, and shape violations.
- Validate against `PLATFORM_SUCCESS_TARGETS`: pool utilization < 70%,
  DB CPU < 70% at 50 users, cache invalidations per event ≤ 2.

**Caveat:** the counts in §1 are from static analysis (grep over service and
query-hook files), not runtime traces. They establish the *shape* of the problem
reliably, but phase 2 should confirm the actual per-screen request profile
before phases 3–5 are tuned to specific numbers.

---

## 6. What was actually built

### Corrections to §1 found during implementation

Two of the original findings were overstated. The §1 numbers came from grep, and
a closer read changed them:

- **Fix 5 (ungated queries) was already solved.** The "13 hooks without
  `enabled:`" were almost all helpers and invalidation modules, not queries. The
  one real hook gates via an `enabled` variable, and `lib/hooks/useQueryBootDefer.ts`
  already defers queries ~1.1–1.5s on cold start so they don't compete with the
  bootstrap RPC. **No change needed.**
- **The trips list reads were already bounded.** `getTripsByOrganization` caps at
  200 and uses `TRIP_SELECT_LIGHT`; `getTripPartyCountsForOrg` caps at 2000. The
  raw `.from()` vs `.limit()` ratio counted every chained call, not distinct
  queries. A proper AST-shaped scan found **191** genuinely unbounded
  select-chains repo-wide — real, but spread thin rather than concentrated in
  the hot path.

The load problem is therefore narrower than §1 implied, and the absence of a
concurrency ceiling is the dominant remaining factor.

### Shipped

| Area | Change |
|------|--------|
| Moderator | `lib/platform/moderator/` — semaphore, priority lanes, coalescing, breaker, shape guard |
| Wiring | `lib/supabase.ts` — moderated `global.fetch`; auth/storage/realtime bypass |
| Invalidation | realtime trips + transactions bursts now debounced (~100ms) |
| Fix 2 | ledger reads select ~19 explicit columns instead of `*` |
| Fix 3 | clients/suppliers/drivers lookups `STALE.moderate` → `STALE.slow` |
| Fix 4 | `getTripLedgerEmbed` wrapped in singleflight |
| Observability | moderator counters exposed via `getPlatformHealthSnapshot()` |
| Tests | 33 new tests in `lib/platform/moderator/__tests__/` |

### Deliberately NOT done

- **No DB or schema changes** — as instructed. The server-side SUM aggregate that
  would properly fix the finance totals read needs a migration and is out of scope.
- **No cap on the finance totals read.** Capping it was attempted and reverted:
  `getAllTransactionsByOrganizationForTotals` must stay unbounded so the Cash
  tab's grand total is exact, with filtered totals derived client-side from that
  complete set. A cap silently truncates headline figures for large orgs — a
  previously-confirmed release blocker, guarded by its own test. It keeps the
  column narrowing, which reduces bytes per row without changing row count.
- **No blanket `.limit()` sweep** over the 191 unbounded chains. Each needs its
  caller checked for whether truncation is safe; the runtime shape guard now
  surfaces the ones that actually fire.
- **No ESLint rule for unbounded reads.** It would need type-aware analysis and
  would fire on ~191 existing sites at once. The runtime guard covers it without
  blocking CI.

### Default configuration

The Moderator ships **observe-only**: it counts and never governs, so this lands
with no behaviour change. Governing features are enabled per §4 once phase-2 data
justifies the thresholds:

```ts
configureModerator({ observeOnly: false });                 // phase 3: coalesce + debounce
configureModerator({ maxConcurrent: 6 });                   // phase 5: ceiling
configureModerator({ circuitBreakerEnabled: true });        // phase 5: breaker, last
```

### Verification

- 33/33 new moderator tests pass; 337/337 in the touched finance/queries/platform
  suites pass.
- Typecheck: 2683 errors before and after — the change adds none. (That baseline
  is large and pre-existing.)
- Lint clean on all changed files.
- One suite, `createLedgerEntry.workflowSync.test.ts`, fails to parse due to a
  Sentry/Babel transform config issue. Verified pre-existing: it fails identically
  with these changes stashed.

---

## 7. Coverage audit — does everything go through the Moderator?

Audited after implementation. **Every HTTP request from the app to the Supabase
backend now passes the Moderator**, verified by an integration test that drives a
real `supabase-js` client (`__tests__/coverage.integration.test.ts`) rather than
by inspection.

### Covered

| Path | How | Verified |
|------|-----|----------|
| `.from().select()` | client `global.fetch` | integration test |
| `.rpc()` | client `global.fetch` | integration test |
| `.insert()/.update()/.delete()` | client `global.fetch` | integration test |
| `.functions.invoke()` | client `global.fetch` | integration test |
| Raw `fetch()` to Edge Functions (3 sites) | converted to `moderatedFetch()` | grep + typecheck |

The 3 converted sites were the only raw `fetch()` calls to the Supabase backend
in app code: `validate-gstin`, `penny-drop`, `biometric-verify`. A repo grep for
raw `fetch` against `supabaseUrl` / `rest/v1` / `functions/v1` now returns none.

### Deliberately NOT moderated

- **Auth (`/auth/v1/*`)** — bypasses before any queuing. Holding a token refresh
  behind data reads is how a recovering client deadlocks; `lib/supabase.ts`
  already has its own jittered auth retry policy.
- **Storage (`/storage/v1/*`)** — large binary uploads/downloads. Queuing a POD
  photo behind ledger reads helps nobody, and these do not hit the DB pool.
- **Realtime (WebSocket)** — structurally outside a fetch chokepoint. It is
  already governed by `lib/realtimeRegistry.ts` (shared channels, 50-channel cap,
  refcounting), which is the right control surface for subscriptions. Realtime
  *consequences* (invalidation storms) are moderated via the debouncer.

### Known bypass, accepted

`app/audit/index.tsx` builds its own client from a CDN `<script>` for the web-only
DB audit tool. It is a developer diagnostic, not a user request path, and is not
part of the mobile bundle. Left as-is.

### Write-path safety (fixed during this audit)

The audit surfaced a real defect. Writes were eligible for a caller-supplied
`background`/`bulk` lane, which meant an open circuit breaker could **shed a
write** — losing a trip status, a payment, or a POD. Now:

- Any non-GET/HEAD request is forced into the `interactive` lane, overriding the
  lane header.
- Writes are never coalesced (only GETs get a coalesce key), so two identical
  writes always both execute.

Both invariants are locked by `__tests__/writeSafety.test.ts`.

**Test totals:** 46 moderator tests; 399/399 pass across the touched
platform/queries/finance/organization suites.

---

## 8. Smoke test results

Run 2026-09-22 on `new-fix-adhi`.

| Check | Result |
|-------|--------|
| Web production bundle (`expo export --platform web`) | **pass** (exit 0) |
| Moderator present in shipped entry bundle | **pass** (not tree-shaken) |
| Moderator suites | **52/52 pass** (7 suites) |
| Touched platform/queries/finance/organization suites | **399/399 pass** |
| `madge --circular` on moderator + supabase | **pass** — no cycles |
| ESLint on changed files | **pass** |
| Typecheck | no new errors (2683 before and after) |

### Behavioural scenarios exercised against a real `supabase-js` client

- **Cold open, observe-only** — the 11-query TripsScreen burst completes, peak
  concurrency measured at 11, nothing queued or shed. Confirms phase 1 is inert.
- **Cold open, ceiling on** — same burst capped at 6 concurrent, **all 11 still
  complete**. This is the pool protection, with no lost work.
- **Duplicate-read stampede** — 8 components requesting the same list collapse to
  **1 round-trip** (7 coalesced).
- **Degraded DB** — with the breaker open, interactive reads and writes are both
  still served; `shed` stays 0. A write is never dropped.
- **Slow backend** — 6 requests against a backend slower than the queue timeout
  all complete via the escape hatch; the queue never wedges.
- **Auth deadlock guard** — a token refresh succeeds while the read queue is
  fully saturated, because auth bypasses moderation before queuing.

### Known failures (pre-existing, not caused by this work)

Both verified by re-running with these changes stashed:

- `features/finance/services/__tests__/createLedgerEntry.workflowSync.test.ts` —
  suite fails to parse (Sentry/Babel transform config).
- `lib/navigationPolicy` — 3 route-registry coverage failures (60/63 pass).
