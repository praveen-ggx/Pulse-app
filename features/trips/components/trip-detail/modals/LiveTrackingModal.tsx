/**
 * Full-screen Live Tracking modal — extracted from TripDetailScreen.
 * Web/desktop: same Leaflet TripMap as trip detail (route, driver pin, ping trail).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Feather } from "@expo/vector-icons";
import { Home, Navigation, Package } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getTripDisplayNumber,
  type TripRow,
} from "../../../services/trips.service";
import { TripMap, type TripMapProps } from "../TripMap";
import {
  buildDriverLastPingDisplay,
  formatHubPingOfflineLabel,
  formatHubPingTimeLabel,
} from "@/features/trips/utils/driverLastPingDisplay.util";
import { formatTrackingDateTime } from "@/features/trips/utils/formatTrackingTimestamp.util";
import { getProfile } from "@/features/auth/services/auth.service";
import { getOrganizationMembers } from "@/features/organization/services/members.service";
import {
  collectActivityTimelineActorIds,
  fallbackActorForStatusContext,
  formatActivityTimelineActorLabel,
  isActivityActorUserId,
} from "@/features/trips/utils/activityTimelineActor.util";
import type { LiveTrackingPresentation } from "@/features/trips/utils/liveTrackingPresentation.util";
import type { DriverActivityTimelineRow } from "../hooks/useTripDetail";
import type { TrackingState } from "@/features/tracking/hooks/useTrackingState";

interface LiveTrackingModalProps {
  visible: boolean;
  onClose: () => void;

  trip: TripRow;
  isClientIndentView?: boolean;
  /** In-transit but driver not broadcasting (or not linked). */
  isDriverOffline?: boolean;
  onSendLoginReminder?: () => void;
  onReassignDriver?: () => void;
  trackingState: TrackingState;

  // Map props (desktop TripMap on web)
  vehicleLabel: string | null;
  locationLabels: [string, string, string, string, string];
  originCoordinate: { latitude: number; longitude: number } | null;
  destinationCoordinate: { latitude: number; longitude: number } | null;
  tripLocationPoints: { latitude: number; longitude: number; recorded_at: string }[];
  locationAddress: string | null;
  mapTruckLocation?: { latitude: number; longitude: number } | null;
  mapDbLocationTrail: TripMapProps["dbLocationTrail"];
  mapTruckStatus: TripMapProps["truckStatus"];
  trackingBroadcastActive?: boolean;
  lastPingRecordedAt?: string | null;
  /** Live map pin avatar (matches driver-app map). */
  driverAvatarUri?: string | null;
  driverAvatarSeed?: string | null;

  // Timeline props
  driverActivityTimelineRows: DriverActivityTimelineRow[];
  expandedTimelineEntryIds: Record<string, boolean>;
  onToggleTimelineItem: (id: string) => void;
  assignmentDriverNames: Record<string, string>;
  assignmentVehicleLabels: Record<string, string>;
  driverName: string | null;
  driverPhone?: string | null;
  currentUserId: string | null;
  displayClientName?: string | null;
  /** Computed once in TripDetailScreen from the Trip Operations Platform; null only during initial load. */
  presentation: LiveTrackingPresentation | null;
}

function formatAssignmentDate(iso: string | null | undefined): string {
  return formatTrackingDateTime(iso);
}

function timelineItemId(item: DriverActivityTimelineRow): string {
  return item.kind === "assignment" ? item.row.id : item.id;
}

