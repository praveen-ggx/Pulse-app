import 'react-native-gesture-handler';
// Shadow / pointerEvents RN Web compat — must run before any StyleSheet.create in the tree.
import { ensureWebShellParity } from '@/lib/htmlShell';
import '@/lib/installWebRnCompatPatches';
import { ensureWebRnCompatPatches } from '@/lib/installWebRnCompatPatches';
// Background GPS task must be registered before any component mounts — do not move this import.
import { AppAlertHost } from '@/components/AppAlertHost';
import { AppBootGate } from '@/components/AppBootGate';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { ConfirmDialogHost } from '@/components/ConfirmDialogHost';
import { ContentErrorState } from '@/components/ContentErrorState';
import { GlobalOperationsToast } from '@/components/GlobalOperationsToast';
import { NavigationLoadingOverlay } from '@/components/NavigationLoadingOverlay';
import type { DemoTabId } from '@/components/demo/DemoTabBar';
import { DemoTabBar } from '@/components/demo/DemoTabBar';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import {
  DemoTabBarAutoHideShell,
  DemoTabBarScrollProvider,
  useDemoTabBarScrollOptional,
} from '@/contexts/DemoTabBarScrollContext';
import * as authService from '@/features/auth/services/auth.service';
import { isSessionExpiredError } from '@/features/auth/services/auth.service';
import {
    isPublicAuthRoute,
    shouldMountAuthenticatedDataPlane,
    shouldMountRootOverlayTabBar,
    shouldApplyUnsignedDataPlaneRedirect,
    shouldRedirectDataPlaneRouteWithoutSession,
    shouldRenderPublicAuthTree,
} from '@/lib/bootGate';
import { QUERY_CACHE_BUSTER } from '@/lib/cache/cacheBuster';
import { captureException, initCrashReporter } from '@/lib/crashReporter';
import { installDevConsoleFilters } from '@/lib/devConsoleFilters';
import { installDriverInviteDeepLinkListener } from '@/lib/driverInviteDeepLink.util';
import { rememberCurrentPath } from '@/lib/lastRoute';
import { preloadFinanceWarmup } from '@/lib/preloadFinanceWarmup';
import type { PreloadableTab } from '@/lib/preloadRoutes';
import {
    preloadPulseLoadsRoute,
    preloadTabScreen,
    scheduleDispatcherTabPreloads,
} from '@/lib/preloadRoutes';
import { useWorkspaceProductsQuery } from '@/lib/queries/useWorkspaceProductsQuery';
import { purgeEmptyEntityQueriesFromCache } from '@/lib/queries/entityListQueryOptions';
import {
    isLinkedOrgDisplayQueryKey,
    purgeLinkedOrgDisplayQueries,
} from '@/lib/queries/linkedOrgDisplayCache';
import { makeQueryClient } from '@/lib/queryClient';
import {
    installForegroundPruning,
    installRealtimeDiagnosticsGlobalHook,
    startRealtimeDiagnosticsLogger,
    stopRealtimeDiagnosticsLogger,
} from '@/lib/realtimeRegistry';
import { overlayActiveTab, overlayPathForTab, pathnameHasRootTopNav } from '@/lib/rootChromeRoutes';
import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { ROUTES } from '@/lib/routes';
import { safeHideSplashAsync, safePreventAutoHideAsync } from '@/lib/safeSplashScreen.util';
import { markStartupPhase } from '@/lib/startupMetrics';
import { hasSupabaseConfig, SUPABASE_CONFIG_MISSING_MESSAGE } from '@/lib/supabase';
import '@/lib/tracking/backgroundTasks';
import { useMemberAccess } from '@/lib/useMemberAccess';
import { useMemberCapabilities } from '@/lib/useMemberCapabilities';
import { useWebLayoutWidth } from '@/lib/useWebLayoutWidth';
import {
    clearNativeBundleReloadGuard,
    installNativeBundleRecoveryHandler,
    installWebDeployRecoveryListener,
    isStaleNativeBundleError,
    isStaleWebChunkError,
    recoverStaleNativeBundle,
    recoverStaleWebDeploy,
} from '@/lib/webDeployRecovery';
import {
    installWebViewportHeight,
} from '@/lib/webViewportHeight';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Redirect, Stack, usePathname, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { LogBox, Platform, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LazyChatProviders } from '@/components/LazyChatProviders';
import { PendingInviteResumeGate } from '@/components/PendingInviteResumeGate';
import { PushTokenRegistration } from '@/components/PushTokenRegistration';
import { ReferralCaptureGate } from '@/components/ReferralCaptureGate';
import { useColorScheme } from '@/components/useColorScheme';
import { ActiveWorkspaceProvider } from '@/contexts/ActiveWorkspaceContext';
import { AuthProvider, useAuth, useOptionalAuth } from '@/contexts/AuthContext';
import { KeyboardAccessoryProvider } from '@/contexts/KeyboardAccessoryContext';
import { LanguageProvider, tGlobal } from '@/contexts/LanguageContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { OrganizationProvider, useOptionalOrganization } from '@/contexts/OrganizationContext';
import { PendingOnboardingProvider } from '@/contexts/PendingOnboardingContext';
import { WalletProvider } from '@/contexts/WalletContext';
import { OrgVerificationReminderProvider } from '@/features/organization/components/workspace/kyc/OrgVerificationReminderProvider';
import { isFloatingChatHostRoute } from '@/lib/floatingChatHostRoute.util';
import { GlobalSyncProvider } from '@/lib/globalSync/GlobalSyncContext';
import { NavigationPolicyShadowHost } from '@/lib/navigationPolicy/NavigationPolicyShadowHost';

