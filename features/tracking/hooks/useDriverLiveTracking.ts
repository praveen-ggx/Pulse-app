import { useEffect } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { isDriverLiveTrackingEnabled } from '@/features/tracking/trackingFeatureFlags';
import {
  acquireDriverLiveTracking,
  ensureDriverBackgroundUpdates,
} from '@/features/tracking/services/driverLiveTracking.service';

type Args = {
  tripId: string | null;
  driverId: string | null;
  orgId: string | null;
  /** True while the trip is accepted / at pickup / in transit / reached (not completed). */
  active: boolean;
};

/** Ask once per trip per app session — never nag the driver repeatedly. */
const askedBackgroundForTrip = new Set<string>();

function showLocationSettingsAlert(title: string, message: string): void {
  Alert.alert(title, message, [
    { text: 'Not now', style: 'cancel' },
    {
      text: 'Open settings',
      onPress: () => {
        void Linking.openSettings().catch(() => {});
      },
    },
  ]);
}

async function promptBackgroundLocationOnce(tripId: string): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  if (askedBackgroundForTrip.has(tripId)) return;
  try {
    const Location = await import('expo-location');
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      // Not answered yet: the system prompt (from starting tracking) handles it.
      if (fg.status !== 'denied') return;
      // Used to return silently: the office lost the truck and nobody knew why.
      askedBackgroundForTrip.add(tripId);
      showLocationSettingsAlert(
        'Location is off',
        'The office cannot see this trip. Turn on location for Pulse in Settings.',
      );
      return;
    }
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'granted') {
      void ensureDriverBackgroundUpdates();
      return;
    }
    askedBackgroundForTrip.add(tripId);
    if (!bg.canAskAgain) {
      showLocationSettingsAlert(
        'Trip tracking stops when the screen is off',
        'To keep the office updated, open Settings → Location and choose "Allow all the time".',
      );
      return;
    }
    Alert.alert(
      'Keep trip tracking on',
      'Allow location "all the time" so the office can follow this trip even when your screen is off. On the next screen choose "Allow all the time".',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Allow',
          onPress: () => {
            void Location.requestBackgroundPermissionsAsync()
              .then((r) => {
                if (r.status === 'granted') void ensureDriverBackgroundUpdates();
              })
              .catch(() => {});
          },
        },
      ],
    );
  } catch {
    // Permission APIs unavailable — foreground tracking still works.
  }
}

/**
 * Driver live tracking (live broadcast + sparse checkpoints, foreground + background GPS).
 * Does not touch the existing 12-ping driver_locations loop.
 */
export function useDriverLiveTracking({ tripId, driverId, orgId, active }: Args): void {
  const enabled = isDriverLiveTrackingEnabled();

  useEffect(() => {
    if (!enabled || !active || !tripId || !driverId || !orgId) return;
    const release = acquireDriverLiveTracking({ tripId, driverId, orgId });
    void promptBackgroundLocationOnce(tripId);
    return release;
  }, [enabled, active, tripId, driverId, orgId]);
}
