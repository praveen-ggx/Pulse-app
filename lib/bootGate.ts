/**
 * Boot gate decision logic — pure, so the cold-start invariant is testable
 * without a render harness.
 *
 * WHY THIS IS A SEPARATE MODULE
 * -----------------------------
 * `AppBootGate` covers exactly one transition: native splash -> first paint.
 * The subtle trap is that `status === 'restoring'` is not a cold-start signal —
 * AuthContext re-enters it on sign-out, token refresh and re-auth too. Gating
 * the overlay on it directly makes an in-app logout -> login re-show the
 * cold-start splash, which previously had no path back off screen (the
 * splash-hide was behind a one-way latch) and hung the app on "Loading...".
 *
 * Keeping the rule here as a pure reducer means the monotonic invariant is
 * pinned by unit tests instead of living only in a comment.
 */

/** Auth-derived inputs the gate is allowed to consider. */
export interface BootGateInput {
  /** True while auth has not resolved yet — includes post-boot transitions. */
  restoring: boolean;
  /** True when a session user exists. */
  hasUser: boolean;
  /** True when the user's profile has hydrated. */
  hasProfile: boolean;
  /** True when auth reached a fully authenticated state. */
  authenticated: boolean;
  /** True on routes that render without resolved auth state. */
  publicRoute: boolean;
  /** True once the hard boot timeout has elapsed. */
  timedOut: boolean;
}

/**
 * Whether *cold start* has resolved far enough to paint.
 *
 * Only meaningful before the gate latches; callers must not consult it
 * afterwards (see `nextBootSettled`).
 */
export function isColdStartResolved(input: BootGateInput): boolean {
  // Safety valve first: never let a stalled dependency pin the splash forever.
  if (input.timedOut) return true;
  // Public auth pages render immediately — no need to wait for session restore.
  if (input.publicRoute) return true;
  if (input.restoring) return false;
  // A session user whose profile has not hydrated is still mid-boot.
  if (input.hasUser && !input.hasProfile && !input.authenticated) return false;
  return true;
}

/**
 * Advance the latch. Monotonic by construction: once `settled` is true it can
 * never return to false, so post-boot auth churn cannot re-show the overlay.
 */
export function nextBootSettled(settled: boolean, coldStartResolved: boolean): boolean {
  return settled || coldStartResolved;
}

/**
 * The single render decision: show the blocking overlay?
 *
 * False forever once the gate has settled — this is the property that fixes the
 * logout -> login hang.
 */
export function shouldShowBootOverlay(settled: boolean, coldStartResolved: boolean): boolean {
  return !settled && !coldStartResolved;
}

const PUBLIC_AUTH_ROUTES = new Set([
  '/sign-in',
  '/sign-up',
  '/driver-signup',
  '/driver-sign-in',
  '/welcome',
  '/forgot-password',
  '/auth/reset-password',
  '/auth/callback',
  '/auth/loading',
  '/onboarding',
  '/terminal-website',
]);

export function isPublicAuthRoute(pathname: string): boolean {
  if (PUBLIC_AUTH_ROUTES.has(pathname)) return true;
  return pathname.startsWith('/onboarding/');
}

/**
 * Overlay tab bar (and useMemberCapabilities) belongs only after the
 * Supabase JS session is attached — the same boundary as the data plane.
 * Pathname is not enough: PublicAuthTree also covers signed-out `/` and
 * expired sessions on non-public routes.
 */
export function shouldMountRootOverlayTabBar(sessionAttached: boolean): boolean {
  return sessionAttached;
}

/** Authenticated org/GlobalSync/nav data plane — only after JS client session attach. */
export function shouldMountAuthenticatedDataPlane(sessionAttached: boolean): boolean {
  return sessionAttached;
}

function firstNonGroupSegment(segments: readonly string[]): string | undefined {
  return segments.find((segment) => segment.length > 0 && !segment.startsWith('('));
}

/**
 * PublicAuthTree still mounts RootLayoutNav (shared Stack). After token
 * failure / sign-out, the URL may still be a data-plane route (trip, tabs,
 * driver, compliance). Those screens call useOrganization — they must not
 * render without the provider. Index `/` stays mounted so NavigationPolicy
 * can send anonymous users to marketing.
 *
 * Expo can report pathname `/` for one frame while `useSegments()` already
 * matches a private file route (e.g. `compliance`). Segments win in that race.
 */
export function shouldRedirectDataPlaneRouteWithoutSession(
  sessionAttached: boolean,
  pathname: string,
  segments: readonly string[] = [],
): boolean {
  if (sessionAttached) return false;
  if (isPublicAuthRoute(pathname)) return false;

  const first = segments[0];
  if (first === '(tabs)' || first === '(driver)' || first === '(modals)') return true;

  const routeRoot = firstNonGroupSegment(segments);
  if (routeRoot && isPublicAuthRoute(`/${routeRoot}`)) return false;
  if ((pathname === '/' || pathname === '') && routeRoot && routeRoot !== 'index') {
    return true;
  }

  if (pathname === '/' || pathname === '') return false;
  return true;
}

/**
 * Expo Router throws if `<Redirect>` / `router.replace` runs before the root
 * layout has painted a Slot/Stack. Hold the unsigned bounce until then.
 */
export function shouldApplyUnsignedDataPlaneRedirect(
  bounce: boolean,
  rootNavigatorMounted: boolean,
): boolean {
  return bounce && rootNavigatorMounted;
}

/**
 * Public sign-in tree without org providers. Waiting for hydrate (cached JWT,
 * status may already be authenticated) is neither this nor the data plane —
 * that path is splash-only.
 */
export function shouldRenderPublicAuthTree(input: {
  sessionAttached: boolean;
  publicRoute: boolean;
  status: 'restoring' | 'authenticated' | 'unauthenticated' | 'expired';
}): boolean {
  if (input.sessionAttached) return false;
  return (
    input.publicRoute ||
    input.status === 'unauthenticated' ||
    input.status === 'expired'
  );
}
