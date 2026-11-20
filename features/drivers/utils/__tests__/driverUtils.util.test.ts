import {
  canShowDriverTripEstEarnings,
  getHubTripKind,
  isAggregateTrip,
  resolveDriverTripPayoutTerms,
  shouldShowAggregateTripKindPill,
  tripEarningsDetailForDriver,
  tripEarningsForDriver,
  type TripWithSupplier,
} from '../driverUtils.util';

// Regression fixtures for the confirmed live bug: DriverControlScreen showed
// "Your earnings ₹3,500" for driver Sadam / trip TRP035 (client_price 35000,
// supplier_id null, driver_commission 0, and zero agreed payout terms on the
// drivers row) — the legacy 10%-of-client_price guess presented as payable.
const TRP035_SHAPE: TripWithSupplier = {
  supplier_id: null,
  driver_commission: 0,
  supplier_rate: 0,
  client_price: 35000,
};

describe('resolveDriverTripPayoutTerms — the confirmed bug and its exact fix', () => {
  it('1) ₹35,000 trip + no compensation terms at all → NOT agreed (this was the live bug)', () => {
    const result = resolveDriverTripPayoutTerms(TRP035_SHAPE, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: null,
    });
    // The legacy resolver still returns a non-zero guess...
    expect(result.commissionDetail.isEstimated).toBe(true);
    expect(result.commissionDetail.amount).toBe(3500); // 35000 * 0.1 — same number the bug showed
    // ...but it must never be treated as agreed.
    expect(result.hasAgreedPayoutTerms).toBe(false);
  });

  it('2) ₹35,000 trip + commission_percent = 10% → agreed, ₹3,500 (same number, now legitimate)', () => {
    const result = resolveDriverTripPayoutTerms(TRP035_SHAPE, {
      payableAmount: null,
      commissionPercent: 10,
      commissionPerKm: null,
    });
    expect(result.commissionDetail.basis).toBe('commission_percent');
    expect(result.commissionDetail.isEstimated).toBe(false);
    expect(result.commissionDetail.amount).toBe(3500);
    expect(result.hasAgreedPayoutTerms).toBe(true);
  });

  it('3) trip with stored driver_commission → agreed, uses the stored value', () => {
    const trip: TripWithSupplier = { ...TRP035_SHAPE, driver_commission: 5000 };
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: null,
    });
    expect(result.commissionDetail.basis).toBe('trip_commission');
    expect(result.commissionDetail.amount).toBe(5000);
    expect(result.hasAgreedPayoutTerms).toBe(true);
  });

  it('4) tracking_only direct assignment → no earnings (component-level combination)', () => {
    // resolveDriverTripPayoutTerms itself has no concept of tracking_only — that
    // check lives in DriverControlScreen's `tripIsAggregate`. This test mirrors
    // the screen's exact gate: `tripIsAggregate || !hasAgreedPayoutTerms`.
    const trip: TripWithSupplier = { ...TRP035_SHAPE, supplier_id: null };
    const trackingOnly = true;
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: null,
    });
    const tripIsAggregate = isAggregateTrip(trip) || trackingOnly;
    const showsEarnings = !tripIsAggregate && result.hasAgreedPayoutTerms;
    expect(showsEarnings).toBe(false);
  });

  it('5) aggregate/supplier trip → no fabricated driver earnings regardless of price', () => {
    const trip: TripWithSupplier = { ...TRP035_SHAPE, supplier_id: 'supplier-1' };
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: null,
    });
    const tripIsAggregate = isAggregateTrip(trip);
    expect(tripIsAggregate).toBe(true);
    const showsEarnings = !tripIsAggregate && result.hasAgreedPayoutTerms;
    expect(showsEarnings).toBe(false);
  });

  it('5b) canShowDriverTripEstEarnings false for supplier-mediated Godrej→supplier trip', () => {
    const trip: TripWithSupplier = {
      ...TRP035_SHAPE,
      supplier_id: 'supplier-1',
      client_price: 50000,
      supplier_rate: 50000,
    };
    expect(
      canShowDriverTripEstEarnings(trip, {
        payableAmount: 18000,
        commissionPercent: null,
        commissionPerKm: null,
      }),
    ).toBe(false);
  });

  it('6) pending attribution (not yet a fleet trip) → no payable earnings yet', () => {
    // Attribution status itself (pending/confirmed) is a separate, pre-existing
    // gate (`isControlTripAttributed` in DriverControlScreen, unaffected by this
    // fix). Until attribution is confirmed there is no commission source at all,
    // which resolveDriverTripPayoutTerms already reports as not agreed.
    const trip: TripWithSupplier = { ...TRP035_SHAPE };
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: null,
    });
    expect(result.hasAgreedPayoutTerms).toBe(false);
  });

  it('monthly salary only (payable_amount, no per-trip commission) → agreed via salary, not commission', () => {
    // This is the case the fix must NOT regress: tripEarningsDetailForDriver has
    // no concept of a monthly salary allocation, so a salaried driver with no
    // per-trip commission_percent/per_km would otherwise fall through to the
    // legacy guess and be wrongly reported as "not agreed".
    const trip: TripWithSupplier = { ...TRP035_SHAPE };
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: 18000,
      commissionPercent: null,
      commissionPerKm: null,
    });
    expect(result.commissionDetail.isEstimated).toBe(true); // the resolver's own guess still fires...
    expect(result.hasAgreedPayoutTerms).toBe(true); // ...but salary presence overrides it
    expect(result.monthlyPayableAmount).toBe(18000);
  });

  it('per-km commission with distance → agreed, per_km basis', () => {
    const trip: TripWithSupplier = { ...TRP035_SHAPE, distance: 500 };
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: 20,
    });
    expect(result.commissionDetail.basis).toBe('per_km');
    expect(result.commissionDetail.amount).toBe(10000);
    expect(result.hasAgreedPayoutTerms).toBe(true);
  });

  it('null trip → not agreed, zero amount', () => {
    const result = resolveDriverTripPayoutTerms(null, null);
    expect(result.hasAgreedPayoutTerms).toBe(false);
    expect(result.commissionDetail.amount).toBe(0);
  });
});

