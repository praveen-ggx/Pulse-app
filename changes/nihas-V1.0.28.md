# nihas V1.0.28

## What
- Finance exports (Advance Verification, Advance Payment, Advance Processed) read the LR number the same way; generated E-LRs export the LR number, not raw JSON.

## Why
- Dhira's 28 Oct feedback: LR NO blank for some trips in the Advance Payment / Advance Processed export; Advance Verification had no fallback to the POD LR list.

## Areas
- Compliance finance export (LR No column).

## Migrations
- None.

## Tested
- Full jest + ci-baseline (lint, typecheck, cycles, lib-files) before push.
