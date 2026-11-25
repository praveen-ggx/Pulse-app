/**
 * Module-level guard so `app/index.tsx` redirects once per user session,
 * even when React Navigation keeps multiple Index mounts alive (web HMR, stack).
 */
let bootRedirectUid: string | null = null;
/** One browser-URL restore per href. Repeating replace() trips Safari's history limit and remounts the splash forever. */
let webRefreshHrefClaimed: string | null = null;

export function hasIndexBootRedirected(uid: string): boolean {
  return bootRedirectUid === uid;
}

/** Returns true when this caller should perform the redirect. */
export function claimIndexBootRedirect(uid: string): boolean {
  if (bootRedirectUid === uid) return false;
  bootRedirectUid = uid;
  return true;
}

/** Returns true the first time this browser href should be restored. */
export function claimWebRefreshRedirect(href: string): boolean {
  if (!href || webRefreshHrefClaimed === href) return false;
  webRefreshHrefClaimed = href;
  return true;
}

export function resetIndexBootRedirect(): void {
  bootRedirectUid = null;
  webRefreshHrefClaimed = null;
  freshSignInLanding = false;
  writeFreshSignInStorage(false);
}

/**
 * Set when email or OAuth sign-in has no explicit product deep link.
 * Index consumes it once and opens the member's top-nav page instead of
 * the last Network hub or workspace sidebar.
 * sessionStorage survives the OAuth full-page hop into `/`.
 */
const FRESH_SIGN_IN_KEY = 'app:fresh_sign_in_landing';
let freshSignInLanding = false;

function readFreshSignInStorage(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(FRESH_SIGN_IN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFreshSignInStorage(pending: boolean): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (pending) sessionStorage.setItem(FRESH_SIGN_IN_KEY, '1');
    else sessionStorage.removeItem(FRESH_SIGN_IN_KEY);
  } catch {
    // Private mode / unavailable
  }
}

export function markFreshSignInLanding(): void {
  freshSignInLanding = true;
  writeFreshSignInStorage(true);
}

export function peekFreshSignInLanding(): boolean {
  return freshSignInLanding || readFreshSignInStorage();
}

export function consumeFreshSignInLanding(): boolean {
  const pending = peekFreshSignInLanding();
  freshSignInLanding = false;
  writeFreshSignInStorage(false);
  return pending;
}

function pathAndSearch(href: string): { path: string; search: string } {
  const raw = (href ?? '').trim();
  const hashless = raw.split('#')[0] ?? raw;
  const qIndex = hashless.indexOf('?');
  const path = qIndex >= 0 ? hashless.slice(0, qIndex) : hashless;
  const search = qIndex >= 0 ? hashless.slice(qIndex + 1) : '';
  return { path, search };
}

/**
 * Destinations that are the app shell, not a top-nav work page.
 * Fresh sign-in replaces these with the member's accessible top-nav page.
 */
export function isPostAuthShellLanding(href: string): boolean {
  const { path, search } = pathAndSearch(href);
  if (!path || path === '/') return true;
  if (path === '/network' || path === '/(tabs)/network') return true;
  if (path.includes('/network/hub')) {
    const tab = new URLSearchParams(search).get('tab');
    return !tab || tab === 'profile' || tab === 'details';
  }
  if (path === '/workspace' || path.endsWith('/workspace')) {
    return !new URLSearchParams(search).get('panel');
  }
  return false;
}

/**
 * Top-nav pages a member can open after sign-in.
 * Order is the landing priority: a work surface first, Network hub last.
 */
export type SignedInHomeAccess = {
  trips: boolean;
  loadCenter: boolean;
  finance: boolean;
  compliance: boolean;
  network: boolean;
};

/**
 * First top-nav page this member can open.
 * Network is the fallback — it is the hub, not the default work surface.
 */
export function resolveSignedInHomeRoute(access: SignedInHomeAccess): string {
  if (access.trips) return '/(tabs)/trips';
  if (access.loadCenter) return '/find-loads';
  if (access.finance) return '/(tabs)/finance';
  if (access.compliance) return '/compliance';
  if (access.network) return '/(tabs)/network';
  return '/(tabs)/trips';
}

/** Workspace overlay with no panel — the sidebar hub, not a detail page. */
export function isWorkspaceSidebarRoute(href: string): boolean {
  const { path, search } = pathAndSearch(href);
  if (path !== '/workspace' && !path.endsWith('/workspace')) return false;
  return !new URLSearchParams(search).get('panel');
}

/**
 * True when the app is already past the index boot gate (`/`).
 * Any real screen — tabs, trip detail, vehicle, auth — must not be stolen
 * by the last-tab cold-start redirect.
 */
export function isPastIndexBootPath(pathname: string): boolean {
  if (!pathname || pathname === '/') return false;
  return true;
}

export type BrowserLocation = {
  pathname: string;
  search: string;
};

/** Safe read of `window.location` (web only; RN may polyfill `window` without location). */
export function getBrowserLocation(): BrowserLocation | null {
  if (typeof window === 'undefined' || !window.location) return null;
  const pathname =
    typeof window.location.pathname === 'string' ? window.location.pathname : '';
  const search =
    typeof window.location.search === 'string' ? window.location.search : '';
  return { pathname, search };
}

function normalizeSearch(search: string): string {
  if (!search || search === '?') return '';
  return search.startsWith('?') ? search : `?${search}`;
}

/**
 * Expo web often mounts `app/index` (`/`) on a hard refresh even when the
 * browser URL is still `/trip/:id`. Return that browser href so Index can
 * `replace` back onto the page the user refreshed — instead of last-tab home.
 *
 * Returns null when no extra navigation is needed.
 */
export function resolveWebRefreshHref(
  expoPathname: string,
  browserPathname: string,
  browserSearch = '',
): string | null {
  const browser = (browserPathname || '').trim();
  if (!browser || browser === '/') return null;

  const expo = (expoPathname || '').trim() || '/';
  if (expo === browser) return null;
  if (expo !== '/' && expo !== '') return null;

  return `${browser}${normalizeSearch(browserSearch)}`;
}
