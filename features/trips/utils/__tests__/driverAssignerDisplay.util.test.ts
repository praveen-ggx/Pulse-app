import type { TripRow } from "@/features/trips/services/trips.service";
import { resolveJobCardAssignmentSourceKind } from "../driverAssignerDisplay.util";

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
