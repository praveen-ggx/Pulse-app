/**
 * Provider boundary for the root-level driver Trip Detail route.
 *
 * app/(driver)/_layout.tsx wraps its entire Tabs tree in five driver-only
 * context providers (DriverThemeProvider, DriverAvatarProvider,
 * DriverCommunicationProvider, DriverInviteModalProvider,
 * DriverTripOpsProvider). Moving Trip Detail to app/driver-trip/[tripId] —
 * a root-level sibling of (driver), not nested inside it — means it no
 * longer renders under any of those providers, so any hook the screen (or
 * its children) call throws immediately (confirmed live: "useDriverTheme
 * must be used within DriverThemeProvider").
 *
 * Reproduces the exact same five providers in the exact same order.
 * Confirmed safe to duplicate: none of the four state-only providers have
 * any navigation-tree assumption; DriverTripOpsProvider's only
 * navigation-aware piece (useFocusEffect) fires correctly relative to
 * whichever screen wraps it and its query is keyed globally, so a second
 * instance here shares cache with (driver)'s own instance rather than
 * duplicating fetches. No auth/role gate here -- that's NavigationPolicy's
 * job now (registry/driver.ts's driver.trip-detail entry), not this
 * layout's; this file exists purely for the provider boundary.
 */
import { DriverInviteModalProvider } from '@/contexts/DriverInviteModalContext';
import { DriverTripOpsProvider } from '@/contexts/DriverTripOpsContext';
import { DriverAvatarProvider } from '@/contexts/DriverAvatarContext';
import { DriverThemeProvider } from '@/contexts/DriverThemeContext';
import { DriverCommunicationProvider } from '@/features/driver/communication';
import { Stack } from 'expo-router';

export default function DriverTripLayout() {
  return (
    <DriverThemeProvider>
      <DriverAvatarProvider>
        <DriverCommunicationProvider>
          <DriverInviteModalProvider>
            <DriverTripOpsProvider refreshOpenTripsOnFocus={false}>
              <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
                <Stack.Screen name="[tripId]" />
              </Stack>
            </DriverTripOpsProvider>
          </DriverInviteModalProvider>
        </DriverCommunicationProvider>
      </DriverAvatarProvider>
    </DriverThemeProvider>
  );
}
