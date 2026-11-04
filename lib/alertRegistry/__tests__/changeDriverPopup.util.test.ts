import { tripIdForChangeDriverPopup } from "@/lib/alertRegistry/changeDriverPopup.util";
import { navigateToOpsAlert } from "@/lib/alertRegistry/registryOpsNavigation.util";
import {
  buildOpsRegistryCardPresentation,
  opsRegistryActionLabel,
} from "@/lib/alertRegistry/registryOpsPresentation.util";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";

// registryOpsPresentation → partyAvatarDisplay → avatarUpload pulls in AuthContext and
// native pickers that have no module under Jest; these tests never resolve avatar URLs.
jest.mock("@/lib/avatarUpload", () => ({
  AVATAR_BUCKET: "userprofiles",
  LEGACY_AVATAR_BUCKET: "avatars",
  getSignedAvatarUrl: jest.fn(async () => null),
  extractPathFromStorageUrl: jest.fn(() => null),
  resolveOrgLogoPublicUrl: jest.fn(() => null),
}));

function ops(
  overrides: Partial<GlobalOperationAlert> &
    Pick<GlobalOperationAlert, "category">,
): GlobalOperationAlert {
  return {
    id: "ops-1",
    priority_weight: 1,
    kind: "critical",
    trip_id: "trip-025",
    trip_number: "TRP025",
    title: "Driver unassigned",
    subtitle: "TRP025 · Change driver to continue",
    amount: null,
    created_at: "2026-10-24T00:00:00.000Z",
    source: "trip_synthetic_unassigned",
    ...overrides,
  };
}

describe("Change driver popup routing", () => {
  it("opens a popup for unassigned-trip alerts and never routes to assignment", () => {
    const router = { push: jest.fn() };
    const onOpenChangeDriver = jest.fn();
    const alert = ops({ category: "unassigned_trip" });

    expect(tripIdForChangeDriverPopup(alert)).toBe("trip-025");
    expect(opsRegistryActionLabel(alert)).toBe("Change driver");

    navigateToOpsAlert(router as never, alert, { onOpenChangeDriver });

    expect(onOpenChangeDriver).toHaveBeenCalledWith("trip-025");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("does not navigate to /assignment even when the popup opener is missing", () => {
    const router = { push: jest.fn() };
    navigateToOpsAlert(router as never, ops({ category: "unassigned_trip" }));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("still opens trip detail for other trip-linked ops alerts", () => {
    const router = { push: jest.fn() };
    navigateToOpsAlert(
      router as never,
      ops({ category: "vehicle_idle", trip_id: "trip-idle" }),
    );
    expect(router.push).toHaveBeenCalledWith("/trip/trip-idle");
  });

  it("ignores non-unassigned categories for the popup", () => {
    expect(
      tripIdForChangeDriverPopup(ops({ category: "payment_received" })),
    ).toBeNull();
  });

  it("keeps notification copy aligned with the popup card", () => {
    const presentation = buildOpsRegistryCardPresentation(
      ops({ category: "unassigned_trip" }),
      {
        org: null,
        activeTrips: [],
        clientsById: new Map(),
        driversById: new Map(),
        suppliersById: new Map(),
        partnerDisplay: {},
        partnerAvatarUri: {},
      },
    );
    expect(presentation.actionText).toBe("needs a driver change for");
    expect(presentation.detail).toContain("Change driver to continue");
  });

  it("puts the lane and date on the driver-change card", () => {
    const presentation = buildOpsRegistryCardPresentation(
      ops({ category: "unassigned_trip", trip_id: "trip-025" }),
      {
        org: null,
        activeTrips: [
          {
            trip_id: "trip-025",
            trip_number: "TRP025",
            display_trip_id: "TRP025",
            status: "assigned",
            pickup_area: "Gowdavalli",
            drop_location: "Jaggayapeta",
            driver_display_name: null,
            vehicle_display_number: null,
            driver_id: null,
            supplier_id: null,
            client_id: null,
            created_at: "2026-11-03T05:30:00.000Z",
            total_unread: 0,
            recent_events: [],
          },
        ],
        clientsById: new Map(),
        driversById: new Map(),
        suppliersById: new Map(),
        partnerDisplay: {},
        partnerAvatarUri: {},
      },
    );
    expect(presentation.detailMeta).toContain("Gowdavalli → Jaggayapeta");
    expect(presentation.detailMeta).toMatch(/Nov/);
  });

  it("puts the client and lane on a late-log card", () => {
    const presentation = buildOpsRegistryCardPresentation(
      ops({
        category: "late_log",
        trip_id: "trip-025",
        subtitle: "No driver system_log in 5+ hours",
      }),
      {
        org: null,
        activeTrips: [
          {
            trip_id: "trip-025",
            trip_number: "TRP025",
            display_trip_id: "TRP002023",
            status: "in_transit",
            pickup_area: "Chennai",
            drop_location: "Delhi",
            driver_display_name: "Jothi S",
            vehicle_display_number: null,
            driver_id: "drv-1",
            supplier_id: null,
            client_id: "client-1",
            created_at: "2026-11-03T05:30:00.000Z",
            total_unread: 0,
            recent_events: [],
          },
        ],
        clientsById: new Map([
          ["client-1", { id: "client-1", name: "Megha Engineering" } as never],
        ]),
        driversById: new Map(),
        suppliersById: new Map(),
        partnerDisplay: {},
        partnerAvatarUri: {},
      },
    );
    expect(presentation.detailMeta).toBe("Megha Engineering · Chennai → Delhi");
  });
});
