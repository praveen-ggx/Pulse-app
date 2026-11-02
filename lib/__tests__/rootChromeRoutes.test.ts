import {
  overlayActiveTab,
  overlayPathForTab,
  pathnameHasRootTopNav,
} from '../rootChromeRoutes';
import { ROUTES } from '../routes';

describe('root chrome overlay', () => {
  it('keeps the primary dock on Load Center and Compliance', () => {
    expect(pathnameHasRootTopNav(ROUTES.PULSE_LOADS)).toBe(true);
    expect(pathnameHasRootTopNav(ROUTES.FIND_LOADS)).toBe(true);
    expect(pathnameHasRootTopNav(ROUTES.COMPLIANCE)).toBe(true);
    expect(pathnameHasRootTopNav(`${ROUTES.COMPLIANCE}/report`)).toBe(true);
    expect(pathnameHasRootTopNav(ROUTES.PULSE_INVOICE)).toBe(true);
    expect(pathnameHasRootTopNav(ROUTES.TABS.NETWORK)).toBe(false);
  });

  it('highlights Load vs Compliance from the overlay pathname', () => {
    expect(overlayActiveTab(ROUTES.PULSE_LOADS)).toBe('loadCenter');
    expect(overlayActiveTab(ROUTES.COMPLIANCE)).toBe('compliance');
    expect(overlayActiveTab(ROUTES.PULSE_INVOICE)).toBe('invoice');
    expect(overlayPathForTab('loadCenter')).toBe(ROUTES.PULSE_LOADS);
    expect(overlayPathForTab('compliance')).toBe(ROUTES.COMPLIANCE);
    expect(overlayPathForTab('invoice')).toBe(ROUTES.PULSE_INVOICE);
  });
});
