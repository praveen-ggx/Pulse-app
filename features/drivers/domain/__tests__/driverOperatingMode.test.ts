import {
  DEFAULT_DRIVER_OPERATING_MODE,
  canAddDcoShippers,
  canManageOwnerVehicles,
  canTagOfflineParty,
  driverHistoryLane,
  driverHistoryLaneLabel,
  driverHistoryTabsForMode,
  driverJobSource,
  isDcoOperatingMode,
  parseDriverOperatingMode,
  splitEmployerRelationships,
} from '../driverOperatingMode';

function serverMode(overrides: Record<string, unknown>) {
  return parseDriverOperatingMode({
    mode: 'DRIVER',
    dco_status: 'NONE',
    is_employee_driver: false,
    has_active_vehicle: false,
    marketplace_allowed: false,
    ...overrides,
  });
}

describe('parseDriverOperatingMode', () => {
  it('A: a normal (employee) driver has no Marketplace access', () => {
    const m = serverMode({ mode: 'DRIVER', is_employee_driver: true });
    expect(m.marketplaceAllowed).toBe(false);
    expect(isDcoOperatingMode(m)).toBe(false);
    expect(canAddDcoShippers(m)).toBe(false);
    expect(canTagOfflineParty(m)).toBe(true);
  });

  it('C: an approved DCO without an active vehicle has no Marketplace access', () => {
    const m = serverMode({ mode: 'DCO_VEHICLE_REQUIRED', dco_status: 'APPROVED' });
    expect(m.marketplaceAllowed).toBe(false);
    expect(isDcoOperatingMode(m)).toBe(true);
  });

  it('D: an approved DCO with an active vehicle has Marketplace access', () => {
    const m = serverMode({
      mode: 'DCO',
      dco_status: 'APPROVED',
      has_active_vehicle: true,
      marketplace_allowed: true,
    });
    expect(m.marketplaceAllowed).toBe(true);
    expect(m.hasActiveVehicle).toBe(true);
    expect(canAddDcoShippers(m)).toBe(true);
    expect(canTagOfflineParty(m)).toBe(true);
  });

  it('L: removing the vehicle leaves a DCO (not an employee) without Marketplace', () => {
    const m = serverMode({ mode: 'DCO_VEHICLE_REQUIRED', dco_status: 'APPROVED' });
    expect(m.mode).toBe('DCO_VEHICLE_REQUIRED');
    expect(m.isEmployeeDriver).toBe(false);
    expect(m.marketplaceAllowed).toBe(false);
  });

  it('suspended and employment-conflict DCO states deny Marketplace', () => {
    expect(serverMode({ mode: 'DCO_SUSPENDED', dco_status: 'SUSPENDED' }).marketplaceAllowed).toBe(false);
    expect(
      serverMode({ mode: 'DCO_EMPLOYMENT_CONFLICT', dco_status: 'APPROVED', is_employee_driver: true })
        .marketplaceAllowed,
    ).toBe(false);
  });

  it('fails closed on missing or inconsistent payloads', () => {
    expect(parseDriverOperatingMode(null)).toEqual(DEFAULT_DRIVER_OPERATING_MODE);
    expect(parseDriverOperatingMode({ mode: 'SOMETHING' }).mode).toBe('DRIVER');
    expect(serverMode({ mode: 'DRIVER', marketplace_allowed: true }).marketplaceAllowed).toBe(false);
    expect(serverMode({ mode: 'DCO', marketplace_allowed: 'true' }).marketplaceAllowed).toBe(false);
  });
});

