# nihas/V1.0.48 — Preprod release set for the simulated-status migration

## What
Preprod-only release set `preprod-2026-11-12-simulated-status` with one version, `20271111143000` (Vasanth #105), SHA-256 pinned, plus a Jest test.

## Why
Preprod already has the other two migrations in `prod-2026-11-12-release`, and `db-push-set` refuses a set whose versions are already applied. So that set cannot run on preprod.

## Migrations
No new migration files. The prod set is unchanged.

## Tested
- Jest: `preprodSimulatedStatus20261112Set.test.ts`
