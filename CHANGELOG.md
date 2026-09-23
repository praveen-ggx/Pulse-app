# Changelog — branch `new-fix-adhi`

DB request efficiency work: a Requests Moderator gateway, query-shape fixes,
and a pass over the repo's failing test / typecheck / lint gates.

**No database or schema changes.** No migrations, no SQL, no edits to remote
schema. Everything here is client-side.

| Gate | Before | After |
|------|--------|-------|
| Jest | 2386 passing / 28 failing, 10 failing suites | **2418 passing / 0 failing, 319/319 suites** |
| Typecheck | 250 errors | **0** |
| Lint | 139 errors / 347 warnings | 95 errors / 351 warnings |
| `madge --circular` | 8 | 8 (unchanged — none added) |
| Web production build | — | passes |

The test total rises from 2414 to 2418 because four suites previously failed to
*run* (ESM parse errors, a missing test wrapper), so their cases were never
counted. Nothing was added to inflate the number.

---

## 1. Requests Moderator (new)

`lib/platform/moderator/` — ~640 LOC + ~680 LOC of tests. Fills the
`packages/platform/gateway` role that was previously a README stub
("Every client request enters here. Implementation: TBD").

Sits **below** TanStack Query and **above** `supabase()`. It is not a cache and
does not duplicate query state — it governs the request *stream*:

| Capability | What it does |
|---|---|
| Concurrency ceiling | Semaphore bounding in-flight DB requests per device (default 6) |
| Priority lanes | `interactive` / `background` / `bulk`; background yields under load |
| Coalescing | Duplicate in-flight reads collapse to one round-trip |
| Circuit breaker | Sheds background/bulk on repeated 5xx / statement timeouts |
| Shape guard | Flags unbounded and `select=*` reads in dev |
| Invalidation debounce | Batches realtime-driven `invalidateQueries` on a ~100 ms window |

**Ships inert.** `observeOnly: true` by default: it counts everything and
governs nothing, so it lands with no behaviour change. Rollout order and the
config lines to enable each stage are in
[`docs/DB_LOAD_ARCHITECTURE_REVIEW.md`](docs/DB_LOAD_ARCHITECTURE_REVIEW.md) §4.

### Files
- `types.ts` — config + metrics shapes
- `requestModerator.ts` — semaphore, lanes, coalescing, breaker
- `requestClassifier.ts` — derives lane / coalesce key / shape violations from the PostgREST URL
- `invalidationScheduler.ts` — invalidation debouncer
- `moderatedFetch.ts` — for Edge Function calls that bypass the supabase-js client
- `index.ts` — public surface

### Wiring
- `lib/supabase.ts` — moderated `global.fetch`. Auth, storage and realtime
  bypass moderation deliberately (queuing a token refresh behind data reads is
  how a recovering client deadlocks).
- `lib/platform/scalability/platformHealth.ts` — moderator counters exposed via
  `getPlatformHealthSnapshot()`.

### Coverage
Verified by an integration test driving a real `supabase-js` client, not by
inspection: `.from().select()`, `.rpc()`, insert/update/delete, and
`.functions.invoke()` all pass through. The 3 raw `fetch()` calls to Edge
Functions (`validate-gstin`, `penny-drop`, `biometric-verify`) were converted to
`moderatedFetch`. A repo grep for raw fetch against the Supabase backend now
returns none.

**Known accepted bypass:** `app/audit/index.tsx` builds its own client from a
CDN script. Web-only dev diagnostic, not in the mobile bundle.

### Write-path safety (defect found during the coverage audit)
Writes were eligible for a caller-supplied `background`/`bulk` lane, so an open
circuit breaker could **shed a write** — losing a trip status, payment or POD.
Now any non-GET/HEAD request is forced into `interactive` and is never
coalesced. Locked by `__tests__/writeSafety.test.ts`.

---

## 2. Query efficiency

- **`features/finance/services/finance.service.ts`** — ledger reads select ~19
  explicit columns instead of `select("*")` on the widest, hottest table.
  `getTripLedgerEmbed` wrapped in `runSingleflight` so a realtime burst across
  distinct trips shares one in-flight request per trip.
  **Deliberately left unbounded:** `getAllTransactionsByOrganizationForTotals`.
  A row cap was attempted and reverted — the Cash tab's grand total must reflect
  every row, with filtered totals derived client-side from that complete set.
  Capping silently truncates headline figures for large orgs (a previously
  confirmed release blocker, guarded by its own test). The proper fix is a
  server-side SUM aggregate, which needs a migration and is out of scope.
- **`lib/queries/useRealtimeInvalidation.ts`** — trips and transactions
  invalidation bursts routed through the debouncer.
- **`useClientsQuery` / `useSuppliersQuery` / `useDriversQuery`** —
  `STALE.moderate` → `STALE.slow`. These are near-static lookups already
  invalidated by mutations and realtime, so no freshness is lost.

---

## 3. Bugs found and fixed

Each of these was surfaced by a gate that had been failing long enough to look
like noise.

