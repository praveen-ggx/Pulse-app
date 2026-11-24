jest.mock('@/features/drivers/services/drivers.service', () => ({}));
import { pickActiveFleet } from '../driverActiveFleet.util';

describe('pickActiveFleet', () => {
  it('returns the active employee fleet', () => {
    expect(
      pickActiveFleet([
        { organization_id: 'gk', relationship_status: 'active_employee', organizations: { name: 'GK Logistics' } },
      ]),
    ).toEqual({ orgId: 'gk', name: 'GK Logistics' });
  });

  it('ignores independent / tracking / left / market-award rows (not a fleet)', () => {
    expect(
      pickActiveFleet([
        { organization_id: 'a', relationship_status: 'independent' },
        { organization_id: 'b', relationship_status: 'active_employee', tracking_only: true },
        { organization_id: 'c', relationship_status: 'active_employee', left_at: '2026-11-01' },
        { organization_id: 'd', relationship_status: 'active_employee', relationship_origin: 'market_award' },
        { organization_id: 'e', relationship_status: 'disconnected' },
      ]),
    ).toBeNull();
  });
});
