import { ROUTES } from '@/lib/routes';
import { pathnameUsesExpoProductShell } from '@/lib/suite/suiteProducts';

export type OverlayDockTabId =
  | 'finance'
  | 'trips'
  | 'network'
  | 'loadCenter'
  | 'compliance'
  | 'invoice'
  | 'resources';

/**
 * Root stack routes that render {@link RootOverlayTabBar} on desktop web.
 * Navigation overlay and route loading must not cover that chrome.
 * Finance Pro and POD keep their own product chrome. Invoice stays on this dock.
 *
 * Load Center and Compliance live outside `(tabs)`, so both must keep the same
 * primary dock — otherwise tapping Load unmounts the tabs layout and drops
 * the Compliance item.
 */
export const ROOT_TOP_NAV_PATHS = [
  ROUTES.PULSE_LOADS,
  ROUTES.FIND_LOADS,
  ROUTES.COMPLIANCE,
  ROUTES.PULSE_INVOICE,
  ROUTES.INVOICING_EXECUTE,
] as const;

function isInvoiceDockPath(pathname: string): boolean {
  return (
    pathname === ROUTES.PULSE_INVOICE ||
    pathname.startsWith(`${ROUTES.PULSE_INVOICE}/`) ||
    pathname === ROUTES.INVOICING_EXECUTE ||
    pathname.startsWith(`${ROUTES.INVOICING_EXECUTE}/`)
  );
}

export function pathnameHasRootTopNav(pathname: string): boolean {
  if (!pathname) return false;
  if (isInvoiceDockPath(pathname)) return true;
  if (pathnameUsesExpoProductShell(pathname)) return false;
  return ROOT_TOP_NAV_PATHS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function overlayActiveTab(pathname: string): OverlayDockTabId {
  if (
    pathname === ROUTES.PULSE_LOADS ||
    pathname === ROUTES.FIND_LOADS ||
    pathname.startsWith(`${ROUTES.FIND_LOADS}/`)
  ) {
    return 'loadCenter';
  }
  if (pathname === ROUTES.COMPLIANCE || pathname.startsWith(`${ROUTES.COMPLIANCE}/`)) {
    return 'compliance';
  }
  if (isInvoiceDockPath(pathname)) return 'invoice';
  if (pathname.includes('/finance')) return 'finance';
  if (pathname.includes('/trips')) return 'trips';
  if (pathname.includes('/network') || pathname.includes('/hub')) return 'network';
  return 'loadCenter';
}

export function overlayPathForTab(tab: OverlayDockTabId): string {
  if (tab === 'finance') return ROUTES.TABS.FINANCE;
  if (tab === 'trips') return ROUTES.TABS.TRIPS;
  if (tab === 'network') return ROUTES.TABS.NETWORK;
  if (tab === 'loadCenter') return ROUTES.PULSE_LOADS;
  if (tab === 'compliance') return ROUTES.COMPLIANCE;
  if (tab === 'invoice') return ROUTES.PULSE_INVOICE;
  return ROUTES.TABS.RESOURCES;
}
