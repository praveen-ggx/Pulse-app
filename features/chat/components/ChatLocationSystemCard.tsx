import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { MapPin, Navigation2, Radar } from "lucide-react-native";
import Theme from "@/constants/Theme";
import type { TripMessageRow } from "../types/chat.types";
import type { SystemLogLocationData } from "../utils/locationLogPayload.util";
import {
  buildLocationPingCardCopy,
  formatLocationPingShortLog,
  isRealLocationSample,
  isSimulatedLocationPing,
  resolveLocationCityLabel,
  type LocationPingTripHint,
} from "../utils/locationPingChatDisplay.util";
import { formatTripEventSheetDate, TripProgressEventCard } from "./ChatEventCard";
import {
  resolveLocationPingDriverAvatar,
  type LocationPingDriverContext,
} from "../utils/chatAvatar.util";
import { mergeMessageMetadataForEventPayload } from "../utils/eventPayloadMerge.util";

/** Arrival ETA from tracking / ping metadata, as "ETA · 25 Nov, 8:35 PM". */
function resolveEtaDateTimeLabel(
  message: TripMessageRow,
): string | null {
  const m = mergeMessageMetadataForEventPayload(message) as
    | Record<string, unknown>
    | null;
  if (!m) return null;

  const ep =
    m.event_payload &&
    typeof m.event_payload === "object" &&
    !Array.isArray(m.event_payload)
      ? (m.event_payload as Record<string, unknown>)
      : null;

  const labelRaw = m.eta_label ?? ep?.eta_label;
  if (typeof labelRaw === "string" && labelRaw.trim()) {
    const label = labelRaw.trim();
    // Already looks like a clock / date stamp — keep as-is with ETA prefix.
    if (/eta/i.test(label)) return label;
    return `ETA · ${label}`;
  }

  const minsRaw = m.eta_minutes ?? ep?.eta_minutes;
  const mins = minsRaw != null ? Number(minsRaw) : NaN;
  if (!Number.isFinite(mins) || mins < 0) return null;

  const baseMs = Date.parse(message.created_at);
  if (!Number.isFinite(baseMs)) return null;
  const arrivalIso = new Date(baseMs + mins * 60_000).toISOString();
  return `ETA · ${formatLocationPingShortLog(null, arrivalIso)}`;
}

export interface ChatLocationSystemCardProps {
  message: TripMessageRow;
  location: SystemLogLocationData | null;
  isMobile?: boolean;
  consolidatedCount?: number;
  tripHint?: LocationPingTripHint;
  composeTrip?: LocationPingDriverContext["composeTrip"];
  conversationDriverId?: string | null;
  /**
   * Driver app thread — compact “shared to shipper” receipt instead of
   * the verbose dispatcher “Driver is at…” system card.
   */
  isOwnDriverSend?: boolean;
  /** Force driver-app presentation even for system-authored location rows. */
  driverAppPresentation?: boolean;
}

function isShipperRequestedPing(message: TripMessageRow): boolean {
  const m = mergeMessageMetadataForEventPayload(message);
  const ep = m?.event_payload;
  if (!ep || typeof ep !== "object" || Array.isArray(ep)) return false;
  return (ep as { shipper_requested?: unknown }).shipper_requested === true;
}

/**
 * System-update style card for driver location pings — city label only, no map tiles.
 *
 * Driver app uses a compact shared-location receipt; business/dispatcher keeps
 * the trip-progress system card (with consecutive-run consolidation).
 */
