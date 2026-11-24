# nihas/V1.0.77

Branched from V1 `66715579` on 2026-11-23. Carries `nihas/rbm-preset` (`ae4460b5`) rebased onto V1.

## What
- New view-only RBM role (`platformRole: "rbm"`, stored as org role `member`): read-only oversight across Sales, Trip Ops, Finance, Compliance and Fleet. No payments, approvals, writes or admin toggles.

## Why
- Oversight role for managers who need to see everything without being able to change or pay anything. Built in the idrees worktree; it was pushed on 23 Nov but never had a PR, notes file or RBAC changelog entry.

## Areas
- lib/memberSurfaces.ts (RBM preset), features/organization/utils/teamInviteRoles.util.ts (role, grants, option)
- docs/RBAC_OPERATING_MODEL.md, docs/RBAC_OPERATING_MODEL_CHANGELOG.md
- lib/__tests__/rbac.rbmPreset.test.ts

## Migrations
None.

## Tested
- See PR description for the local check run.

## Not tested
- Click-through in the app. App-side only: the database treats RBM as `member`, so it is not a security boundary.
