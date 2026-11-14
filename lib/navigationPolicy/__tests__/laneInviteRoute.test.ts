/**
 * Rate-request notifications open My Bids → Rate requests. The target must be
 * reachable for carrier org members who can dispatch, and stay closed to
 * drivers and signed-out sessions.
 */
import { evaluateNavigationPolicy } from '@/lib/navigationPolicy/evaluate';
import { buildPrincipal } from '@/lib/navigationPolicy/grants';
import type { PolicySnapshot } from '@/lib/navigationPolicy/types';
import { ROUTES } from '@/lib/routes';

const target = ROUTES.FIND_LOADS_MY_BIDS;
const pathname = target.split('?')[0] ?? target;

function snapshot(principal: PolicySnapshot['principal'], posture: PolicySnapshot['sessionPosture'] = 'authenticated'): PolicySnapshot {
  return { principal, predicates: {}, platform: 'web', sessionPosture: posture };
}

describe('rate-request notification target', () => {
  it('points at the My Bids segment of Find Loads', () => {
    expect(target).toBe('/find-loads?segment=my-bids');
    expect(pathname).toBe('/find-loads');
  });

  it.each([
    ['aggregate', { role: 'user' as const, aggregated: true, asset: false }],
    ['asset', { role: 'user' as const, aggregated: false, asset: true }],
    ['hybrid', { role: 'user' as const, aggregated: true, asset: true }],
  ])('%s carrier org member can open it', (_name, input) => {
    const decision = evaluateNavigationPolicy({ rawPathname: pathname, snapshot: snapshot(buildPrincipal(input)) });
    expect(decision.type).toBe('allow');
  });

  it('drivers and signed-out sessions are redirected', () => {
    const driver = evaluateNavigationPolicy({
      rawPathname: pathname,
      snapshot: snapshot(buildPrincipal({ role: 'driver' })),
    });
    expect(driver.type).toBe('redirect');
    const anon = evaluateNavigationPolicy({ rawPathname: pathname, snapshot: snapshot(null, 'anonymous') });
    expect(anon.type).toBe('redirect');
  });
});
