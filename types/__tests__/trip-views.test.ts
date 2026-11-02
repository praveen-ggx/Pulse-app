import { getDriverTripExperience } from '@/features/trips/domain/driverTripExperience';
import {
  driverRowToTripRow,
  supplierRowToTripRow,
  type DriverTripRow,
  type SupplierTripRow,
} from '@/types/trip-views';

describe('trip view row types', () => {
  const supplierRow: SupplierTripRow = {
    id: 'trip-1',
    booking_ref: 'BKG-abc123',
    source_indent_code: 'IND-001',
    supplier_trip_sequence: 26,
    status: 'assigned',
    pickup_location: 'Mumbai',
    pickup_address: 'Mumbai',
    pickup_scheduled_at: '2026-06-01T10:00:00Z',
    dropoff_location: 'Pune',
    dropoff_address: 'Pune',
    dropoff_scheduled_at: null,
    assigned_driver_id: 'driver-1',
    driver_display_trip_id: 'TRP001',
    vehicle_id: 'vehicle-1',
    instructions: 'Handle with care',
    created_at: '2026-06-01T09:00:00Z',
    updated_at: '2026-06-01T09:00:00Z',
  };

  const driverRow: DriverTripRow = {
    id: 'trip-1',
    driver_id: 'driver-1',
    driver_display_trip_id: 'TRP001',
    status: 'assigned',
    pickup_location: 'Mumbai',
    pickup_address: 'Mumbai',
    pickup_scheduled_at: '2026-06-01T10:00:00Z',
    dropoff_location: 'Pune',
    dropoff_address: 'Pune',
    dropoff_scheduled_at: null,
    instructions: 'Handle with care',
    vehicle_id: 'vehicle-1',
    created_at: '2026-06-01T09:00:00Z',
    updated_at: '2026-06-01T09:00:00Z',
  };

  it('SupplierTripRow omits shipper operational fields at type level', () => {
    // @ts-expect-error trip_number must not exist on supplier projection
    const _bad: string | undefined = supplierRow.trip_number;
    expect(_bad).toBeUndefined();
    const mapped = supplierRowToTripRow(supplierRow);
    expect(mapped.booking_ref).toBe('BKG-abc123');
    expect(mapped.organization_id).toBe('');
  });

  it('DriverTripRow omits booking_ref at type level', () => {
    // @ts-expect-error booking_ref must not exist on driver projection
    const _bad: string | undefined = driverRow.booking_ref;
    expect(_bad).toBeUndefined();
    const mapped = driverRowToTripRow(driverRow);
    expect(mapped.driver_display_trip_id).toBe('TRP001');
    expect(mapped.trip_number).toBe('TRP001');
  });

  // ── Regression: driver fleet-vs-open classification ────────────────────────
  // driverRowToTripRow used to hardcode organization_id:'' and source:'assigned'.
  // DriverWalletScreen's isEmployerOrgAtDate starts with `if (!orgId) return false`,
  // so a blank org made EVERY driver trip classify as a non-employer "Direct trip"
  // and the Fleet Trips tab was structurally always empty. Drivers then filed
  // attribution requests for work the app had already recorded.
  describe('driver fleet classification fields', () => {
    it('keeps an offline party tag stored in trip notes', () => {
      const mapped = driverRowToTripRow({
        ...driverRow,
        instructions: '<!--pulse-dco-party:{"id":"local:abc","name":"Ajio","billed":12500}-->',
      });
      expect(mapped.notes).toContain('pulse-dco-party');
      expect(mapped.notes).toContain('Ajio');
    });

    it('passes organization_id through instead of blanking it', () => {
      const mapped = driverRowToTripRow({
        ...driverRow,
        organization_id: 'org-paperkraft',
      });
      expect(mapped.organization_id).toBe('org-paperkraft');
    });

    it('preserves the real source so mover_asset stays identifiable', () => {
      const mapped = driverRowToTripRow({
        ...driverRow,
        source: 'mover_asset',
      });
      expect(mapped.source).toBe('mover_asset');
    });

    it('carries completed_at through for settlement ordering', () => {
      const mapped = driverRowToTripRow({
        ...driverRow,
        completed_at: '2026-07-28T12:49:50Z',
      });
      expect(mapped.completed_at).toBe('2026-07-28T12:49:50Z');
    });

    it('falls back safely when the view omits the fields', () => {
      const mapped = driverRowToTripRow(driverRow);
      expect(mapped.organization_id).toBe('');
      expect(mapped.source).toBe('assigned');
      expect(mapped.completed_at).toBeNull();
    });
  });

  describe('commerce origin from trips_driver_view', () => {
    it('maps a standard FTL row to STANDARD_FTL', () => {
      const mapped = driverRowToTripRow({
        ...driverRow,
        indent_id: 'indent-ftl',
        source_indent_id: null,
        execution_plan_id: null,
        is_commerce: false,
      });
      expect(mapped.execution_plan_id).toBeNull();
      expect(mapped.is_commerce).toBe(false);
      expect(getDriverTripExperience(mapped)).toBe('STANDARD_FTL');
    });

    it('maps Commerce via indent_id to COMMERCE_MULTI_ORDER', () => {
      const mapped = driverRowToTripRow({
        ...driverRow,
        indent_id: 'indent-commerce',
        source_indent_id: null,
        execution_plan_id: 'plan-1',
        is_commerce: true,
      });
      expect(mapped.execution_plan_id).toBe('plan-1');
      expect(mapped.is_commerce).toBe(true);
      expect(getDriverTripExperience(mapped)).toBe('COMMERCE_MULTI_ORDER');
    });

    it('maps Commerce via source_indent_id to COMMERCE_MULTI_ORDER', () => {
      const mapped = driverRowToTripRow({
        ...driverRow,
        indent_id: null,
        source_indent_id: 'indent-mover',
        execution_plan_id: 'plan-mover',
        is_commerce: true,
        source: 'mover_asset',
      });
      expect(mapped.indent_id).toBeNull();
      expect(mapped.source_indent_id).toBe('indent-mover');
      expect(mapped.execution_plan_id).toBe('plan-mover');
      expect(mapped.is_commerce).toBe(true);
      expect(getDriverTripExperience(mapped)).toBe('COMMERCE_MULTI_ORDER');
    });

    it('does not treat extra stops or orders as Commerce without a plan id', () => {
      const mapped = driverRowToTripRow({
        ...driverRow,
        execution_plan_id: null,
        is_commerce: false,
      });
      expect(
        getDriverTripExperience({
          ...mapped,
          stops: 4,
          orders: 6,
        } as never),
      ).toBe('STANDARD_FTL');
    });
  });
});
