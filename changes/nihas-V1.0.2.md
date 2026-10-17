# nihas V1.0.2 — first round on the prod baseline (V1.0.1 @ 389a5d3f)

## What
- Started a fresh round from Vasanth's V1.0.1 at 389a5d3f, the code live on gogopulse.com after PR #3 and PR #4.
- Added the team Git lifecycle (`.cursor/rules/team-git-workflow.mdc`): dev branches → PR into V1 → preprod → dated release PR to Vasanth's V1.0.1 → sync prod, plus hotfix.

## Why
- Earlier nihas/V1.0.x rounds drifted from prod; from now on every round starts from prod code and goes back to Vasanth by PR.
- `CLAUDE.md` imports this file but it was missing on the prod baseline, and the 14 Oct outage showed code must never go live before its migrations.

## Areas
- None yet (changes file only).
- Team workflow docs only.

## Migrations
- None. Prod DB already has the 27-migration catch-up (prod-v1-0-1-catchup, applied 2026-10-16).
- None.

## Tested
- Nothing to test yet (no code change).
- Docs only; no code run.
