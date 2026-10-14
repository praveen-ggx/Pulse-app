/**
 * RBAC member-access suite — code-level mirror of docs/RBAC_TEAM_INVITE_FLOW.md
 * and the manual QA guide's test cases.
 *
 * Scope: the pure permission-resolution layer
 *   org capabilities  ∩  member domains  ∩  member surfaces
 *
 * Each `describe` is tagged with the manual TC it covers so a failure points
 * straight at the QA case that would have caught it by hand.
 *
 * NOT covered here (needs a DB / a running app, not unit tests):
 *   TC-01..04 invite precheck, TC-14..18 accept/expiry, TC-11 live refresh.
 *   Those are RPC-level and belong in an integration or e2e run.
 */
import {
  getCapabilitiesFromProfile,
  type Capability,
} from "@/lib/capabilities";
import {
  MEMBER_SURFACE_CATALOG,
  MEMBER_DEPARTMENT_SURFACES,
  applyDomainToggle,
  applySectionToggle,
  capabilitiesFromMemberSurfaces,
  defaultSurfacesForRole,
  domainsFromSurfaces,
  hydrateMemberSurfaces,
  memberHasSurface,
  orgAllowsSurface,
  sectionMasterOn,
  surfaceGroupsForDomains,
  type MemberSurfaceId,
  type MemberSurfaceMap,
} from "@/lib/memberSurfaces";
import { platformRoleAfterAccessEdit } from "@/features/organization/utils/teamInviteRoles.util";

// ── org fixtures ──────────────────────────────────────────────────────────
const capsFor = (model: string): Capability[] =>
  getCapabilitiesFromProfile({ role: "user" }, model);

const AGGREGATE = capsFor("NON_ASSET"); // give-load: dispatch, no fleet
const ASSET = capsFor("ASSET_BASED"); // own fleet: no give-load dispatch
const HYBRID = capsFor("HYBRID");

/** Grant a surface plus its whole `requires` chain — what the UI does on tick. */
function grant(ids: MemberSurfaceId[]): MemberSurfaceMap {
  const map: MemberSurfaceMap = {};
  const byId = new Map(MEMBER_SURFACE_CATALOG.map((d) => [d.id, d]));
  const walk = (id: MemberSurfaceId) => {
    if (map[id]) return;
    map[id] = true;
    const req = byId.get(id)?.requires;
    if (req) walk(req);
  };
  ids.forEach(walk);
  return map;
}

