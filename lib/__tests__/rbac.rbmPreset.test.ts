/**
 * RBM preset — view-only oversight. App-side only (stored as org role `member`).
 */
import { getCapabilitiesFromProfile } from "@/lib/capabilities";
import { defaultSurfacesForRole, type MemberSurfaceId } from "@/lib/memberSurfaces";
import {
  TEAM_INVITE_ROLE_OPTIONS,
  isPlatformTeamRole,
  orgMemberRoleForPlatformRole,
  platformRoleLabel,
} from "@/features/organization/utils/teamInviteRoles.util";

const HYBRID = getCapabilitiesFromProfile({ role: "user" }, "HYBRID");

const FORBIDDEN: readonly MemberSurfaceId[] = [
  "trip_compliance.tab.advance_payment",
  "trip_compliance.tab.advance_verification",
  "trip_compliance.tab.settlement_verification",
  "trip_compliance.tab.final_settlement",
  "trip_compliance.documents.verify",
  "trip_compliance.trip.mark_verified",
  "trip_compliance.trip.resubmit",
  "trip_compliance.finance.reject",
  "trip_compliance.finance.manage",
  "trip_compliance.pod.manage",
  "finance.manage",
  "finance.add_transaction",
  "finance.edit_transaction",
  "finance.void_adjustments",
  "finance.expenses.approve",
  "tripops.indents.create",
  "tripops.indents.award",
  "tripops.trips.assign",
  "tripops.trips.cancel",
  "fleet.vehicles.create",
  "fleet.vehicles.edit",
  "fleet.drivers.create",
  "fleet.drivers.edit",
  "fleet.drivers.invite",
  "fleet.drivers.assign_vehicle",
  // Trip tabs that can write: docs (upload), expenses (add / edit), ratings (submit).
  "tripops.trips.docs",
  "tripops.trips.expenses",
  "tripops.trips.ratings",
  "team.manage",
  "team.invite",
  "workspace.settings",
];

describe("RBM preset", () => {
  it("is registered, pickable and stored as org role member", () => {
    expect(isPlatformTeamRole("rbm")).toBe(true);
    expect(TEAM_INVITE_ROLE_OPTIONS.some((o) => o.value === "rbm")).toBe(true);
    expect(platformRoleLabel("rbm")).toBe("RBM");
    expect(orgMemberRoleForPlatformRole("rbm")).toBe("member");
  });

  it("can see finance, trips and compliance", () => {
    const s = defaultSurfacesForRole("rbm", HYBRID);
    for (const id of ["finance.view", "tripops.trips.view", "trip_compliance.tab", "trip_compliance.finance.view", "fleet.vehicles.view", "fleet.drivers.view"]) {
      expect(s[id]).toBe(true);
    }
  });

  it("holds no payment, approval, write or admin surface", () => {
    const s = defaultSurfacesForRole("rbm", HYBRID);
    for (const id of FORBIDDEN) expect(s[id]).toBeFalsy();
  });
});
