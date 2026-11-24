import { buildAssignedVehicleDisplay } from '@/features/driver/utils/driverAssignedVehicleDisplay.util';
import type { DriverRow } from '@/features/drivers/services/drivers.service';

describe('buildAssignedVehicleDisplay', () => {
  it('shows Assigned vehicle when only a plate is present', () => {
    const display = buildAssignedVehicleDisplay({
      primaryDriver: { id: 'd1', created_at: '2026-01-15T00:00:00Z' } as DriverRow,
      plateLabel: 'TN 22 AS 2341',
      meta: null,
    });
    expect(display.model).toBe('Assigned vehicle');
    expect(display.plate).toBe('TN 22 AS 2341');
    expect(display.hasAssignment).toBe(true);
  });

  it('joins brand and model when meta exists', () => {
    const display = buildAssignedVehicleDisplay({
      primaryDriver: {
        id: 'd1',
        created_at: '2026-01-15T00:00:00Z',
        organizations: { name: 'Acme Logistics' },
      } as DriverRow,
      plateLabel: 'KA 01 AB 1234',
      meta: { brand: 'Tata', model: '407', type: 'LCV' },
    });
    expect(display.model).toBe('Tata 407');
    expect(display.fleetId).toBe('ACME LOGISTICS'.slice(0, 18));
    expect(display.hasAssignment).toBe(true);
  });

  it('marks no assignment when plate is missing', () => {
    const display = buildAssignedVehicleDisplay({
      primaryDriver: null,
      plateLabel: null,
      meta: null,
    });
    expect(display.model).toBe('No vehicle assigned');
    expect(display.hasAssignment).toBe(false);
  });
});