describe('tripEarningsDetailForDriver — unchanged canonical resolver semantics', () => {
  it('still returns the legacy 10% guess with isEstimated=true (existing callers unaffected)', () => {
    const detail = tripEarningsDetailForDriver(TRP035_SHAPE, null);
    expect(detail.amount).toBe(3500);
    expect(detail.isEstimated).toBe(true);
    expect(detail.basis).toBe('estimated');
  });

  it('DCO uses supplier_rate as agreed earning, never the 10% estimate', () => {
    const trip: TripWithSupplier = {
      supplier_id: null,
      driver_commission: 0,
      supplier_rate: 19000,
      client_price: 25000,
      operating_mode: 'DCO',
    };
    const detail = tripEarningsDetailForDriver(trip);
    expect(detail.isEstimated).toBe(false);
    expect(detail.basis).toBe('dco_settlement');
    expect(detail.amount).toBe(19000);
  });
});

describe("getHubTripKind — DCO indent awards are not Asset", () => {
  const godrejIndentDco = {
    supplier_id: null,
    operating_mode: "DCO",
    dco_payee_id: "9f9c185a-5b77-4c5a-a84d-7f54a4fb2208",
    trip_payout_mode: "market",
    source: "direct_bid",
    driver_id: "808d19a0-59c7-4f09-99d3-2036cdf2ac56",
    vehicle_id: null,
  };

  it("labels operating_mode DCO as dco even with no supplier_id", () => {
    expect(getHubTripKind(godrejIndentDco)).toBe("dco");
    expect(shouldShowAggregateTripKindPill(godrejIndentDco)).toBe(true);
  });

  it("does not infer DCO from source, payout, indent, or missing supplier", () => {
    expect(
      getHubTripKind({
        supplier_id: null,
        operating_mode: "FLEET",
        trip_payout_mode: "market",
        source: "direct_bid",
      }),
    ).toBe("aggregate");
  });

  it("keeps non-DCO own-fleet economics as asset", () => {
    expect(
      getHubTripKind({
        supplier_id: null,
        source: "manual",
        trip_payout_mode: "asset",
        operating_mode: "FLEET",
      }),
    ).toBe("asset");
  });

  it("keeps non-DCO supplier trips as aggregate unless execution model is asset", () => {
    expect(
      getHubTripKind({
        supplier_id: "supplier-1",
        operating_mode: "FLEET",
        trip_payout_mode: "market",
        source: "manual",
      }),
    ).toBe("aggregate");
    expect(
      getHubTripKind({
        supplier_id: "supplier-1",
        operating_mode: "FLEET",
        trip_payout_mode: "asset",
        source: "manual",
      }),
    ).toBe("asset");
  });

  it("gives DCO precedence over supplier and asset economics", () => {
    expect(
      getHubTripKind({
        supplier_id: "supplier-1",
        operating_mode: "DCO",
        trip_payout_mode: "asset",
        source: "manual",
      }),
    ).toBe("dco");
    expect(
      shouldShowAggregateTripKindPill({
        supplier_id: "supplier-1",
        operating_mode: "DCO",
        trip_payout_mode: "asset",
        source: "manual",
      }),
    ).toBe(true);
  });
});

