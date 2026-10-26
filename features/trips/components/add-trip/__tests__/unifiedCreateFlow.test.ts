import {
  acquireSubmitLock,
  releaseSubmitLock,
} from "@/features/indents/utils/indentShareSubmitGuard.util";
import {
  inferredMarketFulfillment,
  resolveUnifiedCreateSteps,
  wizardStepAfter,
  wizardStepBefore,
} from "@/features/trips/components/add-trip/addTripWizardSteps";
import { buildIndentPayloadFromAddTripState } from "@/features/trips/components/add-trip/buildIndentPayloadFromAddTrip";
import type { AddTripFormState } from "@/features/trips/components/add-trip/types";
import {
  ADD_TRIP_FORM_INITIAL_STATE,
  buildAddTripPayload,
  getAddTripValidationIssues,
} from "@/features/trips/components/add-trip/useAddTripForm";

function form(over: Partial<AddTripFormState>): AddTripFormState {
  return { ...ADD_TRIP_FORM_INITIAL_STATE, ...over };
}

const common = {
  clientName: "Acme Steel",
  clientId: "client-1",
  clientPrice: "10000",
  pickupArea: "Pune",
  dropLocation: "Mumbai",
  vehicleType: "Truck",
  loadType: "Steel",
  tons: "20",
} as const;

const bothPerms = {
  canAsset: true,
  canAggregate: true,
  canIndent: true,
};

describe("unified create wizard steps", () => {
  it("keeps client → route → commodity → source before fulfilment", () => {
    const steps = resolveUnifiedCreateSteps(
      form({ supplySource: "asset" }),
      bothPerms,
    );
    expect(steps.slice(0, 4)).toEqual([
      "client",
      "route",
      "commodity",
      "source",
    ]);
  });

  it("Asset continues to allocation only", () => {
    expect(
      resolveUnifiedCreateSteps(form({ supplySource: "asset" }), bothPerms),
    ).toEqual(["client", "route", "commodity", "source", "allocation"]);
  });

  it("Market with both permissions waits on fulfilment choice", () => {
    expect(
      resolveUnifiedCreateSteps(
        form({ supplySource: "aggregate", marketFulfillment: null }),
        bothPerms,
      ),
    ).toEqual(["client", "route", "commodity", "source", "market_fulfillment"]);
  });

  it("Existing supplier path: partner then allocation", () => {
    expect(
      resolveUnifiedCreateSteps(
        form({
          supplySource: "aggregate",
          marketFulfillment: "supplier",
        }),
        bothPerms,
      ),
    ).toEqual([
      "client",
      "route",
      "commodity",
      "source",
      "market_fulfillment",
      "market_partner",
      "allocation",
    ]);
  });

  it("Share for bidding: destination then target rate", () => {
    expect(
      resolveUnifiedCreateSteps(
        form({ supplySource: "aggregate", marketFulfillment: "bid" }),
        bothPerms,
      ),
    ).toEqual([
      "client",
      "route",
      "commodity",
      "source",
      "market_fulfillment",
      "share_destination",
      "share_target",
    ]);
  });

  it("retains back/forward neighbours without dropping earlier steps", () => {
    const steps = resolveUnifiedCreateSteps(
      form({ supplySource: "aggregate", marketFulfillment: "bid" }),
      bothPerms,
    );
    expect(wizardStepAfter(steps, "commodity")).toBe("source");
    expect(wizardStepBefore(steps, "source")).toBe("commodity");
    expect(wizardStepAfter(steps, "share_destination")).toBe("share_target");
    expect(wizardStepBefore(steps, "share_target")).toBe("share_destination");
  });
});

describe("common field validation", () => {
  it("requires client and sale value", () => {
    const issues = getAddTripValidationIssues(form({ supplySource: "asset" }));
    expect(issues.some((i) => i.field === "client")).toBe(true);
    expect(issues.some((i) => i.field === "clientPrice")).toBe(true);
  });

  it("does not accept a typed client name without a party-list id", () => {
    const issues = getAddTripValidationIssues(
      form({
        ...common,
        clientId: null,
        supplySource: "asset",
        assignLater: true,
      }),
    );
    expect(issues.some((i) => i.field === "client")).toBe(true);
  });

  it("accepts filled common fields on the asset assign-later path", () => {
    const issues = getAddTripValidationIssues(
      form({
        ...common,
        supplySource: "asset",
        assignLater: true,
      }),
    );
    expect(issues).toEqual([]);
  });
});

