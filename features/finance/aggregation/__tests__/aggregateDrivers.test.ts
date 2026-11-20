import { aggregateDrivers, computeDriverCommissionForTrip } from '../aggregateDrivers';
import type { DriverLike, LedgerTx, TripForDriver } from '../types';

describe('computeDriverCommissionForTrip', () => {
  it('uses commissionPercent of client_price when a driver offer specifies a percentage', () => {
    const commission = computeDriverCommissionForTrip(
      { driver_id: 'd1', client_price: 1000 },
      { commissionPercent: 12, commissionPerKm: null, payableAmount: null },
    );
    expect(commission).toBe(120);
  });

  it('uses commissionPerKm * distance when the offer specifies a per-km rate and no percent', () => {
    const commission = computeDriverCommissionForTrip(
      { driver_id: 'd1', distance: '250' },
      { commissionPercent: null, commissionPerKm: 5, payableAmount: null },
    );
    expect(commission).toBe(1250);
  });

  it('falls back to trip.driver_commission (already-agreed, stamped amount) when there is no offer', () => {
    expect(computeDriverCommissionForTrip({ driver_id: 'd1', driver_commission: 300 }, null)).toBe(300);
  });

  it('never guesses 10% of supplier_rate — no agreed terms and nothing stamped means 0, not an estimate', () => {
    expect(computeDriverCommissionForTrip({ driver_id: 'd1', supplier_rate: 2000 }, null)).toBe(0);
  });

  it('never guesses 10% of client_price — no agreed terms and nothing stamped means 0, not an estimate', () => {
    expect(computeDriverCommissionForTrip({ driver_id: 'd1', client_price: 500 }, null)).toBe(0);
  });

  it('returns 0 for a driver-cum-owner (no org relationship, no offer, no stamped commission) even with a real trip price', () => {
    expect(
      computeDriverCommissionForTrip(
        { driver_id: 'fo-1', client_price: 50000, supplier_rate: 0 },
        { commissionPercent: null, commissionPerKm: null, payableAmount: null },
      ),
    ).toBe(0);
  });

  it('still returns the real agreed percent-based commission even when trip.driver_commission is not yet stamped', () => {
    expect(
      computeDriverCommissionForTrip(
        { driver_id: 'd1', client_price: 1000, driver_commission: 0 },
        { commissionPercent: 15, commissionPerKm: null, payableAmount: null },
      ),
    ).toBe(150);
  });
});

