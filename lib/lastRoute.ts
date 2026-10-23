/**
 * Persist and restore the last visited route.
 *
 * On native, the app cold-starts at `app/index.tsx` (`/`). On web, a hard
 * refresh of a deep screen (e.g. `/trip/:id`) can also remount Index at `/`.
 * This module remembers the last bookmarkable tab **and** the last full path
 * so refresh stays on the current page instead of jumping to trips home.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isPublicAuthOrMarketingPath, sanitizeReturnTo } from './navigationPolicy/returnTo';
import {
  BOOKMARKABLE_TABS,
  DEFAULT_DISPATCHER_ROUTE,
  ROUTES,
  type BookmarkableTab,
} from './routes';

const STORAGE_KEY = 'app:last_tab_route';
const FULL_PATH_KEY = 'app:last_full_path';

function isBookmarkableTab(route: string): route is BookmarkableTab {
  return (BOOKMARKABLE_TABS as readonly string[]).includes(route);
}

function isNetworkHubRoute(route: string): boolean {
  return (
    route === ROUTES.networkOrgHub() ||
    route === ROUTES.networkOrgHub('details') ||
    route.startsWith('/(tabs)/network/hub') ||
    route.startsWith('/network/hub')
  );
}

/** Map current pathname to a storable dispatcher route (tabs or network hub). */
export function resolveRestorableDispatcherRoute(pathname: string): string | null {
  const path = pathname?.trim() || '';
  if (!path || path === '/') return null;

  if (path.includes('/network/hub')) {
    const tabMatch = path.match(/[?&]tab=([^&]+)/);
    const tab = tabMatch?.[1];
    const allowed = new Set([
      'details',
      'team',
      'profile',
      'sales',
      'goals',
      'asset',
      'connections',
      'grow',
      'chat',
    ]);
    if (tab && allowed.has(tab)) {
      const mapped = tab === 'details' ? 'profile' : tab;
      return ROUTES.networkOrgHub(mapped as Parameters<typeof ROUTES.networkOrgHub>[0]);
    }
    return ROUTES.networkOrgHub('profile');
  }

  if (path === '/trips' || path.endsWith('/trips') || path.includes('/(tabs)/trips')) {
    return ROUTES.TABS.TRIPS;
  }
  if (path === '/finance' || path.endsWith('/finance') || path.includes('/(tabs)/finance')) {
    return ROUTES.TABS.FINANCE;
  }
  if (path === '/network' || path.endsWith('/network') || path.includes('/(tabs)/network')) {
    return ROUTES.TABS.NETWORK;
  }

  return null;
}

function isRestorableRoute(route: string): boolean {
  return isBookmarkableTab(route) || isNetworkHubRoute(route);
}

function readSessionFullPath(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const stored = sessionStorage.getItem(FULL_PATH_KEY);
    return stored ? resolveRestorableFullPath(stored) : null;
  } catch {
    return null;
  }
}

function writeSessionFullPath(path: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(FULL_PATH_KEY, path);
  } catch {
    // Private mode / unavailable
  }
}

function isSafeSearch(search: string): boolean {
  if (!search || search === '?') return false;
  if (/https?:/i.test(search) || search.includes('//')) return false;
  return true;
}

/**
 * Allow-list a full app path (trip, vehicle, tabs, …) for refresh restore.
 * Drops auth/marketing destinations and open-redirect shaped values.
 */
export function resolveRestorableFullPath(href: string): string | null {
  const raw = (href ?? '').trim();
  if (!raw) return null;
  const hashless = raw.split('#')[0] ?? raw;
  const qIndex = hashless.indexOf('?');
  const pathPart = qIndex >= 0 ? hashless.slice(0, qIndex) : hashless;
  const searchPart = qIndex >= 0 ? hashless.slice(qIndex) : '';
  const safe = sanitizeReturnTo(pathPart);
  if (!safe) return null;
  if (isPublicAuthOrMarketingPath(safe)) return null;
  if (isSafeSearch(searchPart)) return `${safe}${searchPart}`;
  return safe;
}

/**
 * Persist the current dispatcher route so it can be restored on cold start.
 */
export async function saveLastTabRoute(route: string): Promise<void> {
  if (!isRestorableRoute(route)) return;
  await AsyncStorage.setItem(STORAGE_KEY, route).catch(() => {});
}

/**
 * Returns the last persisted dispatcher route, or the default trips tab.
 */
export async function getLastTabRoute(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && isRestorableRoute(stored)) return stored;
  } catch {
    // Storage unavailable — use default
  }
  return DEFAULT_DISPATCHER_ROUTE;
}

/**
 * Persist the current screen (including `/trip/:id`) so a refresh/cold start
 * can restore it instead of only the last tab.
 */
export async function saveLastFullPath(href: string): Promise<void> {
  const restorable = resolveRestorableFullPath(href);
  if (!restorable) return;
  writeSessionFullPath(restorable);
  await AsyncStorage.setItem(FULL_PATH_KEY, restorable).catch(() => {});
}

/**
 * Remember the live screen. Prefers the browser URL on web so we don't persist
 * `/` while Expo still has Index focused during a deep-link refresh.
 */
export function rememberCurrentPath(pathname: string): void {
  let href = pathname ?? '';
  try {
    if (typeof window !== 'undefined' && window.location?.pathname) {
      const locPath = window.location.pathname;
      if (locPath && locPath !== '/') {
        href = `${locPath}${window.location.search || ''}`;
      }
    }
  } catch {
    // Native / no location
  }
  const restorable = resolveRestorableFullPath(href);
  if (!restorable) return;
  void saveLastFullPath(restorable);
}

/**
 * Last full path if one was stored (sessionStorage first — same-tab refresh).
 * Returns null when nothing restorable is stored (caller falls back to last tab).
 */
export async function getLastFullPath(): Promise<string | null> {
  const fromSession = readSessionFullPath();
  if (fromSession) return fromSession;
  try {
    const stored = await AsyncStorage.getItem(FULL_PATH_KEY);
    return stored ? resolveRestorableFullPath(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Drop the stored full path when it is `href` (e.g. a trip that no longer
 * loads), so cold start falls back to the last tab instead of reopening it.
 */
export async function forgetLastFullPath(href: string): Promise<void> {
  const target = resolveRestorableFullPath(href)?.split('?')[0];
  if (!target) return;
  // Same screen with any query (`/trip/:id?tab=docs`) counts as a match.
  const matches = (stored: string | null) => stored != null && stored.split('?')[0] === target;
  try {
    if (typeof sessionStorage !== 'undefined' && matches(sessionStorage.getItem(FULL_PATH_KEY))) {
      sessionStorage.removeItem(FULL_PATH_KEY);
    }
  } catch {
    // Private mode / unavailable
  }
  try {
    if (matches(await AsyncStorage.getItem(FULL_PATH_KEY))) {
      await AsyncStorage.removeItem(FULL_PATH_KEY);
    }
  } catch {
    // Storage unavailable
  }
}

/**
 * Cold-start destination: last full screen, else last tab, else trips.
 */
export async function getLastRestorableRoute(): Promise<string> {
  const full = await getLastFullPath();
  if (full) return full;
  return getLastTabRoute();
}