// ══════════════════════════════════════════════════════════════════════════
// TC-12 / TC-13 — org capability is the hard ceiling
// ══════════════════════════════════════════════════════════════════════════
describe("TC-12/13 — org capability caps member access", () => {
  it("TC-12: every box ticked still gives no fleet in a give-load org", () => {
    const everything = grant(MEMBER_SURFACE_CATALOG.map((s) => s.id));

    expect(memberHasSurface(AGGREGATE, everything, "fleet.vehicles.view")).toBe(false);
    expect(memberHasSurface(AGGREGATE, everything, "fleet.drivers.view")).toBe(false);
    expect(memberHasSurface(AGGREGATE, everything, "fleet.vehicles.add")).toBe(false);
  });

  it("TC-12: owner/admin bypass still cannot exceed org capability", () => {
    // bypass=true skips the member map but NOT the org gate.
    expect(memberHasSurface(AGGREGATE, null, "fleet.vehicles.view", true)).toBe(false);
  });

  it("TC-13: aggregate dispatcher gets trips + indents, never fleet", () => {
    const s = grant([
      "tripops.trips.view",
      "tripops.indents.view",
      "fleet.vehicles.view",
    ]);
    expect(memberHasSurface(AGGREGATE, s, "tripops.trips.view")).toBe(true);
    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.view")).toBe(true);
    expect(memberHasSurface(AGGREGATE, s, "fleet.vehicles.view")).toBe(false);
  });

  it("asset-only org cannot create give-load indents even fully ticked", () => {
    const s = grant(["tripops.indents.create"]);
    expect(memberHasSurface(ASSET, s, "tripops.indents.create")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TC-10 / TC-20 — one checkbox off removes one action, not the whole group
// ══════════════════════════════════════════════════════════════════════════
describe("TC-10/20 — single surface toggle is surgical", () => {
  it("TC-10: removing Create indent keeps the list visible", () => {
    const s = grant(["tripops.indents.view", "tripops.indents.create"]);
    delete s["tripops.indents.create"];

    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.view")).toBe(true);
    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.create")).toBe(false);
  });

  it("TC-20: disabling one trip surface leaves siblings intact", () => {
    const s = grant([
      "tripops.trips.view",
      "tripops.trips.detail",
      "tripops.trips.assign",
    ]);
    delete s["tripops.trips.assign"];

    expect(memberHasSurface(AGGREGATE, s, "tripops.trips.detail")).toBe(true);
    expect(memberHasSurface(AGGREGATE, s, "tripops.trips.assign")).toBe(false);
  });

  it("revoking a parent cascades to every child", () => {
    const s = grant(["tripops.indents.create", "tripops.indents.award"]);
    s["tripops.indents.view"] = false; // parent off

    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.create")).toBe(false);
    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.award")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TC-21 — a surface cannot outrun its parent chain
// ══════════════════════════════════════════════════════════════════════════
describe("TC-21 — child surfaces cannot bypass a disabled parent/domain", () => {
  it("indent children are dead without sales.tab, even if ticked", () => {
    const s: MemberSurfaceMap = {
      "tripops.indents.view": true,
      "tripops.indents.create": true,
      // sales.tab deliberately absent — this is the "domain off" case
    };
    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.create")).toBe(false);
  });

  it("finance children are dead without finance.tab", () => {
    const s: MemberSurfaceMap = { "finance.reports": true };
    expect(memberHasSurface(HYBRID, s, "finance.reports")).toBe(false);
  });

  it("every catalog surface with a parent fails when only itself is ticked", () => {
    const orphans = MEMBER_SURFACE_CATALOG.filter((d) => d.requires)
      .filter((d) => orgAllowsSurface(HYBRID, d.id))
      .filter((d) => memberHasSurface(HYBRID, { [d.id]: true }, d.id))
      .map((d) => d.id);

    expect(orphans).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TC-09 — restricted floor
// ══════════════════════════════════════════════════════════════════════════
describe("TC-09 — restricted member has no functional access", () => {
  const restricted = defaultSurfacesForRole("restricted", HYBRID);

  it("restricted preset grants nothing", () => {
    expect(Object.keys(restricted)).toHaveLength(0);
  });

  it("all three domains resolve false", () => {
    expect(domainsFromSurfaces(restricted)).toEqual({
      finance: false,
      sales: false,
      tripops: false,
    });
  });

  it("no catalog surface is reachable", () => {
    const reachable = MEMBER_SURFACE_CATALOG.filter((d) =>
      memberHasSurface(HYBRID, restricted, d.id),
    );
    expect(reachable).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TC-05..08 — role presets stay inside their domain
// ══════════════════════════════════════════════════════════════════════════
describe("TC-05..08 — role presets do not leak across domains", () => {
  const domainsTouched = (role: "finance" | "sales" | "tripops") => {
    const s = defaultSurfacesForRole(role, HYBRID);
    return new Set(
      MEMBER_SURFACE_CATALOG.filter((d) => s[d.id]).map((d) => d.domain),
    );
  };

  it("TC-06: finance preset reaches beyond finance only via read-only surfaces", () => {
    // Finance owns the fiscal domain, but its sub-tabs and the trip finance tab
    // read party directories, fleet rosters and trip detail — surfaces
    // catalogued under sales/fleet/tripops. Crossing those domains is intended;
    // what must never happen is a preset surface conferring a capability
    // finance has no business holding (dispatch, fleet_management).
    const s = defaultSurfacesForRole("finance", HYBRID);
    const crossDomain = MEMBER_SURFACE_CATALOG.filter(
      (d) => s[d.id] && d.domain !== "finance",
    );

    expect(crossDomain.length).toBeGreaterThan(0);
    const leaking = crossDomain
      .filter((d) => (d.grantsCaps ?? d.anyOfCaps).length > 0)
      .flatMap((d) =>
        (d.grantsCaps ?? d.anyOfCaps).map((c) => `${d.id} grants ${c}`),
      )
      // finance_view AND finance_manage are finance's own capabilities — a
      // finance member holding them on a cross-domain surface (e.g. the
      // Compliance settlement panel) is the intended behaviour, not a leak.
      // The leak this guards against is a non-finance cap: dispatch,
      // dispatch_for_own_fleet, fleet_management.
      .filter(
        (entry) =>
          !entry.endsWith("finance_view") && !entry.endsWith("finance_manage"),
      );

    expect(leaking).toEqual([]);
  });

  it("TC-06b: finance preset confers no dispatch or fleet capability", () => {
    const caps = capabilitiesFromMemberSurfaces(
      HYBRID,
      defaultSurfacesForRole("finance", HYBRID),
    );

    expect(caps).not.toContain("dispatch");
    expect(caps).not.toContain("dispatch_for_own_fleet");
    expect(caps).not.toContain("fleet_management");
  });

  it("TC-07: sales preset touches sales, plus the Trips tab entry point", () => {
    // Sales owns indents (all under sales.tab) and keeps tripops.tab so it can
    // reach Create trip → share as indent. No capability leak: TC-06b / TC-07b.
    expect([...domainsTouched("sales")].sort()).toEqual(["sales", "tripops"]);
  });

  it("TC-07c: sales books trips — view, detail, create, assign — but no ops extras", () => {
    const sales = defaultSurfacesForRole("sales", HYBRID);
    const on = (id: MemberSurfaceId) => memberHasSurface(HYBRID, sales, id);
    for (const id of [
      "tripops.trips.view",
      "tripops.trips.detail",
      "tripops.trips.create_asset",
      "tripops.trips.create_aggregate",
      "tripops.trips.assign",
      "tripops.trips.reassign",
    ] as MemberSurfaceId[]) {
      expect(on(id)).toBe(true);
    }
    for (const id of [
      "tripops.trips.tracking",
      "tripops.trips.docs",
      "tripops.trips.finance",
      "fleet.vehicles.view",
      "fleet.drivers.view",
    ] as MemberSurfaceId[]) {
      expect(on(id)).toBe(false);
    }
  });

  it("TC-07b: sales preset confers no fleet capability", () => {
    const caps = capabilitiesFromMemberSurfaces(
      HYBRID,
      defaultSurfacesForRole("sales", HYBRID),
    );
    expect(caps).not.toContain("fleet_management");
  });

  it("TC-08: tripops preset stays within trips + fleet (no indents)", () => {
    // `trip_compliance` is limited to tab + document view + resubmit (TC-08c).
    const touched = [...domainsTouched("tripops")].sort();
    expect(touched).toEqual(["fleet", "trip_compliance", "tripops"]);
    const tripops = defaultSurfacesForRole("tripops", HYBRID);
    const indents = Object.keys(tripops).filter(
      (id) => id.startsWith("tripops.indents.") || id === "tripops.pulse_loads",
    );
    expect(indents).toEqual([]);
  });

  it("TC-08c: tripops gets only Compliance tab, document view and resubmit (no verify / finance)", () => {
    const tripops = defaultSurfacesForRole("tripops", HYBRID);
    const compliance = Object.keys(tripops)
      .filter((id) => id.startsWith("trip_compliance.") && tripops[id as MemberSurfaceId])
      .sort();
    expect(compliance).toEqual([
      "trip_compliance.documents.view",
      "trip_compliance.tab",
      "trip_compliance.trip.resubmit",
    ]);
  });

  it("TC-08e: re-picking Finance gives the full Compliance-page Finance set", () => {
    // Old saved maps (before these surfaces existed) are fixed by tapping the
    // Finance tile again in Edit member — it re-applies this preset.
    const finance = defaultSurfacesForRole("finance", HYBRID);
    const on = (id: MemberSurfaceId) => memberHasSurface(HYBRID, finance, id);
    for (const id of [
      "trip_compliance.tab",
      "trip_compliance.documents.view",
      "trip_compliance.finance.view",
      "trip_compliance.tab.advance_verification",
      "trip_compliance.tab.advance_payment",
      "trip_compliance.tab.settlement_verification",
      "trip_compliance.tab.final_settlement",
      "trip_compliance.finance.manage",
      "trip_compliance.finance.reject",
    ] as MemberSurfaceId[]) {
      expect(on(id)).toBe(true);
    }
  });

  it("TC-08d: finance gets Reject but never Verify or document verify", () => {
    const finance = defaultSurfacesForRole("finance", HYBRID);
    expect(finance["trip_compliance.finance.reject"]).toBe(true);
    expect(finance["trip_compliance.trip.mark_verified"]).toBeFalsy();
    expect(finance["trip_compliance.documents.verify"]).toBeFalsy();
  });

  it("vendor support: suppliers on Network, Finance → Suppliers sub-tab only", () => {
    const vs = defaultSurfacesForRole("vendor_support", HYBRID);
    const on = (id: MemberSurfaceId) => memberHasSurface(HYBRID, vs, id);
    expect(on("sales.suppliers.create")).toBe(true);
    expect(on("finance.subtab.suppliers")).toBe(true);
    for (const id of [
      "finance.subtab.cash",
      "finance.subtab.customers",
      "finance.manage",
      "sales.clients.view",
      "tripops.indents.view",
      "tripops.tab",
    ] as MemberSurfaceId[]) {
      expect(on(id)).toBe(false);
    }
    const caps = capabilitiesFromMemberSurfaces(HYBRID, vs);
    expect(caps).not.toContain("finance_manage");
    expect(caps).not.toContain("fleet_management");
    expect(MEMBER_DEPARTMENT_SURFACES.vendor_support).toContain("sales.suppliers.view");
  });

  it("vendor support label survives edits while supplier access remains", () => {
    const vs = defaultSurfacesForRole("vendor_support", HYBRID);
    expect(
      platformRoleAfterAccessEdit("vendor_support", domainsFromSurfaces(vs), vs, HYBRID),
    ).toBe("vendor_support");
  });

  it("TC-05: admin preset covers every org-allowed surface", () => {
    const admin = defaultSurfacesForRole("admin", HYBRID);
    const missing = MEMBER_SURFACE_CATALOG.filter(
      (d) => orgAllowsSurface(HYBRID, d.id) && !admin[d.id],
    ).map((d) => d.id);

    expect(missing).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TC-21A / 10A — Indents live under Sales; give-load orgs must still reach them
// Regression guard for the Operation → Sales move.
// ══════════════════════════════════════════════════════════════════════════
describe("TC-21A — Indents render under Sales and stay grantable", () => {
  const INDENT_SURFACES: MemberSurfaceId[] = [
    "tripops.indents.view",
    "tripops.indents.create",
    "tripops.indents.edit",
    "tripops.indents.cancel",
    "tripops.indents.broadcast",
    "tripops.indents.bid",
    "tripops.indents.award",
    "tripops.indents.allocate",
    "tripops.pulse_loads",
  ];

  it("all 9 indent surfaces sit in the sales domain", () => {
    const strays = MEMBER_SURFACE_CATALOG.filter(
      (d) => INDENT_SURFACES.includes(d.id) && d.domain !== "sales",
    ).map((d) => d.id);

    expect(strays).toEqual([]);
  });

  it("the Indents group is listed under Sales, not TripOps", () => {
    const salesGroups = surfaceGroupsForDomains(["sales"]).map((g) => g.group);
    const tripopsGroups = surfaceGroupsForDomains(["tripops"]).map((g) => g.group);

    expect(salesGroups).toContain("Indents");
    expect(tripopsGroups).not.toContain("Indents");
    expect(MEMBER_DEPARTMENT_SURFACES.tripops).not.toContain("tripops.indents.view");
    expect(MEMBER_DEPARTMENT_SURFACES.sales).toContain("tripops.indents.create");
  });

  it("a give-load org can still grant every indent surface", () => {
    // The bug this guards: reparenting to sales.tab must not strand indents
    // in an org that has dispatch but no marketplace/client capability.
    const s = grant(INDENT_SURFACES);
    const blocked = INDENT_SURFACES.filter(
      (id) => !memberHasSurface(AGGREGATE, s, id),
    );

    expect(blocked).toEqual([]);
  });

  it("indent surfaces hang off sales.tab, never tripops.tab", () => {
    // Indents belong to Sales (owner decision 2026-10-12); Trip Ops has no
    // indent access. @see docs/RBAC_OPERATING_MODEL_CHANGELOG.md
    const parents = MEMBER_SURFACE_CATALOG.filter(
      (d) => INDENT_SURFACES.includes(d.id) && d.requires,
    ).map((d) => d.requires);

    expect(parents).not.toContain("tripops.tab");
    expect(
      MEMBER_SURFACE_CATALOG.find((d) => d.id === "tripops.indents.view")?.requires,
    ).toBe("sales.tab");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Ground Ops — field staff who upload documents; no sibling-auto-add in hydration
// ══════════════════════════════════════════════════════════════════════════
describe("Ground Ops — hydration does not auto-add sibling surfaces", () => {
  it("Ground Ops default surfaces", () => {
    const groundOpsDefaults = defaultSurfacesForRole("ground_ops", HYBRID);
    const ids = Object.keys(groundOpsDefaults).filter((id) => groundOpsDefaults[id as MemberSurfaceId]);

    // Ground Ops should have exactly these surfaces (and parents will be added by hydration)
    expect(ids).toContain("tripops.tab");
    expect(ids).toContain("tripops.trips.view");
    expect(ids).toContain("tripops.trips.detail");
    expect(ids).toContain("tripops.trips.docs");
    expect(ids).toContain("trip_compliance.tab");
    expect(ids).toContain("trip_compliance.documents.view");
    expect(ids).toContain("trip_compliance.trip.resubmit");
    expect(ids).not.toContain("trip_compliance.documents.verify");
    expect(ids).not.toContain("trip_compliance.trip.mark_verified");
    expect(ids).not.toContain("trip_compliance.finance.view");
    expect(ids).not.toContain("trip_compliance.finance.manage");
    expect(ids).not.toContain("trip_compliance.pod.manage");
  });

  it("Ground Ops does NOT have finance/expenses/assign/reassign/tracking/verification/simulate/ratings by default", () => {
    const groundOpsDefaults = defaultSurfacesForRole("ground_ops", HYBRID);

    // These should NOT be in the default preset
    const forbiddenSurfaces: MemberSurfaceId[] = [
      "tripops.trips.finance",
      "tripops.trips.expenses",
      "tripops.trips.assign",
      "tripops.trips.reassign",
      "tripops.trips.tracking",
      "tripops.trips.verification",
      "tripops.trips.simulate",
      "tripops.trips.ratings",
    ];

    for (const surface of forbiddenSurfaces) {
      expect(groundOpsDefaults[surface]).not.toBe(true);
    }
  });

  it("hydrateMemberSurfaces preserves explicit false and does not overwrite it", () => {
    // Edge case: if a parent is explicitly false (via applySurfaceToggle OFF cascade),
    // hydration must not overwrite it to true, even if the child is true.
    // (This should not happen in production, but defensive code prevents it anyway.)
    const stored: MemberSurfaceMap = {
      "tripops.trips.docs": true,
      "tripops.trips.detail": false, // explicitly disabled (edge case, shouldn't occur)
    };

    const hydrated = hydrateMemberSurfaces(stored, HYBRID);

    // Parent chain should be filled in (tripops.trips.view, tripops.tab)
    expect(hydrated["tripops.trips.view"]).toBe(true);
    expect(hydrated["tripops.tab"]).toBe(true);

    // But the explicit false should be preserved (defensive measure)
    expect(hydrated["tripops.trips.detail"]).toBe(false);
  });

  it("Ground Ops without dispatch capability derives correct domains (not all-false)", () => {
    // When org lacks dispatch, defaultSurfacesForRole returns empty surfaces.
    // buildTeamInvitePermissions must NOT persist all-false domains; must fall back to platformRole.
    const { buildTeamInvitePermissions } = require("@/features/organization/utils/teamInviteRoles.util");

    // Org has no dispatch capability (e.g., restricted org model)
    const noDispatchCaps: Capability[] = [];

    const perms = buildTeamInvitePermissions("ground_ops", undefined, noDispatchCaps);

    // Domains must come from domainsFromPlatformRole("ground_ops"), not domainsFromSurfaces({})
    expect(perms.domains.tripops).toBe(true);
    expect(perms.domains.finance).toBe(false);
    expect(perms.domains.sales).toBe(false);
  });

  it("Ground Ops with dispatch capability derives domains from surfaces", () => {
    // When org has dispatch, defaultSurfacesForRole returns tripops surfaces.
    // buildTeamInvitePermissions should derive domains from non-empty surfaces.
    const { buildTeamInvitePermissions } = require("@/features/organization/utils/teamInviteRoles.util");

    const dispatchCaps: Capability[] = ["dispatch"];

    const perms = buildTeamInvitePermissions("ground_ops", undefined, dispatchCaps);

    // Domains derived from non-empty surfaces
    expect(perms.domains.tripops).toBe(true);
    expect(perms.domains.finance).toBe(false);
    expect(perms.domains.sales).toBe(false);

    // Surfaces should be populated
    expect(Object.keys(perms.surfaces || {}).length).toBeGreaterThan(0);
  });

  it("Explicit domains override both surfaces and platformRole", () => {
    // If caller explicitly provides domains, they must be respected regardless of surfaces.
    const { buildTeamInvitePermissions } = require("@/features/organization/utils/teamInviteRoles.util");

    const explicitDomains: MemberDomainFlags = {
      tripops: false,
      finance: true,
      sales: false,
    };

    const perms = buildTeamInvitePermissions("ground_ops", explicitDomains, ["dispatch"]);

    // Explicit domains must be preserved
    expect(perms.domains).toEqual(explicitDomains);
  });

  it("Restricted role still derives to all-false (intentional)", () => {
    // Restricted is intentionally all-false. Must remain all-false even after fix.
    const { buildTeamInvitePermissions } = require("@/features/organization/utils/teamInviteRoles.util");

    const perms = buildTeamInvitePermissions("restricted", undefined, []);

    expect(perms.domains.tripops).toBe(false);
    expect(perms.domains.finance).toBe(false);
    expect(perms.domains.sales).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Catalog integrity — cheap smoke checks that catch authoring mistakes
// ══════════════════════════════════════════════════════════════════════════
describe("Compliance vs Finance — split of the Compliance page", () => {
  const has = (role: "compliance" | "finance", id: MemberSurfaceId) =>
    memberHasSurface(HYBRID, defaultSurfacesForRole(role, HYBRID), id);

  it("compliance gets Document Upload + Verification only — no settlement, payments or POD", () => {
    expect(has("compliance", "trip_compliance.tab")).toBe(true);
    expect(has("compliance", "trip_compliance.documents.view")).toBe(true);
    expect(has("compliance", "trip_compliance.documents.verify")).toBe(true);
    expect(has("compliance", "trip_compliance.trip.mark_verified")).toBe(true);
    expect(has("compliance", "trip_compliance.pod.manage")).toBe(false);
    expect(has("compliance", "trip_compliance.finance.view")).toBe(false);
    expect(has("compliance", "trip_compliance.finance.manage")).toBe(false);
  });

  it("finance views docs and pays, but cannot verify, mark verified or log POD", () => {
    expect(has("finance", "trip_compliance.tab")).toBe(true);
    expect(has("finance", "trip_compliance.documents.view")).toBe(true);
    expect(has("finance", "trip_compliance.finance.manage")).toBe(true);
    expect(has("finance", "trip_compliance.documents.verify")).toBe(false);
    expect(has("finance", "trip_compliance.trip.mark_verified")).toBe(false);
    expect(has("finance", "trip_compliance.pod.manage")).toBe(false);
  });

  it("compliance preset confers no dispatch, fleet or finance_manage capability", () => {
    const caps = capabilitiesFromMemberSurfaces(
      HYBRID,
      defaultSurfacesForRole("compliance", HYBRID),
    );
    expect(caps).not.toContain("dispatch");
    expect(caps).not.toContain("dispatch_for_own_fleet");
    expect(caps).not.toContain("fleet_management");
    expect(caps).not.toContain("finance_manage");
  });

  it("Compliance preset turns the Compliance switch on and does not grant payments", () => {
    const surfaces = defaultSurfacesForRole("compliance", HYBRID);
    expect(sectionMasterOn("compliance", surfaces, HYBRID)).toBe(true);
    expect(memberHasSurface(HYBRID, surfaces, "trip_compliance.finance.manage")).toBe(false);
  });

  it("turning the Compliance switch on keeps the Compliance label", () => {
    const preset = defaultSurfacesForRole("compliance", HYBRID);
    const cleared = applySectionToggle(preset, "compliance", false, HYBRID);
    expect(sectionMasterOn("compliance", cleared, HYBRID)).toBe(false);
    expect(
      platformRoleAfterAccessEdit("compliance", domainsFromSurfaces(cleared), cleared, HYBRID),
    ).toBe("tripops");

    const restored = applySectionToggle(cleared, "compliance", true, HYBRID);
    expect(sectionMasterOn("compliance", restored, HYBRID)).toBe(true);
    expect(memberHasSurface(HYBRID, restored, "trip_compliance.documents.verify")).toBe(true);
    expect(memberHasSurface(HYBRID, restored, "trip_compliance.finance.manage")).toBe(false);
    expect(
      platformRoleAfterAccessEdit(
        "compliance",
        domainsFromSurfaces(restored),
        restored,
        HYBRID,
      ),
    ).toBe("compliance");
  });

  it("finance gets the four Finance tabs of the Compliance page; compliance gets none", () => {
    const TABS: MemberSurfaceId[] = [
      "trip_compliance.tab.advance_verification",
      "trip_compliance.tab.advance_payment",
      "trip_compliance.tab.settlement_verification",
      "trip_compliance.tab.final_settlement",
    ];
    for (const id of TABS) {
      expect(has("finance", id)).toBe(true);
      expect(has("compliance", id)).toBe(false);
      expect(MEMBER_DEPARTMENT_SURFACES.finance).toContain(id);
    }
  });

  it("legacy settlement view back-fills every Finance tab, but never over an explicit off", () => {
    const legacy = grant(["trip_compliance.finance.view"]);
    const hydrated = hydrateMemberSurfaces(legacy, HYBRID);
    expect(memberHasSurface(HYBRID, hydrated, "trip_compliance.tab.final_settlement")).toBe(true);

    const narrowed = hydrateMemberSurfaces(
      { ...legacy, "trip_compliance.tab.final_settlement": false },
      HYBRID,
    );
    expect(narrowed["trip_compliance.tab.final_settlement"]).toBe(false);
    expect(narrowed["trip_compliance.tab.advance_payment"]).toBeUndefined();
  });

  it("ground ops sees only the Document Upload tab of the Compliance page", () => {
    // Mirrors app/compliance/index.tsx visibleStages: any surface below
    // would unlock a tab other than Document Upload.
    const ground = hydrateMemberSurfaces(defaultSurfacesForRole("ground_ops", HYBRID), HYBRID);
    const OTHER_TAB_SURFACES: MemberSurfaceId[] = [
      "trip_compliance.documents.verify",
      "trip_compliance.trip.mark_verified",
      "trip_compliance.tab.advance_verification",
      "trip_compliance.tab.advance_payment",
      "trip_compliance.tab.settlement_verification",
      "trip_compliance.tab.final_settlement",
      "trip_compliance.pod.manage",
    ];
    expect(memberHasSurface(HYBRID, ground, "trip_compliance.documents.view")).toBe(true);
    expect(OTHER_TAB_SURFACES.filter((id) => memberHasSurface(HYBRID, ground, id))).toEqual([]);
  });

  it("debit control logs hard-copy POD only — no doc upload, verify, settlement or pay", () => {
    const dc = defaultSurfacesForRole("debit_control", HYBRID);
    const on = (id: MemberSurfaceId) => memberHasSurface(HYBRID, dc, id);
    expect(on("trip_compliance.pod.manage")).toBe(true);
    expect(on("tripops.trips.docs")).toBe(true);
    for (const id of [
      "trip_compliance.documents.view",
      "trip_compliance.documents.verify",
      "trip_compliance.finance.view",
      "trip_compliance.finance.manage",
      "tripops.trips.assign",
    ] as MemberSurfaceId[]) {
      expect(on(id)).toBe(false);
    }
    expect(capabilitiesFromMemberSurfaces(HYBRID, dc)).toEqual([]);
    expect(
      platformRoleAfterAccessEdit("debit_control", domainsFromSurfaces(dc), dc, HYBRID),
    ).toBe("debit_control");
  });

  it("switching Compliance off keeps Debit control payments working", () => {
    const finance = defaultSurfacesForRole("finance", HYBRID);
    const cleared = applySectionToggle(finance, "compliance", false, HYBRID);
    expect(memberHasSurface(HYBRID, cleared, "trip_compliance.finance.manage")).toBe(true);
    expect(memberHasSurface(HYBRID, cleared, "trip_compliance.documents.view")).toBe(false);
  });

  it("turning Operations on from scratch grants no indents", () => {
    const on = applyDomainToggle({}, "tripops", true, HYBRID);
    expect(on["tripops.tab"]).toBe(true);
    expect(on["tripops.indents.view"]).toBeFalsy();
    expect(on["sales.tab"]).toBeFalsy();
  });

  it("a section edit does not retitle Ground Ops or Admin as TripOps", () => {
    const ground = defaultSurfacesForRole("ground_ops", HYBRID);
    const withCompliance = applySectionToggle(ground, "compliance", true, HYBRID);
    expect(
      platformRoleAfterAccessEdit(
        "ground_ops",
        domainsFromSurfaces(withCompliance),
        withCompliance,
        HYBRID,
      ),
    ).toBe("ground_ops");

    const admin = defaultSurfacesForRole("admin", HYBRID);
    expect(
      platformRoleAfterAccessEdit("admin", domainsFromSurfaces(admin), admin, HYBRID),
    ).toBe("admin");
  });

  it("no functional preset logs hard-copy POD (Debit control is granted by hand)", () => {
    const presets = ["finance", "sales", "tripops", "compliance", "planner", "operator", "ground_ops", "restricted"] as const;
    for (const role of presets) {
      expect(
        memberHasSurface(HYBRID, defaultSurfacesForRole(role, HYBRID), "trip_compliance.pod.manage"),
      ).toBe(false);
    }
  });
});

describe("catalog integrity (smoke)", () => {
  it("surface ids are unique", () => {
    const ids = MEMBER_SURFACE_CATALOG.map((d) => d.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  it("every `requires` points at a real surface", () => {
    const ids = new Set(MEMBER_SURFACE_CATALOG.map((d) => d.id));
    const dangling = MEMBER_SURFACE_CATALOG.filter(
      (d) => d.requires && !ids.has(d.requires),
    ).map((d) => `${d.id} -> ${d.requires}`);

    expect(dangling).toEqual([]);
  });

  it("no surface requires itself, directly or in a cycle", () => {
    const byId = new Map(MEMBER_SURFACE_CATALOG.map((d) => [d.id, d]));
    const cyclic: string[] = [];

    for (const def of MEMBER_SURFACE_CATALOG) {
      const seen = new Set<string>([def.id]);
      let cur = def.requires;
      while (cur) {
        if (seen.has(cur)) {
          cyclic.push(def.id);
          break;
        }
        seen.add(cur);
        cur = byId.get(cur)?.requires;
      }
    }

    expect(cyclic).toEqual([]);
  });

  it("a child never sits in a different domain from its parent", () => {
    const byId = new Map(MEMBER_SURFACE_CATALOG.map((d) => [d.id, d]));
    const split = MEMBER_SURFACE_CATALOG.filter((d) => {
      if (!d.requires) return false;
      const parent = byId.get(d.requires);
      return parent && parent.domain !== d.domain;
    }).map((d) => `${d.id} (${d.domain}) -> ${d.requires}`);

    expect(split).toEqual([]);
  });

  it("every surface is listed in exactly one department", () => {
    const counts = new Map<MemberSurfaceId, number>();
    for (const ids of Object.values(MEMBER_DEPARTMENT_SURFACES)) {
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const missing = MEMBER_SURFACE_CATALOG.filter((d) => !counts.has(d.id)).map((d) => d.id);
    const duplicated = [...counts].filter(([, n]) => n > 1).map(([id]) => id);

    expect(missing).toEqual([]);
    expect(duplicated).toEqual([]);
  });

  it("every surface declares at least one capability", () => {
    const capless = MEMBER_SURFACE_CATALOG.filter(
      (d) => !d.anyOfCaps || d.anyOfCaps.length === 0,
    ).map((d) => d.id);

    expect(capless).toEqual([]);
  });
});
