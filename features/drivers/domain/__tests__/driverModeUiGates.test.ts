/**
 * Targeted gates for the four preprod UI defects (Add Client / Capture /
 * Receivable / Wallet labels). Pure domain — no React Query.
 */
import {
  canManageDcoSelfBook,
  canManageIndieBook,
  canTagOfflineParty,
  driverOfflinePartyBookKicker,
  driverWalletBookTabLabel,
  parseDriverOperatingMode,
  type DriverOperatingMode,
} from '../driverOperatingMode';

function mode(overrides: Record<string, unknown>): DriverOperatingMode {
  return parseDriverOperatingMode({
    mode: 'DRIVER',
    dco_status: 'NONE',
    is_employee_driver: false,
    has_active_vehicle: false,
    marketplace_allowed: false,
    ...overrides,
  });
}

/** Mirrors the Add Client redirect rule: never leave while mode is unresolved. */
function shouldLeaveAddClient(args: {
  modeLoading: boolean;
  operatingMode: DriverOperatingMode;
  modeReady: boolean;
}): boolean {
  if (args.modeLoading || !args.modeReady) return false;
  return !canTagOfflineParty(args.operatingMode);
}

/** Mirrors capture/receivable book selection after mode settle. */
function captureBookKind(m: DriverOperatingMode): 'dco_self' | 'driver_indie' | 'employer_or_exchange' {
  if (canManageDcoSelfBook(m)) return 'dco_self';
  if (canManageIndieBook(m)) return 'driver_indie';
  return 'employer_or_exchange';
}

describe('driver mode UI gates (defects A–D)', () => {
  it('A: independent DRIVER may open Add Client once mode is ready', () => {
    const indie = mode({ mode: 'DRIVER', is_employee_driver: false });
    expect(
      shouldLeaveAddClient({ modeLoading: true, operatingMode: indie, modeReady: false }),
    ).toBe(false);
    expect(
      shouldLeaveAddClient({ modeLoading: false, operatingMode: indie, modeReady: true }),
    ).toBe(false);
    expect(canTagOfflineParty(indie)).toBe(true);
    expect(canManageIndieBook(indie)).toBe(true);
    expect(canManageDcoSelfBook(indie)).toBe(false);
  });

  it('A: fleet employee still cannot open offline Add Client', () => {
    const employee = mode({ mode: 'DRIVER', is_employee_driver: true });
    expect(
      shouldLeaveAddClient({ modeLoading: false, operatingMode: employee, modeReady: true }),
    ).toBe(true);
  });

  it('B: capture book routing is mutually exclusive across modes', () => {
    expect(captureBookKind(mode({ mode: 'DRIVER', is_employee_driver: false }))).toBe(
      'driver_indie',
    );
    expect(captureBookKind(mode({ mode: 'DCO', marketplace_allowed: true }))).toBe('dco_self');
    expect(captureBookKind(mode({ mode: 'DRIVER', is_employee_driver: true }))).toBe(
      'employer_or_exchange',
    );
  });

  it('C: indie and DCO never share a receivable book kind', () => {
    const indie = mode({ mode: 'DRIVER', is_employee_driver: false });
    const dco = mode({ mode: 'DCO', marketplace_allowed: true });
    expect(captureBookKind(indie)).not.toBe(captureBookKind(dco));
    expect(canManageIndieBook(dco)).toBe(false);
    expect(canManageDcoSelfBook(indie)).toBe(false);
  });

  it('D: wallet terminology follows operating mode', () => {
    expect(driverWalletBookTabLabel(mode({ mode: 'DRIVER', is_employee_driver: false }))).toBe(
      'Independent',
    );
    expect(driverWalletBookTabLabel(mode({ mode: 'DRIVER', is_employee_driver: true }))).toBe(
      'Fleet',
    );
    expect(driverWalletBookTabLabel(mode({ mode: 'DCO', marketplace_allowed: true }))).toBe(
      'Self',
    );
    expect(driverOfflinePartyBookKicker(mode({ mode: 'DRIVER', is_employee_driver: false }))).toBe(
      'Saved customers',
    );
  });
});
