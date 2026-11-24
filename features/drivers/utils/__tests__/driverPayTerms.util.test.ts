import { pickDriverRowForTrip, resolveAgreedPayTerms } from '../driverPayTerms.util';

describe('resolveAgreedPayTerms', () => {
  const invite = { payable_amount: 25000, commission_percent: 5, commission_per_km: null };

  it('fleet edited terms (driver row) win over the original invite', () => {
    expect(
      resolveAgreedPayTerms({ payable_amount: 25000, commission_percent: 7 }, invite),
    ).toEqual({ payableAmount: 25000, commissionPercent: 7, commissionPerKm: null });
  });

  it('falls back to the invite only when the row has no terms at all', () => {
    expect(resolveAgreedPayTerms({}, invite)).toEqual({
      payableAmount: 25000,
      commissionPercent: 5,
      commissionPerKm: null,
    });
  });

  it('never mixes: a removed term on the row is not refilled from the invite', () => {
    // Fleet changed salary-only → no commission. Old invite had 5%.
    expect(resolveAgreedPayTerms({ payable_amount: 30000 }, invite)).toEqual({
      payableAmount: 30000,
      commissionPercent: null,
      commissionPerKm: null,
    });
  });

  it('reads DB numerics sent as strings', () => {
    expect(resolveAgreedPayTerms({ commission_percent: '7.5' }, null).commissionPercent).toBe(7.5);
  });
});

describe('pickDriverRowForTrip', () => {
  const rowA = { id: 'a', organization_id: 'fleet-1', commission_percent: 7 };
  const rowB = { id: 'b', organization_id: 'fleet-2', commission_percent: 3 };

  it("uses the trip's own driver row", () => {
    expect(pickDriverRowForTrip({ driver_id: 'b', organization_id: 'fleet-1' }, [rowA, rowB])).toBe(rowB);
  });

  it("else the driver's row in the trip's fleet, never another fleet", () => {
    expect(pickDriverRowForTrip({ organization_id: 'fleet-1' }, [rowB, rowA])).toBe(rowA);
    expect(pickDriverRowForTrip({ organization_id: 'fleet-9' }, [rowA, rowB])).toBeNull();
  });
});
