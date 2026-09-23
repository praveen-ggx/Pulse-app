# Operating model RBAC — change log

Track **new** vs **modified** files for Asset / Aggregate / Hybrid RBAC work.  
Update this table whenever RBAC behavior or gates change.

Canonical matrix: [`docs/RBAC_OPERATING_MODEL.md`](./RBAC_OPERATING_MODEL.md)

---

## Session / commits

| Commit | Summary |
|--------|---------|
| _(pending)_ | Fix: `trip_compliance.*` surfaces used `anyOfCaps` as both the org availability gate AND the grant set, so enabling the Compliance tab for a **finance** member also conferred `dispatch` + `dispatch_for_own_fleet` (and `trip_compliance.finance.view` conferred `finance_manage`). Added explicit `grantsCaps` — `[]` for `trip_compliance.tab` (opening the workspace grants nothing; inner actions have their own surfaces) and `["finance_view"]` for `trip_compliance.finance.view`. Caught by `lib/__tests__/rbac.memberAccess.test.ts` TC-06/TC-06b. Note: `tripops.pulse_loads` deliberately keeps `requires: "sales.tab"` (loads-hub landing screen inside the Network tab) while the eight per-indent surfaces parent to `tripops.tab` |
| _(pending)_ | Fix: invite-flow Trip Ops functional role (`lib/memberSurfaces.ts` `defaultSurfacesForRole` "tripops" case) unconditionally included `sales.tab`, granting the full Sales/Network tab + domain to every Trip Ops invitee. Removed — mirrors the same fix already applied to the legacy `operator` role in `4c9ae5fe`. Indent access (`tripops.indents.*`, `tripops.pulse_loads`) is unaffected since those surfaces now require `tripops.tab`, not `sales.tab` |
| _(pending)_ | Department Manager delegation: `permissions.isDepartmentManager` flag (owner-only to set); new narrow `set_member_surfaces_as_manager` RPC lets a flagged member edit `surfaces` for teammates sharing their own `platformRole` only — never role/domains/the flag itself, never owner/admin rows, never their own row; `MemberPermissionsPanel` adds `canEditAsManager` edit path (surfaces-only) alongside existing owner path, plus an owner-only toggle to grant the flag |
| `943c7241` | `useCapabilities` + ModelAccessGate + finance/trip/party/supplier/vehicle gates |
| `3af2fdaf` | Party directory gate; give-load blocked for asset; nav policy + capability merge fix |
| `6cef06c4` | Docs + cursor rule: operating model blueprint |
| _(pending)_ | Account & Organization IA: `/account` → My Account panel (not Network My Profile); hub PARTY → Operations; personal prefs on My Account; org admin on Organization. Same `workspace.*` / `team.manage` surfaces, no new gates. |
| _(pending)_ | Organization Overview **Business dashboard** card stays; it opens Network hub (`ROUTES.networkOrgHub("profile")`). Intelligence `/business-pulse` page is a redirect stub to that hub (no KPI landing page). Nav alias inherits `/network/hub`, not `finance_view`. Workspace org avatar still opens Organization overview. |
| _(pending)_ | Network page: counterparty-aware connect roles; asset hides supplier tab/count/create-post; aggregate hides driver (FLEET) tab/count |
| _(pending)_ | Operating-model switching: owner-only, 30-day cooldown, audited RPC; impact-preview modal; capability re-gate with no data loss |
| _(pending)_ | Desktop hub sub-panels (details / hero / grow) gated on `canAccessSuppliers`/`canAccessDrivers`; `database.types.ts` regen (change_operating_model RPC + operating_model_changed_at); Hybrid model verified full-union (no gates to add, covered by tests) |
| _(pending)_ | Ownership transfer: owner-only atomic audited RPC (`transfer_organization_ownership`) — demote owner→admin, promote member→owner, sync `organizations.owner_id`; hardened `org_members_update` RLS to block off-RPC `role='owner'`; owner-only "Transfer ownership" on member access page; workspace refresh re-gates ex-owner |
| _(pending)_ | Owner-only Access Control page: dedicated owner-gated screen (`app/(modals)/access-control.tsx`) reusing `TeamMembersView`; role writes routed through new owner-only, atomic, audited `set_member_role` RPC; `org_members_update` RLS hardened so role/permission changes are owner-only (admins can no longer re-role teammates off-RPC); owner-only "Access" entry in `WorkspaceTeamPanel` |
| _(pending)_ | Part 2: functional member roles (Finance/Sales/TripOps) — invite roles replace Planner/Operator; `permissions.platformRole` now read into `ActiveWorkspaceContext`; new `useMemberCapabilities()` intersects org model with functional role (owner/admin bypass); client-side gate on the 3 primary tabs only (`MemberDomainGate`) — no RLS change, no DB migration (reuses existing `organization_members.permissions` column and legacy `role` CHECK values) |
| _(pending)_ | Part 3: per-member access page — Edit opens `/(modals)/member-permissions` (two-column: identity left, presets/domains right); replaces `MemberEditModal`; remove + transfer + role/domains save live on that page |
| _(pending)_ | RBAC enhancements: zero-domain fallback → `restricted`, custom presets stored in `organizations.settings`, bulk role assignment, and removed hardcoded driver RBAC limits |
| _(pending)_ | Fix: Team/Workspace surfaces were wrongly gated on `team_manage` (never emitted by org operating-model caps) — now available for any business org so owners can grant invite/audit/settings/KYC/notifications |
| _(pending)_ | Fix: Driver Control screen treated an Aggregate-mode org that only ever assigned an open trip (via a `tracking_only` phone-assignment stub, no real fleet employment) as the driver's employer — fabricating an "Estimated earnings" figure and offering "Attribute to employer" with no salary/commission ever configured. Now excludes `tracking_only` rows from employer resolution and from the earnings-estimate gate, matching the pattern already used everywhere else `tracking_only` is checked (`DriverWalletScreen`, `drivers.service.ts`, `aggregateDrivers.ts`) |
| _(pending)_ | Driver Stories: Pulse story preview (`DriverPulseStoryViewer` + `StoryBroadcastPreview`); `/story-detail` nav experience `public_content` so drivers can open market stories; bid-to-shipper footer banner |
| _(pending)_ | Driver + Fleet Owner Phase 1 foundation: explicit `driver_fleet_owner_profiles` + `enable_driver_fleet_owner` RPC (no personal org); Become Fleet Owner entry in Driver App. Canonical: [`DRIVER_FLEET_OWNER_PHASE1.md`](./DRIVER_FLEET_OWNER_PHASE1.md). Does **not** grant Business create-trip/load/indent. |
| _(pending)_ | Driver + Fleet Owner Phase 1b: separate `owner_vehicles` (`owner_user_id` RLS); My Fleet list/add/detail. Business `public.vehicles` unchanged. No trip/docs/P&L/create-trip. |
| _(pending)_ | Driver + Fleet Owner Phase 2: `owner_vehicle_documents` + private `owner-vehicle-documents` bucket; upload/preview/replace/expiry on vehicle detail. No marketplace/P&L. |
| _(pending)_ | Driver + Fleet Owner Phase 3A: `list_open_marketplace_loads_for_fleet_owner` + Available Loads UI (read-only). No bid/trip create. Explicit `owner_vehicle_id` deferred to 3C. |
| _(pending)_ | Driver + Fleet Owner Phase 3B inspection baseline appended to PRD — Story/Reach reuse; no My Fleet bidding; extend `driver_direct_bids` preferred over new bid tables; capacity Story needs minimal posts authoring extension (no personal org). |
| _(pending)_ | Driver + Fleet Owner Phase **3B.1 integration correction**: Business Give Load Idle capacity / Find vehicles consumes FO `VEHICLE_AVAILABILITY` via existing feed + OpportunityCard; FO Stories reuses same card language; null-org Stories/detail hardened. No bid / Boost. |
| _(pending)_ | **NO-GO security:** lock `get_network_feed(uuid,integer,integer)` EXECUTE to authenticated only (`20270210182000`); Reach Option A deleted-source bid = campaign snapshot (`20270210183000`). Employed-driver role-blind OM RLS tracked only: [`SECURITY_TICKET_EMPLOYED_DRIVER_RLS.md`](./SECURITY_TICKET_EMPLOYED_DRIVER_RLS.md). **Do not start 3B.2 until re-audit green.** |
| _(pending)_ | Finance party tabs: one add FAB per page (customer / supplier / vehicle / driver matching the active sub-tab), with the new icon+plus chip that expands on desktop hover. Same `sales.*.create` / `fleet.*.create` surfaces. |
| _(pending)_ | Org KYC document update: owner/admin step wizard (intro → upload → preview of **new file only**). Update stays available while pending/verified; submit queues admin-console review via `request_kyc_document_review`. Tax IDs stay frozen. |
| _(pending)_ | Organization hub Slice 1: `workspace.kyc` lands on Organization home (summary + nav), not the giant KYC form. Business details, Verification, and Documents are separate screens. Same `workspace.kyc` / owner-admin edit surface. |
| _(pending)_ | Organization hub Slice 3: 4-step verification + review wizard. Home status card is the next-action source of truth. Continue/Fix never opens the old tax form. Same KYC primitives / freeze / document-update lifecycle. No FO work. |
| _(pending)_ | Verify wizard tax step: fields follow registration type; optional IDs add/remove; GSTIN+PAN (and CIN for Pvt/Public Ltd) stay mandatory. Admin console marks the same slots required. |
| _(pending)_ | Workspace **Profile** opens in the flex-card side panel (same chrome as Account / Organization), not the full `/profile` tab. Compact hero/stats alignment for the narrower pane. |
| _(pending)_ | Verify wizard Slice 3.2 UX: GST Yes/No (no Required+skip contradiction), Add vs Edit, Step 4 cards from `buildKycRequirementProfile`, Home “2 details and 4 documents remaining”. Admin GST check `required` follows the same skip. Hub structure unchanged. |
| _(pending)_ | Drop leftover 5-arg `submit_business_verification` overload (GST-always-required). **Pushed** to linked remote 2026-08-15 (`20270215221500`). Live: 6-arg exists, 5-arg gone. Policy: [`docs/KYC_REQUIREMENT_POLICY.md`](./KYC_REQUIREMENT_POLICY.md). Wizard UX not reopened. No FO / 3B.2. |
| _(pending)_ | Network hub opens as a full-page popup (covers tab dock). Welcome / corner close hidden; org profile + all tabs (Details → Chat, including Goals) stay in the same flow. Close X is painted above the hub shell and `replace`s to Network (not `back()` through hub tabs). No FO / 3B.2. |
| _(pending)_ | Hub **Sales** tab merges Connection sales + Asset sales. Toggle when the org has both clients and fleet (`canAccessClients` + `canAccessDrivers`). Aggregate-only: Connection view only. `?tab=asset` still opens Sales on Asset. |
| _(pending)_ | Workspace hub "Documents" quick-action tile removed. Documents Center still reachable from the header folder icon. No FO / 3B.2. |
| `20270217000000` | QA fix (TC-13): `defaultSurfacesForRole("tripops", …)` excluded give-load/indent surfaces because they're catalogued under `domain: "sales"`, not `"tripops"` — Dispatcher invites in Aggregate orgs got trip visibility but no create/manage-indent access. Filter now includes `tripops.indents.*`, `tripops.pulse_loads`, and their `sales.tab` parent requirement (mirrors the existing "planner" case). |
| `20270217000000` | QA fix (TC-20): `applyDomainToggle` bulk-reset every surface in a domain to role defaults whenever the domain master switch was re-enabled, silently reverting an admin's individually-revoked surface. Now: re-enabling an already-configured domain only flips the `*.tab` gate and leaves individual surface choices untouched; only a never-configured domain seeds role defaults. |
| `20270217000000` | QA fix (TC-10/TC-11): permission/role changes to the signed-in user's own `organization_members` row now push live via a `postgres_changes` subscription in `ActiveWorkspaceContext` (`subscribeSharedPostgresChanges`, scoped `user_id=eq.<uid>`), triggering `loadWorkspaces()` automatically instead of requiring reload/relogin. RLS was already enforcing revokes immediately server-side — this closes the client-side staleness gap. |
| `20270217000000` | QA fix (TC-02/TC-04/TC-16): `get_my_team_invites`, `accept_team_invite`, `reject_team_invite`, `precheck_team_invite_contact` checked `organization_members.status = 'invited'`, a value the table's CHECK constraint never allows (only `active`/`inactive`/`pending`). Every invite is written as `'pending'`, so these RPCs matched zero rows — invited members never saw their invite and admins' duplicate-invite detection silently missed. Migration `20270217000000_fix_invited_status_mismatch.sql` corrects all four to check `'pending'`. |
| _(pending)_ | Full-repo permission audit (85 surfaces in `MEMBER_SURFACE_CATALOG`): built `docs/RBAC_SURFACE_CATALOG.json` (catalog export) and `docs/RBAC_SURFACE_AUDIT.json` (wired-vs-not per surface, with file references). Found 13 catalog-only surfaces with no enforcement; fixed 6 real gaps this pass — `finance.branding` (Invoice Branding card in Workspace Settings), `sales.network.discover` (Discover-partners section, mobile + desktop), `sales.suppliers.edit` (new `canEdit` prop on shared `CounterpartyProfileSystemCard`, both mobile and desktop edit triggers + modal), `team.invite` (all 4 invite entry points: Team screen, Access Control screen, Workspace Team panel, Network desktop Team panel), `team.audit` (`SurfaceAccessGate` wrap on `app/audit-log`, new `ROUTES.AUDIT_LOG`, first-ever nav link added to Access Control screen). 5 were false positives from an earlier grep-only pass (`finance.manage` + 4 `finance.ledger.*`) — already enforced via `memberHasSurface`'s `requires`-chain / `canLedgerCategory()` helper, left untouched. 2 skipped by explicit user decision: `fleet.vehicles.edit` (no edit-vehicle UI exists anywhere — `updateVehicle()` service has zero callers, would need new feature work) and `finance.business_pulse` (route already product-retired, redirects to Network hub, dashboard component orphaned). |

