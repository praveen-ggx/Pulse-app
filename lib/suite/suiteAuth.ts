import { ROUTES } from '@/lib/routes';

import {
  clearSuiteNavigationIntent,
  consumeSuiteNavigationIntent,
  markSuiteNavigationIntentConsumed,
  peekSuiteNavigationIntent,
  peekSuiteNavigationIntentSync,
  writeSuiteNavigationIntent,
  type SuiteNavigationIntent,
} from './suiteNavigationIntent';
import {
  isSuiteExternalAppPath,
  normalizeSuiteReturnTo,
  openSuiteProductApp,
} from './suitePaths';
import {
  parseSuiteProductId,
  resolveSuiteProduct,
  type SuiteProductId,
} from './suiteProducts';
import { isLockedProductPath, isSuiteProductLocked } from './productLock';

export type { SuiteNavigationIntent };
export {
  SUITE_NAVIGATION_INTENT_TTL_MS,
  SUITE_NAVIGATION_INTENT_VERSION,
} from './suiteNavigationIntent';

/** @deprecated Use {@link SuiteNavigationIntent}. */
export type PendingSuiteAuthRedirect = {
  productId: SuiteProductId | null;
  returnTo: string;
  savedAt: number;
};

function intentToLegacy(intent: SuiteNavigationIntent): PendingSuiteAuthRedirect {
  return {
    productId: intent.productId,
    returnTo: intent.returnTo,
    savedAt: intent.createdAt,
  };
}

export type SuiteAuthQuery = {
  product?: string | string[];
  returnTo?: string | string[];
};

export function parseReturnTo(raw: string | string[] | undefined): string | null {
  const value = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!value?.trim()) return null;
  try {
    return normalizeSuiteReturnTo(decodeURIComponent(value.trim()));
  } catch {
    return normalizeSuiteReturnTo(value.trim());
  }
}

export function resolveSuiteAuthContext(query: SuiteAuthQuery) {
  const parsed = parseSuiteProductId(query.product);
  const productId =
    parsed && isSuiteProductLocked(parsed) ? null : parsed;
  const product = resolveSuiteProduct(productId);
  const explicitReturnTo = parseReturnTo(query.returnTo);
  const defaultReturnTo =
    productId === 'commerce'
      ? `${product.appBasePath}/dashboard`
      : product.appBasePath;
  const returnTo = normalizeSuiteReturnTo(explicitReturnTo ?? defaultReturnTo);

  return { productId, product, returnTo };
}

export function buildSuiteSignInHref(options: {
  productId?: SuiteProductId | null;
  returnTo?: string;
}): string {
  const product = resolveSuiteProduct(options.productId);
  const returnTo =
    options.returnTo ??
    (product.expoProductShell
      ? product.appBasePath
      : `${product.appBasePath}/dashboard`);
  const params = new URLSearchParams();
  if (options.productId && options.productId !== 'core') {
    params.set('product', options.productId);
  }
  params.set('returnTo', returnTo);
  const qs = params.toString();
  return qs ? `${ROUTES.SIGN_IN}?${qs}` : ROUTES.SIGN_IN;
}

export function buildSuiteSignUpHref(options: {
  productId?: SuiteProductId | null;
  returnTo?: string;
}): string {
  const product = resolveSuiteProduct(options.productId);
  const returnTo = options.returnTo ?? product.activationPath;
  const params = new URLSearchParams();
  if (options.productId && options.productId !== 'core') {
    params.set('product', options.productId);
  }
  params.set('returnTo', returnTo);
  return `${ROUTES.SIGN_UP}?${params.toString()}`;
}

export {
  buildPulseCommerceUrl,
  buildPulseInvoiceUrl,
  isSuiteExternalAppPath,
  normalizeSuiteReturnTo,
  openSuiteProductApp,
  openSuiteProductAppInNewTab,
} from './suitePaths';

export function savePendingSuiteAuthRedirect(payload: {
  productId: SuiteProductId | null;
  returnTo: string;
}): void {
  writeSuiteNavigationIntent(payload);
}

export function peekPendingSuiteAuthRedirectSync(): PendingSuiteAuthRedirect | null {
  const intent = peekSuiteNavigationIntentSync();
  return intent ? intentToLegacy(intent) : null;
}

export async function peekPendingSuiteAuthRedirect(): Promise<PendingSuiteAuthRedirect | null> {
  const intent = await peekSuiteNavigationIntent();
  return intent ? intentToLegacy(intent) : null;
}

export async function consumePendingSuiteAuthRedirect(): Promise<PendingSuiteAuthRedirect | null> {
  const intent = await consumeSuiteNavigationIntent();
  return intent ? intentToLegacy(intent) : null;
}

export async function clearPendingSuiteAuthRedirect(): Promise<void> {
  await clearSuiteNavigationIntent();
}

/**
 * Narrow injection point — Expo Router's typed `Href` union is closed over generated
 * route literals, so callers cast at the boundary (`(href) => router.replace(href as Href)`)
 * instead of this shared, router-agnostic module depending on `expo-router` types.
 */
type RouterReplace = (href: string) => void;

/**
 * Post-auth navigation: external suite apps use full page load; Core stays in Expo Router.
 * Identity authenticates only — the requested product decides the destination.
 */
export function navigateAfterSuiteAuth(returnTo: string, routerReplace?: RouterReplace): void {
  const target = normalizeSuiteReturnTo(returnTo);
  if (isLockedProductPath(target)) {
    if (routerReplace) {
      routerReplace('/trips');
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.assign('/trips');
    }
    return;
  }
  if (typeof window !== 'undefined' && isSuiteExternalAppPath(target)) {
    openSuiteProductApp(target);
    return;
  }
  if (routerReplace) {
    routerReplace(target);
    return;
  }
  if (typeof window !== 'undefined') {
    window.location.assign(target.startsWith('/') ? target : `/${target}`);
  }
}

export function buildSuiteSignInHrefWithOAuthError(
  oauthError: string,
  options?: { productId?: SuiteProductId | null; returnTo?: string },
): string {
  const href = buildSuiteSignInHref({
    productId: options?.productId,
    returnTo: options?.returnTo,
  });
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}oauth_error=${encodeURIComponent(oauthError)}`;
}

/** Mark navigation intent consumed after initiating redirect (OAuth / index races). */
export async function finalizeSuiteNavigationIntent(): Promise<void> {
  await markSuiteNavigationIntentConsumed();
  await clearSuiteNavigationIntent();
}

export {
  peekSuiteNavigationIntent,
  peekSuiteNavigationIntentSync,
  writeSuiteNavigationIntent,
};
