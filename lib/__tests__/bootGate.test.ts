import {
  isColdStartResolved,
  nextBootSettled,
  shouldShowBootOverlay,
  shouldMountAuthenticatedDataPlane,
  shouldMountRootOverlayTabBar,
  shouldApplyUnsignedDataPlaneRedirect,
  shouldRedirectDataPlaneRouteWithoutSession,
  shouldRenderPublicAuthTree,
  type BootGateInput,
} from '@/lib/bootGate';

const base: BootGateInput = {
  restoring: false,
  hasUser: false,
  hasProfile: false,
  authenticated: false,
  publicRoute: false,
  timedOut: false,
};

const input = (over: Partial<BootGateInput> = {}): BootGateInput => ({ ...base, ...over });

/** Drive a sequence of auth states through the latch, as React would. */
function run(steps: BootGateInput[]) {
  let settled = false;
  return steps.map((step) => {
    const resolved = isColdStartResolved(step);
    // shouldShowBootOverlay reads the pre-update latch, matching render order.
    const overlay = shouldShowBootOverlay(settled, resolved);
    settled = nextBootSettled(settled, resolved);
    return { overlay, settled };
  });
}

describe('isColdStartResolved', () => {
  it('blocks while auth is restoring', () => {
    expect(isColdStartResolved(input({ restoring: true }))).toBe(false);
  });

  it('blocks when a session user has no hydrated profile yet', () => {
    expect(isColdStartResolved(input({ hasUser: true }))).toBe(false);
  });

  it('resolves once the profile hydrates', () => {
    expect(isColdStartResolved(input({ hasUser: true, hasProfile: true }))).toBe(true);
  });

  it('resolves for an authenticated user even before profile hydration', () => {
    expect(isColdStartResolved(input({ hasUser: true, authenticated: true }))).toBe(true);
  });

  it('resolves immediately on public auth routes', () => {
    expect(isColdStartResolved(input({ restoring: true, publicRoute: true }))).toBe(true);
  });

  it('resolves on timeout even while still restoring', () => {
    expect(isColdStartResolved(input({ restoring: true, timedOut: true }))).toBe(true);
  });
});

describe('nextBootSettled', () => {
  it('latches on first resolution', () => {
    expect(nextBootSettled(false, true)).toBe(true);
  });

  it('stays false until cold start resolves', () => {
    expect(nextBootSettled(false, false)).toBe(false);
  });

  it('is monotonic — never returns to false once settled', () => {
    expect(nextBootSettled(true, false)).toBe(true);
  });
});

describe('boot gate lifecycle', () => {
  it('shows the overlay during cold start, then hides it', () => {
    const [restoring, ready] = run([
      input({ restoring: true }),
      input({ hasUser: true, hasProfile: true, authenticated: true }),
    ]);
    expect(restoring.overlay).toBe(true);
    expect(ready.overlay).toBe(false);
    expect(ready.settled).toBe(true);
  });

  // The reported bug: driver -> logout -> login as user hung on "Loading...".
  it('never re-shows the overlay on logout then login as a different role', () => {
    const steps = run([
      input({ restoring: true }),                                              // cold start
      input({ hasUser: true, hasProfile: true, authenticated: true }),          // driver in
      input({ restoring: true }),                                              // signing out
      input({}),                                                               // signed out
      input({ restoring: true }),                                              // logging in
      input({ hasUser: true }),                                                // profile pending
      input({ hasUser: true, hasProfile: true, authenticated: true }),          // user in
    ]);

    expect(steps[0].overlay).toBe(true);
    // Everything after the first resolution must stay unblocked.
    for (const step of steps.slice(1)) {
      expect(step.overlay).toBe(false);
    }
  });

  it('does not re-block on a mid-session token refresh', () => {
    const steps = run([
      input({ hasUser: true, hasProfile: true, authenticated: true }),
      input({ restoring: true, hasUser: true }), // refresh in flight
      input({ hasUser: true, hasProfile: true, authenticated: true }),
    ]);
    expect(steps.every((s) => s.overlay === false)).toBe(true);
  });

  it('does not re-block when an expired session drops to a public route', () => {
    const steps = run([
      input({ hasUser: true, hasProfile: true, authenticated: true }),
      input({ restoring: true }),
      input({ publicRoute: true }),
    ]);
    expect(steps.every((s) => s.overlay === false)).toBe(true);
  });
});

describe('authenticated data-plane mount', () => {
  it('does not mount on cached identity without sessionAttached', () => {
    expect(shouldMountAuthenticatedDataPlane(false)).toBe(false);
  });

  it('mounts only after sessionAttached', () => {
    expect(shouldMountAuthenticatedDataPlane(true)).toBe(true);
  });

  it('keeps public auth tree off while waiting for hydrate even if status is authenticated', () => {
    expect(
      shouldRenderPublicAuthTree({
        sessionAttached: false,
        publicRoute: false,
        status: 'authenticated',
      }),
    ).toBe(false);
  });

  it('renders public auth tree when signed out', () => {
    expect(
      shouldRenderPublicAuthTree({
        sessionAttached: false,
        publicRoute: false,
        status: 'unauthenticated',
      }),
    ).toBe(true);
  });

  it('does not unmount data plane on TOKEN_REFRESHED (sessionAttached stays true)', () => {
    expect(shouldMountAuthenticatedDataPlane(true)).toBe(true);
    expect(
      shouldRenderPublicAuthTree({
        sessionAttached: true,
        publicRoute: false,
        status: 'authenticated',
      }),
    ).toBe(false);
  });
});

describe('root overlay tab bar mount', () => {
  it('does not mount until sessionAttached', () => {
    expect(shouldMountRootOverlayTabBar(false)).toBe(false);
  });

  it('mounts on the authenticated data plane', () => {
    expect(shouldMountRootOverlayTabBar(true)).toBe(true);
  });
});

describe('data-plane route without session', () => {
  it('does not redirect while sessionAttached', () => {
    expect(shouldRedirectDataPlaneRouteWithoutSession(true, '/trip/abc')).toBe(false);
    expect(shouldRedirectDataPlaneRouteWithoutSession(true, '/trips')).toBe(false);
  });

  it('keeps public auth and anonymous landing on the public tree', () => {
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/sign-in')).toBe(false);
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/terminal-website')).toBe(false);
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/auth/callback')).toBe(false);
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/')).toBe(false);
  });

  it('redirects trip, tabs, and driver routes after session loss', () => {
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/trip/abc')).toBe(true);
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/trips')).toBe(true);
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/workspace')).toBe(true);
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/driver-trip/xyz')).toBe(true);
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/compliance')).toBe(true);
  });

  it('redirects when pathname lags on / but segments already match a private route', () => {
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/', ['compliance'])).toBe(true);
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/', ['(tabs)'])).toBe(true);
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/', [])).toBe(false);
    expect(shouldRedirectDataPlaneRouteWithoutSession(false, '/', ['index'])).toBe(false);
  });

  it('holds Redirect until the root Slot/Stack has painted', () => {
    expect(shouldApplyUnsignedDataPlaneRedirect(true, false)).toBe(false);
    expect(shouldApplyUnsignedDataPlaneRedirect(true, true)).toBe(true);
    expect(shouldApplyUnsignedDataPlaneRedirect(false, true)).toBe(false);
  });
});
