import {
  getDriverTripExperience,
  isCommerceDriverTrip,
  mergeTripRowPreservingCommerceOrigin,
} from '../driverTripExperience';
import { GATE3_TRP011, GATE3_TRP049, GATE3_TRP051 } from './gate3CommerceOriginFixtures';

describe('getDriverTripExperience', () => {
  it('A/G: a standard FTL trip selects STANDARD_FTL', () => {
    expect(getDriverTripExperience({ source: 'manual' } as never)).toBe('STANDARD_FTL');
    expect(getDriverTripExperience({ is_commerce: false, execution_plan_id: null })).toBe(
      'STANDARD_FTL',
    );
  });

  it('B: a Commerce trip with is_commerce selects COMMERCE_MULTI_ORDER', () => {
    expect(getDriverTripExperience({ is_commerce: true })).toBe('COMMERCE_MULTI_ORDER');
  });

  it('B: a Commerce trip with execution_plan_id selects COMMERCE_MULTI_ORDER', () => {
    expect(getDriverTripExperience({ execution_plan_id: 'plan-1' })).toBe('COMMERCE_MULTI_ORDER');
  });

  it('F: empty SES / missing orders does not drop Commerce classification', () => {
    expect(
      getDriverTripExperience({ is_commerce: true, execution_plan_id: 'plan-1' }),
    ).toBe('COMMERCE_MULTI_ORDER');
    expect(isCommerceDriverTrip({ is_commerce: true })).toBe(true);
  });

  it('H: unknown or empty trip fails safe to STANDARD_FTL — never guesses Commerce', () => {
    expect(getDriverTripExperience(null)).toBe('STANDARD_FTL');
    expect(getDriverTripExperience(undefined)).toBe('STANDARD_FTL');
    expect(getDriverTripExperience({})).toBe('STANDARD_FTL');
    expect(getDriverTripExperience({ execution_plan_id: '   ' })).toBe('STANDARD_FTL');
  });

  it('does not infer Commerce from stop or order counts', () => {
    const trip = { is_commerce: false, execution_plan_id: null, stops: 4, orders: 6 };
    expect(getDriverTripExperience(trip)).toBe('STANDARD_FTL');
  });

  it('does not infer Commerce from product rows', () => {
    const trip = {
      is_commerce: false,
      execution_plan_id: null,
      products: [{ id: 'p1' }, { id: 'p2' }],
    };
    expect(getDriverTripExperience(trip)).toBe('STANDARD_FTL');
  });

  it('does not infer Commerce from at_pickup / at_drop status', () => {
    expect(
      getDriverTripExperience({ is_commerce: false, execution_plan_id: null, status: 'at_drop' } as never),
    ).toBe('STANDARD_FTL');
  });
});

describe('Gate 3 fixture origin', () => {
  it('TRP049 is Commerce from origin flags', () => {
    expect(isCommerceDriverTrip(GATE3_TRP049)).toBe(true);
    expect(getDriverTripExperience(GATE3_TRP049)).toBe('COMMERCE_MULTI_ORDER');
  });

  it('TRP051 is Commerce from origin flags', () => {
    expect(isCommerceDriverTrip(GATE3_TRP051)).toBe(true);
    expect(getDriverTripExperience(GATE3_TRP051)).toBe('COMMERCE_MULTI_ORDER');
  });

  it('TRP011 at_drop without a plan stays FTL', () => {
    expect(isCommerceDriverTrip(GATE3_TRP011)).toBe(false);
    expect(getDriverTripExperience(GATE3_TRP011)).toBe('STANDARD_FTL');
  });
});

describe('mergeTripRowPreservingCommerceOrigin', () => {
  it('keeps Commerce flags when a status patch omits them', () => {
    const merged = mergeTripRowPreservingCommerceOrigin(
      {
        id: 't1',
        is_commerce: true,
        execution_plan_id: 'plan-1',
        indent_id: 'ind-1',
        status: 'assigned',
      },
      { id: 't1', status: 'in_progress' } as never,
    );
    expect(merged.is_commerce).toBe(true);
    expect(merged.execution_plan_id).toBe('plan-1');
    expect(merged.indent_id).toBe('ind-1');
    expect(merged.status).toBe('in_progress');
  });
});