describe('single owner-operator concept (DCO = Driver-come-Owner = Fleet Owner)', () => {
  it('a normal driver is not a DCO, cannot own vehicles and has no Marketplace', () => {
    const m = serverMode({ mode: 'DRIVER', dco_status: 'NONE' });
    expect(isDcoOperatingMode(m)).toBe(false);
    expect(canManageOwnerVehicles(m)).toBe(false);
    expect(canAddDcoShippers(m)).toBe(false);
    expect(canTagOfflineParty(m)).toBe(true);
    expect(m.marketplaceAllowed).toBe(false);
  });

  it('pending or rejected DCO requests stay a normal driver', () => {
    for (const dco_status of ['PENDING', 'REJECTED']) {
      const m = serverMode({ mode: 'DRIVER', dco_status });
      expect(isDcoOperatingMode(m)).toBe(false);
      expect(canManageOwnerVehicles(m)).toBe(false);
    }
  });

  it('an approved DCO without a vehicle can attach one, but has no Marketplace yet', () => {
    const m = serverMode({ mode: 'DCO_VEHICLE_REQUIRED', dco_status: 'APPROVED' });
    expect(canManageOwnerVehicles(m)).toBe(true);
    expect(m.marketplaceAllowed).toBe(false);
  });

  it('becoming DCO with an attached vehicle yields the canonical owner-operator state', () => {
    const m = serverMode({
      mode: 'DCO',
      dco_status: 'APPROVED',
      has_active_vehicle: true,
      marketplace_allowed: true,
    });
    expect(isDcoOperatingMode(m)).toBe(true);
    expect(canManageOwnerVehicles(m)).toBe(true);
    expect(m.marketplaceAllowed).toBe(true);
    expect(m.isEmployeeDriver).toBe(false);
  });

  it('suspended or still-employed DCOs cannot manage owner vehicles (mirrors is_dco_eligible)', () => {
    expect(canManageOwnerVehicles(serverMode({ mode: 'DCO_SUSPENDED', dco_status: 'SUSPENDED' }))).toBe(false);
    expect(canAddDcoShippers(serverMode({ mode: 'DCO_SUSPENDED', dco_status: 'SUSPENDED' }))).toBe(false);
    expect(canTagOfflineParty(serverMode({ mode: 'DCO_SUSPENDED', dco_status: 'SUSPENDED' }))).toBe(false);
    expect(
      canManageOwnerVehicles(
        serverMode({ mode: 'DCO_EMPLOYMENT_CONFLICT', dco_status: 'APPROVED', is_employee_driver: true }),
      ),
    ).toBe(false);
    expect(
      canAddDcoShippers(
        serverMode({ mode: 'DCO_EMPLOYMENT_CONFLICT', dco_status: 'APPROVED', is_employee_driver: true }),
      ),
    ).toBe(false);
    expect(
      canTagOfflineParty(
        serverMode({ mode: 'DCO_EMPLOYMENT_CONFLICT', dco_status: 'APPROVED', is_employee_driver: true }),
      ),
    ).toBe(false);
  });

  it('there is no separate Fleet Owner state: a legacy flag or mode grants nothing', () => {
    const legacy = serverMode({ mode: 'FLEET_OWNER', is_fleet_owner: true, marketplace_allowed: true });
    expect(legacy.mode).toBe('DRIVER');
    expect(isDcoOperatingMode(legacy)).toBe(false);
    expect(canManageOwnerVehicles(legacy)).toBe(false);
    expect(legacy.marketplaceAllowed).toBe(false);
    expect(Object.keys(legacy).some((k) => /fleet/i.test(k))).toBe(false);
  });

  it('an attached vehicle without DCO approval does not grant owner-operator or Marketplace', () => {
    const m = serverMode({
      mode: 'DRIVER',
      dco_status: 'NONE',
      has_active_vehicle: true,
      marketplace_allowed: true,
    });
    expect(isDcoOperatingMode(m)).toBe(false);
    expect(canManageOwnerVehicles(m)).toBe(false);
    expect(m.marketplaceAllowed).toBe(false);
  });

  it('Marketplace bid authorization is only marketplaceAllowed — never isFleetOwner OR isDCO', () => {
    const dco = serverMode({
      mode: 'DCO',
      dco_status: 'APPROVED',
      has_active_vehicle: true,
      marketplace_allowed: true,
    });
    const driver = serverMode({ mode: 'DRIVER', is_employee_driver: true });
    expect(dco.marketplaceAllowed).toBe(true);
    expect(driver.marketplaceAllowed).toBe(false);
    expect('isFleetOwner' in dco).toBe(false);
    expect('is_fleet_owner' in dco).toBe(false);
  });
});

