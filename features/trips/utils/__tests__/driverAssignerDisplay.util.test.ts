import type { TripRow } from "@/features/trips/services/trips.service";
import { resolveAssignerUserId, resolveJobCardAssignmentSourceKind } from "../driverAssignerDisplay.util";

jest.mock("@/features/vehicles/utils/fleetAvatar.util", () => ({
  getFleetAvatarSeedForOrg: jest.fn(() => null),
}));

const trip = (overrides: Partial<TripRow>) =>
  ({ id: "t1", organization_id: "org-nihas", supplier_id: null, ...overrides }) as TripRow;

describe("resolveJobCardAssignmentSourceKind", () => {
  it("labels a client trip with a tagged supplier as OFFLINE TRIP", () => {
    expect(
      resolveJobCardAssignmentSourceKind(
        trip({ supplier_id: "supplier-gk" }),
        "org-gk",
        { requiresOtp: true, isAggregate: true, isRoster: false },
        null,
      ),
    ).toEqual({ kind: "direct", kindLabel: "OFFLINE TRIP" });
  });

  it("keeps the employer's own trips as YOUR FLEET", () => {
    expect(
      resolveJobCardAssignmentSourceKind(
        trip({ organization_id: "org-gk" }),
        "org-gk",
        { requiresOtp: false, isAggregate: false, isRoster: false },
        null,
      ),
    ).toEqual({ kind: "your_fleet", kindLabel: "YOUR FLEET" });
  });
});

describe("resolveAssignerUserId", () => {
  const UID = "860a2a68-dbda-4aed-a6db-cb5833c8c1f1";
  const withMeta = (m: Record<string, string | null>) => trip(m as Partial<TripRow>);

  it("never returns a free-text name (prod 22P02 on profiles.id IN (...))", () => {
    expect(resolveAssignerUserId(withMeta({ status_updated_by: "Sivakozhunthu" }), {})).toBe("");
    expect(resolveAssignerUserId(withMeta({ assigned_by_user_id: "Sivakozhunthu" }), {})).toBe("");
    expect(resolveAssignerUserId(trip({}), { t1: "Sivakozhunthu" })).toBe("");
  });

  it("skips a name and falls through to the next valid UUID", () => {
    expect(
      resolveAssignerUserId(withMeta({ status_updated_by: "Sivakozhunthu", owner_user_id: UID }), {}),
    ).toBe(UID);
    expect(resolveAssignerUserId(trip({}), { t1: "Sivakozhunthu" })).toBe("");
  });

  it("keeps audit actor precedence when it is a UUID", () => {
    expect(resolveAssignerUserId(withMeta({ owner_user_id: "11111111-1111-1111-1111-111111111111" }), { t1: UID })).toBe(UID);
  });
});
