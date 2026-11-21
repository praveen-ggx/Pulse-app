# nihas/V1.0.64

Branched from V1 `99c4f5f2` on 2026-11-21.

## What
- Release set `prod-2026-11-21-release`: the three migrations V1 has and prod does not (20261120055411, 20261120094932, 20271120101500), in version order, each pinned by sha256, plus its Jest pin test.
- Release set `preprod-2026-11-21`: the two of those not yet on preprod (20261120094932, 20271120101500), same hashes, pinned in the same test.
- ewayBillNumbersKept test mock: add `maybeSingle`. #138 (e-way) and #139 (approved-doc status re-read) merged separately; together this suite failed on V1.

## Why
- Release 2026-11-21 to Vasanth. 20261120094932 (per-MT advance, #141) had no release set; prod only takes migrations through a named set.

## Areas
- supabase/release-sets/prod-2026-11-21-release.versions
- supabase/migrations/__tests__/prod20261121ReleaseSet.test.ts
- supabase/release-sets/preprod-2026-11-21.versions
- features/trips/services/__tests__/ewayBillNumbersKept.test.ts

## Migrations
- None new. The set lists existing files only.

## Tested
- Jest: prod20261121ReleaseSet, entityDocumentsSupersededReadersReleaseSet, poolExhaustedRebid (14 pass). Hashes checked against the files and the per-feature sets.
- Preprod dry-run (CLI 2.121.0): `db-push-set preprod-2026-11-21 --dry-run` would push exactly 20261120094932 and 20271120101500; nothing applied.
- Full jest on this branch before the mock fix: only ewayBillNumbersKept failed (4); after: it passes (15 with tripDocumentDeleteOrder). lint 98, typecheck 344, cycles 94, lib-files 178 (all at baseline), navigation-policy 69 pass.

## Not tested
- Real apply (preprod first, then prod by Vasanth).
