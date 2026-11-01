/**
 * Driver app layout (route group). When user has role=driver they land here after login.
 * Tabs: Dashboard, Trip, Trips, Earnings. Trip chat opens from trip detail (hidden route).
 * Not to be confused with app/driver/ which is for dispatchers (e.g. /driver/[id] = driver detail).
 */
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { DriverInviteModalProvider } from '@/contexts/DriverInviteModalContext';
import { DriverTripOpsProvider } from '@/contexts/DriverTripOpsContext';
import { DriverTabBar } from '@/components/driver/DriverTabBar';
import { useAuth } from '@/contexts/AuthContext';
import { DriverAvatarProvider } from '@/contexts/DriverAvatarContext';
import { DriverThemeProvider } from '@/contexts/DriverThemeContext';
import { DriverCommunicationProvider } from '@/features/driver/communication';
import {
  consumePendingDriverInviteAfterAuth,
} from '@/lib/driverInviteDeepLink.util';
import { beginDriverPerfSession } from '@/lib/driverPerfMetrics';
import { syncAndInvalidateLinkedDrivers } from '@/lib/syncLinkedDriversForDriverHome';
import {
  hydrateDriverSignupSuccessFlag,
} from '@/lib/onboarding/businessSignupBranding.util';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts as usePlusJakartaFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, Tabs } from 'expo-router';
import { DEFAULT_DISPATCHER_ROUTE } from '@/lib/routes';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';

function DriverTabsNavigator() {
  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <DriverTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="stories" options={{ title: 'Loads', href: null }} />
      <Tabs.Screen name="control" options={{ title: 'Trip', href: null }} />
      <Tabs.Screen name="trip-history" options={{ title: 'Trips' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Transactions' }} />
      <Tabs.Screen
        name="receivable"
        options={{
          title: 'Receivable',
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="add-client"
        options={{
          title: 'Add client',
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="capture-payment"
        options={{
          title: 'Capture payment',
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      {/* Not listed in DriverTabBar TAB_CONFIG; omit href: null so router.push / query params work on web */}
      <Tabs.Screen
        name="chat"
        options={{
          title: "Trip chat",
          tabBarStyle: { display: "none" },
        }}
      />

      {/* Hidden routes */}
      <Tabs.Screen name="notifications" options={{ title: 'Notifications', href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', href: null }} />
      <Tabs.Screen name="level-progression" options={{ title: 'Level progression', href: null }} />
      <Tabs.Screen name="documents" options={{ title: 'Documents', href: null }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
      <Tabs.Screen name="passbook" options={{ title: 'Passbook', href: null }} />
      <Tabs.Screen name="salary-request" options={{ title: 'Salary Request', href: null }} />
      <Tabs.Screen name="pending-earnings" options={{ title: 'Pending Earnings', href: null }} />
      <Tabs.Screen name="expense-capture" options={{ title: 'Capture expense', href: null }} />
      <Tabs.Screen name="general-expense" options={{ title: 'General expense', href: null }} />
      <Tabs.Screen name="dco-status" options={{ title: 'DCO Status', href: null }} />
      <Tabs.Screen name="my-fleet" options={{ title: 'My Fleet', href: null }} />
      <Tabs.Screen name="available-loads" options={{ title: 'Market' }} />
      <Tabs.Screen name="my-bids" options={{ title: 'My Bids', href: null }} />
      <Tabs.Screen name="market-awards" options={{ title: 'Awards', href: null }} />
      <Tabs.Screen name="capacity-story" options={{ title: 'Capacity Story', href: null }} />
      <Tabs.Screen name="commerce-mission" options={{ title: 'Delivery mission', href: null }} />
    </Tabs>
  );
}

export default function DriverAppLayout() {
  // Web uses FontFaceObserver (expo-font) with a timeout; on failure we still mount so the app is usable with system fonts.
  const [fontsLoaded, fontError] = usePlusJakartaFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const fontsReady = fontsLoaded || fontError != null;

  // ✅ Keep roleVerified from deepak/main
  const { user, profile, loading } = useAuth();
  const queryClient = useQueryClient();
  const linkedDriversSyncedRef = useRef(false);

  useEffect(() => {
    void hydrateDriverSignupSuccessFlag();
  }, []);

  useEffect(() => {
    if (loading || !user || profile?.role !== 'driver') return;
    void consumePendingDriverInviteAfterAuth();
  }, [loading, user, profile?.role]);

  useEffect(() => {
    if (fontError && __DEV__ && Platform.OS === 'web') {
      console.warn(
        '[DriverAppLayout] Plus Jakarta font load failed; using system fallbacks.',
        fontError,
      );
    }
  }, [fontError]);

  // A resolved non-driver has no business in this group — never gate on it.
  // Gating would render the splash with no exit (this layout has no redirect of
  // its own), which is how a driver -> logout -> login-as-user hung on
  // "Loading..." forever. Send them to their own shell instead.
  const wrongRole = !loading && Boolean(user) && Boolean(profile) && profile?.role !== 'driver';

  // ✅ Gate includes fonts + auth checks — waiting states only, never wrongRole.
  const gate =
    !wrongRole &&
    (!fontsReady ||
      loading ||
      !user ||
      !profile ||
      profile.role !== 'driver');

  // Phase 0 perf: session origin when driver shell becomes interactive.
  useEffect(() => {
    if (gate) return;
    beginDriverPerfSession();
  }, [gate]);

  // Phase 2: sync linked drivers once per driver session (login / cold restore), not on poll.
  useEffect(() => {
    if (gate) {
      linkedDriversSyncedRef.current = false;
      return;
    }
    if (!profile?.uid || linkedDriversSyncedRef.current) return;
    linkedDriversSyncedRef.current = true;
    void syncAndInvalidateLinkedDrivers(queryClient, profile.uid);
  }, [gate, profile?.uid, queryClient]);

  // Non-driver landed in the driver group (e.g. logged out as driver, back in as
  // a user while on /profile — both groups define that route). Hand off to the
  // business shell rather than showing a splash this layout can never dismiss.
  if (wrongRole) {
    return <Redirect href={DEFAULT_DISPATCHER_ROUTE} />;
  }

  if (gate) {
    return (
      <AppLoadingSplash
        variant={loading ? 'session' : !fontsReady ? 'preparing' : 'generic'}
        style={styles.gate}
      />
    );
  }

  return (
    <DriverThemeProvider>
      <DriverAvatarProvider>
        <DriverCommunicationProvider>
          <DriverInviteModalProvider>
            <DriverTripOpsProvider>
              <DriverTabsNavigator />
            </DriverTripOpsProvider>
          </DriverInviteModalProvider>
        </DriverCommunicationProvider>
      </DriverAvatarProvider>
    </DriverThemeProvider>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
});