/** Path helpers for suite product routing (Core, Commerce, Pilot, …). */

import { isLockedProductPath } from './productLock';

const DEFAULT_SUITE_RETURN_TO = '/';

/**
 * Normalize suite return paths — allow-list application-relative paths only.
 * Anything else (protocol-relative `//host`, backslash-prefixed `\host` which some
 * browsers also treat as `//host`, or absolute `http(s)://`/`javascript:`/`data:` URLs)
 * falls back to the default route. Blacklisting URL forms is easy to bypass; allow-listing
 * "starts with a single `/`" isn't.
 */
export function normalizeSuiteReturnTo(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return DEFAULT_SUITE_RETURN_TO;
  if (trimmed.startsWith('//')) return DEFAULT_SUITE_RETURN_TO;
  if (trimmed.includes('\\')) return DEFAULT_SUITE_RETURN_TO;
  return trimmed;
}

/** Paths served outside Expo Router (separate SPAs on the same origin). */
export function isSuiteExternalAppPath(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/oms' || normalized.startsWith('/oms/');
}

/** Open a suite product app on web (Expo Router cannot host /oms SPA routes). */
export function openSuiteProductApp(path: string): void {
  if (typeof window === 'undefined') return;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (isLockedProductPath(normalized)) {
    return;
  }
  window.location.assign(normalized);
}

/** Open a suite product app in a new browser tab (web only). */
export function openSuiteProductAppInNewTab(path: string): void {
  if (typeof window === 'undefined') return;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (isLockedProductPath(normalized)) {
    return;
  }
  window.open(normalized, '_blank', 'noopener,noreferrer');
}

/** Navigate to Pulse Commerce on the shared origin. */
export function buildPulseCommerceUrl(path = '/dashboard'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/' || normalized === '/dashboard') return '/oms/dashboard';
  return `/oms${normalized}`;
}

/**
 * Pulse Invoice product home (Core/Expo route, same origin).
 * Not an OMS-style external SPA — do not prefix /oms.
 */
export function buildPulseInvoiceUrl(path = '/pulse-invoice'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (
    normalized === '/' ||
    normalized === '/pulse-invoice' ||
    normalized === '/dashboard'
  ) {
    return '/pulse-invoice';
  }
  if (normalized.startsWith('/pulse-invoice')) return normalized;
  return `/pulse-invoice${normalized}`;
}
