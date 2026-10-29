# nihas V1.0.26


## RBAC: new Sourcing role (read-only follow-up of indents and trips)

### What broke / root cause
- Jeeva (GOGOVAN) follows loads for sourcing but is set up as Sales, so he
  can bid, award and allocate, and on Compliance sees client rate, profit
  and supplier banking. There was no read-only, scoped preset for that job.

### What
- New "Sourcing" preset in Member access. The owner assigns one or more
  clients and/or warehouses (same warehouse picker as Ground Ops, plus a
  client picker). They see only those indents and trips (Trips hub,
  Compliance, trip / indent detail); nothing assigned = nothing shown.
- Read-only: no create / bid / award / allocate / assign / status change /
  file upload / verify / resubmit / fleet / finance / team.
- Money hidden: indent commercials and quotes, hub money tiles, Trip Report
  and ledger export, E-LR, banking, profit and client rate. Driver name and
  phone stay visible.
- Compliance documents: read-only except the Memo — uploadable only before
  the trip is in transit, or again if the Memo is rejected / the hold or
  finance-reject reason mentions it. Assigned trips are listed for upload.
  Compliance Rates shows Supplier rate and Target rate (the indent's
  supplier target) instead.
- App-side only: stored as org role `member`, so the database still allows
  everything Sales can do through a direct API call, org-wide. Documented in
  docs/RBAC_OPERATING_MODEL.md.

### Areas
features/organization (role util, member editor, draft, picker, scope hook /
util, invite), lib/memberSurfaces.ts, features/trips (hub, trip detail),
features/indents (detail, supplier-target read), features/tripCompliance
(workspace Rates card), app/compliance, RBAC docs.

### Migrations
None.

### Tested
- New rbac.sourcingPreset.test.ts and sourcingScope.util.test.ts (preset,
  `member` mapping, label kept on save, only view surfaces on every model,
  every action denied, client / warehouse union, trips via indent, no-indent
  trips via client, empty scope = nothing, clientIds saved for Sourcing only).
- Full Jest 4,896 passed; lint / cycles / lib-files at baseline; typecheck
  325 (baseline 350).
- Prod read-only: trip SAT812GOGTRIP001772 target 4,233 per trip vs supplier
  5,250. Not clicked through in the app; Jeeva not reassigned.

## RBAC: Department managers for every department

### What broke / root cause
- The manager save function merged any toggle it was sent, so a manager of
  any department could grant Finance, Team or another department's access.
- It picked the caller's first active membership in any org (multi-org bug).
- Managers could not open Team & access without `team.manage`, saw every org
  member, and could not assign Ground Ops / Sourcing scope. Any staff member
  could write anyone's warehouse rows (including their own).

### What
- Manager flag opens Team & access; roster = active same-department
  teammates only; no invite, pending, join requests, bulk role change.
- Editor: only the department's preset toggles; master switches, role,
  manager flag and custom presets locked.
- Ground Ops / Sourcing managers assign teammates' warehouses (and Sourcing
  clients) from their own scope only.
- Server (migration 20261029171316, release set department-manager-rbac):
  allowlist per department, org resolved from the target, scope function,
  warehouse writes owner / admin only, anon revoked.

### Areas
lib/memberSurfaces.ts, lib/queries/useOrgMembersQuery.ts,
features/organization (Team list, permissions panel, editor, toggle row,
services), components/profile/WorkspaceHubMenu.tsx, app/workspace.tsx,
app/(modals)/team.tsx, lib/database.types.ts, RBAC docs.

### Migrations
20261029171316_department_manager_allowlist_and_scope.sql — set
department-manager-rbac. Not applied anywhere yet.

### Tested
- rbac.departmentManager.test.ts (35): app ↔ SQL allowlist parity for all 8
  departments, requires-closure, no Team / workspace toggles, manager rules.
- departmentManagerRbacSet.test.ts (4): set pinning.
- supabase/tests/department_manager on a disposable local Postgres 15: 29/29
  allow / deny cases (cross-dept, Finance / Team grants, self, admin,
  inactive, other org, anon, scope in / out, direct table writes).
- Not run against preprod; not clicked through in the app.