describe('splitEmployerRelationships', () => {
  const employer = {
    id: 'a',
    left_at: null,
    relationship_status: 'active_employee',
    relationship_origin: 'invite_accepted',
  };
  const phoneAssigned = {
    id: 'b',
    left_at: null,
    relationship_status: 'independent',
    relationship_origin: 'phone_assignment',
  };
  const formerEmployer = {
    id: 'c',
    left_at: '2026-09-01T00:00:00Z',
    relationship_status: 'disconnected',
    relationship_origin: 'invite_accepted',
  };
  const marketAwardStub = {
    id: 'd',
    left_at: null,
    relationship_status: 'independent',
    relationship_origin: 'market_award',
  };

  it('B: a normal driver sees the businesses that assign their jobs', () => {
    const { current } = splitEmployerRelationships([employer, phoneAssigned]);
    expect(current.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('G: a Marketplace award stub is never an employer', () => {
    const { current, previous } = splitEmployerRelationships([marketAwardStub]);
    expect(current).toHaveLength(0);
    expect(previous).toHaveLength(0);
  });

  it('J: a former employer stays visible as a previous fleet after becoming DCO', () => {
    const { current, previous } = splitEmployerRelationships([formerEmployer, marketAwardStub]);
    expect(current).toHaveLength(0);
    expect(previous.map((r) => r.id)).toEqual(['c']);
  });

  it('K: history is never promoted to a current employer', () => {
    const { current } = splitEmployerRelationships([formerEmployer]);
    expect(current).toHaveLength(0);
  });
});

describe('driverJobSource', () => {
  it('F: a Marketplace award is classified from trips.source, in DCO or legacy FLEET mode', () => {
    expect(driverJobSource({ source: 'market_bid', operating_mode: 'DCO' })).toBe('marketplace_award');
    expect(driverJobSource({ source: 'market_bid', operating_mode: 'FLEET' })).toBe('marketplace_award');
  });

  it('other DCO-mode trips are DCO work, never business-assigned', () => {
    expect(driverJobSource({ source: 'direct_bid', operating_mode: 'DCO' })).toBe('dco_direct');
  });

  it('B: FLEET trips are business-assigned', () => {
    expect(driverJobSource({ source: 'indent', operating_mode: 'FLEET' })).toBe('business_assigned');
    expect(driverJobSource({ source: null, operating_mode: null })).toBe('business_assigned');
  });

  it('a DCO Marketplace award is operated as Marketplace work, not an employee assignment', () => {
    expect(driverJobSource({ source: 'market_bid', operating_mode: 'DCO' })).toBe('marketplace_award');
    expect(driverJobSource({ source: 'market_bid', operating_mode: 'DCO' })).not.toBe(
      'business_assigned',
    );
  });
});

describe('driverHistoryLane / driverHistoryTabsForMode', () => {
  it('Marketplace conversion is always the marketplace lane', () => {
    expect(driverHistoryLane({ source: 'market_bid' }, true)).toBe('marketplace');
    expect(driverHistoryLane({ source: 'market_bid' }, false)).toBe('marketplace');
  });

  it('shipper phone assignment (not fleet, not market) is offline', () => {
    expect(driverHistoryLane({ source: 'manual', operating_mode: 'DCO' }, false)).toBe('offline');
    expect(driverHistoryLane({ source: null, operating_mode: 'FLEET' }, false)).toBe('offline');
  });

  it('connected fleet-employer assignment is fleet when not a market award', () => {
    expect(driverHistoryLane({ source: 'indent' }, true)).toBe('fleet');
  });

  it('DCO history chips are Offline + Marketplace; employee chips are Fleet + Offline', () => {
    expect(driverHistoryTabsForMode(true)).toEqual(['offline', 'marketplace']);
    expect(driverHistoryTabsForMode(false)).toEqual(['fleet', 'offline']);
  });

  it('labels DCO as offline/marketplace and employee as offline/fleet', () => {
    expect(driverHistoryLaneLabel('marketplace')).toBe('Marketplace trip');
    expect(driverHistoryLaneLabel('offline')).toBe('Offline trip');
    expect(driverHistoryLaneLabel('fleet')).toBe('Fleet trip');
  });
});
