# nihas/V1.0.64

Branched from V1 `99c4f5f2` on 2026-11-21.

## What
- Release set `prod-2026-11-21-release`: the three migrations V1 has and prod does not (20261120055411, 20261120094932, 20271120101500), in version order, each pinned by sha256, plus its Jest pin test.

## Why
- Release 2026-11-21 to Vasanth. 20261120094932 (per-MT advance, #141) had no release set; prod only takes migrations through a named set.

## Areas
- supabase/release-sets/prod-2026-11-21-release.versions
- supabase/migrations/__tests__/prod20261121ReleaseSet.test.ts

## Migrations
- None new. The set lists existing files only.

## Tested
- Jest: prod20261121ReleaseSet, entityDocumentsSupersededReadersReleaseSet, poolExhaustedRebid (14 pass). Hashes checked against the files and the per-feature sets.

## Not tested
- Real apply (preprod first, then prod by Vasanth).
