/**
 * Sourcing preset — read-only follow-up of indents and trips.
 *
 * Scope: the app-side permission layer only (preset surfaces, role mapping,
 * label persistence). Sourcing is stored as org role `member`, so none of
 * this is enforced by the database — see docs/RBAC_OPERATING_MODEL.md.
 */
import {
  getCapabilitiesFromProfile,
  type Capability,
} from "@/lib/capabilities";
import {
  MEMBER_SURFACE_CATALOG,
  defaultSurfacesForRole,
  domainsFromSurfaces,
  hydrateMemberSurfaces,
  memberHasSurface,
  type MemberSurfaceId,
} from "@/lib/memberSurfaces";
import {
  TEAM_INVITE_ROLE_OPTIONS,
  buildMemberPermissions,
  isPlatformTeamRole,
  orgMemberRoleForPlatformRole,
  platformRoleAfterAccessEdit,
  platformRoleLabel,
} from "@/features/organization/utils/teamInviteRoles.util";

const capsFor = (model: string): Capability[] =>
  getCapabilitiesFromProfile({ role: "user" }, model);

const AGGREGATE = capsFor("NON_ASSET");
const ASSET = capsFor("ASSET_BASED");
const HYBRID = capsFor("HYBRID");

/** Everything Sourcing may hold: the tabs plus list / detail views. */
const SOURCING_ALLOWED: readonly MemberSurfaceId[] = [
  "sales.tab",
  "tripops.indents.view",
  "tripops.tab",
  "tripops.trips.view",
  "tripops.trips.detail",
  // Compliance Document Upload, view only (uploads are cut on the page).
  "trip_compliance.tab",
  "trip_compliance.documents.view",
];

const effectiveOn = (caps: Capability[]) => {
  const surfaces = hydrateMemberSurfaces(defaultSurfacesForRole("sourcing", caps), caps);
  return MEMBER_SURFACE_CATALOG.filter((d) => memberHasSurface(caps, surfaces, d.id)).map(
    (d) => d.id,
  );
};

describe("Sourcing preset — registration and role mapping", () => {
  it("is a known, pickable role labelled Sourcing", () => {
    expect(isPlatformTeamRole("sourcing")).toBe(true);
    expect(TEAM_INVITE_ROLE_OPTIONS.some((o) => o.value === "sourcing")).toBe(true);
    expect(platformRoleLabel("sourcing")).toBe("Sourcing");
  });

  it("is stored as the coarse org role member (no new DB role)", () => {
    expect(orgMemberRoleForPlatformRole("sourcing")).toBe("member");
  });

  it("saves through buildMemberPermissions without being relabelled", () => {
    const perms = buildMemberPermissions({
      platformRole: "sourcing",
      surfaces: defaultSurfacesForRole("sourcing", HYBRID),
      orgCaps: HYBRID,
    });
    expect(perms.platformRole).toBe("sourcing");
    expect(perms.domains).toEqual({ finance: false, sales: true, tripops: true });
    expect(perms.grants).not.toContain("finance:read");
    expect(perms.grants).not.toContain("finance:manage");
  });

  it("keeps its label while a view surface remains, drops it once none do", () => {
    const sourcing = defaultSurfacesForRole("sourcing", HYBRID);
    expect(
      platformRoleAfterAccessEdit("sourcing", domainsFromSurfaces(sourcing), sourcing, HYBRID),
    ).toBe("sourcing");
    expect(platformRoleAfterAccessEdit("sourcing", domainsFromSurfaces({}), {}, HYBRID)).toBe(
      "restricted",
    );
  });
});

describe("Sourcing preset — read-only, no money, no documents", () => {
  it.each([
    ["HYBRID", HYBRID],
    ["AGGREGATE", AGGREGATE],
    ["ASSET", ASSET],
  ])("%s: grants only the allowed view surfaces", (_label, caps) => {
    for (const id of effectiveOn(caps)) {
      expect(SOURCING_ALLOWED).toContain(id);
    }
  });

  it("can follow indents and trips on a hybrid org", () => {
    const on = effectiveOn(HYBRID);
    expect(on).toEqual(expect.arrayContaining([...SOURCING_ALLOWED]));
  });

  it("never gets indent, trip, document, fleet, finance or team actions", () => {
    const surfaces = defaultSurfacesForRole("sourcing", HYBRID);
    const denied = MEMBER_SURFACE_CATALOG.map((d) => d.id).filter(
      (id) => !SOURCING_ALLOWED.includes(id),
    );
    // Spot-check the ones the brief names, then the whole remainder.
    for (const id of [
      "tripops.indents.create",
      "tripops.indents.edit",
      "tripops.indents.bid",
      "tripops.indents.award",
      "tripops.indents.allocate",
      "tripops.trips.assign",
      "tripops.trips.reassign",
      "tripops.trips.simulate",
      "tripops.trips.tracking",
      "tripops.trips.docs",
      "tripops.trips.expenses",
      "tripops.trips.finance",
      "tripops.trips.verification",
      "trip_compliance.trip.resubmit",
      "trip_compliance.documents.verify",
      "trip_compliance.trip.mark_verified",
      "trip_compliance.finance.view",
      "trip_compliance.finance.manage",
      "trip_compliance.pod.manage",
      "finance.tab",
      "fleet.drivers.view",
      "fleet.vehicles.view",
    ] as MemberSurfaceId[]) {
      expect(memberHasSurface(HYBRID, surfaces, id)).toBe(false);
    }
    for (const id of denied) {
      expect(memberHasSurface(HYBRID, surfaces, id)).toBe(false);
    }
  });

  it("has no Finance domain, so finance routes stay closed", () => {
    expect(domainsFromSurfaces(defaultSurfacesForRole("sourcing", HYBRID)).finance).toBe(false);
  });
});