markStartupPhase('js_parse_start');

// Wire crash reporting as early as possible (no-op in dev / when no DSN is set).
initCrashReporter();

// Dev (web.output "single") skips app/+html.tsx — inject its shell CSS/JS at runtime.
ensureWebShellParity();

function isNetworkError(error: Error): boolean {
  const msg = error.message;
  return (
    msg === 'Network request failed' ||
    msg === 'Failed to fetch' ||
    /network|failed to fetch|fetch failed|load failed/i.test(msg) ||
    /AuthRetryableFetchError|network request failed/i.test(msg)
  );
}

function isConfigMissingError(error: Error): boolean {
  return error.message.includes('Missing Supabase config') || error.message === SUPABASE_CONFIG_MISSING_MESSAGE;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sessionExpired = isSessionExpiredError(error);

  useEffect(() => {
    if (!sessionExpired) return;
    authService.signOut().catch(() => {});
    try {
      router.replace(ROUTES.SIGN_IN_DIRECT);
    } catch {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.replace(ROUTES.SIGN_IN_DIRECT);
      }
    }
  }, [sessionExpired, router]);

  useEffect(() => {
    if (isStaleWebChunkError(error)) {
      recoverStaleWebDeploy();
      return;
    }
    if (isStaleNativeBundleError(error)) {
      recoverStaleNativeBundle();
    }
  }, [error]);

  // Report genuine crashes to Sentry. The root ErrorBoundary previously showed
  // the "Something went wrong" screen but never captured the error, so these
  // never reached Sentry and had no stack/line to debug. Skip the benign cases
  // handled above (session-expired sign-out, stale-bundle auto-recovery).
  useEffect(() => {
    if (
      sessionExpired ||
      isStaleWebChunkError(error) ||
      isStaleNativeBundleError(error)
    ) {
      return;
    }
    captureException(error, { source: 'root-error-boundary' });
  }, [error, sessionExpired]);

  if (sessionExpired) {
    return null;
  }

  const staleDeploy = isStaleWebChunkError(error);
  const staleNativeBundle = isStaleNativeBundleError(error);
  const configMissing = isConfigMissingError(error);
  const network = isNetworkError(error);
  const variant = configMissing
    ? 'config'
    : staleDeploy
      ? 'update'
      : network
        ? 'connection'
        : 'generic';

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <ContentErrorState
        variant={variant}
        tone="dark"
        layout="full"
        title={
          configMissing
            ? tGlobal('appNotConfigured')
            : staleDeploy
              ? undefined
              : network
                ? tGlobal('connectionErrorShort')
                : tGlobal('somethingWentWrong')
        }
        message={
          configMissing
            ? undefined
            : staleDeploy
              ? undefined
              : staleNativeBundle
                ? 'The dev bundle is out of date. Stop all Metro servers, run npm run start:clean, reopen Expo Go, and try again.'
              : network
                ? undefined
                : error.message
        }
        technicalDetails={error.stack ?? error.message}
        onRetry={
          configMissing || staleDeploy
            ? undefined
            : () => {
                if (Platform.OS === 'web' && isStaleWebChunkError(error)) {
                  recoverStaleWebDeploy();
                  return;
                }
                if (staleNativeBundle && recoverStaleNativeBundle()) {
                  return;
                }
                retry();
              }
        }
        retryLabel={tGlobal('tryAgain')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /** Required so RNGH components (e.g. hold-to-accept Pressable) work on Android; stabilizes iOS. */
  ghRoot: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? ({
          backgroundColor: Theme.screenBackground,
          overflow: 'hidden' as const,
        } satisfies ViewStyle)
      : null),
  },
  rootTabBarWrap: {
    width: '100%',
    paddingHorizontal: 0,
  },
  configErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
  },
  configErrorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    marginBottom: 12,
  },
  configErrorMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
  },
});

