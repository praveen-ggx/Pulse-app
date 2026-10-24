import { tripIdForChangeDriverPopup } from "@/lib/alertRegistry/changeDriverPopup.util";
import { navigateToOpsAlert } from "@/lib/alertRegistry/registryOpsNavigation.util";
import {
  buildOpsRegistryCardPresentation,
  opsRegistryActionLabel,
} from "@/lib/alertRegistry/registryOpsPresentation.util";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";

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
});
