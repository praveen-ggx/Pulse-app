# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`pulse` — an Expo (React Native) app for a logistics/fleet platform (trips, indents, drivers, vehicles, clients/suppliers, finance/ledger, marketplace). Same Supabase project/schema as the sibling repo **pulse-unified-base** — see the migrations warning below, this is not an isolated backend.

The repo is a monorepo: the root is the Expo app; `oms/` and `analytics/` are separate, independently-built Vite SPAs that live inside it but are not bundled by Metro.

## Commands

```bash
npm run dev                # main app + oms together (scripts/dev-with-oms.js)
npm start                  # Expo Go, via scripts/run-expo.js (not raw `expo` CLI)
npm run start:dev-client   # custom dev-client build required on device
npm run start:simulator    # binds to localhost, use when simulator can't reach Metro
npm run web                # web target
npm run android / ios      # native builds via expo run:*
npm run lint                # eslint . --ext .js,.jsx,.ts,.tsx
npm run typecheck            # tsc --noEmit -p tsconfig.json (root app only; oms has typecheck:oms)
npm test                     # jest (multi-project — see Testing below)
npx jest path/to/file.test.ts   # run a single test
npm run test:navigation-policy  # jest lib/navigationPolicy --no-coverage
npm run test:web              # playwright (test:web:ui / :headed / :report variants)
npm run test:e2e              # detox iOS (needs test:e2e:build first)
npm run build:graph[:strict]  # audit startup import graph for offenders
npm run build:barrels          # find files importing feature barrels (ties to the ESLint ban below)
npm run db:preflight           # run before ANY db push — see migrations section
npm run db:push                # supabase db push --linked
npm run db:use-local / db:use-cloud   # swap local .env between local/cloud Supabase
npm run seed                     # ts-node scripts/seed-test-data.ts
npm run admin:dev / admin:build  # proxies into analytics/ (Vite, port 3002)
npm run oms:dev / oms:build      # proxies into oms/ (Vite, port 3004)
```

`oms/` and `analytics/` have their own `package.json`, build (`tsc -b && vite build`), and test runners (Vitest-style, not part of root Jest). Root `tsconfig.json` and root Jest both explicitly exclude `oms/`, `analytics/`, `packages/`, `tools/`.

## Architecture

Modular monolith, feature-driven. Data flow (see `docs/architecture.md`, the current authoritative doc):

```
Screen → useXQuery (lib/queries/) → XService (features/<domain>/services/) → supabase() → Postgres/RLS
                                              ↑
                 Realtime: Postgres CDC → useRealtimeInvalidation → queryClient.invalidate
```

- `app/` — Expo Router routes only, no business logic.
- `features/<domain>/{services,components,hooks,utils}` — one folder per domain (43 domains, e.g. `finance`, `trips`, `drivers`, `marketplace`, `invoicing`). ESLint enforces `*.service.ts`/`*.storage.ts` for `features/*/services/*` and `*.util.ts(x)`/`*.model.ts` for `features/*/utils/*`.
  - **Import rule (enforced, ground truth):** `app/**`, `contexts/**`, and `components/**` are ESLint-blocked (error) from importing a bare feature barrel (`@/features/<domain>`) — must import the specific sub-path instead, e.g. `@/features/finance/services/finance.service`. `docs/FEATURES_ARCHITECTURE.md`'s "always import via index.ts" guidance is superseded by this; don't follow it.
  - `lib/` must not import from `feature/`, and `components/` (ui) must not import from `feature/` either (both warn-level `eslint-plugin-boundaries` rules) — put shared logic in `lib/`, pass feature data into shared components via props.
- `lib/` — shared logic: `supabase.ts` (client singleton), `capabilities.ts` + `useCapabilities()` (ACL), `queries/` (TanStack Query hooks), `queryKeys.ts` (cache key factory), `routes.ts` (centralized route constants), `navigationPolicy/`, `database.types.ts`, `authEngine.ts`, `maps/`. **CI hard-caps root `lib/*.ts(x)` files at 60** — new domain-specific files go into `features/<domain>/`, not `lib/`.
- `contexts/` — Auth/Organization/Language/Network/Wallet React contexts.
- `constants/Theme.ts` — all UI colors must come from `Theme`, never hardcoded hex/rgba.
- `packages/platform/` — internal platform services (identity, command-store, timeline, gateway, runtime — staged "Phase 1A" rollout). Golden rule per its README: business code in `services/` calls `PlatformRuntime.executeCommand()`, never inserts Timeline/Command Store rows directly. `packages/pulse-sdk/` is a placeholder (README only, no code yet).
- State: TanStack Query v5 owns all server state; React Context is for global UI state only.
- Known fragile/complex areas called out in `docs/architecture.md`: `features/finance/hooks/useFinanceLedger.ts`, `features/trips/services/trips.service.ts` (large, cross-org visibility), `contexts/AuthContext.tsx` (multi-path session restore), realtime channel invalidation, `.native.tsx`/`.web.tsx` map split.

### Platform-specific files

`.native.tsx` / `.web.tsx` suffix pairs are resolved automatically by Metro's platform extension resolution (e.g. `components/InvoicePdf.{native,web}.tsx`, `lib/mapLibreCompat.native.tsx`, `app/trip/[id]/index.web.tsx`). `lib/maps/*Implementation.ts` is the one sanctioned place for lazy runtime `require()` (Expo Go vs standalone builds share a bundle but throw on import if the other's map SDK isn't present — see `lib/maps/mapEnvironment.ts`).

### Circular imports