export const unstable_settings = {
  initialRouteName: 'index',
};

void safePreventAutoHideAsync().catch(() => {});

// Stale refresh token (e.g. from another device) is handled by clearing local session and showing sign-in.
// Suppress the library's error log so users don't see a scary red error on app open.
LogBox.ignoreLogs([
  'Invalid Refresh Token',
  'Refresh Token Not Found',
  'AuthApiError',
  'No native splash screen registered',
  // RN Web dev noise (harmless on web; native still uses shadow* props).
  '"shadow*" style props are deprecated',
  '"textShadow*" style props are deprecated',
  'props.pointerEvents is deprecated',
  // Metro allow-list — fixed via direct imports; ignore if a dev chunk still cycles.
  'Require cycle:',
  // Expo Router file is app/add-commodity-type/index.tsx (screen name includes /index).
  'No route named "add-commodity-type"',
  // React Strict Mode double-mount vs Supabase auth Web Lock (dev-only recovery).
  'Lock "lock:sb-',
  'was not released within',
  'Lock was stolen by another request',
  // whatwg-fetch AbortController timeout (Expo Go) — handled in lib/supabase.ts.
  'AbortError: Aborted',
  'Aborted',
]);

export default function RootLayout() {
  useEffect(() => {
    ensureWebRnCompatPatches();
    installDevConsoleFilters();
    clearNativeBundleReloadGuard();
    installNativeBundleRecoveryHandler();
    installWebDeployRecoveryListener();
    if (Platform.OS !== 'web') return;
    return installWebViewportHeight();
  }, []);

  useEffect(() => {
    return installDriverInviteDeepLinkListener();
  }, []);

  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const queryClient = useMemo(() => makeQueryClient(), []);
  const persister = useMemo(
    () =>
      createAsyncStoragePersister({
        storage: AsyncStorage,
        key: 'pulse-cache-v1',
        throttleTime: 10_000,  // 10s: reduces UI-thread write pressure (was 3s)
      }),
    [],
  );

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;

    const styleId = 'pulse-input-focus-reset';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      input:focus,
      input:focus-visible,
      textarea:focus,
      textarea:focus-visible,
      select:focus,
      select:focus-visible {
        outline: none !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);

  // On web the browser handles font loading natively via CSS — blocking here
  // causes several seconds of splash while the dev server streams ~4 MB of
  // FontAwesome files.  Native still needs to wait (fonts aren't pre-bundled).
  if (!loaded && Platform.OS !== 'web') {
    return (
      <SafeAreaProvider>
        <LanguageProvider>
          <AppLoadingSplash variant="preparing" useGlobalI18n />
        </LanguageProvider>
      </SafeAreaProvider>
    );
  }

  // Avoid any Supabase call when config is missing (prevents "Network request failed" from invalid URL)
  if (!hasSupabaseConfig()) {
    return (
      <SafeAreaProvider>
        <LanguageProvider>
          <ConfigErrorScreen />
        </LanguageProvider>
      </SafeAreaProvider>
    );
  }

  markStartupPhase('providers_mount');

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AppErrorBoundary>
        <GestureHandlerRootView style={styles.ghRoot}>
          <PersistQueryClientProvider
            client={queryClient}
            onSuccess={() => {
              purgeEmptyEntityQueriesFromCache(queryClient);
              purgeLinkedOrgDisplayQueries(queryClient);
            }}
            persistOptions={{
              persister,
              // Tied to the build id: any deploy discards caches written by older
              // code, so a drifted cache can never outlive a release. Previously a
              // stale list survived redeploys and hard refreshes, and only that one
              // device was affected (GX-PULSE-CACHE).
              buster: QUERY_CACHE_BUSTER,
              maxAge: 6 * 60 * 60 * 1000,  // 6h: balances cold-start speed vs memory on long-shift devices
              dehydrateOptions: {
                shouldDehydrateQuery: (query) => {
                  if (query.state.status !== 'success') return false;
                  const data = query.state.data;
                  // Never persist empty entity lists — they block refetch on cold start.
                  if (Array.isArray(data) && data.length === 0) return false;
                  // Linked-org display is workspace-scoped; a persisted map can
                  // hydrate before org resolution and leak across sessions.
                  if (isLinkedOrgDisplayQueryKey(query.queryKey)) return false;
                  return true;
                },
              },
            }}
          >
            <NetworkProvider>
              <AuthProvider>
                <PendingOnboardingProvider>
                  <AppSessionTree />
                </PendingOnboardingProvider>
              </AuthProvider>
            </NetworkProvider>
          </PersistQueryClientProvider>
        </GestureHandlerRootView>
        </AppErrorBoundary>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

function ConfigErrorScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.configErrorContainer,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={styles.configErrorTitle}>App not configured</Text>
      <Text style={styles.configErrorMessage}>
        Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env in the project root, then restart the dev server: npx expo start
      </Text>
    </View>
  );
}