---

## New files

| File | Purpose |
|------|---------|
| `lib/useCapabilities.ts` | Hook: profile + org `operatingModel` → capabilities |
| `components/ModelAccessGate.tsx` | Soft route gate (suppliers / vehicles / drivers / clients) |
| `lib/__tests__/capabilities.operatingModel.test.ts` | Unit tests for ASSET / NON_ASSET / HYBRID |
| `docs/RBAC_OPERATING_MODEL.md` | Who-can-do-what matrix |
| `docs/RBAC_OPERATING_MODEL_CHANGELOG.md` | This change log |
| `.cursor/rules/pulse-operating-model-rbac.mdc` | Cursor rule for RBAC sessions |
| `supabase/migrations/20270120000000_organizations_settings_jsonb.sql` | Add `settings` JSONB column to `organizations` for custom RBAC presets |
| `supabase/migrations/20261207160000_discover_organizations_expose_operating_model.sql` | RPC returns `operating_model` for counterparty-aware connect roles |
| `supabase/migrations/20261208120000_change_operating_model.sql` | `operating_model_changed_at` col + owner-only, cooldown-guarded, audited `change_operating_model` RPC |
| `features/organization/components/workspace/ChangeOperatingModelModal.tsx` | Owner-only model picker with downgrade impact preview |
| `supabase/migrations/20261210120000_transfer_organization_ownership.sql` | Owner-only atomic ownership-transfer RPC + `org_members_update` RLS hardening (no off-RPC `role='owner'`) |
| `supabase/migrations/20261212090000_set_member_role_owner_only.sql` | Owner-only `set_member_role(p_member_id, p_role, p_permissions)` SECURITY DEFINER RPC (rejects non-owner + owner-row reassignment, audits `member.role_update`); `member_role_permissions_unchanged()` helper; `org_members_update` RLS now requires owner to change role/permissions (no self-reference — uses helpers to avoid the `20261211090000` recursion class) |
| `app/(modals)/access-control.tsx` | Owner-only Access Control screen — gates on `useOrgRole().isOwner`, renders `TeamMembersView` with `canManage={isOwner}`; "Owner access only" notice for non-owners |
| `supabase/migrations/20261211090000_fix_org_members_policy_recursion.sql` | Fix infinite-recursion in `org_members_update`/`org_members_insert` (self-referenced `organization_members` inside its own policy → every UPDATE/INSERT 500'd). New `is_org_owner()` SECURITY DEFINER helper; policies now use `is_org_admin()`/`is_org_owner()` instead of inline self-subqueries. Same authz intent |
| `lib/useMemberCapabilities.ts` | Hook: `useCapabilities()` (org model) ∩ member domains (or legacy single functional role) → `{ finance, sales, tripops }`; owner/admin bypass |
| `components/MemberDomainGate.tsx` | Client-side redirect-on-deny gate for the Fiscal/Trips/Network tabs (same pattern as `ModelAccessGate`) |
| `app/(modals)/member-permissions.tsx` | Owner-only per-member domain permission detail screen (`?memberId=`) |
| `features/organization/components/MemberPermissionsPanel/MemberPermissionsPanel.tsx` | KYC-style WorkspaceDetailLayout page: role presets + domain Switch rows + save via `updateMemberPermissions`; zero-domain handling; custom preset save/apply UI |
| `features/organization/components/MemberPermissionsPanel/DomainPermissionToggleRow.tsx` | Expandable domain row (Switch + grants chips), mirrors KycRequiredDocumentRow |
| `docs/DRIVER_FLEET_OWNER_PHASE1.md` | Driver App Fleet Owner Phase 1 PRD — identity, RBAC boundary, no personal org |
| `supabase/migrations/20270210103000_enable_driver_fleet_owner_capability.sql` | `driver_fleet_owner_profiles` + `enable_driver_fleet_owner` / `is_driver_fleet_owner` |
| `features/driver/services/driverFleetOwner.service.ts` | Client API for owner capability |
| `lib/queries/useDriverFleetOwnerQuery.ts` | React Query hook for Fleet Owner status |
| `features/driver/components/BecomeFleetOwnerScreen.tsx` | Lightweight Become Fleet Owner onboarding |
| `app/(driver)/become-fleet-owner.tsx` | Route entry |
| `supabase/migrations/20270210114000_create_owner_vehicles.sql` | Personal `owner_vehicles` + owner-only fleet-owner RLS |
| `features/driver/services/ownerVehicles.service.ts` | Owner vehicle CRUD (soft delete) |
| `lib/queries/useOwnerVehiclesQuery.ts` | List/detail queries |
| `features/driver/components/MyFleetScreen.tsx` | My Fleet list |
| `features/driver/components/AddOwnerVehicleScreen.tsx` | Add vehicle (no docs) |
| `features/driver/components/OwnerVehicleDetailScreen.tsx` | Vehicle detail + “Share as Story” deeplink (3B.1) |
| `app/(driver)/my-fleet/*` | My Fleet routes |
| `supabase/migrations/20270210123000_create_owner_vehicle_documents.sql` | Document rows + private owner-vehicle-documents storage |
| `features/driver/services/ownerVehicleDocuments.service.ts` | Upload / signed URL / replace / delete |
| `features/driver/utils/ownerVehicleDocuments.util.ts` | Types + expiry + summary |
| `features/driver/components/OwnerVehicleDocumentsSection.tsx` | Document vault UI |
| `supabase/migrations/20270210133000_list_open_marketplace_loads_for_fleet_owner.sql` | Sanitized open marketplace loads RPC for FO |
| `features/driver/services/fleetOwnerLoads.service.ts` | FO load list helpers |
| `lib/queries/useFleetOwnerOpenLoadsQuery.ts` | React Query for Available Loads |
| `features/driver/components/AvailableLoadsScreen.tsx` | Load discovery list |
| `features/driver/components/AvailableLoadDetailScreen.tsx` | Read-only load detail |
| `app/(driver)/available-loads/*` | Routes |
| `supabase/migrations/20270210143000_fleet_owner_capacity_story.sql` | Phase 3B.1: `VEHICLE_AVAILABILITY` on posts, nullable org, `owner_vehicle_id`, FO RLS + create/deactivate RPCs, organic `get_network_feed` branch |
| `features/driver/services/fleetOwnerCapacityStory.service.ts` | Create / list / deactivate capacity Stories |
| `lib/queries/useMyCapacityStoriesQuery.ts` | FO “My availability” query |
| `features/driver/components/CapacityStoryComposerScreen.tsx` | Minimal capacity Story composer |
| `app/(driver)/capacity-story.tsx` | Route entry |
| `features/network/components/desktop/NetworkDesktopSalesPanel.tsx` | Hub Sales tab: Aggregate (connection) / Asset (fleet) toggle gated on `canAccessClients` + `canAccessDrivers` |

---

## Modified files

| File | What changed |
|------|----------------|
| `lib/capabilities.ts` | Org model flags; finance/party helpers; asset = no indent create; hybrid merge safe; `hasBusinessCapabilities`; `allowedConnectionRoles` (counterparty-aware client/supplier); `operatingModelTransition` (impact preview); removed hardcoded driver limits |
| `features/organization/services/organization.service.ts` | `changeOperatingModel` RPC wrapper + `looksLikeModelChangeCooldownError` |
| `features/organization/services/members.service.ts` | `transferOwnership` RPC wrapper + `looksLikeTransferTargetError`; `updateMemberRole` → `set_member_role`; new `updateMemberPermissions` for domain toggles + `looksLikeNotOwnerError`; new `updateBulkMemberPermissions` |
| `lib/routes.ts` | `MODALS.ACCESS_CONTROL` + `MODALS.MEMBER_PERMISSIONS`; driver FO routes incl. `driverCapacityStory` (3B.1); `?tab=asset` documented as Sales Asset-view alias |
| `features/reach/screens/DriverStoriesScreen.tsx` | FO “My availability” + Share capacity entry (3B.1); no bidding |
| `app/(modals)/_layout.tsx` | Register `access-control` + `member-permissions` fullScreenModal screens |
| `features/organization/components/workspace/WorkspaceTeamPanel.tsx` | Owner-only "Access" button → `ROUTES.MODALS.ACCESS_CONTROL` |
| `features/network/components/desktop/NetworkDesktopTeamPanel.tsx` | Owner-only "Access" button (network hub Team tab) → `ROUTES.MODALS.ACCESS_CONTROL` |
| `lib/navigationPolicy/registry/org.ts` | `org.modal-access-control` + `org.modal-member-permissions` policies |
| `features/organization/components/TeamMembersView.tsx` | Edit → member-permissions modal (no `MemberEditModal`); phone-invite cancel stays local; multi-select and bulk role assignment action bar |
| `features/organization/utils/teamInviteRoles.util.ts` | `MemberDomainFlags`, `domains` on permissions, domain helpers, `buildPermissionsFromDomains`; added `restricted` fallback role for zero-domain members |
| `contexts/ActiveWorkspaceContext.tsx` / `types/workspace.ts` | Expose `memberDomains` from permissions |
| `lib/useMemberCapabilities.ts` | Prefer `memberDomains` (multi-domain) over single functional role |
| ~~`features/organization/components/MemberEditModal.tsx`~~ | Removed — superseded by `MemberPermissionsPanel` |
| `features/organization/components/workspace/WorkspaceSettingsPanel.tsx` | Owner-only editable Operating Model field → opens modal; refresh + `['q',…]` cache purge on switch |
| `features/organization/components/workspace/workspacePanelUi.tsx` | `panelFieldHint` style |
| `features/network/screens/NetworkScreen.tsx` | Asset: hide supplier tab/count/create-post, connect as client only. Aggregate: hide DRIVER tab + FLEET count. Empty-role connect blocked with alert |
| `features/network/components/desktop/NetworkDesktopHub.tsx` | Hub stats: drop SUPPLIERS tile (asset) / FLEET tile (aggregate) via `canAccessSuppliers`/`canAccessDrivers`. Zero gated counts (`gatedSupplierCount`/`gatedDriverCount`) into details/hero/grow sub-panels so no hidden-surface count leaks. Connection sales + Asset sales merged into one **Sales** tab (`asset` deep-link alias) |
| `lib/database.types.ts` | Regenerated — adds `change_operating_model` RPC + `organizations.operating_model_changed_at` |
| `features/network/components/ConnectionRoleModal.tsx` | `allowedRoles` prop; preselect + render only valid roles |
| `features/network/components/StoryReel.tsx` | `canCreatePost` prop; hide create bubble/`+` badge for asset |
| `features/network/components/DiscoverView.tsx` | Connect modal gated by `allowedConnectionRoles`; empty-role connect blocked |
| `features/network/services/discover.service.ts` | `DiscoverOrg.operating_model` field; threaded from RPC |
| `lib/__tests__/capabilities.operatingModel.test.ts` | `allowedConnectionRoles` cases (asset→aggregate, asset→asset empty, etc.) |
| `features/organization/components/workspace/kyc/OrgVerificationReminderProvider.tsx` | Gate via `useCapabilities` + `hasBusinessCapabilities` (no `profile.role`) |
| `lib/navigationPolicy/grants.ts` | `operatingModel` arg on grant set |
| `lib/navigationPolicy/NavigationPolicyProvider.tsx` | Passes `operatingModel` into principal |
| `lib/navigationPolicy/NavigationPolicyShadowHost.tsx` | Reads org operating model |
| `lib/navigationPolicy/registry/org.ts` | Supplier/`create-indent` = `dispatch`; party kind policies; vehicle = fleet |
| `lib/navigationPolicy/__tests__/grants.test.ts` | Operating-model override test |
| `features/auth/services/auth.service.ts` | Signup writes profile flags; refresh prefers metadata model |
| `features/finance/components/FinanceScreen.tsx` | Tab / ledger / party / vehicle filters by caps |
| `features/finance/components/FinanceTabRow.tsx` | Optional visible tabs |
| `features/finance/components/FinanceTabBody.tsx` | Mounts only allowed tabs |
| `features/finance/components/FinanceTabBody.types.ts` | `visibleTabs` / kanban columns |
| `features/finance/components/FinanceSummarySection.tsx` | Passes visible tabs + ledger categories |
| `features/finance/components/TreasurySummaryCard.tsx` | Allowed ledger categories |
| `features/finance/components/EntityListCategoryModal.tsx` | Allowed categories prop |
| `features/finance/components/FinanceKanbanTab.tsx` | Visible columns |
| `features/finance/components/finance-tabs/FinanceCashKanbanPanel.tsx` | Kanban columns from caps |
| `features/trips/screens/TripsScreen.tsx` | `useCapabilities` |
| `features/trips/components/add-trip/AddTripModal.tsx` | Allowed supply modes |
| `features/trips/components/add-trip/AddTripFormFields.tsx` | Passes `allowedSupplyModes` |
| `features/trips/components/add-trip/useAddTripForm.ts` | Initial supply source |
| `features/trips/components/SupplyAllocationModeBar.tsx` | Own fleet / Partner fleet labels |
| `features/trips/components/TripExpandableCard.tsx` | `useCapabilities` |
| `features/trips/components/trip-detail/hooks/useTripDetail.ts` | `useCapabilities` |
| `features/indents/components/IndentDetailScreen.tsx` | No give-load/broadcast/share for asset |
| `features/party/components/PartyDirectoryScreen.tsx` | Filtered tabs + queries |
| `app/party/[kind].tsx` | `ModelAccessGate` by kind |
| `app/supplier/[id].tsx` (+ profile/analytics) | Supplier gate |
| `app/vehicle/[id].tsx` (+ profile/analytics) | Vehicle gate |
| `features/suppliers/screens/AddSupplierScreen.tsx` | Bounce if no suppliers |
| `features/vehicles/screens/AddVehicleScreen.tsx` | Bounce if no vehicles |
| `components/profile/WorkspaceHubMenu.tsx` | Party rows by caps |
| `app/(tabs)/clients.tsx` | `useCapabilities` |
| `app/create-indent/index.tsx` | Caps via hook (create blocked for asset) |
| `features/clients/components/ClientDetailScreen.tsx` | `useCapabilities` |
| `features/suppliers/components/SupplierDetailScreen.tsx` | `useCapabilities` |
| `features/drivers/components/DriverDetailScreen.tsx` | `useCapabilities` |
| `features/vehicles/components/VehicleDetailScreen.tsx` | `useCapabilities` |
| `features/organization/screens/ProfileScreen.tsx` | `useCapabilities` |
| `features/invoicing/InvoicingExecuteScreen.tsx` | Caps via hook (valid hooks) |
| `app/invoicing/pdf-preview.tsx` | Caps via hook |
| `features/pod-reconciliation/PodReconciliationScreen.tsx` | Caps via hook |
| `features/log-pods/LogIncomingPodsScreen.tsx` | Caps via hook |
| `CLAUDE.md` | Points to RBAC docs |
| `.cursor/rules/pulse-standards.mdc` | Points to operating-model RBAC |
| `features/organization/utils/teamInviteRoles.util.ts` | `PlatformTeamRole` adds `finance`/`sales`/`tripops` (planner/operator kept for legacy-row display only); `TEAM_INVITE_ROLE_OPTIONS` now Admin/Finance/Sales/TripOps; `orgMemberRoleForPlatformRole` maps finance→`finance`, sales→`member`, tripops→`dispatcher`; new `FunctionalRole` type + `functionalRoleFromPlatformRole()` |
| `features/organization/components/InviteMemberModal.tsx` | Default `selectedRole` → `"tripops"` (was `"operator"`, now retired from the picker) |
| ~~`features/organization/components/MemberEditModal.tsx`~~ | Removed — edit now opens `MemberPermissionsPanel` |
| `contexts/ActiveWorkspaceContext.tsx` | Selects `permissions` from `organization_members`; new `platformRoleMap` (parallel to `roleMap`) + `memberPlatformRole` state, derived via `platformRoleFromMember`, set in `loadWorkspaces` and `switchWorkspace` |
| `types/workspace.ts` | `ActiveWorkspaceState.memberPlatformRole: PlatformTeamRole \| null` |
| `app/(tabs)/finance.tsx` | Wrapped in `<MemberDomainGate kind="finance">` |
| `app/(tabs)/trips.tsx` | Wrapped in `<MemberDomainGate kind="tripops">` |
| `app/(tabs)/network/index.tsx` | Wrapped in `<MemberDomainGate kind="sales">` |
| `features/drivers/screens/DriverControlScreen.tsx` | `employerOrgIdSet` excludes `tracking_only` driver rows (open-trip phone stubs are not real employment); `tripIsAggregate` also true when `tripDriver.tracking_only === true`, not just when `trip.supplier_id` is set — fixes fabricated "Estimated earnings" / "Attribute to employer" for Aggregate-mode direct open-trip assignments |

---

## Known gaps (Part 2 — functional member roles)

- **Rollout behavior change**: any existing non-admin member with no `permissions.platformRole` set (plain legacy `member`, or a pre-existing Planner/Operator invite) now gets **zero** Fiscal/Trips/Network tab access until the owner explicitly assigns Finance/Sales/TripOps. This was a deliberate strict-default choice, not an oversight — flag it before shipping.
- **Scope is nav/tab-entry only** — the ~30 existing `useCapabilities()` call sites inside individual screens (sub-tabs, ledger categories, party detail screens, etc.) are untouched and remain org-model-only. A functional-role member who is inside an allowed tab still sees the same content an Admin would see for that org model.
- No RLS/database-level enforcement; no CHECK-constraint migration (new roles map onto existing legal `role` values).

### Follow-up fixes (landing + tab visibility)

Resolved three defects reported after the first pass, where a functional-role member landed on the wrong screen:

- **Role-aware redirect target.** `MemberDomainGate` no longer bounces a denied member to the neutral Profile tab. It now redirects to the member's own home tab via `memberHomeRouteFromAccess()` (`lib/useMemberCapabilities.ts`): TripOps → Trips, Finance → Fiscal, Sales → Network. This fixes a TripOps member cold-booting onto a persisted/default Fiscal or Network route and getting parked on Profile.
- **No-access notice instead of a blank frame.** A member with no reachable domain (no functional role) has nowhere to redirect, so the gate now renders a themed "No workspace access yet" notice (i18n `memberNoAccessTitle` / `memberNoAccessBody`) rather than an empty `<View>`.
- **Denied tabs are now hidden from the dock.** `DemoTabBar` (desktop top nav) and `PulseBottomTabBar` (mobile footer) take an optional `visibility` prop, wired from `useMemberCapabilities()` in `app/(tabs)/_layout.tsx`. A member only sees the primary tabs their role can reach; the dock highlight also falls back to the member's home tab (not a hard-coded `trips`) when the current route isn't a primary tab, fixing the "Trips highlighted while URL is /profile" desync. Owner/Admin are unaffected — all three tabs stay visible. While access is still resolving, all tabs stay visible to avoid a flicker (the per-tab gate holds the screen).

---

## Part 5 — wiring the unenforced surfaces

An audit of `MEMBER_SURFACE_CATALOG` (85 surfaces) found 47 enforced via `canSurface(...)`, a further 17 enforced indirectly (finance sub-tabs and ledger filters via `canAccessFinanceSubTab` / `ledgerCategorySurface`; the three primary tabs via `MemberDomainGate`; team/access-control via owner-only `useOrgRole().isOwner` + `set_member_role` RPC), and **21 that were stored, rendered as toggles, and never read**. Turning those off changed nothing — the permission UI made promises it did not keep. This part wires them.

### New files

| File | Purpose |
|------|---------|
| `components/SurfaceAccessGate.tsx` | Reusable whole-screen gate for a single `MemberSurfaceId`. Holds a blank frame while surfaces hydrate (same rule as `ModelAccessGate`), then renders children or a themed no-access notice. Owner/admin bypass comes from `useMemberAccess`. |

### Modified files

| File | Change |
|------|--------|
| `locales/en.json` | New keys `surfaceNoAccessTitle` / `surfaceNoAccessBody` for the gate notice |
| `app/documents-center/index.tsx` | Body wrapped in `SurfaceAccessGate surface="finance.documents_center"` (header left outside so Back stays usable) |
| `app/pod-reconciliation/index.tsx` | Wrapped — `finance.pod_reconciliation` |
| `app/business-pulse.tsx` | Screen body wrapped — `finance.business_pulse` |
| `app/load-board/index.tsx` | Wrapped — `sales.load_board` |
| `app/from-clients/index.tsx` | Bare re-export replaced with a wrapper component — `sales.from_clients` |
| `app/notifications/index.tsx` | Wrapped — `workspace.notifications` |
| `app/trip-ledger/[id].tsx` | Wrapped — `finance.trip_ledger` |
| `app/(modals)/edit-client.tsx` | Wrapped — `sales.clients.edit` |
| `features/clients/components/ClientDetailRoute.tsx` | Wrapped — `sales.clients.detail` (route previously had no gate at all) |
| `app/client/[id]/analytics.tsx` | Wrapped — `sales.clients.analytics` |
| `app/supplier/[id].tsx` | `sales.suppliers.detail` nested inside the existing `ModelAccessGate` |
| `app/supplier/[id]/analytics.tsx` | `sales.suppliers.analytics` nested inside the existing `ModelAccessGate` |
| `features/network/screens/StoryDetailScreen.tsx` | `viewerCanBidCapability` now `allowLoadPosts && canSurface("sales.marketplace.bid")`. Deliberately kept separate from the feed filter so a member without the surface still *sees* load posts — they just cannot bid |
| `features/finance/components/FinanceScreen.tsx` | `initialEntry` gated on `finance.edit_transaction`; `onReportPress` omitted without `finance.reports` |
| `features/finance/screens/LedgerSyncScreen.tsx` | `?entryId` deep-link edit gated on `finance.edit_transaction` (falls back to a blank add form) |
| `features/finance/components/EntityDetailOverlay.tsx` | `handleReportPress` + both toolbar props gated on `finance.reports` |
| `features/clients/…/ClientDetailScreen.tsx`, `features/suppliers/…/SupplierDetailScreen.tsx`, `features/drivers/…/DriverDetailScreen.tsx` | `openClientReport` / `openSupplierReport` / `openDriverReport` early-return without `finance.reports` |
| `features/finance/components/TreasurySummaryCard.tsx`, `TreasuryToolbar.tsx`, `TreasuryDetailLayout.tsx`, `FinanceSummarySection.tsx` | `onReportPress` made optional through the whole prop chain; Report button renders only when supplied |
| `features/trips/components/trip-detail/hooks/useTripDetail.ts` | `openTripAdjustmentModal` early-returns without `finance.void_adjustments` — one chokepoint covering add / income / deduction / supplier-cost entry points. Exposes `canVoidAdjustments`, `canViewTripExpenses`, `canApproveTripExpenses` |
| `features/trips/components/trip-detail/TripDetailScreen.tsx` | Expenses tab now needs `tripops.trips.expenses` **and** `finance.expenses.view` (two domains cover the same tab) |
| `features/trips/operations/hub/TripExpensesScreen.tsx` | `handleApprove` early-returns and `onApprove` is omitted (button hidden) without `finance.expenses.approve` |

### Known gaps after Part 5

- **`finance.manage`** — still not read directly. Write actions are gated by their own narrower surfaces (`add_transaction`, `edit_transaction`, `void_adjustments`, `expenses.approve`) plus the `finance_manage` capability, so the toggle is redundant rather than broken. Consider removing it from the catalog or making it a true parent.
- **`finance.shared_ledger` and `finance.branding`** — left unwired **because they have no live UI entry point**. `setShowSharedLedgerModal(true)` is never called anywhere, and `/branding-settings` is a deprecated redirect to `/workspace`. Gating a modal nothing opens would be dead code; wire them when the entry points return.
- **`fleet.vehicles.edit`** — no `EditVehicleModal` or vehicle-edit trigger exists in the codebase; `VehicleProfileScreen`'s `onEditPress` is an empty stub. Nothing to gate yet.
- **Still no server-side enforcement.** Every surface remains client-only; RLS authorizes on org membership alone. A member can bypass any of the above via a direct API call. Unchanged by this part.
- **Nav gates still fail open while loading** (`surfaceLoading || canSurface(...)` in `app/_layout.tsx` and `app/(tabs)/_layout.tsx`) — a denied nav item flashes briefly before surfaces resolve. Cosmetic; destination screens re-check.

**Verification:** `tsc --noEmit` 28 errors before and after (all pre-existing, none in touched files); `eslint` 0 errors on every edited file; `jest` 759 passed / 6 failed — identical to the clean-tree baseline (same 4 suites). No behavior was tested in a running app.

## Finance party speed-dial (this session)

Create entry points stay **one FAB per Finance party page**, matching the active sub-tab (customer / supplier / vehicle / driver). The chip UI is new (icon + plus, hover-expand on desktop). Permissions are unchanged.

### New files

| File | Purpose |
|------|---------|
| `components/PartySpeedDialFab.tsx` | Page-matching icon+plus chip; expands label on desktop hover. Mobile: labeled chip (single action) or tap-plus dial if multiple. |

### Modified files

| File | Change |
|------|--------|
| `features/finance/components/FinanceScreen.tsx` | Replaces per-tab `FinanceFAB` with `PartySpeedDialFab` for the **active** party sub-tab only |
| `components/PartyAddChip.tsx` | `collapsedGlyph="icon"` keeps the party glyph visible and adds a plus badge |
| `locales/en.json` | `addCustomer`, `addParty`, `closeAddParty` |

## KYC document-update wizard (this session)

Owner/admin can replace a verification document even when the profile is locked (pending or verified). The wizard previews **only the new file**. Submit upserts the document as `pending` and re-queues the org for the admin console. Tax IDs and other KYC fields stay frozen.

### New files

| File | Purpose |
|------|---------|
| `features/organization/components/workspace/kyc/KycDocumentUpdateWizard.tsx` | CRED-style intro → upload → new-file preview + edit |
| `supabase/migrations/20270215184500_request_kyc_document_review.sql` | `request_kyc_document_review` RPC + freeze exception so address-proof path can sync |

### Modified files

| File | Change |
|------|--------|
| `features/organization/hooks/useInlineKycVerification.ts` | `pickKycDocumentFile` / `commitKycDocumentUpdate` (upsert pending + request review) |
| `features/organization/services/organizationKycDocuments.service.ts` | `requestKycDocumentReview` RPC wrapper |
| `features/organization/components/workspace/kyc/KycRequiredDocumentRow.tsx` | Upload/Update opens wizard; available when `canEdit` even if frozen |
| `features/organization/components/workspace/WorkspaceOrgKycPanel.tsx` | Wires wizard; first-submit footer still hidden while frozen |
| `analytics/src/lib/kycDocuments.ts` | DB `pending` maps to admin `Pending` (was treated as Valid) |
| `analytics/src/context/AdminDataProvider.tsx` | Audit title for `document_update_resubmit` |

## Organization hub Slice 1 (this session)

Organization is the home. Business profile, verification, and documents are separate destinations under the same `workspace.kyc` surface. The old one-page KYC form is no longer the landing screen.

### New files

| File | Purpose |
|------|---------|
| `features/organization/components/workspace/org/OrganizationHomePanel.tsx` | Status-aware summary + Business / Workspace nav |
| `features/organization/components/workspace/org/OrganizationBusinessDetailsPanel.tsx` | Identity/profile only (name, type, address, website) |
| `features/organization/components/workspace/org/OrganizationVerificationPanel.tsx` | Verification entry: landing + Continue for draft, status view after submit |
| `features/organization/components/workspace/org/OrganizationDocumentsPanel.tsx` | Evidence list + existing document-update wizard |
| `features/organization/components/workspace/org/organizationHub.util.ts` | Masked GSTIN, dates, status copy |
| `features/organization/components/workspace/org/OrganizationVerifyWizard.tsx` | Slice 3: 4 information steps + review/submit over existing KYC saves |

### Modified files

| File | Change |
|------|--------|
| `app/workspace.tsx` | `section=details\|verification\|documents` nested under `panel=kyc` |
| `features/organization/components/workspace/WorkspaceOrgKycPanel.tsx` | Hub router; Slice 3 wizard instead of verification tax form |
| `components/profile/WorkspaceHubMenu.tsx` | Row label **Organization** |
| `features/organization/components/workspace/workspacePanelUi.tsx` | Empty optional tax IDs (CIN/Udyam/TAN/IEC) no longer render as blank rows; `forceShowOptional` for wizard add-chips |
| `lib/memberSurfaces.ts` | Surface copy: Organization / verification |

## Organization hub Slice 3 (this session)

4-step verification + review. Home CTAs are the only next action. Continue never returns to the long tax form.

### New files

| File | Purpose |
|------|---------|
| `features/organization/components/workspace/org/OrganizationVerifyWizard.tsx` | Business type → identity → tax → documents → review & submit |
| `features/organization/components/workspace/WorkspaceProfilePanel.tsx` | Org profile inside the workspace flex-card |
| `features/organization/components/workspace/kyc/KycVerificationDocumentCard.tsx` | Wizard Step 4 evidence card (upload / ready-to-submit / preview+change) |
| `docs/KYC_REQUIREMENT_POLICY.md` | Pulse / Admin / 6-arg RPC must share one type × GST matrix |

### Modified files

| File | Change |
|------|--------|
| `features/organization/components/workspace/org/OrganizationVerifyWizard.tsx` | GST Yes/No; labeled stepper; Step 4 cards from requirement profile; review sections with Edit |
| `features/organization/components/workspace/org/OrganizationHomePanel.tsx` | Human remaining copy from the same counts |
| `features/organization/utils/kycVerification.util.ts` | `buildKycRequirementProfile` + `formatKycHubRemainingCopy`; GSTIN required only when GST-registered |
| `features/organization/components/workspace/workspacePanelUi.tsx` | Empty tax fields use Add, not Edit |
| `analytics/src/context/AdminDataProvider.tsx` | GST check `required` is false when not registered for GST |
| `features/organization/components/workspace/org/OrganizationVerificationPanel.tsx` | Draft is a landing page, not the tax form |
| `features/organization/components/workspace/org/organizationHub.util.ts` | Home copy matches next-action spec |
| `features/organization/components/workspace/WorkspaceOrgKycPanel.tsx` | Opens verify wizard; submit footer only on review |
| `features/organization/components/workspace/kyc/KycDocumentUpdateWizard.tsx` | Additive `onboarding` variant (skip intro, Save document) |
| `features/organization/components/workspace/kyc/KycRequiredDocumentsSection.tsx` | `requiredOnly` for wizard step 4 |
| `features/organization/components/workspace/workspacePanelUi.tsx` | Optional tax IDs are removable; GSTIN/PAN/CIN-for-companies stay required |
| `features/organization/utils/kycVerification.util.ts` | Structure-driven tax-field helpers (`isKycTaxFieldRequired`) |
| `analytics/src/context/AdminDataProvider.tsx` | Required flags on tax checks + document slots (CIN only for limited companies) |
| `analytics/src/components/workspace/BusinessProfilePanel.tsx` | Required labels on GSTIN/PAN/CIN |
| `analytics/src/components/workspace/DocumentViewportPanel.tsx` | Required / Optional badges on document tabs |
| `app/workspace.tsx` | `panel=profile` |
| `components/profile/WorkspaceHubMenu.tsx` | Profile / My Account stay in the workspace card |
| `features/organization/screens/ProfileScreen.tsx` | `embedded` compact layout for the side panel |

## How to update this file

When you change RBAC again:

1. Add a row under **New files** or **Modified files**.
2. Update the matrix in `docs/RBAC_OPERATING_MODEL.md` if behavior changed.
3. Note the commit hash in **Session / commits** when landed.

## Part 6 — Indents group moved from Operation to Sales

**Goal:** Present the 9 Indents surfaces under **Sales** instead of **Operation** in Member access, without touching surface IDs (renaming them would orphan grants already stored in `member.permissions.surfaces`).

### Modified files

| File | Change |
|------|--------|
| `lib/memberSurfaces.ts` | All 9 `tripops.indents.*` / `tripops.pulse_loads` surfaces switched to `domain: "sales"`. The two `requires: "tripops.tab"` parents (`indents.view`, `pulse_loads`) now require `sales.tab`; the 7 children still require `tripops.indents.view` (ID unchanged). |
| `features/organization/components/MemberPermissionsPanel/MemberPermissionsPanel.tsx` | `orgAllows.sales` now also accepts `canAccessIndents(orgCaps)` — otherwise a give-load org with dispatch but no marketplace/client caps would see the Sales section locked and could never grant Indents. |
| `lib/useMemberCapabilities.ts` | Same `orgAllowsSales` widening, so runtime enforcement matches the editor UI. |

### Notes

- **IDs deliberately unchanged.** Surface IDs stay `tripops.*` even though they now render under Sales. Every `can("tripops.indents.*")` call site and every persisted grant keeps working. The ID prefix is now a naming artifact, not a domain claim.
- **`sales.tab` already admits dispatch users** (`anyOfCaps: ["marketplace_post", "marketplace_bid", ...DISP]`), so the reparented `requires` resolves for give-load orgs.
- **Group still renders as "Indents"** — `group: "Indents"` is unchanged; only the section it sits in moved.

**Verification:** `tsc --noEmit` clean on all three touched files; `jest lib/__tests__/capabilities.operatingModel.test.ts` 16/16 passed. **Not verified in a running app** — the Member access screen was not opened to confirm the group renders under Sales.

---

## Workspace hub — Organization tile gate

| Commit | Summary |
|--------|---------|
| _(pending)_ | Workspace hub "Organization" quick-action tile (`components/profile/WorkspaceHubMenu.tsx`): swapped the generic person icon for the org logo/initials avatar (same `orgLogoUri`/`orgInitials` resolution already used for the header logo), relabeled "Profile" → "Organization", and gated visibility on `canSurface("workspace.settings")` — the same `useMemberAccess` surface check the adjacent "Settings" row already uses. No new capability introduced. |

**Verification:** `tsc --noEmit` clean on the touched file. **Not verified in a running app** — did not open the workspace hub as a non-admin member to confirm the tile disappears.

---

## Registered office on Workspace branding (this session)

Registered-office map moved from Details → Company profile to My Profile → Workspace branding. Address follows KYC freeze (`pending` / `verified`): no inline edit; change is the existing address-proof document upload for Pulse admin. Draft/rejected orgs can still edit the address on branding. KYC wizard UX not reopened.

### Modified files

| File | Change |
|------|--------|
| `features/network/components/desktop/NetworkDesktopProfilePanel.tsx` | Map + contact + About/Products + Locations & offices on Workspace branding; verified registered office locked (upload address proof) |
| `features/network/components/desktop/NetworkDesktopDetailsPanel.tsx` | Headquarter map, contact, About, Products, and Locations moved off Details; completion chips open My Profile |
| `features/network/components/desktop/NetworkDesktopHub.tsx` | `onOpenProfileTab` from Details |
| `features/network/components/desktop/NetworkDesktopWorkspaceProfileModal.tsx` | Contact edit no longer writes address |
| `features/organization/services/organizationWorkspaceProfile.service.ts` | Reject address writes while KYC is frozen |
| `features/organization/services/organization.service.ts` | Same freeze guard on `updateWorkspaceKyc` address fields |
| `features/network/components/desktop/networkDesktopHub.styles.ts` | Branding map / lock styles |

**Verification:** not typechecked here. **Not verified in a running app.**

---

## Details tab body removed (this session)

Details tab chrome stays (tabs, + Invites, branding hint). The Details **body** is gone: stats, Overview, Open protocols, Tags, Company profile completion, Network growth. Hub open / Org Profile / `/account` land on **My Profile**.

### Modified files

| File | Change |
|------|--------|
| `features/network/components/desktop/NetworkDesktopDetailsPanel.tsx` | Empty stub — no Metronic Details body |
| `features/network/components/desktop/NetworkDesktopHub.tsx` | Details renders stub; default tab is My Profile |
| `lib/routes.ts` | `networkOrgHub()` default tab is `profile` |
| `components/profile/WorkspaceHubMenu.tsx` | Org Profile opens My Profile |
| `app/account/index.tsx` | Redirect to My Profile |
| `lib/lastRoute.ts` | Hub restore without `?tab=` uses My Profile |

**Verification:** not typechecked here. **Not verified in a running app.**

---

## Details tab removed (this session)

Details tab is gone from the hub chrome. Old `?tab=details` / `networkOrgHub("details")` open **My Profile**. `NetworkDesktopDetailsPanel.tsx` deleted.

### Modified files

| File | Change |
|------|--------|
| `features/network/components/desktop/NetworkDesktopHub.tsx` | No Details tab; `details` alias → profile |
| `features/network/screens/NetworkScreen.tsx` | Hub `?tab=details` lands on My Profile |
| `lib/routes.ts` | `details` URL aliases to profile |
| `lib/lastRoute.ts` | Restore maps details → profile |
| `features/network/components/desktop/NetworkDesktopDetailsPanel.tsx` | Deleted |

**Verification:** not typechecked here. **Not verified in a running app.**

---

## Profile Access + Team Members stay in workspace card (this session)

Access and Team Members on the org profile were pushing `/(modals)/team` (full page). Both now open `panel=team` in the workspace flex-card — same destination as Organization → Members & access. Network hub Access also stays in the Team tab instead of `/(modals)/access-control`.

### Modified files

| File | Change |
|------|--------|
| `lib/routes.ts` | `WORKSPACE_TEAM` (`/workspace?panel=team`) |
| `features/organization/screens/ProfileScreen.tsx` | Access + Team Members → workspace team panel |
| `features/organization/components/workspace/WorkspaceProfilePanel.tsx` | `onOpenTeam` → `panel=team` |
| `app/workspace.tsx` | Team back returns to the panel that opened it |
| `features/network/components/desktop/NetworkDesktopTeamPanel.tsx` | Access / member edit stay in the hub Team tab |

**Verification:** not typechecked here. **Not verified in a running app.**

---

## Members & access stays in Organization sidebar (this session)

`panel=team` no longer closes the workspace card and replaces with `/(modals)/team`. Members & access (and Account → Team members) render `WorkspaceTeamPanel` in the same sidebar. Back returns to Organization home, not the full-page profile tab.

### Modified files

| File | Change |
|------|--------|
| `app/workspace.tsx` | Removed team→modal redirect; render `WorkspaceTeamPanel` |
| `features/organization/components/workspace/WorkspaceOrgKycPanel.tsx` | Members & access → `panel=team` |
| `features/organization/components/workspace/WorkspaceAccountPanel.tsx` | Team members → `panel=team` |

**Verification:** not typechecked here. **Not verified in a running app.**

---

## Team invite / access stay in Organization sidebar (this session)

Invite member, Access control, and member Edit no longer push full-page modals from the workspace team panel. They swap inside `WorkspaceTeamPanel` (embedded invite flow + `MemberPermissionsPanel embedded`). Back stays in the Organization card.

### Modified files

| File | Change |
|------|--------|
| `features/organization/components/workspace/WorkspaceTeamPanel.tsx` | Invite / Access / Edit are in-panel views |
| `features/organization/components/TeamMembersView.tsx` | Optional `onEditMember` intercepts Edit |
| `features/organization/components/MemberPermissionsPanel/MemberPermissionsPanel.tsx` | `embedded` skips extra safe-area and two-col |

**Verification:** not typechecked here. **Not verified in a running app.**

---

## Cash kanban columns follow ALL / ASSET / AGGREGATE (this session)

Hybrid cash kanban was showing all four party columns even when AGGREGATE or ASSET was selected. Columns now follow the supply filter, then org-model RBAC. Remaining columns flex to fill the row.

| Filter | Columns |
|--------|---------|
| ALL | Customers, Suppliers, Garage, Drivers |
| ASSET | Customers, Garage, Drivers |
| AGGREGATE | Customers, Suppliers |

### Modified files

| File | Change |
|------|--------|
| `lib/capabilities.ts` | `financeKanbanColumnsForSupplyFilter` |
| `features/finance/components/FinanceScreen.tsx` | Kanban uses supply-filter columns |
| `lib/__tests__/capabilities.operatingModel.test.ts` | Column-set tests |

**Verification:** unit tests passed. **Not verified in a running app.**

---