CI runs `npx madge --circular` on every PR touching `.ts/.tsx`. There are 5 known pre-existing cycles that are allowed but must not be added to (see `.github/workflows/architecture-check.yml` comments): `AddDriverModal↔DriverRegistrationPortalFlow`, `drivers.service↔driverInviteCompensation.util`, `tripOtp.service↔trips.service`, `contactPicker↔contactPickerNative`, `contactPicker↔contactPickerWeb`.

## Supabase migrations — read before touching schema

Migrations live in **this repo** (`supabase/migrations/`, 800+ files) — an old note claiming otherwise is stale, ignore it. Full current rule set is in `.cursor/rules/supabase-migrations.mdc`; the critical facts:

- This repo and sibling `pulse-unified-base` push migrations to the **same remote Supabase project**. Migration timestamps are primary keys in `supabase_migrations.schema_migrations` — a timestamp collision causes the second pusher's migration to be **silently skipped**.
- `pulse-unified-base` always uses midnight (`YYYYMMDD000000`) timestamps — **this repo must never generate a migration with a `000000` time component.** Always create migrations via `supabase migration new <description>` (real timestamp), never hand-write the filename.
- Run `npm run db:preflight` before any `db push`/`db:push-both` — it hard-fails on empty local-only migration files (a real past incident).
- Never edit schema ad hoc on remote; `migration repair` is for rare, targeted, deliberate fixes only.
- When running ad hoc SQL against the DB yourself, use `supabase db query "<SQL>" --linked -o table` (prefer `--linked`/remote) rather than just producing SQL for the user to run. Never put `service_role` keys or DB passwords in rule files or chat.

## Capabilities / RBAC

Access is capability-based (`lib/capabilities.ts`, `useCapabilities()`), not simple roles, and is further split by **operating model**: Asset / Aggregate / Hybrid orgs get different feature access (e.g. don't grant give-load/suppliers to Asset-only orgs; don't grant garage/vehicles to Aggregate-only orgs). Before touching access control, finance, create-trip, suppliers, garage, or party routes, read `docs/RBAC_OPERATING_MODEL.md` first, and update `docs/RBAC_OPERATING_MODEL_CHANGELOG.md` when you ship a change. Keep `ModelAccessGate` and `lib/navigationPolicy/registry/org.ts` in sync with each other.

## Information architecture: ME vs ORGANIZATION vs WORKSPACE vs PRODUCTS

These are strictly separated scopes with canonical routes (e.g. `/workspace?panel=account|profile|kyc|settings|products`). Don't invent new KYC steps or scan configs outside what's already defined — see `.cursor/rules/pulse-me-org-workspace-ia.mdc` for the full scope table before adding screens in this area.

## Accounting / finance

Ledger and transaction logic (`features/finance/**`) must follow the double-entry model in `docs/CORE_ACCOUNTING_MODEL.md`: every transaction hits ≥2 of Accounts Receivable, Accounts Payable, Driver Payable, Vehicle Expense, Revenue, Cash/Bank, Commission Expense. Balances are always derived from transaction history, never edited directly. Use `features/finance/accounting/accountingModel.ts` for consistent debit/credit interpretation of a transaction row. Don't change existing Finance tab UI/layout when adjusting data flow.

## Navigation

Bottom tabs are only **Home** and **Resources**; Home has top tabs Customers/Suppliers/Trips, Resources has top tabs Drivers/Vehicles/More. Reach other screens (Trips, Indents, Finance, Settings) through these rather than adding new bottom tabs.

## Responsive / safe area

Every screen must respect safe area via `useSafeAreaInsets()` (root wrapped in `SafeAreaProvider`). Prefer existing layout components over hand-rolled insets: `ListScreenLayout` (list screens), `DetailPageLayout` (detail screens), `CenteredLoadingView` (full-screen loading — never a bare `ActivityIndicator`), `FAB` component for fixed bottom UI. No fixed `paddingTop: 48`-style constants for notch/status-bar clearance; touch targets ≥44pt.

## Testing

Jest is a multi-project config: `platform` project (`lib/platform/**/__tests__`), `oms` project (`oms/src/**/__tests__`), and the default `app` project (`jest-expo` preset, everything else). `oms/`, `analytics/`, `packages/`, and `tools/` own their own runners (Vitest-style) and aren't part of root Jest. Web/e2e: Playwright (`test:web*`) for the web build, Detox (`test:e2e`, iOS simulator only) for native.

CI (`.github/workflows/architecture-check.yml`) runs on every PR: lint (boundaries rules), `madge --circular`, the `lib/` 60-file cap, `test:navigation-policy`, `typecheck`, and `npm test -- --ci --passWithNoTests`.

## Team Git workflow and trigger words

Branching, PRs into `V1`, preprod deploys, migrations, releases, and the trigger words ("start", "sync", "handoff", "merge <PR#>", "release <version>", "hotfix", "sync prod") are defined in one shared file, also used by Cursor:

@.cursor/rules/team-git-workflow.mdc

## Stale docs — don't trust at face value


- `.cursor/rules/web-only.mdc` claims this project is strictly web-only; that's a leftover from a different sibling project and doesn't apply here (this is the Expo mobile+web app).
- `.cursor/rules/pulse-standards.mdc`'s line about migrations living in a separate repo is stale — see the Migrations section above for the real rule.
- `docs/FEATURES_ARCHITECTURE.md`'s "import features only via index.ts" guidance is superseded by the ESLint barrel-import ban described above.
- `docs/architecture_plan.md` is an AI-generated refactor *proposal*, not current state — useful for known debt (e.g. oversized `TripDetailScreen`, `AddTransactionModal`, an under-owned `globalSync/`) but don't treat its structural claims as fact.
