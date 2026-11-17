/**
 * Write-only GPS telemetry: debounced checkpoint insert + throttled broadcast.
 * No post-write DB reads (recent pins / presence / health on every tick).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TripRow } from '@/features/trips/services/trips.service';
import * as driverLocationService from '@/features/driver/services/driverLocation.service';
import type { DriverLocationSource } from '@/features/driver/services/driverLocation.service';
import { useAdaptiveTripLocationPingLoop } from '@/features/driver/hooks/useAdaptiveTripLocationPingLoop';
import {
  useDriverTrackingSessionLifecycle,
  usePublishTrackingOnCheckpoint,
} from '@/features/tracking/hooks/useDriverTrackingPublisher';
import { useDriverLiveTracking } from '@/features/tracking/hooks/useDriverLiveTracking';
import { isDriverLiveTrackingEnabled } from '@/features/tracking/trackingFeatureFlags';
import { isCompletedStatus } from '@/features/drivers/utils/driverUtils.util';
import { supabase } from '@/lib/supabase';

export type UseDriverLocationStreamArgs = {
  driver: { id: string; organization_id: string; user_id?: string | null } | null;
  trip: TripRow | null;
  /** Master switch (trip eligible, driver online, etc.). */
  enabled: boolean;
  /** Foreground guard from DriverCommunicationProvider — pauses loop in background. */
  communicationActive: boolean;
  shouldPersistCheckpoint: boolean;
  /**
   * Live lane (background GPS + broadcast) gate. Defaults to true so callers
   * that don't pass it keep the old behaviour. DriverHome passes false while
   * the trip is only accepted, so high-accuracy background GPS and the
   * "trip in progress" notification start when the driver actually starts.
   */
  liveLaneAllowed?: boolean;
  minDisplacementM: number | null;
  source: DriverLocationSource;
  onLocationFix: (args: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    position: { coords: { latitude: number; longitude: number; heading?: number | null } };
  }) => void;
};

export function useDriverLocationStream({
  driver,
  trip,
  enabled,
  communicationActive,
  shouldPersistCheckpoint,
  liveLaneAllowed = true,
  minDisplacementM,
  source,
  onLocationFix,
}: UseDriverLocationStreamArgs): void {
  const publishTrackingOnCheckpoint = usePublishTrackingOnCheckpoint();
  const inFlightRef = useRef(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase().auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSessionUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase().auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user?.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const sessionOwnsDriver = driverLocationService.shouldPersistDriverLocation({
    sessionUserId,
    ownerUserId: driver?.user_id,
  });

  const reportLocationFireAndForget = useCallback(
    async (
      tripId: string | null,
      lat: number,
      lng: number,
      accuracy: number | null,
      locSource: DriverLocationSource,
      extras?: { odometerKm?: number | null; recordedAt?: string },
    ): Promise<boolean> => {
      if (!driver?.organization_id || !driver.id) return false;
      if (
        !driverLocationService.shouldPersistDriverLocation({
          sessionUserId,
          ownerUserId: driver.user_id,
        })
      ) {
        return false;
      }
      if (inFlightRef.current) return true;

      const recordedAt = extras?.recordedAt ?? new Date().toISOString();
      inFlightRef.current = true;

      void driverLocationService
        .reportDriverLocation({
          driverId: driver.id,
          organizationId: driver.organization_id,
          tripId,
          latitude: lat,
          longitude: lng,
          accuracy,
          source: locSource,
          odometerKm: extras?.odometerKm ?? null,
          recordedAt,
          ownerUserId: driver.user_id,
        })
        .then(({ error, skipped }) => {
          inFlightRef.current = false;
          if (error || skipped || !tripId) return;
          void publishTrackingOnCheckpoint({
            latitude: lat,
            longitude: lng,
            accuracy,
            recordedAt,
          });
        })
        .catch(() => {
          inFlightRef.current = false;
        });

      return true;
    },
    [driver, publishTrackingOnCheckpoint, sessionUserId],
  );

  const tripActive = Boolean(
    trip &&
      shouldPersistCheckpoint &&
      !isCompletedStatus(trip.status),
  );

  const liveTrackingEnabled = isDriverLiveTrackingEnabled();

  // Live lane (broadcast every ~15 s + checkpoint every 2 min), foreground AND background.
  // Owns the broadcast session; intentionally NOT gated on communicationActive so it keeps
  // running with the screen off (background GPS task feeds it).
  useDriverLiveTracking({
    tripId: trip?.id ?? null,
    driverId: driver?.id ?? null,
    orgId: driver?.organization_id ?? null,
    active: tripActive && liveLaneAllowed && sessionOwnsDriver,
  });

  // Legacy flag-gated session lifecycle — only when the live lane is switched off
  // (EXPO_PUBLIC_DRIVER_LIVE_TRACKING=0), so the two never fight over the session.
  useDriverTrackingSessionLifecycle({
    tripId: trip?.id ?? null,
    driverId: driver?.id ?? null,
    orgId: driver?.organization_id ?? null,
    tripActive: !liveTrackingEnabled && tripActive && communicationActive && sessionOwnsDriver,
  });

  useAdaptiveTripLocationPingLoop({
    driver,
    trip,
    enabled: enabled && communicationActive && sessionOwnsDriver,
    shouldPersistCheckpoint,
    minDisplacementM,
    source,
    reportLocationToDb: reportLocationFireAndForget,
    onLocationFix,
    skipHealthFetchOnTick: true,
    reportFireAndForget: true,
  });
}