describe('agreed trip pay: commission % + per km add up', () => {
  const trip1000: TripWithSupplier = {
    client_price: 1000,
    supplier_rate: null,
    supplier_id: null,
    driver_commission: 0,
    distance: 72,
  } as TripWithSupplier;

  it('₹1,000 trip, 72 km, 3% + ₹10/km = ₹30 + ₹720 = ₹750', () => {
    const d = tripEarningsDetailForDriver(trip1000, { commissionPercent: 3, commissionPerKm: 10 });
    expect(d.amount).toBe(750);
    expect(d.isEstimated).toBe(false);
    expect(d.parts).toMatchObject({ commission: 30, perKm: 720, km: 72 });
  });

  it('commission % only', () => {
    const d = tripEarningsDetailForDriver(trip1000, { commissionPercent: 3 });
    expect(d.amount).toBe(30);
    expect(d.basis).toBe('commission_percent');
  });

  it('per km only', () => {
    const d = tripEarningsDetailForDriver(trip1000, { commissionPerKm: 10 });
    expect(d.amount).toBe(720);
    expect(d.basis).toBe('per_km');
  });

  it('% is on the trip amount (client price), never the supplier cost — same as the DB', () => {
    const withSupplierCost = { ...trip1000, supplier_rate: 800 } as TripWithSupplier;
    expect(tripEarningsDetailForDriver(withSupplierCost, { commissionPercent: 7 }).amount).toBe(70);
    const noClientPrice = { ...trip1000, client_price: 0, supplier_rate: 800 } as TripWithSupplier;
    expect(tripEarningsForDriver(noClientPrice, { commissionPercent: 7 })).toBe(0);
  });

  it('a stored trip figure wins; breakdown only when the terms explain it', () => {
    const stored = { ...trip1000, driver_commission: 750 } as TripWithSupplier;
    const d = tripEarningsDetailForDriver(stored, { commissionPercent: 3, commissionPerKm: 10 });
    expect(d.amount).toBe(750);
    expect(d.basis).toBe('trip_commission');
    expect(d.parts?.commission).toBe(30);
    const other = { ...trip1000, driver_commission: 500 } as TripWithSupplier;
    expect(tripEarningsDetailForDriver(other, { commissionPercent: 3 }).parts).toBeUndefined();
  });

  it('no agreed terms: never counted as money owed', () => {
    expect(tripEarningsForDriver(trip1000, null)).toBe(0);
    expect(tripEarningsDetailForDriver(trip1000, null).isEstimated).toBe(true);
  });
});