function AuthenticatedDataPlane() {
  return (
    <>
      <PushTokenRegistration />
      <OrganizationProvider>
        <ActiveWorkspaceProvider>
          <PendingInviteResumeGate />
          <ReferralCaptureGate />
          <WalletProvider>
            <KeyboardAccessoryProvider>
              <GlobalSyncProvider>
                <AppBootGate>
                  <OrgVerificationReminderProvider>
                    <RootLayoutNav />
                  </OrgVerificationReminderProvider>
                </AppBootGate>
              </GlobalSyncProvider>
            </KeyboardAccessoryProvider>
          </WalletProvider>
        </ActiveWorkspaceProvider>
      </OrganizationProvider>
    </>
  );
}

function PublicAuthTree() {
  return (
    <AppBootGate>
      <RootLayoutNav />
    </AppBootGate>
  );
}

/**
 * Mount boundary: Organization / workspace / GlobalSync / gated nav only after
 * the Supabase JS session is attached. Cached web JWT (status authenticated)
 * is not enough.
 */
function AppSessionTree() {
  const { status, sessionAttached } = useAuth();
  const pathname = usePathname();
  const publicRoute = isPublicAuthRoute(pathname);

  useEffect(() => {
    if (sessionAttached) return;
    void safeHideSplashAsync().catch(() => {});
  }, [sessionAttached]);

  if (shouldMountAuthenticatedDataPlane(sessionAttached)) {
    return <AuthenticatedDataPlane />;
  }

  if (
    shouldRenderPublicAuthTree({
      sessionAttached,
      publicRoute,
      status,
    })
  ) {
    return <PublicAuthTree />;
  }

  return <AppLoadingSplash variant="session" />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const _layoutWidth = useWebLayoutWidth();
  const pathname = usePathname();
  const segments = useSegments();
  const auth = useOptionalAuth();
  const [rootNavigatorMounted, setRootNavigatorMounted] = useState(false);
  const isDriverRole = auth?.profile?.role === 'driver';
  const isChatRoute =
    pathname === ROUTES.CHAT || pathname.startsWith('/chat');
  const isDispatcherChatRouteActive =
    !isDriverRole &&
    (isFloatingChatHostRoute(pathname) || isChatRoute);
  useEffect(() => {
    setRootNavigatorMounted(true);
  }, []);
  useEffect(() => {
    rememberCurrentPath(pathname);
  }, [pathname]);
  useEffect(() => {
    installForegroundPruning();
    if (!__DEV__) return;
    installRealtimeDiagnosticsGlobalHook();
    startRealtimeDiagnosticsLogger();
    return () => {
      stopRealtimeDiagnosticsLogger();
    };
  }, []);

  const bounceUnsigned = shouldRedirectDataPlaneRouteWithoutSession(
    Boolean(auth?.sessionAttached),
    pathname,
    segments,
  );

  // First paint must include Stack/Slot. Redirect on that same render throws
  // "Attempted to navigate before mounting the Root Layout".
  if (shouldApplyUnsignedDataPlaneRedirect(bounceUnsigned, rootNavigatorMounted)) {
    return <Redirect href={ROUTES.SIGN_IN_DIRECT} />;
  }

  const navTree = (
    <NavigationPolicyShadowHost>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DemoTabBarScrollProvider>
        {/*
          Chat providers are lazy: ~1.1k LOC of realtime + store + service stays
          out of the startup chunk. They re-wrap the tree after first idle.
        */}
        <LazyChatProviders
          isActive={isDispatcherChatRouteActive && !isChatRoute}
          skipWrap={isChatRoute && !isDriverRole}
        >
          <View style={{ flex: 1 }}>
            <GlobalOperationsToast />
            <AppAlertHost />
            <ConfirmDialogHost />
            <Stack screenOptions={routeStackScreenOptions}>
              <Stack.Screen name="index" />
              <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
              <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
              <Stack.Screen name="forgot-password" options={{ animation: 'fade' }} />
              <Stack.Screen name="auth/reset-password" options={{ animation: 'fade' }} />
              <Stack.Screen name="sign-up" options={{ animation: 'fade' }} />
              <Stack.Screen name="onboarding/index" options={{ animation: 'fade' }} />
              <Stack.Screen name="onboarding/business" options={{ animation: 'fade' }} />
              <Stack.Screen name="onboarding/driver" options={{ animation: 'fade' }} />
              <Stack.Screen name="onboarding/join-team" options={{ animation: 'fade' }} />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(driver)" />
              <Stack.Screen name="add-trip" />
              <Stack.Screen
                name="add-commodity-type/index"
                options={{ animation: "slide_from_right", headerShown: false }}
              />
              <Stack.Screen name="network" />
              <Stack.Screen name="load-board" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen
                name="chat"
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_right', headerShown: false }}
              />
              <Stack.Screen name="trip" options={{ animation: 'slide_from_right', headerShown: false }} />
              <Stack.Screen name="driver-trip" options={{ animation: 'slide_from_right', headerShown: false }} />
              <Stack.Screen name="track" options={{ animation: 'slide_from_right', headerShown: false }} />
              <Stack.Screen name="fleet-operations" options={{ animation: 'slide_from_right', headerShown: false }} />
              <Stack.Screen name="compliance" options={{ animation: 'slide_from_right', headerShown: false }} />
              <Stack.Screen name="pulse-loads" options={{ animation: 'slide_from_right', headerShown: false }} />
              <Stack.Screen name="create-indent" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="log-incoming-pods" options={{ presentation: 'card', animation: 'slide_from_right' }} />
              <Stack.Screen name="invoicing-execute" options={{ presentation: 'card', animation: 'slide_from_right' }} />
              <Stack.Screen name="pulse-invoice" options={{ presentation: 'card', animation: 'slide_from_right', headerShown: false }} />
              <Stack.Screen name="finance-pro" options={{ presentation: 'card', animation: 'slide_from_right', headerShown: false }} />
              <Stack.Screen name="business-pulse" options={{ presentation: 'card', animation: 'slide_from_right', headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
              <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
              <Stack.Screen
                name="workspace"
                options={{
                  presentation: "transparentModal",
                  animation: "fade",
                  headerShown: false,
                  contentStyle: { flex: 1, backgroundColor: "transparent" },
                }}
              />
              <Stack.Screen name="audit" options={{ headerShown: false }} />
              <Stack.Screen name="platform-health" options={{ headerShown: false }} />
              <Stack.Screen name="+not-found" options={{ headerShown: false }} />
            </Stack>
            <NavigationLoadingOverlay />
            {shouldMountRootOverlayTabBar(Boolean(auth?.sessionAttached)) ? (
              <RootOverlayTabBar />
            ) : null}
          </View>
        </LazyChatProviders>
      </DemoTabBarScrollProvider>
    </ThemeProvider>
    </NavigationPolicyShadowHost>
  );

  // One-frame Stack paint on a leftover data-plane URL must not throw
  // useOrganization (PublicAuthTree has no org provider).
  if (bounceUnsigned) {
    return <OrganizationProvider>{navTree}</OrganizationProvider>;
  }

  return navTree;
}

function RootOverlayTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useOptionalAuth();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const scrollControls = useDemoTabBarScrollOptional();
  const layoutWidth = useWebLayoutWidth();
  const { can: canSurface, isLoading: surfaceLoading } = useMemberAccess();
  // Fail open while surfaces hydrate so the nav item doesn't flicker in and out.
  const canViewLoadsHub = surfaceLoading || canSurface('tripops.pulse_loads');
  /**
   * This nav renders above every MemberDomainGate, so the three primary tabs
   * were always visible — a member with no functional role saw Fiscal / Trips /
   * Network and could tap straight into a gate notice. Same access source the
   * gates use; fail open while it resolves so tabs don't flicker.
   */
  const memberDomainAccess = useMemberCapabilities();
  const domainsLoading = memberDomainAccess.isLoading;
  const { data: workspaceProducts, isLoading: productsLoading } = useWorkspaceProductsQuery();
  const complianceProductActive =
    productsLoading ||
    (workspaceProducts ?? []).some(
      (p) => p.product_id === 'pulse_compliance' && (p.status === 'active' || p.status === 'trial'),
    );
  const canOpenCompliance =
    (surfaceLoading || canSurface('trip_compliance.tab')) && complianceProductActive;

  const showOnRootScreens = pathnameHasRootTopNav(pathname);

  useEffect(() => {
    if (showOnRootScreens) scrollControls?.resetBarVisible();
  }, [pathname, scrollControls, showOnRootScreens]);

  useEffect(() => {
    if (!showOnRootScreens || auth?.profile?.role === 'driver') return;
    // Chunk-only. Finance/trips RPCs on this overlay duplicated tabs-layout
    // warmup and piled onto Auth at sign-in (2026-09-22 unhealthy cascade).
    scheduleDispatcherTabPreloads(undefined, {
      queryClient,
      orgId,
      warmFinanceData: false,
    });
  }, [showOnRootScreens, orgId, queryClient, auth?.profile?.role]);

  if (!showOnRootScreens) return null;

  const activeTab: DemoTabId = overlayActiveTab(pathname);
  const isDesktopWeb = Platform.OS === 'web' && layoutWidth >= Layout.webDesktopMinWidth;

  const shellStyle = [
    styles.rootTabBarWrap,
    isDesktopWeb && {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      zIndex: 100,
      width: '100%' as const,
    },
    !isDesktopWeb && Platform.OS === 'web' && {
      position: 'fixed' as const,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
    },
  ];

  const tabBar = (
    <DemoTabBar
      activeTab={activeTab}
      visibility={{
        finance: domainsLoading || memberDomainAccess.finance,
        trips: domainsLoading || memberDomainAccess.tripops,
        network: domainsLoading || memberDomainAccess.sales,
        loadCenter: canViewLoadsHub,
        compliance: canOpenCompliance,
      }}
      onTabChange={(tab) => {
        if (tab === 'loadCenter' && !canViewLoadsHub) return;
        if (tab === 'compliance' && !canOpenCompliance) return;
        if (tab === 'loadCenter') preloadPulseLoadsRoute();
        else if (tab === 'finance' || tab === 'trips' || tab === 'network') {
          preloadTabScreen(tab as PreloadableTab);
          if (tab === 'finance' && orgId) {
            preloadFinanceWarmup(queryClient, orgId);
          }
        }
        router.push(overlayPathForTab(tab) as '/');
      }}
      onProfilePress={() => router.push(ROUTES.WORKSPACE)}
      onNotificationsPress={() => router.push('/notifications')}
    />
  );

  if (isDesktopWeb) {
    return <View style={shellStyle}>{tabBar}</View>;
  }

  return (
    <DemoTabBarAutoHideShell style={shellStyle}>{tabBar}</DemoTabBarAutoHideShell>
  );
}
