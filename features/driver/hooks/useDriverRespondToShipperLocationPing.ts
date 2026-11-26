/**
 * Driver responds to shipper "Ping location" broadcast:
 * 1) Capture current GPS (prompt to enable if denied)
 * 2) Persist + broadcast position
 * 3) Post location card into trip chat
 * 4) Surface toast: "Your current location shared to shipper"
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as chatService from "@/features/chat/services/chat.service";
import {
  buildLocationPingChatContent,
  buildLocationPingChatMetadata,
} from "@/features/chat/utils/locationPingChatPayload.util";
import * as driverLocationService from "@/features/driver/services/driverLocation.service";
import {
  publishPingStatus,
  publishTrackingBroadcast,
} from "@/features/tracking/broadcast/publishTrackingBroadcast";
import { trackingTripChannelName } from "@/features/tracking/broadcast/trackingBroadcastChannels";
import { TRACKING_BROADCAST_EVENT } from "@/features/tracking/constants";
import type { TrackingPositionPayload } from "@/features/tracking/types/broadcast.types";
import { getDriverTrackingSessionManager } from "@/features/tracking/session/DriverTrackingSessionManager";
import { extractCityFromLocationLabel } from "@/features/trips/utils/driverLastPingDisplay.util";
import { supabase } from "@/lib/supabase";
import { isCompletedStatus } from "@/features/drivers/utils/driverUtils.util";

export type DriverLocationSharedToastState = {
  cityLabel: string | null;
  at: string;
  tripId: string;
} | null;

export type DriverPingTripTarget = {
  tripId: string;
  conversationId: string;
  organizationId: string;
  driverId: string | null;
  tripStatus?: string | null;
};

export type UseDriverRespondToShipperLocationPingArgs = {
  trips: DriverPingTripTarget[];
  ownerUserId: string | null;
  enabled: boolean;
  driverDisplayName?: string | null;
};

export function useDriverRespondToShipperLocationPing({
  trips,
  ownerUserId,
  enabled,
  driverDisplayName,
}: UseDriverRespondToShipperLocationPingArgs): {
  sharedToast: DriverLocationSharedToastState;
  dismissSharedToast: () => void;
} {
  const [sharedToast, setSharedToast] =
    useState<DriverLocationSharedToastState>(null);
  const inFlightRef = useRef<Set<string>>(new Set());
  const lastHandledAtRef = useRef<Map<string, number>>(new Map());
  const tripsRef = useRef(trips);
  tripsRef.current = trips;

  const dismissSharedToast = useCallback(() => setSharedToast(null), []);

  const activeTripIdsKey = useMemo(() => {
    const ids: string[] = [];
    for (const t of trips) {
      if (!t.tripId || !t.conversationId || !t.organizationId) continue;
      if (t.tripStatus && isCompletedStatus(t.tripStatus)) continue;
      ids.push(t.tripId);
    }
    return ids.sort().join("|");
  }, [trips]);

  const activeTripIds = useMemo(
    () => (activeTripIdsKey ? activeTripIdsKey.split("|") : []),
    [activeTripIdsKey],
  );

  const handlePing = useCallback(
    async (tripId: string) => {
      if (!enabled || !tripId) return;
      const target = tripsRef.current.find((t) => t.tripId === tripId);
      if (!target?.conversationId || !target.organizationId) return;
      if (target.tripStatus && isCompletedStatus(target.tripStatus)) return;
      if (!target.driverId) return;

      const now = Date.now();
      const last = lastHandledAtRef.current.get(tripId) ?? 0;
      if (now - last < 2_000) return;
      if (inFlightRef.current.has(tripId)) return;
      lastHandledAtRef.current.set(tripId, now);
      inFlightRef.current.add(tripId);

      try {
        const Location = await import("expo-location");
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          const asked = await Location.requestForegroundPermissionsAsync();
          if (asked.status !== "granted") {
            void publishPingStatus(tripId, "gps_denied");
            Alert.alert(
              "Enable GPS",
              "The shipper asked for your location. Turn on location access so Pulse can share a live update.",
              [
                { text: "Not now", style: "cancel" },
                {
                  text: Platform.OS === "ios" ? "Open Settings" : "Enable",
                  onPress: () => {
                    void Linking.openSettings();
                  },
                },
              ],
            );
            return;
          }
        }

        let fix: Awaited<ReturnType<typeof Location.getCurrentPositionAsync>>;
        try {
          fix = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        } catch {
          void publishPingStatus(tripId, "gps_denied");
          Alert.alert(
            "GPS unavailable",
            "Turn on device location services, then the shipper can ping again.",
            [
              { text: "OK", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => {
                  void Linking.openSettings();
                },
              },
            ],
          );
          return;
        }
        const latitude = fix.coords.latitude;
        const longitude = fix.coords.longitude;
        const accuracy = fix.coords.accuracy ?? null;
        const recordedAt = new Date(fix.timestamp || Date.now()).toISOString();
        void publishPingStatus(tripId, "sharing");

        let addressLabel: string | null = null;
        try {
          const { reverseGeocodeCityStateLabel } = await import(
            "@/lib/reverseGeocodePlace.util"
          );
          const geo = await reverseGeocodeCityStateLabel(latitude, longitude);
          addressLabel = geo?.trim() || null;
        } catch {
          // best-effort
        }

        const cityLabel = addressLabel
          ? extractCityFromLocationLabel(addressLabel) || addressLabel
          : null;

        await driverLocationService.reportDriverLocation({
          driverId: target.driverId,
          organizationId: target.organizationId,
          tripId,
          latitude,
          longitude,
          accuracy,
          source: "live",
          recordedAt,
          addressLabel,
          ownerUserId,
        });

        const session = getDriverTrackingSessionManager().active;
        const sessionId =
          session?.tripId === tripId && session.sessionId
            ? session.sessionId
            : `ping-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

        const positionPayload: TrackingPositionPayload = {
          v: 1,
          tripId,
          driverId: target.driverId,
          orgId: target.organizationId,
          sessionId,
          latitude,
          longitude,
          accuracy,
          recordedAt,
          heading: fix.coords.heading ?? null,
          speedKmh:
            fix.coords.speed != null && Number.isFinite(fix.coords.speed)
              ? fix.coords.speed * 3.6
              : null,
        };
        await publishTrackingBroadcast(
          tripId,
          target.organizationId,
          TRACKING_BROADCAST_EVENT.POSITION,
          positionPayload,
        );

        const content = buildLocationPingChatContent(cityLabel || "En route");
        const metadata = buildLocationPingChatMetadata({
          location: {
            lat: latitude,
            lng: longitude,
            address_name: addressLabel || cityLabel,
            recorded_at: recordedAt,
          },
          shipperRequested: true,
        });
        try {
          await chatService.sendChatMessage({
            conversationId: target.conversationId,
            organizationId: target.organizationId,
            content,
            senderRole: "driver",
            senderName: (driverDisplayName ?? "").trim() || "Driver",
            senderUserId: ownerUserId,
            messageType: "system",
            metadata,
          });
        } catch {
          // Location was still persisted + broadcast; chat trail is best-effort.
        }

        setSharedToast({ cityLabel, at: recordedAt, tripId });
      } catch (err) {
        if (__DEV__) {
          console.warn("[driver] shipper location ping failed", err);
        }
      } finally {
        inFlightRef.current.delete(tripId);
      }
    },
    [enabled, ownerUserId, driverDisplayName],
  );

  useEffect(() => {
    if (!enabled || activeTripIds.length === 0) return;

    const channels = activeTripIds.map((tripId) => {
      const channel = supabase().channel(
        `${trackingTripChannelName(tripId)}:driver-ping`,
        { config: { broadcast: { self: false } } },
      );
      channel.on(
        "broadcast",
        { event: TRACKING_BROADCAST_EVENT.PING_REQUEST },
        () => {
          void handlePing(tripId);
        },
      );
      void channel.subscribe();
      return channel;
    });

    return () => {
      for (const channel of channels) {
        void supabase().removeChannel(channel);
      }
    };
  }, [enabled, activeTripIdsKey, activeTripIds, handlePing]);

  useEffect(() => {
    if (!sharedToast) return;
    const t = globalThis.setTimeout(() => setSharedToast(null), 4_500);
    return () => globalThis.clearTimeout(t);
  }, [sharedToast]);

  return { sharedToast, dismissSharedToast };
}
