import Layout from '@/constants/Layout';
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { tGlobal } from '@/contexts/LanguageContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import {
  claimIndexBootRedirect,
  claimWebRefreshRedirect,
  consumeFreshSignInLanding,
  getBrowserLocation,
  hasIndexBootRedirected,
  isPastIndexBootPath,
  isWorkspaceSidebarRoute,
  peekFreshSignInLanding,
  resetIndexBootRedirect,
  resolveSignedInHomeRoute,
  resolveWebRefreshHref,
} from '@/lib/indexBootRedirect.util';
import { getLastRestorableRoute } from '@/lib/lastRoute';
import { preloadPulseLoadsRoute, preloadTabForRoute } from '@/lib/preloadRoutes';
import {
  hydrateSignupFlowFlags,
  isBusinessSignupBrandingActiveSync,
  isDriverSignupSuccessActiveSync,
} from '@/lib/onboarding/businessSignupBranding.util';
import {
  detectIncompleteOwnerOrgForSession,
  isOwnerBusinessProfileRequiredSync,
  sessionHasGoogleProvider,
  setOwnerBusinessProfileRequired,
} from '@/lib/onboarding/incompleteOwnerOrg.util';
import { hasPendingOAuthMetadata } from '@/features/auth/services/auth.service';
import { useComplianceProductEnabled } from '@/features/tripCompliance/hooks/useComplianceProductEnabled';
import { DEFAULT_DRIVER_ROUTE, ROUTES } from '@/lib/routes';
import { useMemberAccess } from '@/lib/useMemberAccess';
import { useMemberCapabilities } from '@/lib/useMemberCapabilities';
import {
  finalizeSuiteNavigationIntent,
  isSuiteExternalAppPath,
  navigateAfterSuiteAuth,
  normalizeSuiteReturnTo,
  peekSuiteNavigationIntentSync,
} from '@/lib/suite/suiteAuth';
import { useLoadingStuck } from '@/lib/hooks/useLoadingStuck';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function warmHomeRoute(route: string): void {
  if (route === ROUTES.PULSE_LOADS) {
    preloadPulseLoadsRoute();
    return;
  }
  preloadTabForRoute(route);
}

export default function Index() {
  const { sessionAttached } = useAuth();
  if (!sessionAttached) {
    return <IndexBoot homeRoute={null} homeReady />;
  }
  return <AuthenticatedIndexBoot />;
}

function AuthenticatedIndexBoot() {
  const memberAccess = useMemberCapabilities();
  const { can: canSurface, isLoading: surfaceLoading } = useMemberAccess();
  const { enabled: complianceEnabled, isLoading: productsLoading } =
    useComplianceProductEnabled();
  const homeReady =
    !memberAccess.isLoading && !surfaceLoading && !productsLoading;
  const homeRoute = resolveSignedInHomeRoute({
    trips: memberAccess.tripops,
    loadCenter: homeReady && canSurface('tripops.pulse_loads'),
    finance: memberAccess.finance,
    compliance: homeReady && complianceEnabled && canSurface('trip_compliance.tab'),
    network: memberAccess.sales,
  });
  return <IndexBoot homeRoute={homeRoute} homeReady={homeReady} />;
}

