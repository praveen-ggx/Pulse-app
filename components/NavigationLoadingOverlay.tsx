/**
 * Covers the main content area during client-side route transitions (especially
 * while Metro lazy-bundles a screen). Works with expo `loading.tsx` on each segment.
 */
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import Layout from '@/constants/Layout';
import { pathnameHasRootTopNav } from '@/lib/rootChromeRoutes';
import { ROUTES } from '@/lib/routes';
import { usePathname, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { pe } from '@/lib/platformViewStyle.util';
import {
  InteractionManager,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

const MIN_VISIBLE_MS = 120;

/** Stack routes outside tab/driver/modal groups — overlay while Metro bundles. */
function shouldShowNavigationOverlay(
  pathname: string,
  segments: string[],
): boolean {
  if (!pathname || pathname === '/') return false;
  const root = segments[0] ?? '';
  if (root === '(tabs)' || root === '(driver)' || root === '(modals)') return false;
  if (
    pathname === ROUTES.SIGN_IN_DIRECT ||
    pathname === '/sign-in' ||
    pathname === '/sign-up' ||
    pathname === '/welcome' ||
    pathname === '/terminal-website' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/onboarding/') ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/auth/')
  ) {
    return false;
  }
  // These routes show the root top tab bar — use segment `loading.tsx` instead.
  if (pathnameHasRootTopNav(pathname)) return false;
  return true;
}

/**
 * On web, per-route loading.tsx Suspense boundaries handle first-load chunk
 * fetching. Subsequent navigations use the browser's module cache and are
 * instant. The InteractionManager path adds 120ms+ of artificial delay on
 * every navigation with no benefit — skip entirely on web.
 */
export function NavigationLoadingOverlay() {
  if (Platform.OS === 'web') return null;
  return <NativeNavigationLoadingOverlay />;
}

function NativeNavigationLoadingOverlay() {
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const segmentsKey = segments.join('/');
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= Layout.webDesktopMinWidth;
  const reserveTopNav = isDesktopWeb && pathnameHasRootTopNav(pathname);
  const visibleRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAt = useRef(0);

  const setVisibleIfChanged = (next: boolean) => {
    if (visibleRef.current === next) return;
    visibleRef.current = next;
    setVisible(next);
  };

  useEffect(() => {
    const shouldShow = shouldShowNavigationOverlay(pathname, segments);

    if (!shouldShow) {
      setVisibleIfChanged(false);
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      return;
    }

    setVisibleIfChanged(true);
    shownAt.current = Date.now();

    if (hideTimer.current) clearTimeout(hideTimer.current);

    const interaction = InteractionManager.runAfterInteractions(() => {
      const elapsed = Date.now() - shownAt.current;
      const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
      hideTimer.current = setTimeout(() => {
        setVisibleIfChanged(false);
      }, delay);
    });

    return () => {
      interaction.cancel();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [pathname, segmentsKey, segments]);

  if (!visible) return null;

  return (
    <View
      style={[
        styles.overlay,
        reserveTopNav && { top: Layout.desktopTopNavOffset },
        pe('auto'),
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AppLoadingSplash variant="preparing" style={styles.splash} />
    </View>
  );
}

const ROOT_TAB_BAR_Z = 100;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: ROOT_TAB_BAR_Z - 1,
    elevation: ROOT_TAB_BAR_Z - 1,
    ...(Platform.OS === 'web' ? { position: 'fixed' as const } : null),
  },
  splash: {
    flex: 1,
  },
});
