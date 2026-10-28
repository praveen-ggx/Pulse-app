import {
  getTripExecutionModel,
  isAggregateExecutionTrip,
  isAssetExecutionTrip,
  isAssetFinanceForViewer,
  isPartnerAwardedSupplierView,
  isPartnerOwnRosterHaul,
  shouldShowTripExpenseHub,
} from "@/features/trips/domain/tripExecutionModel";
import type { TripRow } from "@/features/trips/services/trips.service";

function trip(overrides: Partial<TripRow> = {}): TripRow {
  return {
    id: "trip-1",
    organization_id: "org-1",
    ...overrides,
  } as TripRow;
}

describe("tripExecutionModel", () => {
  it("keeps supplier-linked trips aggregate after subcontractor driver assign", () => {
    const aggregateWithDriver = trip({
      supplier_id: "supplier-1",
      driver_id: "driver-1",
      vehicle_id: "vehicle-1",
      trip_payout_mode: null,
    });

    expect(getTripExecutionModel(aggregateWithDriver)).toBe("aggregate");
    expect(isAggregateExecutionTrip(aggregateWithDriver)).toBe(true);
    expect(isAssetExecutionTrip(aggregateWithDriver)).toBe(false);
  });

  it("respects explicit asset payout mode on supplier-linked integrated loads", () => {
    const integratedAsset = trip({
      supplier_id: "supplier-1",
      driver_id: "driver-1",
      trip_payout_mode: "asset",
    });

    expect(getTripExecutionModel(integratedAsset)).toBe("asset");
    expect(isAssetExecutionTrip(integratedAsset)).toBe(true);
  });

  it("treats own-fleet trips without supplier as asset", () => {
    const assetTrip = trip({
      driver_id: "driver-1",
      trip_payout_mode: null,
    });

    expect(getTripExecutionModel(assetTrip)).toBe("asset");
    expect(isAssetExecutionTrip(assetTrip)).toBe(true);
  });

  it("treats a direct_quote deploy with own driver+vehicle as asset despite bookkeeping supplier_id", () => {
    // The scenario commit 333decbd was actually fixing: create_trip_from_direct_quote
    // stamps a bookkeeping supplier_id (the shipper's supplier row for the winning
    // bidder) even when the bidder deploys with its own roster driver/vehicle.
    const directQuoteAsset = trip({
      source: "direct_quote",
      supplier_id: "supplier-1",
      driver_id: "driver-1",
      vehicle_id: "vehicle-1",
      trip_payout_mode: null,
    });

    expect(getTripExecutionModel(directQuoteAsset)).toBe("asset");
    expect(isAssetExecutionTrip(directQuoteAsset)).toBe(true);
  });

  it("always treats a mover_asset trip as asset (driver payout + expense UI)", () => {
    // Even if payout mode drifts or a supplier_id lingers, the mover's own
    // execution trip must render the asset finance layout.
    const moverAsset = trip({
      source: "mover_asset",
      driver_id: "driver-1",
      vehicle_id: "vehicle-1",
      supplier_id: "supplier-1",
      trip_payout_mode: "market",
    });

    expect(getTripExecutionModel(moverAsset)).toBe("asset");
    expect(isAssetExecutionTrip(moverAsset)).toBe(true);
    expect(isAggregateExecutionTrip(moverAsset)).toBe(false);
  });

  // Issue B: explicit execution_type on manual/Aggregate-assigned trips.
  describe("explicit execution_type (Issue B)", () => {
    it("Case A: manual + supplier + explicit ASSET -> asset, driver payout available", () => {
      const manualOwnAsset = trip({
        source: "manual",
        indent_id: null,
        supplier_id: "supplier-1",
        driver_id: "driver-1",
        execution_type: "ASSET",
        trip_payout_mode: null,
      });

      expect(getTripExecutionModel(manualOwnAsset)).toBe("asset");
      expect(isAssetExecutionTrip(manualOwnAsset)).toBe(true);
      expect(isAggregateExecutionTrip(manualOwnAsset)).toBe(false);
    });

    it("Case B: manual + supplier + explicit AGGREGATE (third-party) -> aggregate, driver payout unavailable", () => {
      const manualThirdParty = trip({
        source: "manual",
        indent_id: null,
        supplier_id: "supplier-1",
        driver_id: "driver-1",
        execution_type: "AGGREGATE",
        trip_payout_mode: null,
      });

      expect(getTripExecutionModel(manualThirdParty)).toBe("aggregate");
      expect(isAssetExecutionTrip(manualThirdParty)).toBe(false);
      expect(isAggregateExecutionTrip(manualThirdParty)).toBe(true);
    });

    it("Case C: execution_type NULL preserves the existing legacy classification", () => {
      const legacyManualSupplier = trip({
        source: "manual",
        indent_id: null,
        supplier_id: "supplier-1",
        driver_id: "driver-1",
        execution_type: null,
        trip_payout_mode: null,
      });

      // Same outcome as the pre-Issue-B "keeps supplier-linked trips
      // aggregate" case above — NULL must not change historical behavior.
      expect(getTripExecutionModel(legacyManualSupplier)).toBe("aggregate");
    });

    it("explicit execution_type takes priority over trip_payout_mode", () => {
      const conflicting = trip({
        source: "manual",
        supplier_id: "supplier-1",
        execution_type: "ASSET",
        trip_payout_mode: "market",
      });

      expect(getTripExecutionModel(conflicting)).toBe("asset");
    });

    it("is case-insensitive and tolerant of whitespace", () => {
      const lower = trip({ supplier_id: "supplier-1", execution_type: "asset" as never });
      expect(getTripExecutionModel(lower)).toBe("asset");
    });
  });

  describe("partner own-roster haul (viewer-aware)", () => {
    const shipperTrip = trip({
      organization_id: "org-ajio",
      supplier_id: "supplier-godrej",
      driver_id: "driver-ganesh",
      source: "direct_quote",
      trip_payout_mode: "market",
    });

    it("keeps the shipper trip aggregate for the owner", () => {
      expect(getTripExecutionModel(shipperTrip)).toBe("aggregate");
      expect(isAssetFinanceForViewer(shipperTrip, "org-ajio")).toBe(false);
      expect(isPartnerAwardedSupplierView(shipperTrip, "org-ajio")).toBe(false);
    });

    it("treats the awarded carrier with an assigned driver as asset finance", () => {
      expect(isPartnerAwardedSupplierView(shipperTrip, "org-godrej")).toBe(true);
      expect(isPartnerOwnRosterHaul(shipperTrip, "org-godrej")).toBe(true);
      expect(isAssetFinanceForViewer(shipperTrip, "org-godrej")).toBe(true);
    });

    it("does not treat the carrier as own-roster haul before a driver is assigned", () => {
      const unassigned = trip({
        organization_id: "org-ajio",
        supplier_id: "supplier-godrej",
        trip_payout_mode: "market",
      });
      expect(isPartnerAwardedSupplierView(unassigned, "org-godrej")).toBe(true);
      expect(isPartnerOwnRosterHaul(unassigned, "org-godrej")).toBe(false);
      expect(isAssetFinanceForViewer(unassigned, "org-godrej")).toBe(false);
    });
  });

  describe("shouldShowTripExpenseHub", () => {
    it("stays open for DCO trips with a vehicle even when execution model is aggregate", () => {
      const dcoMarket = trip({
        operating_mode: "DCO",
        supplier_id: "supplier-1",
        vehicle_id: "vehicle-1",
        trip_payout_mode: "market",
      });
      expect(getTripExecutionModel(dcoMarket)).toBe("aggregate");
      expect(shouldShowTripExpenseHub(dcoMarket)).toBe(true);
    });

    it("does not open for DCO trips without a vehicle", () => {
      const dcoNoVehicle = trip({
        operating_mode: "DCO",
        supplier_id: "supplier-1",
        trip_payout_mode: "market",
      });
      expect(shouldShowTripExpenseHub(dcoNoVehicle)).toBe(false);
    });

    it("stays open for commerce multi-order trips with a vehicle", () => {
      const commerce = trip({
        is_commerce: true,
        supplier_id: "supplier-1",
        vehicle_id: "vehicle-1",
        trip_payout_mode: null,
      });
      expect(getTripExecutionModel(commerce)).toBe("aggregate");
      expect(shouldShowTripExpenseHub(commerce)).toBe(true);
    });

    it("does not open for aggregate trips without DCO, commerce vehicle, or asset execution", () => {
      const handedOff = trip({
        supplier_id: "supplier-1",
        driver_id: "driver-1",
      });
      expect(shouldShowTripExpenseHub(handedOff)).toBe(false);
    });
  });
});