function IndexBoot({
  homeRoute,
  homeReady,
}: {
  homeRoute: string | null;
  homeReady: boolean;
}) {
  const insets = useSafeAreaInsets();
  const isOnline = useIsOnline();
  const { user, profile, loading, restoreError, refreshSession, clearRestoreError } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isFocused = useIsFocused();
  const uid = user?.uid ?? null;
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [brandingGateHydrated, setBrandingGateHydrated] = useState(false);

  useEffect(() => {
    void hydrateSignupFlowFlags().finally(() => {
      setBrandingGateHydrated(true);
    });
  }, []);

  const logRouteDecision = (event: string, details: Record<string, unknown>) => {
    if (!__DEV__) return;
    console.info('[RouteGuard:index]', event, details);
  };

  useEffect(() => {
    if (!isFocused || loading || !brandingGateHydrated) return;

    // Hard refresh of /trip/:id (etc.) often remounts Index at `/` while the
    // browser URL is still the deep path. Honor that URL instead of last-tab home.
    if (Platform.OS === 'web') {
      const browser = getBrowserLocation();
      const webHref = resolveWebRefreshHref(
        pathname,
        browser?.pathname ?? '',
        browser?.search ?? '',
      );
      if (webHref) {
        if (!claimWebRefreshRedirect(webHref)) return;
        if (uid) claimIndexBootRedirect(uid);
        logRouteDecision('redirect_web_refresh_url', { uid, pathname, webHref });
        router.replace(webHref as Href);
        return;
      }
    }

    const effectivePath =
      Platform.OS === 'web'
        ? (getBrowserLocation()?.pathname || pathname)
        : pathname;
    if (isPastIndexBootPath(effectivePath)) {
      if (uid) claimIndexBootRedirect(uid);
      return;
    }

    // Onboarding resumes: NavigationPolicy predicates (Actor) — do not replace here.
    if (isBusinessSignupBrandingActiveSync() || isOwnerBusinessProfileRequiredSync()) {
      return;
    }

    if (isDriverSignupSuccessActiveSync()) {
      return;
    }

    if (!uid) {
      resetIndexBootRedirect();
      // Phase 5: NavigationPolicy owns anonymous boot redirect.
      return;
    }

    // Suite/product redirects outrank the boot-path short-circuit below — an authenticated
    // user with a pending Commerce (or other product) destination must reach it even if a
    // background-mounted index.tsx races with /sign-in or /auth/callback for the boot claim.
    const pendingSuite = peekSuiteNavigationIntentSync();
    if (pendingSuite?.returnTo && isSuiteExternalAppPath(pendingSuite.returnTo)) {
      if (!claimIndexBootRedirect(uid)) return;
      void finalizeSuiteNavigationIntent();
      logRouteDecision('redirect_pending_suite_product', {
        uid,
        returnTo: pendingSuite.returnTo,
        productId: pendingSuite.productId,
      });
      navigateAfterSuiteAuth(pendingSuite.returnTo);
      return;
    }

    if (returnTo) {
      const decoded = normalizeSuiteReturnTo(
        typeof returnTo === 'string' ? returnTo : String(returnTo),
      );
      if (!claimIndexBootRedirect(uid)) return;
      logRouteDecision('redirect_return_to', { uid, returnTo: decoded });
      navigateAfterSuiteAuth(decoded, (href) => router.replace(href as Href));
      return;
    }

    if (!profile) return;

    if (profile.role === 'driver') {
      if (isDriverSignupSuccessActiveSync()) {
        // Policy Actor owns redirect to /driver-signup.
        return;
      }
      consumeFreshSignInLanding();
      if (!claimIndexBootRedirect(uid)) return;
      logRouteDecision('redirect_driver_root', { uid, pathname });
      router.replace(DEFAULT_DRIVER_ROUTE as '/');
      return;
    }

    if (hasIndexBootRedirected(uid)) return;

    const freshSignIn = peekFreshSignInLanding();
    if (freshSignIn && !homeReady) return;

    void (async () => {
      try {
        const pendingMeta = await hasPendingOAuthMetadata();
        if (pendingMeta) {
          setOwnerBusinessProfileRequired(true);
          logRouteDecision('flag_pending_oauth_metadata', { uid });
          // Predicate signal → Actor redirects to /onboarding/business.
          return;
        }
        const isGoogle = await sessionHasGoogleProvider();
        if (isGoogle) {
          const { incomplete } = await detectIncompleteOwnerOrgForSession();
          if (incomplete) {
            setOwnerBusinessProfileRequired(true);
            logRouteDecision('flag_incomplete_owner_org', { uid });
            return;
          }
        }
      } catch {
        // Fall through to normal tab redirect
      }
      const restored = freshSignIn ? null : await getLastRestorableRoute();
      const openHome =
        freshSignIn || (restored != null && isWorkspaceSidebarRoute(restored));
      if (openHome && !homeReady) return;
      if (!claimIndexBootRedirect(uid)) return;
      if (openHome && homeRoute) {
        consumeFreshSignInLanding();
        warmHomeRoute(homeRoute);
        logRouteDecision('redirect_signed_in_home', {
          uid,
          pathname,
          route: homeRoute,
          freshSignIn,
        });
        router.replace(homeRoute as '/');
        return;
      }
      consumeFreshSignInLanding();
      const route = restored ?? (await getLastRestorableRoute());
      warmHomeRoute(route);
      logRouteDecision('redirect_dispatcher_last_route', { uid, pathname, route });
      router.replace(route as '/');
    })();
  }, [uid, profile, loading, pathname, router, isFocused, brandingGateHydrated, returnTo, homeReady, homeRoute]);

  const splashVariant = useMemo(() => {
    if (loading) return 'session' as const;
    if (user && !profile) return 'verify' as const;
    return 'generic' as const;
  }, [loading, profile, user]);

  const bootActive = loading || Boolean(user && !profile);
  const bootStuck = useLoadingStuck(bootActive);
  const showConnectionIssue = Boolean(restoreError) || (bootStuck && bootActive);

  const handleRetryBoot = () => {
    clearRestoreError();
    void refreshSession();
  };

  const showOfflineHint = !loading && !isOnline;
  const showBootRetry = showConnectionIssue && !showOfflineHint;

  return (
    <View style={styles.container}>
      <AppLoadingSplash variant={splashVariant} useGlobalI18n />
      {showOfflineHint ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, Layout.spacingMedium) },
          ]}
        >
          <Text style={styles.splashHint}>{tGlobal('splashOfflineHint')}</Text>
        </View>
      ) : null}
      {showBootRetry ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, Layout.spacingMedium) },
          ]}
        >
          <Text style={styles.splashHint}>
            {restoreError?.message ?? tGlobal('splashCalmFooter')}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.92 }]}
            onPress={handleRetryBoot}
            accessibilityRole="button"
            accessibilityLabel={tGlobal('splashRetrySession')}
          >
            <Text style={styles.retryLabel}>{tGlobal('splashRetrySession')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  footer: {
    position: 'absolute',
    left: Layout.screenPaddingHorizontal,
    right: Layout.screenPaddingHorizontal,
    bottom: 0,
    alignItems: 'center',
  },
  splashHint: {
    marginBottom: Layout.spacingMedium,
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  retryButton: {
    marginTop: Layout.spacingMedium,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: Layout.sectionSpacing,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  retryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.buttonPrimaryText,
  },
});
