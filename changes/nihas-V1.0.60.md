# nihas V1.0.60

## What
- `scripts/ci-local.sh`: runs the same 7 jobs as `.github/workflows/architecture-check.yml` (lib-files, lint, cycles, V2 isolation, navigation policy, typecheck, Jest) on your machine and prints a pass/fail summary. `bash scripts/ci-local.sh` for all, or name jobs: `lint cycles lib v2 nav tsc jest`.

## Why
- GitHub Actions on nihas-gogox/Pulse-app is paused (billing), so PR checks don't start. Everyone runs this before raising a PR and pastes the summary into the PR description.

## Areas
- scripts/ only. No app code.

## Migrations
- None.

## Tested
- `bash -n` syntax check; `bash scripts/ci-local.sh lib` on this branch; full run on the 2026-11-20 sync commit (922146f4): 6/7 pass, typecheck 345 vs 344 from a shared node_modules (that commit added no TS errors).