| Bug | Impact |
|---|---|
| `DriverLevelProgressionScreen` called `subscribeSharedPostgresChanges` without importing it | Screen would throw as soon as a driver's IDs resolved |
| `trip_compliance.*` surfaces used `anyOfCaps` as both the org gate **and** the grant set | Granting a **finance** member the Compliance tab also conferred `dispatch` + `dispatch_for_own_fleet` (privilege leak). Fixed with explicit `grantsCaps`; logged in `docs/RBAC_OPERATING_MODEL_CHANGELOG.md` |
| `markSelectedTripsHardCopyPodReceived` passed a timestamp where POD metadata was expected (2 call sites) | Courier name and AWB the user typed were **silently discarded** on every bulk POD mark |
| `MAP_PING_DOT_HTML` referenced but never defined | GPS ping marker would throw on web maps. Constant recovered from `6ba500e6` |
| `invoiceCnDn.service.ts` imported `../invoicing.service` | Wrong path — the module is a sibling (`./`) |
| `/reach/inbox` route had no navigation-policy entry | Route shipped with no access rules attached |

---

## 4. Typecheck: 250 → 0

**One line caused 202 of the 250.** Two web-only CSS properties
(`outlineStyle: "none"`) in `PodReconciliationScreen.tsx` broke
`StyleSheet.create`'s type inference, so *every* `styles.*` reference in that
2,400-line file reported "No overload matches this call". Cast via `object`,
matching the repo's existing pattern for web-only CSS.

The remaining ~48 were spread thin. Representative fixes:

- **Derived fields typed as such** — `execution_plan_id` added as optional to
  `TripRow` and `IndentRow`. It is resolved at read time from joined indents;
  it is **not** a column on `trips` or `indents` (verified against
  `database.types.ts` and the migration history).
- **Signatures widened to match runtime** — `isTripCompleted`,
  `resolveGiveLoadClient`, `indentDisplayOriginDest` all declared
  `Pick<Row, …>` but callers legitimately pass nullable values the bodies
  already normalize.
- **`groupInvoiceRevenueCnDn` made generic** so callers passing the richer
  `TripAdjustment` keep `trip_id` through to the edit callback.
- **`chatDocumentHub.service.ts`** — keys cast to `VehicleComplianceDocType`
  instead of `keyof VehicleDocuments`; the latter includes `extras: []`, which
  widened every entry and broke `.url` / `.uploadedAt`.
- **`DriverWorkOpportunityCard`** — `withWebSafeShadows` wraps a *stylesheet*,
  not a single entry; restructured to the repo pattern.
- **Story viewers** — passed `originParts`/`destinationParts` objects to a
  component whose props take raw strings.

---

## 5. Test infrastructure

- **`__mocks__/@sentry/react-native.js` (new)** — the real SDK ships
  untranspiled ESM, so any test transitively importing `lib/crashReporter.ts`
  died with `Unexpected token 'export'` when run in isolation.
- **`jest.config.js`** — maps that mock; adds `moti`, `react-native-reanimated`,
  `lottie-react-native`, `@motify` to `transformIgnorePatterns` (same ESM issue,
  hit by any test rendering a screen that imports them).
- **`eslint.config.cjs`** — `@typescript-eslint/no-require-imports` off for test
  files. Jest hoists `jest.mock()` factories above the import block, so
  `require()` inside one is the documented pattern, not a lapse.

### Tests updated to match current behaviour
Four assertions encoded superseded designs and were failing because the code had
moved on, not because it was wrong:
- `quoted` status moved from the Quoted tab to Open (migration `20270128103100`)
- Sponsored story posts sort **first** (monetization ordering)
- Indent surfaces re-parented to `tripops.tab` (prevents a Trip Ops member
  unlocking the whole Network tab)
- Sign-in footer link now routes to the onboarding hub, not the suite sign-up href

Stale mocks were also repaired where production had added a DB call or a
recovery branch the test didn't queue a response for.

**Open item:** `tripops.pulse_loads` still parents to `sales.tab` while its
eight sibling indent surfaces parent to `tripops.tab`. Confirmed intentional
(it's the loads-hub landing screen inside the Network tab) — the catalog
integrity test carries a documented exemption rather than papering over it.

---

## 6. Lint: 139 → 95 errors

Auto-fixable unused imports removed; 13 unused function args prefixed with `_`
(destructured props written as `name: _name` so the property lookup survives);
one genuinely dead local removed.

**Stopped here by decision.** The remaining 95 are judgment calls, not breakage:
- **44 `pulse/file-naming`** — cosmetic renames (`*.util.ts` / `*.service.ts`
  suffixes) touching 34 import sites. Wide diff, high conflict risk.
- **30 unused vars** — whole dead functions/components in product files
  (`TableStatusCell`, `renderDesktopStatusTabs`, `publishDispatchEvents`).
  Each has exactly one reference: its own declaration. Some may be unfinished
  work rather than abandoned, so deleting them is a product call.
- **21 `@typescript-eslint/no-explicit-any`** — mostly Edge Functions. Needs a
  real type per call site; a wrong type is worse than `any` because it reads as
  a guarantee.

---

## 7. Docs

- `docs/DB_LOAD_ARCHITECTURE_REVIEW.md` (new) — the architecture review,
  coverage audit, rollout plan and smoke-test results.
- `docs/RBAC_OPERATING_MODEL_CHANGELOG.md` — entry for the `trip_compliance`
  capability-leak fix, as the repo's RBAC process requires.

---

## Verification

All numbers above were measured, and the "before" figures were confirmed by
re-running each gate with these changes stashed.

Two caveats worth carrying forward:
1. One full-suite run reported a failure that turned out to be a Jest worker
   `SIGSEGV` under memory pressure, not a regression — a re-run with
   `--maxWorkers=2` passed cleanly. The suite can flake this way under load.
2. The per-screen request counts in the architecture review come from static
   analysis, not runtime traces. Phase 2 (observe-only) should confirm the real
   profile before the concurrency ceiling is tuned to specific numbers.