export function ChatLocationSystemCard({
  message,
  location,
  consolidatedCount,
  tripHint,
  composeTrip,
  conversationDriverId,
  isOwnDriverSend = false,
  driverAppPresentation = false,
}: ChatLocationSystemCardProps) {
  const simulated = isSimulatedLocationPing(message);
  const cityLabel = resolveLocationCityLabel(
    location,
    message.content,
    tripHint,
  );
  const shipperRequested = isShipperRequestedPing(message);

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  const sharedAtStamp = formatLocationPingShortLog(
    location?.recorded_at,
    message.created_at,
  );
  const etaStamp = resolveEtaDateTimeLabel(message);

  // ── Driver app: compact shared-location receipt ───────────────────────────
  if (isOwnDriverSend || driverAppPresentation) {
    return (
      <DriverLocationSharedReceipt
        cityLabel={cityLabel}
        /** Prefer ETA (date+time); fall back to shared-at date+time. */
        stampLabel={etaStamp ?? sharedAtStamp}
        stampIsEta={Boolean(etaStamp)}
        simulated={simulated}
        shipperRequested={shipperRequested}
        consolidatedCount={consolidatedCount}
      />
    );
  }

  // ── Business / dispatcher view ────────────────────────────────────────────
  const { title, subLine, captureClock } = buildLocationPingCardCopy({
    location,
    message,
    simulated,
    consolidatedCount,
    tripHint,
  });
  const dateUpper = formatTripEventSheetDate(message.created_at);
  const isReal = isRealLocationSample(location, message.content);
  const statusLabel = simulated
    ? "SIMULATED LOCATION"
    : shipperRequested
      ? "PINGED LOCATION"
      : isReal
        ? "DRIVER LOCATION"
        : "TRIP STATUS (ESTIMATED)";
  const metaLine = `${dateUpper} · ${statusLabel}`;
  const driverAvatar = resolveLocationPingDriverAvatar(message, {
    composeTrip,
    conversationDriverId,
  });
  const rightPrimary = simulated
    ? "SIM"
    : shipperRequested
      ? "PING"
      : isReal
        ? "LIVE"
        : "EST";
  const rightPrimaryColor = simulated
    ? "#D97706"
    : shipperRequested
      ? Theme.primary
      : isReal
        ? "#059669"
        : "#6b7280";

  return (
    <TripProgressEventCard
      avatarSeed={driverAvatar.displayName}
      avatarIdentity={driverAvatar}
      eventKind="location"
      simulated={simulated}
      kicker={shipperRequested ? "LOCATION PING" : "SYSTEM UPDATE"}
      title={title}
      subLine={subLine}
      captureClock={captureClock}
      metaLine={metaLine}
      rightPrimary={rightPrimary}
      rightPrimaryColor={rightPrimaryColor}
      time={displayTime}
    />
  );
}

function DriverLocationSharedReceipt({
  cityLabel,
  stampLabel,
  stampIsEta,
  simulated,
  shipperRequested,
  consolidatedCount,
}: {
  cityLabel: string;
  /** Date + time on one line, e.g. "25 Nov, 8:35 PM" or "ETA · 25 Nov, 9:10 PM". */
  stampLabel: string;
  stampIsEta: boolean;
  simulated: boolean;
  shipperRequested: boolean;
  consolidatedCount?: number;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
    transform: [
      {
        scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }),
      },
    ],
  };

  const count =
    typeof consolidatedCount === "number" && consolidatedCount > 1
      ? consolidatedCount
      : null;

  return (
    <View style={s.driverWrap}>
      <View style={s.driverCard}>
        <View style={s.driverIconStack}>
          <Animated.View style={[s.driverPingRing, ringStyle]} />
          <View style={s.driverIconPlate}>
            {shipperRequested ? (
              <Radar size={14} color={Theme.textOnPrimary} strokeWidth={2.4} />
            ) : (
              <Navigation2 size={14} color={Theme.textOnPrimary} strokeWidth={2.4} />
            )}
          </View>
        </View>
        <View style={s.driverCopy}>
          <Text style={s.driverTitle}>
            {simulated
              ? "Simulated location shared"
              : shipperRequested
                ? "Your current location shared to shipper"
                : "Live location update shared"}
          </Text>
          <View style={s.driverMetaRow}>
            {cityLabel ? (
              <View style={s.driverCityChip}>
                <MapPin size={10} color={Theme.driverPrimary} strokeWidth={2.4} />
                <Text style={s.driverCityText} numberOfLines={1}>
                  {cityLabel}
                </Text>
              </View>
            ) : null}
            {count ? (
              <Text style={s.driverCount}>{count} updates</Text>
            ) : null}
            <Text
              style={[s.driverTime, stampIsEta && s.driverEta]}
              numberOfLines={1}
              accessibilityLabel={stampLabel}
            >
              {stampLabel}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  driverWrap: {
    alignItems: "stretch",
    paddingHorizontal: 4,
    marginVertical: 6,
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Theme.driverDock,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.driverEmeraldBorder,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  driverIconStack: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  driverPingRing: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Theme.driverPrimary,
  },
  driverIconPlate: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.driverPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  driverCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  driverTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: Theme.driverOnForest,
    letterSpacing: -0.1,
  },
  driverMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  driverCityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: "62%",
    backgroundColor: Theme.driverEmeraldMuted,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  driverCityText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: Theme.driverPrimary,
    flexShrink: 1,
  },
  driverCount: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.driverDockIconMuted,
  },
  driverTime: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.driverDockIconMuted,
    marginLeft: "auto" as unknown as number,
    maxWidth: "58%",
    textAlign: "right",
  },
  driverEta: {
    color: Theme.driverPrimary,
    fontWeight: "700",
  },
});
