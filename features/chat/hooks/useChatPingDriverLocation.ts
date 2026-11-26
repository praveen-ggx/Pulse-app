/**
 * Business chat: ping driver location.
 *
 * Smart flow:
 *  1. Check whether the driver is online (presence / last GPS).
 *  2. Always publish a realtime ping request (and keep waiting for a live fix).
 *  3. If a last-known fix exists, post it into chat immediately.
 *  4. UI reflects offline / GPS-needed / timeout so the shipper knows what to expect.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as chatService from "@/features/chat/services/chat.service";
import type { MessageSenderRole } from "@/features/chat/types/chat.types";
import {
  buildLocationPingChatContent,
  buildLocationPingChatMetadata,
} from "@/features/chat/utils/locationPingChatPayload.util";
import { extractCityFromLocationLabel } from "@/features/trips/utils/driverLastPingDisplay.util";
import * as driverLocationService from "@/features/driver/services/driverLocation.service";
import * as tripsService from "@/features/trips/services/trips.service";
import { publishPingRequest } from "@/features/tracking/broadcast/publishTrackingBroadcast";
import { subscribeTrackingTripBroadcast } from "@/features/tracking/broadcast/TrackingBroadcastSubscriptionManager";
import { TRACKING_PING_TIMEOUT_MS } from "@/features/tracking/constants";
import { useChatStore } from "@/features/chat/store/useChatStore";

export type ChatPingPhase =
  | "idle"
  | "pinging_online"
  | "pinging_offline"
  | "timed_out"
  | "timed_out_offline"
  | "gps_needed";

export type UseChatPingDriverLocationArgs = {
  tripId: string | null;
  conversationId: string | null;
  organizationId: string | null;
  senderRole: MessageSenderRole;
  senderName: string;
  senderUserId: string | null;
  enabled: boolean;
};

export type UseChatPingDriverLocationResult = {
  pingLocation: () => void;
  isPinging: boolean;
  pingTimedOut: boolean;
  lastCityLabel: string | null;
  driverOnline: boolean | null;
  pingPhase: ChatPingPhase;
};

export function useChatPingDriverLocation({
  tripId,
  conversationId,
  organizationId,
  senderRole,
  senderName,
  senderUserId,
  enabled,
}: UseChatPingDriverLocationArgs): UseChatPingDriverLocationResult {
  const [isPinging, setIsPinging] = useState(false);
  const [pingTimedOut, setPingTimedOut] = useState(false);
  const [lastCityLabel, setLastCityLabel] = useState<string | null>(null);
  const [driverOnline, setDriverOnline] = useState<boolean | null>(null);
  const [gpsNeeded, setGpsNeeded] = useState(false);

  const isPingingRef = useRef(false);
  const driverOnlineRef = useRef<boolean | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timedOutResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPingTimeout = () => {
    if (timeoutRef.current !== null) {
      globalThis.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const clearTimedOutReset = () => {
    if (timedOutResetRef.current !== null) {
      globalThis.clearTimeout(timedOutResetRef.current);
      timedOutResetRef.current = null;
    }
  };

  const resolvePing = useCallback(() => {
    if (!isPingingRef.current) return;
    isPingingRef.current = false;
    clearPingTimeout();
    setIsPinging(false);
    setPingTimedOut(false);
    setGpsNeeded(false);
  }, []);

  useEffect(() => {
    if (!tripId || !enabled) return;
    return subscribeTrackingTripBroadcast(tripId, {
      onPosition: () => {
        resolvePing();
      },
      onPingStatus: (payload) => {
        if (!isPingingRef.current) return;
        if (payload.status === "gps_denied") {
          isPingingRef.current = false;
          clearPingTimeout();
          setIsPinging(false);
          setGpsNeeded(true);
          setPingTimedOut(false);
          timedOutResetRef.current = globalThis.setTimeout(() => {
            setGpsNeeded(false);
          }, 5_000);
        }
      },
    });
  }, [tripId, enabled, resolvePing]);

  useEffect(
    () => () => {
      clearPingTimeout();
      clearTimedOutReset();
    },
    [],
  );

  const pingPhase: ChatPingPhase = gpsNeeded
    ? "gps_needed"
    : isPinging
      ? driverOnline === false
        ? "pinging_offline"
        : "pinging_online"
      : pingTimedOut
        ? driverOnline === false
          ? "timed_out_offline"
          : "timed_out"
        : "idle";

  const pingLocation = useCallback(() => {
    if (
      !enabled ||
      !tripId ||
      !conversationId ||
      !organizationId ||
      isPingingRef.current
    ) {
      return;
    }

    clearTimedOutReset();
    setPingTimedOut(false);
    setGpsNeeded(false);
    isPingingRef.current = true;
    setIsPinging(true);

    void (async () => {
      let online: boolean | null = null;
      try {
        const { state } = await tripsService.getTripDriverOnlineState(tripId);
        online = state?.isOnline ?? false;
        driverOnlineRef.current = online;
        setDriverOnline(online);
      } catch {
        online = null;
        driverOnlineRef.current = null;
        setDriverOnline(null);
      }

      try {
        const { location } =
          await driverLocationService.getLatestDriverLocationForTrip(tripId);

        let city: string | null = null;
        let addressLabel: string | null = null;

        if (
          location &&
          Number.isFinite(location.latitude) &&
          Number.isFinite(location.longitude)
        ) {
          try {
            const { reverseGeocodeCityStateLabel } = await import(
              "@/lib/reverseGeocodePlace.util"
            );
            const geo = await reverseGeocodeCityStateLabel(
              location.latitude,
              location.longitude,
            );
            addressLabel = geo?.trim() || null;
            city = addressLabel
              ? extractCityFromLocationLabel(addressLabel) || addressLabel
              : null;
          } catch {
            // best-effort
          }

          if (city) setLastCityLabel(city);

          const content = buildLocationPingChatContent(city || "En route");
          const metadata = buildLocationPingChatMetadata({
            location: {
              lat: location.latitude,
              lng: location.longitude,
              address_name: addressLabel || city,
              recorded_at: location.recorded_at,
            },
            shipperRequested: true,
          });

          const persisted = await chatService.sendChatMessage({
            conversationId,
            organizationId,
            content,
            senderRole,
            senderName,
            senderUserId,
            messageType: "system",
            metadata,
          });
          useChatStore.getState().appendMessage(conversationId, persisted);
        }

        // Always ask the driver for a fresh fix — even when offline so the
        // request is waiting the moment they reconnect / open the app.
        void publishPingRequest(tripId);
      } catch (err) {
        if (__DEV__) {
          console.warn("[chat] ping driver location failed", err);
        }
        isPingingRef.current = false;
        setIsPinging(false);
        setPingTimedOut(true);
        timedOutResetRef.current = globalThis.setTimeout(() => {
          setPingTimedOut(false);
        }, 3_000);
        return;
      }

      clearPingTimeout();
      timeoutRef.current = globalThis.setTimeout(() => {
        if (!isPingingRef.current) return;
        isPingingRef.current = false;
        setIsPinging(false);
        // Offline: treat timeout as "request queued", not a hard failure tone.
        if (driverOnlineRef.current === false) {
          setPingTimedOut(true);
        } else {
          setPingTimedOut(true);
        }
        timedOutResetRef.current = globalThis.setTimeout(() => {
          setPingTimedOut(false);
        }, 4_000);
      }, TRACKING_PING_TIMEOUT_MS);
    })();
  }, [
    enabled,
    tripId,
    conversationId,
    organizationId,
    senderRole,
    senderName,
    senderUserId,
  ]);

  return {
    pingLocation,
    isPinging,
    pingTimedOut,
    lastCityLabel,
    driverOnline,
    pingPhase,
  };
}