describe("Asset createTrip payload", () => {
  it("does not send supplier_id or supplier_rate", () => {
    const payload = buildAddTripPayload(
      form({
        ...common,
        supplySource: "asset",
        assignLater: true,
        supplierId: "should-ignore",
        supplierRate: "999",
        driverId: "drv-1",
        vehicleId: "veh-1",
      }),
    );
    expect(payload.client_name).toBe("Acme Steel");
    expect(payload.client_price).toBe(10000);
    expect(payload.pickup_area).toBe("Pune");
    expect(payload.drop_location).toBe("Mumbai");
    expect(payload.load_type).toBe("Steel");
    expect(payload.vehicle_type).toBe("Truck");
    expect(payload.supplier_id).toBeNull();
    expect(payload.supplier_rate).toBe(0);
    expect(payload.driver_id).toBeNull();
    expect(payload.vehicle_id).toBeNull();
  });

  it("stamps driver and vehicle when assigned", () => {
    const payload = buildAddTripPayload(
      form({
        ...common,
        supplySource: "asset",
        assignLater: false,
        driverId: "drv-1",
        vehicleId: "veh-1",
      }),
    );
    expect(payload.driver_id).toBe("drv-1");
    expect(payload.vehicle_id).toBe("veh-1");
  });
});

describe("Market existing supplier createTrip payload", () => {
  it("maps supplier and supplier_rate without overwriting sale value", () => {
    const payload = buildAddTripPayload(
      form({
        ...common,
        supplySource: "aggregate",
        marketFulfillment: "supplier",
        supplierId: "sup-1",
        supplierDisplayName: "Partner Co",
        supplierRate: "8000",
        supplierTarget: "7000",
        assignLater: true,
      }),
    );
    expect(payload.client_price).toBe(10000);
    expect(payload.supplier_id).toBe("sup-1");
    expect(payload.supplier_name).toBe("Partner Co");
    expect(payload.supplier_rate).toBe(8000);
    expect(payload.driver_id).toBeNull();
  });
});

describe("Market share createIndent payload", () => {
  const bidBase = form({
    ...common,
    supplySource: "aggregate",
    marketFulfillment: "bid",
    supplierTarget: "7500",
    supplierRate: "1111",
    circulationTarget: "integrated_supplier",
  });

  it("Network uses circulation_target integrated_supplier and supplier_target", () => {
    const payload = buildIndentPayloadFromAddTripState(bidBase);
    expect(payload.circulation_target).toBe("integrated_supplier");
    expect(payload.supplier_target).toBe(7500);
    expect(payload.client_price).toBe(10000);
    expect(payload.weight).toBe(20000);
    expect(payload.vehicle_type).toBe("Truck");
    expect(payload.load_type).toBe("Steel");
    expect(payload.client_id).toBe("client-1");
  });

  it("Marketplace uses circulation_target marketplace", () => {
    const payload = buildIndentPayloadFromAddTripState({
      ...bidBase,
      circulationTarget: "marketplace",
    });
    expect(payload.circulation_target).toBe("marketplace");
    expect(payload.supplier_target).toBe(7500);
  });

  it("Both uses circulation_target both on a single payload", () => {
    const payload = buildIndentPayloadFromAddTripState({
      ...bidBase,
      circulationTarget: "both",
    });
    expect(payload.circulation_target).toBe("both");
  });

  it("does not copy supplierRate onto supplier_target or client_price", () => {
    const payload = buildIndentPayloadFromAddTripState(bidBase);
    expect(payload.supplier_target).not.toBe(1111);
    expect(payload.client_price).toBe(10000);
  });
});

describe("inferred fulfilment when a permission is missing", () => {
  it("skips the choice step when only aggregate trip is allowed", () => {
    expect(
      inferredMarketFulfillment(
        { canAsset: true, canAggregate: true, canIndent: false },
        "aggregate",
      ),
    ).toBe("supplier");
    expect(
      resolveUnifiedCreateSteps(form({ supplySource: "aggregate" }), {
        canAsset: true,
        canAggregate: true,
        canIndent: false,
      }),
    ).toEqual([
      "client",
      "route",
      "commodity",
      "source",
      "market_partner",
      "allocation",
    ]);
  });
});

describe("double submit lock", () => {
  it("allows only one in-flight create", () => {
    const lock = { current: false };
    expect(acquireSubmitLock(lock)).toBe(true);
    expect(acquireSubmitLock(lock)).toBe(false);
    releaseSubmitLock(lock);
    expect(acquireSubmitLock(lock)).toBe(true);
  });
});

describe("create error leaves values intact", () => {
  it("payload builders are pure — retry uses the same state", () => {
    const state = form({
      ...common,
      supplySource: "asset",
      assignLater: true,
    });
    const first = buildAddTripPayload(state);
    const second = buildAddTripPayload(state);
    expect(second).toEqual(first);
  });
});
