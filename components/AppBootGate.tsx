/**
 * Holds a full-screen branded overlay until session + workspace are ready,
 * then hides the native splash. Prevents blank flashes between splash and content.
 *
 * Public auth routes (sign-in, sign-up, driver-signup, etc.) bypass the gate so
 * they render immediately — they don't need resolved auth state to show their UI.
 *
 * SCOPE — COLD START ONLY (read before editing)
 * --------------------------------------------
 * This gate covers exactly one transition: native splash -> first paint. Once it
 * opens, it is permanently inert for the lifetime of the JS context.
 *
 * That matters because `status === 'restoring'` is NOT a cold-start signal —
 * AuthContext also re-enters it on sign-out, token refresh and re-auth. Gating
 * render on it directly means an in-app logout -> login re-shows the cold-start
 * overlay; combined with a one-way "already hid the splash" latch, the overlay
 * had no path back off screen and the app hung on "Loading...".
 *
 * The fix is structural rather than a flag reset: `bootSettled` latches true at
 * the first resolved auth state and never returns to false, so re-auth cannot
 * reach the overlay at all. Post-boot auth transitions are the routers' and
 * screens' concern (route guards + per-screen skeletons), never this component's.
 *
 * Invariant: bootSettled is monotonic (false -> true, once).
 */
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { useAuth } from '@/contexts/AuthContext';
import { safeHideSplashAsync } from '@/lib/safeSplashScreen.util';
import { dumpStartupMetrics, markStartupPhase } from '@/lib/startupMetrics';
import { isColdStartResolved, shouldShowBootOverlay, isPublicAuthRoute } from '@/lib/bootGate';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { pe } from '@/lib/platformViewStyle.util';
import { Platform, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { hydrateSignupFlowFlags } from '@/lib/onboarding/businessSignupBranding.util';

const BOOT_HARD_TIMEOUT_MS = 8_000;

type AppBootGateProps = {
  children: ReactNode;
};

export function AppBootGate({ children }: AppBootGateProps) {
  const { status, user, profile } = useAuth();
  const pathname = usePathname();
  const [timedOut, setTimedOut] = useState(false);

  // Monotonic: once cold start resolves this stays true forever. Never reset it —
  // doing so re-opens the logout -> login hang this gate was fixed for.
  const [bootSettled, setBootSettled] = useState(false);

  useEffect(() => {
    void hydrateSignupFlowFlags();
  }, []);

  useEffect(() => {
    if (bootSettled) return;
    const t = setTimeout(() => setTimedOut(true), BOOT_HARD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [bootSettled]);

  // Whether *cold start* is resolved. Only consulted until bootSettled latches.
  // Rule lives in lib/bootGate.ts so the monotonic invariant stays unit-tested.
  // Workspace/org data deliberately does not gate boot — it loads behind the
  // scenes and each screen shows its own skeleton while it streams in.
  const coldStartResolved = useMemo(
    () =>
      isColdStartResolved({
        restoring: status === 'restoring',
        hasUser: Boolean(user),
        hasProfile: Boolean(profile),
        authenticated: status === 'authenticated',
        publicRoute: isPublicAuthRoute(pathname),
        timedOut,
      }),
    [status, user, profile, timedOut, pathname],
  );

  // Latch on first resolution. From here on the gate is inert and post-boot auth
  // transitions (sign-out, refresh, re-auth) can never re-show the overlay.
  useEffect(() => {
    if (bootSettled || !coldStartResolved) return;
    setBootSettled(true);
    markStartupPhase('boot_gate_open');
    const id = requestAnimationFrame(() => {
      void safeHideSplashAsync().catch(() => {});
      dumpStartupMetrics();
    });
    return () => cancelAnimationFrame(id);
  }, [coldStartResolved, bootSettled]);

  const showOverlay = shouldShowBootOverlay(bootSettled, coldStartResolved);
  const splashVariant = status === 'restoring' ? 'session' : 'preparing';

  return (
    <View style={styles.root}>
      {children}
      {showOverlay ? (
        <View
          style={[styles.overlay, pe('auto')]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <AppLoadingSplash variant={splashVariant} style={styles.splash} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    ...(Platform.OS === 'web' ? { position: 'fixed' as const } : null),
  },
  splash: {
    flex: 1,
  },
});