export function LiveTrackingModal({
  visible,
  onClose,
  trip,
  isClientIndentView: _isClientIndentView,
  isDriverOffline: isDriverOfflineProp,
  onSendLoginReminder,
  onReassignDriver,
  trackingState,
  vehicleLabel,
  locationLabels: _locationLabels,
  originCoordinate,
  destinationCoordinate,
  tripLocationPoints: _tripLocationPoints,
  locationAddress,
  mapTruckLocation,
  mapDbLocationTrail,
  mapTruckStatus,
  trackingBroadcastActive = false,
  lastPingRecordedAt,
  driverAvatarUri,
  driverAvatarSeed,
  driverActivityTimelineRows,
  expandedTimelineEntryIds,
  onToggleTimelineItem,
  assignmentDriverNames,
  assignmentVehicleLabels,
  driverName,
  driverPhone,
  currentUserId,
  displayClientName,
  presentation,
}: LiveTrackingModalProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const wideLayout = windowWidth >= Layout.webDesktopMinWidth;
  const hangCardWidth = Math.min(420, Math.max(340, Math.round(windowWidth * 0.32)));
  const [activityOpen, setActivityOpen] = useState(true);
  const [actorDisplayById, setActorDisplayById] = useState<Record<string, string>>(
    {},
  );
  const timelineActorIds = useMemo(
    () => collectActivityTimelineActorIds(driverActivityTimelineRows),
    [driverActivityTimelineRows],
  );
  const timelineActorIdsKey = timelineActorIds.join(",");

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const orgId = String(trip.organization_id ?? "").trim();
    void (async () => {
      const next: Record<string, string> = {};
      if (orgId) {
        const { members } = await getOrganizationMembers(orgId);
        for (const member of members) {
          const uid = String(member.user_id ?? "").trim();
          const name =
            member.full_name?.trim() ||
            member.phone?.trim() ||
            member.email?.trim() ||
            "";
          if (uid && name) next[uid] = name;
        }
      }
      const unresolved = timelineActorIds.filter((id) => !next[id]);
      await Promise.all(
        unresolved.map(async (id) => {
          if (!isActivityActorUserId(id)) {
            next[id] = id;
            return;
          }
          const profile = await getProfile(id);
          const name =
            profile?.full_name?.trim() ||
            profile?.displayName?.trim() ||
            profile?.phone?.trim() ||
            profile?.email?.trim() ||
            "";
          if (name) next[id] = name;
        }),
      );
      if (!cancelled) setActorDisplayById(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, timelineActorIdsKey, timelineActorIds, trip.organization_id]);
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, handleClose]);

  const handleCallDriverToCoordinate = useCallback(async () => {
    const normalized = (driverPhone ?? "").replace(/[^\d+]/g, "");
    if (!normalized) {
      Alert.alert(
        "Unable to call",
        "No driver phone number on file. Assign or update the driver contact on the trip.",
      );
      return;
    }
    try {
      await Linking.openURL(`tel:${normalized}`);
    } catch {
      Alert.alert(
        "Unable to call",
        "Phone calls are not available on this device or the number could not be opened.",
      );
    }
  }, [driverPhone]);

  const openLastPingInMaps = useCallback(async () => {
    if (!mapTruckLocation) return;
    const { latitude, longitude } = mapTruckLocation;
    const label = encodeURIComponent(
      (locationAddress ?? "").trim() || "Driver location",
    );
    const url =
      Platform.OS === "ios"
        ? `maps:?q=${latitude},${longitude}&ll=${latitude},${longitude}`
        : Platform.OS === "android"
          ? `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`
          : `https://www.google.com/maps?q=${latitude},${longitude}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to open maps", "Could not open the driver location.");
    }
  }, [mapTruckLocation, locationAddress]);

  const openPingInMaps = useCallback(async (latitude: number, longitude: number) => {
    const label = encodeURIComponent("Driver ping");
    const url =
      Platform.OS === "ios"
        ? `maps:?q=${latitude},${longitude}&ll=${latitude},${longitude}`
        : Platform.OS === "android"
          ? `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`
          : `https://www.google.com/maps?q=${latitude},${longitude}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to open maps", "Could not open this ping location.");
    }
  }, []);

  if (!visible) return null;

  const driverOffline =
    isDriverOfflineProp ?? !trackingState.driverOnline;
  const lastPingDisplay = buildDriverLastPingDisplay({
    latitude: mapTruckLocation?.latitude ?? null,
    longitude: mapTruckLocation?.longitude ?? null,
    locationAddress,
    recordedAt: lastPingRecordedAt,
  });
  const offlineLabel = formatHubPingOfflineLabel(lastPingRecordedAt);
  const pingTimeShort = lastPingRecordedAt
    ? formatHubPingTimeLabel(lastPingRecordedAt)
    : null;
  // Trip stage headline (deriveTripStage/getStageMetadata via presentation) --
  // driver connectivity (online/offline/broadcasting) is shown separately by
  // the TRACKING/LIVE/OFFLINE chip below, not conflated into this text.
  const statusHeadline = presentation?.statusTitle ?? "Tracking trip";
  const tripRef = getTripDisplayNumber(trip);
  const headerTitle =
    (displayClientName ?? trip.client_name ?? "").trim() ||
    locationPrimaryLine(trip.pickup_area) ||
    tripRef;
  const headerSubtitle = [
    driverName?.trim() || null,
    vehicleLabel?.trim() || null,
    tripRef,
  ]
    .filter(Boolean)
    .join(" · ");
  const originPrimary = locationPrimaryLine(trip.pickup_area);
  const destPrimary = locationPrimaryLine(trip.drop_location);
  const driverPingLine =
    lastPingDisplay.locationLabel ?? lastPingDisplay.cityLabel ?? null;

  // Distance-based journey progress (real GPS-covered distance vs. planned
  // route), not a workflow step count -- see computeJourneyMetrics(). Falls
  // back to a coarse stage estimate before departure via the presentation
  // builder itself; 0 only while presentation hasn't loaded yet.
  const progressPct = Math.round((presentation?.progressFraction ?? 0) * 100);
  const statusTone = driverOffline
    ? "offline"
    : trackingState.broadcastActive
      ? "live"
      : "idle";

  const timelineSection = (
    <View style={styles.timelineWrap}>
      {driverActivityTimelineRows.length === 0 ? (
        <View style={styles.emptyTimeline}>
          <Text style={styles.emptyTimelineText}>No activity recorded yet</Text>
        </View>
      ) : (
        <>
          <View style={styles.timelineLine} />
          {driverActivityTimelineRows.map((item, idx) => {
            const itemId = timelineItemId(item);
            const isExpanded = !!expandedTimelineEntryIds[itemId];
            const isFirst = idx === 0;
            const isLast = idx === driverActivityTimelineRows.length - 1;

            if (item.kind === "status") {
              const actorLabel = formatActivityTimelineActorLabel({
                actorUserId: item.actorUserId,
                currentUserId,
                displayById: actorDisplayById,
                fallback:
                  item.status_context === "accepted"
                    ? driverName?.trim() || "Driver"
                    : fallbackActorForStatusContext(item.status_context),
              });
              const contextLabel =
                item.status_context === "completed"
                  ? "Delivery completed"
                  : item.status_context === "in_transit"
                    ? "Movement update"
                    : item.status_context === "assigned"
                      ? "Assignment"
                      : item.status_context === "created"
                        ? "Trip created"
                        : "Driver status change";
              return (
                <TimelineItem
                  key={item.id}
                  label={item.status_label}
                  sublabel={`${contextLabel} · ${actorLabel}`}
                  date={formatAssignmentDate(item.changed_at)}
                  isFirst={isFirst}
                  isLast={isLast}
                  isExpanded={isExpanded}
                  onPress={() => onToggleTimelineItem(itemId)}
                  expandedContent={
                    <ExpandedContent
                      lines={[
                        ["Event", item.status_label],
                        ["Context", item.detail_line],
                        ["Updated by", actorLabel],
                        [
                          "Recorded at",
                          formatAssignmentDate(item.changed_at),
                        ],
                      ]}
                    />
                  }
                />
              );
            }

            const row = item.row;
            const eventLabel =
              row.event_type === "reassignment" ? "Reassignment" : "Assignment";
            const dateStr = formatAssignmentDate(row.changed_at);
            const actorLabel = formatActivityTimelineActorLabel({
              actorUserId: row.changed_by,
              currentUserId,
              displayById: actorDisplayById,
              fallback: "Dispatcher",
            });
            const byLabel = row.changed_by != null ? ` · ${actorLabel}` : "";
            const isFallback = row.id === "fallback";
            const driverPrev =
              !isFallback && row.driver_id_prev
                ? (assignmentDriverNames[row.driver_id_prev] ??
                  row.driver_id_prev)
                : null;
            const driverNew = row.driver_id_new
              ? (assignmentDriverNames[row.driver_id_new] ??
                (isFallback ? (driverName ?? null) : row.driver_id_new))
              : null;
            const vehiclePrev =
              !isFallback && row.vehicle_id_prev
                ? (assignmentVehicleLabels[row.vehicle_id_prev] ??
                  row.vehicle_id_prev)
                : null;
            const vehicleNew = row.vehicle_id_new
              ? (assignmentVehicleLabels[row.vehicle_id_new] ??
                (isFallback ? (vehicleLabel ?? null) : row.vehicle_id_new))
              : null;
            const driverLine =
              driverPrev && driverNew
                ? `Driver: ${driverPrev} → ${driverNew}`
                : driverNew
                  ? `Driver: ${driverNew}`
                  : driverPrev
                    ? `Driver: ${driverPrev} (removed)`
                    : null;
            const vehicleLine =
              vehiclePrev && vehicleNew
                ? `Vehicle: ${vehiclePrev} → ${vehicleNew}`
                : vehicleNew
                  ? `Vehicle: ${vehicleNew}`
                  : vehiclePrev
                    ? `Vehicle: ${vehiclePrev} (removed)`
                    : null;
            const detail = [driverLine, vehicleLine]
              .filter(Boolean)
              .join("  ·  ");

            return (
              <TimelineItem
                key={row.id}
                label={detail || eventLabel}
                sublabel={`${eventLabel} @ node${byLabel}`}
                date={dateStr}
                isFirst={isFirst}
                isLast={isLast}
                isExpanded={isExpanded}
                onPress={() => onToggleTimelineItem(itemId)}
                expandedContent={
                  <ExpandedContent
                    lines={[
                      ["Event type", eventLabel],
                      [
                        "Driver update",
                        driverLine ?? "No driver change recorded",
                      ],
                      [
                        "Vehicle update",
                        vehicleLine ?? "No vehicle change recorded",
                      ],
                      [
                        "Updated by",
                        row.changed_by != null ? actorLabel : "System",
                      ],
                      ["Recorded at", dateStr],
                    ]}
                  />
                }
              />
            );
          })}
        </>
      )}
    </View>
  );

  const driverDisplayName = driverName?.trim() || "Driver";
  const hasPhone = Boolean(driverPhone?.trim());

  // Sample prior GPS points (movement) so the route lists driver travel, not
  // only origin → current. Latest point is the Current row below.
  const movementPings = (() => {
    const trail = mapDbLocationTrail ?? [];
    if (trail.length === 0) return [] as typeof trail;
    const prior = mapTruckLocation && trail.length > 1 ? trail.slice(0, -1) : trail;
    if (prior.length === 0) return [] as typeof trail;
    const max = 4;
    if (prior.length <= max) return prior;
    const step = (prior.length - 1) / (max - 1);
    return Array.from({ length: max }, (_, i) => prior[Math.round(i * step)]!);
  })();

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <View style={styles.mapFill} pointerEvents="box-none">
          <TripMap
            source={(trip.pickup_area ?? "").trim() || undefined}
            destination={(trip.drop_location ?? "").trim() || undefined}
            sourceCoords={originCoordinate ?? undefined}
            destCoords={destinationCoordinate ?? undefined}
            truckLocation={mapTruckLocation ?? undefined}
            dbLocationTrail={mapDbLocationTrail ?? []}
            truckStatus={mapTruckStatus}
            height="100%"
            tripId={trip.id}
            trackingEnabled={
              trackingBroadcastActive || (mapDbLocationTrail?.length ?? 0) > 0
            }
            fitPaddingBottom={wideLayout ? 56 : Math.round(windowHeight * 0.42)}
            fitPaddingRight={wideLayout ? hangCardWidth + 28 : 40}
            driverAvatarUri={driverAvatarUri}
            driverAvatarSeed={driverAvatarSeed ?? trip.driver_id}
            driverOnline={trackingBroadcastActive}
          />
          {trackingState.broadcastActive ? (
            <View
              style={[styles.livePill, { top: insets.top + 62 }]}
              pointerEvents="none"
            >
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>LIVE</Text>
            </View>
          ) : (mapDbLocationTrail?.length ?? 0) > 0 ? (
            <View
              style={[styles.livePill, styles.historyPill, { top: insets.top + 62 }]}
              pointerEvents="none"
            >
              <Text style={styles.livePillText}>PINGS</Text>
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.headerBar,
            {
              paddingTop: insets.top + 8,
              paddingRight: wideLayout ? hangCardWidth + 28 : SCREEN_PAD,
            },
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              styles.headerCircleBtn,
              pressed && styles.headerCircleBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close live tracking"
            hitSlop={Layout.touchTargetHitSlop}
          >
            <FontAwesome name="chevron-left" size={14} color={Theme.textPrimaryDark} />
          </Pressable>

          <View style={styles.headerCenter} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1}>
              {headerTitle}
            </Text>
            {headerSubtitle ? (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {headerSubtitle}
              </Text>
            ) : null}
          </View>

          <Pressable
            onPress={hasPhone ? handleCallDriverToCoordinate : undefined}
            disabled={!hasPhone}
            style={({ pressed }) => [
              styles.headerCircleBtn,
              !hasPhone && styles.headerCircleBtnDisabled,
              pressed && hasPhone && styles.headerCircleBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={hasPhone ? "Call driver" : "No driver phone"}
            hitSlop={Layout.touchTargetHitSlop}
          >
            <FontAwesome
              name="phone"
              size={14}
              color={hasPhone ? Theme.textPrimaryDark : Theme.textMuted}
            />
          </Pressable>
        </View>

        <View
          style={[
            styles.hangCard,
            wideLayout
              ? [
                  styles.hangCardRight,
                  {
                    width: hangCardWidth,
                    top: insets.top + 64,
                    bottom: insets.bottom + 16,
                    right: 16,
                  },
                ]
              : [
                  styles.hangCardBottom,
                  {
                    left: 12,
                    right: 12,
                    bottom: insets.bottom + 12,
                    maxHeight: Math.round(windowHeight * 0.5),
                  },
                ],
          ]}
        >
          <ScrollView
            style={styles.hangCardScroll}
            contentContainerStyle={styles.hangCardScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <View style={styles.sheetStack}>
            <View style={styles.statusCard}>
              <View
                style={[
                  styles.statusBanner,
                  statusTone === "offline" && {
                    backgroundColor: TRACKING.offline.bannerBg,
                    borderColor: TRACKING.offline.bannerBorder,
                  },
                  statusTone === "live" && {
                    backgroundColor: TRACKING.live.bannerBg,
                    borderColor: TRACKING.live.bannerBorder,
                  },
                ]}
              >
                <View style={styles.statusBannerTop}>
                  <View style={styles.statusBannerLeft}>
                    <View
                      style={[
                        styles.statusIconWrap,
                        statusTone === "offline" && {
                          backgroundColor: TRACKING.offline.iconBg,
                        },
                        statusTone === "live" && {
                          backgroundColor: TRACKING.live.iconBg,
                        },
                        statusTone === "idle" && {
                          backgroundColor: TRACKING.idle.iconBg,
                        },
                      ]}
                    >
                      <Feather
                        name={
                          statusTone === "offline"
                            ? "wifi-off"
                            : statusTone === "live"
                              ? "radio"
                              : "truck"
                        }
                        size={15}
                        color={
                          statusTone === "offline"
                            ? Theme.textPrimaryDark
                            : Theme.textOnPrimary
                        }
                      />
                    </View>
                    <View style={styles.statusCopy}>
                      <Text style={styles.statusHeadline} numberOfLines={2}>
                        {statusHeadline}
                      </Text>
                      {presentation?.distanceRemainingLabel ? (
                        <Text style={styles.statusSubcopy} numberOfLines={1}>
                          {presentation.distanceRemainingLabel}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
                <View style={styles.statusMetaRow}>
                  <View
                    style={[
                      styles.statusChip,
                      statusTone === "offline" && {
                        backgroundColor: TRACKING.offline.chipBg,
                      },
                      statusTone === "live" && {
                        backgroundColor: TRACKING.live.chipBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        statusTone === "offline" && {
                          color: TRACKING.offline.chipText,
                        },
                        statusTone === "live" && {
                          color: TRACKING.live.chipText,
                        },
                      ]}
                    >
                      {statusTone === "offline"
                        ? "OFFLINE"
                        : statusTone === "live"
                          ? "LIVE"
                          : "TRACKING"}
                    </Text>
                  </View>
                  <Text style={styles.progressPctLabel}>{progressPct}% en route</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${progressPct}%`,
                        backgroundColor:
                          statusTone === "offline"
                            ? TRACKING.offline.progress
                            : statusTone === "live"
                              ? TRACKING.live.progress
                              : TRACKING.idle.progress,
                      },
                    ]}
                  />
                </View>
                {presentation?.showEta ? (
                  <View style={styles.arrivalRow}>
                    <Text style={styles.arrivalLabel}>Expected arrival</Text>
                    <Text
                      style={[
                        styles.arrivalValue,
                        presentation.eta.isUnavailable && styles.arrivalValueMuted,
                      ]}
                      numberOfLines={1}
                    >
                      {presentation.eta.label}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.driverCard}>
                <Text style={styles.driverCardLabel}>Driver</Text>
                <View style={styles.driverCardBody}>
                  <View style={styles.driverCardTextCol}>
                    <Text style={styles.driverCardName} numberOfLines={1}>
                      {driverDisplayName}
                    </Text>
                    {vehicleLabel?.trim() ? (
                      <Text style={styles.driverCardVehicle} numberOfLines={1}>
                        {vehicleLabel.trim()}
                      </Text>
                    ) : null}
                    <View style={styles.driverCardMetaRow}>
                      <Text style={styles.driverCardMetaLabel}>Last updated</Text>
                      <Text
                        style={[
                          styles.driverCardMetaValue,
                          driverOffline && { color: TRACKING.offline.metaText },
                        ]}
                      >
                        {lastPingDisplay.hasPing
                          ? (offlineLabel ?? pingTimeShort ?? "Just now")
                          : "—"}
                      </Text>
                    </View>
                  </View>
                  {mapTruckLocation ? (
                    <Pressable
                      onPress={openLastPingInMaps}
                      style={({ pressed }) => [
                        styles.driverCardNavBtn,
                        pressed && styles.actionBtnPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Open driver location in maps"
                    >
                      <Navigation size={14} color={Theme.buttonPrimaryText} strokeWidth={2.4} />
                      <Text style={styles.driverCardNavBtnText}>Navigate</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={styles.routeSection}>
                <Text style={styles.routeSectionTitle}>Trip route</Text>
                <View style={styles.routeTimeline}>
                  <RouteStopRow
                    variant="origin"
                    icon={
                      <Package
                        size={12}
                        color={Theme.textPrimary}
                        strokeWidth={1.75}
                      />
                    }
                    label="Origin"
                    title={originPrimary}
                    subtitle={trip.pickup_area?.trim() || "Pickup"}
                    isFirst
                  />
                  {movementPings.map((ping, idx) => {
                    const lat = ping.latitude;
                    const lon = ping.longitude;
                    const when = ping.recorded_at
                      ? formatAssignmentDate(ping.recorded_at)
                      : "GPS ping";
                    return (
                      <RouteStopRow
                        key={`ping-${ping.recorded_at ?? idx}-${lat}-${lon}`}
                        variant="origin"
                        icon={
                          <Navigation
                            size={11}
                            color={Theme.pulseIndigo}
                            strokeWidth={2}
                          />
                        }
                        label={`Ping ${idx + 1}`}
                        title={`${lat.toFixed(4)}, ${lon.toFixed(4)}`}
                        subtitle={when}
                        onPress={() => void openPingInMaps(lat, lon)}
                        actionLabel="Open in maps"
                      />
                    );
                  })}
                  {mapTruckLocation ? (
                    <RouteStopRow
                      variant={driverOffline ? "current-offline" : "current-live"}
                      label="Current"
                      title={driverPingLine ?? "Driver location"}
                      subtitle={
                        lastPingDisplay.hasPing
                          ? (offlineLabel ?? pingTimeShort ?? "Last GPS ping")
                          : "Waiting for GPS"
                      }
                      onPress={openLastPingInMaps}
                      actionLabel="Open in maps"
                    />
                  ) : null}
                  <RouteStopRow
                    variant="destination"
                    icon={
                      <Home
                        size={12}
                        color={Theme.textPrimary}
                        strokeWidth={1.75}
                      />
                    }
                    label="Destination"
                    title={destPrimary}
                    subtitle={(trip.drop_location ?? "").trim() || "Destination"}
                    isLast
                  />
                </View>
              </View>

              <View style={styles.actionBar}>
                <Pressable
                  onPress={handleCallDriverToCoordinate}
                  disabled={!hasPhone}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.actionBtnPrimary,
                    !hasPhone && styles.actionBtnDisabled,
                    pressed && hasPhone && styles.actionBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Call driver"
                >
                  <Feather name="phone" size={14} color={Theme.textPrimaryDark} />
                  <Text style={styles.actionBtnPrimaryText}>Call driver</Text>
                </Pressable>
                {onSendLoginReminder ? (
                  <Pressable
                    onPress={onSendLoginReminder}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      styles.actionBtnSecondary,
                      pressed && styles.actionBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Request driver location"
                  >
                    <Feather name="bell" size={14} color={Theme.pulseIndigo} />
                    <Text style={styles.actionBtnSecondaryText}>
                      {driverOffline ? "Request ping" : "Nudge driver"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {onReassignDriver ? (
                <Pressable
                  onPress={onReassignDriver}
                  style={({ pressed }) => [
                    styles.reassignLink,
                    pressed && styles.headerCircleBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Reassign driver"
                >
                  <Text style={styles.reassignLinkText}>Re-assign driver</Text>
                  <Feather name="chevron-right" size={14} color={Theme.textPrimary} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.activityCard}>
              <Pressable
                onPress={() => setActivityOpen((v) => !v)}
                style={({ pressed }) => [
                  styles.activityCardHeader,
                  !activityOpen && styles.activityCardHeaderCollapsed,
                  pressed && styles.headerCircleBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ expanded: activityOpen }}
                accessibilityLabel="Toggle driver activity"
              >
                <FontAwesome name="list-alt" size={12} color={Theme.pulseIndigo} />
                <Text style={styles.activityCardTitle}>Driver activity</Text>
                <Text style={styles.activityCount}>
                  {driverActivityTimelineRows.length} events
                </Text>
                <Feather
                  name={activityOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={Theme.textPrimary}
                />
              </Pressable>
              {activityOpen ? timelineSection : null}
            </View>
          </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function locationPrimaryLine(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "—";
  const comma = raw.indexOf(",");
  return comma > 0 ? raw.slice(0, comma).trim() : raw;
}

function RouteStopRow({
  icon,
  label,
  title,
  subtitle,
  meta,
  variant = "origin",
  isFirst,
  isLast,
  onPress,
  actionLabel,
}: {
  icon?: ReactNode;
  label: string;
  title: string;
  subtitle: string;
  meta?: ReactNode;
  variant?: "origin" | "destination" | "current-live" | "current-offline";
  isFirst?: boolean;
  isLast?: boolean;
  onPress?: () => void;
  actionLabel?: string;
}) {
  const isCurrent =
    variant === "current-live" || variant === "current-offline";
  const isOffline = variant === "current-offline";
  const tone = isOffline ? TRACKING.offline : TRACKING.live;

  const trailingNavBadge = isCurrent ? (
    <View
      style={[
        styles.routeTrailingBadge,
        { backgroundColor: isOffline ? tone.badgeBg : TRACKING.live.badgeBg },
      ]}
    >
      <Navigation
        size={16}
        color={isOffline ? Theme.textPrimaryDark : Theme.textOnPrimary}
        strokeWidth={2.5}
      />
    </View>
  ) : null;

  const body = (
    <>
      <View style={styles.routeRailCol}>
        {!isFirst ? <View style={styles.routeRailLineTop} /> : null}
        <View
          style={[
            styles.routeRailDot,
            isCurrent && {
              width: 10,
              height: 10,
              borderRadius: 5,
              borderWidth: 0,
              backgroundColor: isOffline ? tone.badgeBg : TRACKING.live.badgeBg,
            },
          ]}
        >
          {!isCurrent ? icon : null}
        </View>
        {!isLast ? <View style={styles.routeRailLineBottom} /> : null}
      </View>
      <View style={[styles.routeRowBody, isCurrent && styles.routeRowBodyCurrent]}>
        <Text style={styles.routeStopLabel}>{label}</Text>
        <Text
          style={[styles.routeRowTitle, isCurrent && styles.routeRowTitleCurrent]}
          numberOfLines={isCurrent ? 2 : 1}
        >
          {title}
        </Text>
        {subtitle.trim() ? (
          <Text style={styles.routeRowSubtitle} numberOfLines={isCurrent ? 3 : 2}>
            {subtitle}
          </Text>
        ) : null}
        {meta}
        {actionLabel ? (
          <View style={styles.routeActionRow}>
            <Text style={styles.routeActionText}>{actionLabel}</Text>
            <Feather name="external-link" size={11} color={Theme.pulseIndigo} />
          </View>
        ) : null}
      </View>
      {trailingNavBadge}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.routeRow,
          isCurrent && styles.routeRowCurrent,
          isCurrent && {
            backgroundColor: isOffline ? tone.rowBg : TRACKING.live.rowBg,
            borderColor: isOffline ? tone.rowBorder : TRACKING.live.rowBorder,
          },
          pressed && styles.routeRowPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${title}`}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.routeRow,
        isCurrent && [
          styles.routeRowCurrent,
          {
            backgroundColor: isOffline ? tone.rowBg : TRACKING.live.rowBg,
            borderColor: isOffline ? tone.rowBorder : TRACKING.live.rowBorder,
          },
        ],
      ]}
    >
      {body}
    </View>
  );
}

function TimelineItem({
  label,
  sublabel,
  date,
  isFirst,
  isLast,
  isExpanded,
  onPress,
  expandedContent,
}: {
  label: string;
  sublabel: string;
  date: string;
  isFirst: boolean;
  isLast: boolean;
  isExpanded: boolean;
  onPress: () => void;
  expandedContent: ReactNode;
}) {
  return (
    <View style={styles.timelineItem}>
      <View style={[styles.timelineDot, isFirst && styles.timelineDotActive]}>
        {isFirst && <View style={styles.timelineDotInner} />}
      </View>
      <View style={[styles.timelineItemBody, !isLast && styles.timelineItemBorder]}>
        <TouchableOpacity
          style={styles.timelineItemRow}
          activeOpacity={0.85}
          onPress={onPress}
        >
          <View style={styles.timelineItemLeft}>
            <Text
              style={[styles.timelineLocation, isFirst && styles.timelineLocationActive]}
              numberOfLines={2}
            >
              {label}
            </Text>
            <Text style={styles.timelineCoords}>{sublabel}</Text>
          </View>
          <View style={styles.timelineTimeBadge}>
            <Text style={styles.timelineTimeText}>{date}</Text>
          </View>
        </TouchableOpacity>
        {isExpanded && expandedContent}
      </View>
    </View>
  );
}

function ExpandedContent({ lines }: { lines: [string, string][] }) {
  return (
    <View style={styles.expandedPanel}>
      <Text style={styles.expandedTitle}>Activity details</Text>
      {lines.map(([key, value]) => (
        <Text key={key} style={styles.expandedLine}>
          {key}: {value}
        </Text>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const SCREEN_PAD = Layout.screenPaddingHorizontal;

/** Activity rail geometry — dot centre must sit on the first text line and on the line. */
const TIMELINE_DOT_SIZE = 14;
const TIMELINE_ROW_PAD_V = 10;
const TIMELINE_LABEL_LINE_HEIGHT = 15;
const TIMELINE_DOT_TOP = Math.round(
  TIMELINE_ROW_PAD_V + TIMELINE_LABEL_LINE_HEIGHT / 2 - TIMELINE_DOT_SIZE / 2,
);
const TIMELINE_DOT_CENTER = TIMELINE_DOT_TOP + TIMELINE_DOT_SIZE / 2;

/** Solid tracking tones — slate + Pulse purple (offline), green (live). */
const TRACKING = {
  live: {
    bannerBg: Theme.positiveMuted,
    bannerBorder: Theme.positive,
    iconBg: Theme.positive,
    chipBg: Theme.positive,
    chipText: Theme.textOnPrimary,
    progress: Theme.positive,
    rowBg: "#ECFDF5",
    rowBorder: "rgba(21, 128, 61, 0.28)",
    badgeBg: Theme.pulseIndigo,
    metaText: Theme.positive,
  },
  offline: {
    bannerBg: "#EEF2FF",
    bannerBorder: "#C7D2FE",
    iconBg: Theme.loadMainTabBg,
    chipBg: Theme.loadDoneSubTabBg,
    chipText: Theme.textPrimaryDark,
    progress: Theme.loadDoneSubTabBg,
    rowBg: "#F5F3FF",
    rowBorder: Theme.pulseIndigoRing,
    badgeBg: Theme.loadMainTabBg,
    metaText: Theme.textPrimary,
  },
  idle: {
    bannerBg: Theme.surface,
    bannerBorder: Theme.borderMedium,
    iconBg: Theme.pulseIndigo,
    chipBg: Theme.surfaceGray,
    chipText: Theme.textPrimaryDark,
    progress: Theme.pulseIndigo,
    rowBg: Theme.pulseIndigoWash,
    rowBorder: Theme.pulseIndigoRing,
    badgeBg: Theme.pulseIndigo,
    metaText: Theme.textPrimary,
  },
} as const;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  mapFill: {
    ...StyleSheet.absoluteFillObject,
  },
  hangCard: {
    position: "absolute",
    zIndex: 3,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 28,
      },
      android: { elevation: 12 },
      default: { boxShadow: "0 16px 40px rgba(15,23,42,0.16)" } as object,
    }),
  },
  hangCardRight: {
    borderRadius: 20,
  },
  hangCardBottom: {
    borderRadius: 20,
  },
  hangCardScroll: {
    flex: 1,
  },
  hangCardScrollContent: {
    flexGrow: 1,
    paddingBottom: 12,
  },
  mapChip: {
    position: "absolute",
    left: SCREEN_PAD,
    bottom: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
      default: { boxShadow: "0 2px 8px rgba(15,23,42,0.1)" } as object,
    }),
  },
  mapChipText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.6,
    color: Theme.textPrimaryDark,
  },
  livePill: {
    position: "absolute",
    left: SCREEN_PAD,
    top: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(79, 70, 229, 0.92)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#86efac",
  },
  livePillText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    letterSpacing: 0.4,
  },
  historyPill: {
    backgroundColor: "rgba(15, 23, 42, 0.78)",
  },
  sheetStack: {
    paddingHorizontal: 0,
    gap: 8,
    width: "100%",
  },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SCREEN_PAD,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: "transparent",
    zIndex: 4,
  },
  headerCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerCircleBtnDisabled: {
    opacity: 0.45,
  },
  headerCircleBtnPressed: {
    opacity: 0.88,
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimary,
    textAlign: "center",
  },
  statusCard: {
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 16,
    paddingBottom: 8,
    marginHorizontal: 0,
  },
  statusBanner: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 12,
  },
  statusBannerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  statusBannerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  statusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  statusHeadline: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  statusSubcopy: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimary,
    lineHeight: 14,
  },
  statusMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    flexShrink: 0,
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.textPrimaryDark,
  },
  statusChipTextSolid: {
    color: Theme.textOnPrimary,
  },
  progressPctLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimary,
    textAlign: "right",
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Theme.borderLight,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  arrivalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  arrivalLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimary,
    flexShrink: 0,
  },
  arrivalValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  arrivalValueMuted: {
    color: Theme.textPrimary,
    fontWeight: "600",
  },
  driverCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  driverCardLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.pulseIndigo,
    marginBottom: 8,
  },
  driverCardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  driverCardTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  driverCardName: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 19,
  },
  driverCardVehicle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimary,
    lineHeight: 16,
  },
  driverCardLocation: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  driverCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  driverCardMetaLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  driverCardMetaValue: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  driverCardNavBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Theme.buttonPrimary,
    flexShrink: 0,
  },
  driverCardNavBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  routeSection: {
    marginBottom: 14,
  },
  routeSectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textPrimary,
    marginBottom: 10,
  },
  routeTimeline: {
    gap: 4,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 48,
  },
  routeRowCurrent: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginVertical: 4,
  },
  routeRowPressed: {
    opacity: 0.9,
  },
  routeRailCol: {
    width: 24,
    alignItems: "center",
    alignSelf: "stretch",
  },
  routeRailLineTop: {
    width: 2,
    flex: 1,
    backgroundColor: Theme.borderMedium,
    minHeight: 6,
  },
  routeRailLineBottom: {
    width: 2,
    flex: 1,
    backgroundColor: Theme.borderMedium,
    minHeight: 6,
  },
  routeRailDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  routeRowBody: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 8,
    paddingTop: 1,
    gap: 3,
  },
  routeRowBodyCurrent: {
    paddingBottom: 0,
    paddingTop: 0,
    paddingLeft: 4,
    paddingRight: 4,
  },
  routeTrailingBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginLeft: 8,
    alignSelf: "center",
  },
  routeStopLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textPrimary,
  },
  routeRowTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
  },
  routeRowTitleCurrent: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  routeActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  routeActionText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.pulseIndigo,
  },
  routeRowSubtitle: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimary,
    lineHeight: 14,
  },
  actionBar: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  actionBtnPrimary: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    ...Platform.select({
      ios: {
        shadowColor: Theme.pulseIndigo,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
      default: {} as object,
    }),
  },
  actionBtnSecondary: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnPressed: {
    opacity: 0.88,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.pulseIndigo,
  },
  reassignLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    marginBottom: 4,
  },
  reassignLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  activityCard: {
    marginHorizontal: SCREEN_PAD,
    marginBottom: 8,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  activityCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: SCREEN_PAD,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  activityCardHeaderCollapsed: {
    borderBottomWidth: 0,
  },
  activityCardTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  activityCount: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimary,
    marginRight: 4,
  },
  timelineWrap: {
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  emptyTimeline: {
    padding: 24,
    alignItems: "center",
  },
  emptyTimelineText: {
    fontSize: 13,
    color: Theme.textPrimary,
  },
  timelineLine: {
    position: "absolute",
    left: SCREEN_PAD + TIMELINE_DOT_SIZE / 2,
    top: TIMELINE_DOT_CENTER,
    bottom: TIMELINE_DOT_CENTER,
    width: 1,
    backgroundColor: Theme.borderFocus,
  },
  timelineItem: {
    flexDirection: "row",
    paddingHorizontal: SCREEN_PAD,
  },
  timelineDot: {
    width: TIMELINE_DOT_SIZE,
    height: TIMELINE_DOT_SIZE,
    borderRadius: TIMELINE_DOT_SIZE / 2,
    borderWidth: 2,
    borderColor: Theme.borderFocus,
    backgroundColor: Theme.screenBackground,
    marginTop: TIMELINE_DOT_TOP,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  timelineDotActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.buttonPrimary,
  },
  timelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.textPrimaryDark,
  },
  timelineItemBody: {
    flex: 1,
    paddingVertical: TIMELINE_ROW_PAD_V,
  },
  timelineItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  timelineItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  timelineItemLeft: {
    flex: 1,
    minWidth: 0,
  },
  timelineLocation: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimary,
    lineHeight: TIMELINE_LABEL_LINE_HEIGHT,
  },
  timelineLocationActive: {
    color: Theme.textPrimaryDark,
    fontWeight: "700",
  },
  timelineCoords: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimary,
    marginTop: 2,
  },
  timelineTimeBadge: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    flexShrink: 0,
  },
  timelineTimeText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: TIMELINE_LABEL_LINE_HEIGHT - 2,
  },
  expandedPanel: {
    marginTop: 10,
    padding: 12,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    gap: 4,
  },
  expandedTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0,
    marginBottom: 4,
    ...(Platform.OS === "web" ? ({ whiteSpace: "pre-wrap" } as object) : {}),
  },
  expandedLine: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    lineHeight: 15,
    letterSpacing: 0,
    ...(Platform.OS === "web" ? ({ whiteSpace: "pre-wrap" } as object) : {}),
  },
});