describe('aggregateDrivers', () => {
  const drivers: DriverLike[] = [{ id: 'd1', name: 'Driver One' } as DriverLike];

  it('computes due from trips and paid from ledger, clamping pending at 0', () => {
    const trips: TripForDriver[] = [{ driver_id: 'd1', driver_commission: 500 } as TripForDriver];
    const transactions: LedgerTx[] = [
      { contact_type: 'driver', contact_id: 'd1', amount_out: 200 } as LedgerTx,
    ];
    const { rows } = aggregateDrivers(drivers, trips, transactions);
    expect(rows[0].due).toBe(500);
    expect(rows[0].paid).toBe(200);
    expect(rows[0].pending).toBe(300);
  });

  it('surfaces a trip whose driver_id is not in the loaded drivers list as its own row instead of dropping the commission', () => {
    const trips: TripForDriver[] = [
      { driver_id: 'd1', driver_commission: 500 } as TripForDriver,
      { driver_id: 'ghost-driver', driver_commission: 300 } as TripForDriver,
    ];
    const { rows, totals } = aggregateDrivers(drivers, trips, []);
    expect(rows).toHaveLength(2);
    const unresolvedRow = rows.find((r) => r.id === 'ghost-driver');
    expect(unresolvedRow).toBeDefined();
    expect(unresolvedRow?.name).toBe('Unknown Driver');
    expect(unresolvedRow?.due).toBe(300);
    expect(unresolvedRow?.trips).toBe(1);
    // Totals must include the unresolved driver's commission too, not just the known driver.
    expect(totals.totalOut).toBe(800);
  });

  it('does not let generic (non-driver-tagged) cash-out rows reduce a driver’s pending due', () => {
    const trips: TripForDriver[] = [{ driver_id: 'd1', driver_commission: 500 } as TripForDriver];
    const transactions: LedgerTx[] = [
      { contact_type: 'supplier', contact_id: 'sup-1', amount_out: 500 } as LedgerTx,
    ];
    const { rows } = aggregateDrivers(drivers, trips, transactions);
    expect(rows[0].paid).toBe(0);
    expect(rows[0].pending).toBe(500);
  });

  it('marks a driver disconnected when left_at is set, with a formatted subline', () => {
    const disconnected: DriverLike[] = [
      { id: 'd1', name: 'Driver One', left_at: '2026-01-05T00:00:00.000Z' } as DriverLike,
    ];
    const { rows } = aggregateDrivers(disconnected, [], []);
    expect(rows[0].status).toBe('DISCONNECTED');
    expect(rows[0].subline).toContain('Disconnected');
  });

  it('keeps stamped asset-trip commission settleable after the driver leaves', () => {
    const former: DriverLike[] = [
      {
        id: 'd1',
        name: 'Sadam',
        left_at: '2026-08-17T00:00:00.000Z',
        relationship_status: 'disconnected',
      } as DriverLike,
    ];
    const trips: TripForDriver[] = [
      { driver_id: 'd1', driver_commission: 3500, client_price: 35000 } as TripForDriver,
    ];
    const unpaid = aggregateDrivers(former, trips, []);
    expect(unpaid.rows[0].due).toBe(3500);
    expect(unpaid.rows[0].pending).toBe(3500);
    expect(unpaid.rows[0].status).toBe('DISCONNECTED');

    const afterPay = aggregateDrivers(former, trips, [
      { contact_type: 'driver', contact_id: 'd1', amount_out: 3500 } as LedgerTx,
    ]);
    expect(afterPay.rows[0].paid).toBe(3500);
    expect(afterPay.rows[0].pending).toBe(0);
  });

  it('counts trips per driver and totals in/out across all drivers', () => {
    const trips: TripForDriver[] = [
      { driver_id: 'd1', driver_commission: 100 } as TripForDriver,
      { driver_id: 'd1', driver_commission: 100 } as TripForDriver,
    ];
    const { rows, totals } = aggregateDrivers(drivers, trips, []);
    expect(rows[0].trips).toBe(2);
    expect(totals.totalIn).toBe(200);
    expect(totals.totalOut).toBe(200);
  });

  it('does not treat a DCO trip as a Driver payable even when driver_id is set', () => {
    const trips: TripForDriver[] = [
      {
        driver_id: 'd1',
        operating_mode: 'DCO',
        supplier_rate: 36500,
        driver_commission: 0,
      } as TripForDriver,
    ];
    const { rows, totals } = aggregateDrivers(drivers, trips, [
      { contact_type: 'dco', contact_id: 'payee-1', amount_out: 1000 } as LedgerTx,
    ]);
    expect(rows[0].due).toBe(0);
    expect(rows[0].trips).toBe(0);
    expect(rows[0].paid).toBe(0);
    expect(totals.totalIn).toBe(0);
  });

  it('returns 0 commission for DCO even if a fleet offer exists', () => {
    expect(
      computeDriverCommissionForTrip(
        { driver_id: 'd1', operating_mode: 'DCO', client_price: 50000 },
        { commissionPercent: 10, commissionPerKm: null, payableAmount: null },
      ),
    ).toBe(0);
  });
});

describe('fleet sees the same trip pay as the driver', () => {
  const trip = {
    id: 't1',
    driver_id: 'd1',
    client_price: 1000,
    distance: 72,
    driver_commission: 0,
  } as unknown as TripForDriver;

  it('adds commission % and per km: 3% of ₹1,000 + 72 km × ₹10 = ₹750', () => {
    expect(
      computeDriverCommissionForTrip(trip, { commissionPercent: 3, commissionPerKm: 10 }),
    ).toBe(750);
  });

  it('keeps the amount saved on an old trip even if terms change later', () => {
    const saved = { ...trip, driver_commission: 750 } as unknown as TripForDriver;
    expect(
      computeDriverCommissionForTrip(saved, { commissionPercent: 7, commissionPerKm: 20 }),
    ).toBe(750);
  });

  it('no agreed terms and nothing saved → 0, never a guess', () => {
    expect(computeDriverCommissionForTrip(trip, null)).toBe(0);
  });
});
