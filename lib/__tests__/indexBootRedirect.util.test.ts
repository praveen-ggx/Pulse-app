import {
  consumeFreshSignInLanding,
  isPastIndexBootPath,
  isPostAuthShellLanding,
  isWorkspaceSidebarRoute,
  markFreshSignInLanding,
  peekFreshSignInLanding,
  resetIndexBootRedirect,
  resolveWebRefreshHref,
} from '@/lib/indexBootRedirect.util';

describe('isPastIndexBootPath', () => {
  it('treats only boot `/` as the index gate', () => {
    expect(isPastIndexBootPath('/')).toBe(false);
    expect(isPastIndexBootPath('')).toBe(false);
  });

  it('does not steal deep screens on refresh', () => {
    expect(isPastIndexBootPath('/trip/abc')).toBe(true);
    expect(isPastIndexBootPath('/trip/abc/verification')).toBe(true);
    expect(isPastIndexBootPath('/vehicle/abc')).toBe(true);
    expect(isPastIndexBootPath('/trips')).toBe(true);
    expect(isPastIndexBootPath('/finance')).toBe(true);
    expect(isPastIndexBootPath('/capture-payment')).toBe(true);
    expect(isPastIndexBootPath('/receivable/untagged')).toBe(true);
    expect(isPastIndexBootPath('/add-client')).toBe(true);
  });
});

describe('resolveWebRefreshHref', () => {
  it('syncs Index `/` to the browser trip URL so refresh stays on the page', () => {
    expect(resolveWebRefreshHref('/', '/trip/abc', '?tab=docs')).toBe(
      '/trip/abc?tab=docs',
    );
  });

  it('preserves cold driver capture-payment deep links with query params', () => {
    expect(
      resolveWebRefreshHref('/', '/capture-payment', '?tripId=abc&lane=shipper'),
    ).toBe('/capture-payment?tripId=abc&lane=shipper');
  });

  it('does nothing when Expo is already on the browser path', () => {
    expect(resolveWebRefreshHref('/trip/abc', '/trip/abc', '?tab=docs')).toBeNull();
  });

  it('does nothing on a true `/` boot', () => {
    expect(resolveWebRefreshHref('/', '/', '')).toBeNull();
  });

  it('does not fight when Expo is already on another deep route', () => {
    expect(resolveWebRefreshHref('/trips', '/trip/abc', '')).toBeNull();
  });
});

describe('post-auth shell landing', () => {
  it('treats the hub and workspace sidebar as shell landings', () => {
    expect(isPostAuthShellLanding('/')).toBe(true);
    expect(isPostAuthShellLanding('/network')).toBe(true);
    expect(isPostAuthShellLanding('/network/hub')).toBe(true);
    expect(isPostAuthShellLanding('/network/hub?tab=profile')).toBe(true);
    expect(isPostAuthShellLanding('/workspace')).toBe(true);
  });

  it('keeps an explicit work page or workspace detail', () => {
    expect(isPostAuthShellLanding('/trips')).toBe(false);
    expect(isPostAuthShellLanding('/finance')).toBe(false);
    expect(isPostAuthShellLanding('/pulse-loads')).toBe(false);
    expect(isPostAuthShellLanding('/compliance')).toBe(false);
    expect(isPostAuthShellLanding('/workspace?panel=account')).toBe(false);
    expect(isPostAuthShellLanding('/network/hub?tab=sales')).toBe(false);
    expect(isPostAuthShellLanding('/oms/dashboard')).toBe(false);
  });

  it('recognizes the workspace sidebar without a panel', () => {
    expect(isWorkspaceSidebarRoute('/workspace')).toBe(true);
    expect(isWorkspaceSidebarRoute('/workspace?panel=settings')).toBe(false);
    expect(isWorkspaceSidebarRoute('/network')).toBe(false);
  });

  it('remembers a fresh sign-in until index consumes it', () => {
    resetIndexBootRedirect();
    expect(peekFreshSignInLanding()).toBe(false);
    markFreshSignInLanding();
    expect(peekFreshSignInLanding()).toBe(true);
    expect(consumeFreshSignInLanding()).toBe(true);
    expect(peekFreshSignInLanding()).toBe(false);
  });
});
