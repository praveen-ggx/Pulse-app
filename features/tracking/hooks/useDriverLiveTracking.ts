import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
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

async function promptBackgroundLocationOnce(tripId: string): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  if (askedBackgroundForTrip.has(tripId)) return;
  try {
    const Location = await import('expo-location');
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return;
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'granted') {
      void ensureDriverBackgroundUpdates();
      return;
    }
    if (!bg.canAskAgain) return;
    askedBackgroundForTrip.add(tripId);
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
