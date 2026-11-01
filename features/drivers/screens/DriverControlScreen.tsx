import { DriverBrandMark } from "@/components/driver/DriverBrandMark";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useAuth } from "@/contexts/AuthContext";
import { useDriverThemeColors } from "@/contexts/DriverThemeContext";
import {
    useDriverLocation,
} from "@/features/drivers/hooks/useDriverLocation";
import { useHoldButton } from "@/features/drivers/hooks/useHoldButton";
import { useLrDocuments, usePodDocuments } from "@/features/drivers/hooks/useTripDocumentsByType";
import {
    STEPS,
    useTripControl
} from "@/features/drivers/hooks/useTripControl";
import { computeDriverTripEstEarningsInr } from "@/features/finance/selectors/assetTripProvisionSelectors";
import { DriverSelfAvatar } from "@/components/driver/DriverSelfAvatar";
import { useDriverAvatarUri } from "@/lib/avatarUpload";
import {
    buildDriverTripNumberMap,
    getDriverTripDisplayNumber,
} from "@/features/driver/utils/driverTripSequence.util";
import {
  isAggregateTrip,
  resolveDriverTripPayoutTerms,
  tripEarningsDetailForDriver,
} from "@/features/drivers/utils/driverUtils.util";
import { formatINR } from "@/lib/format";
import { formatEstimatedDuration } from "@/lib/formatEstimatedDuration";
import { ROUTES } from "@/lib/routes";
import { preloadDriverChatTrip } from "@/lib/preloadDriverChatWarmup";
import { useSafeBack } from "@/lib/useSafeBack";
import * as driversService from "@/features/drivers/services/drivers.service";
import { getOptimalRoute } from "@/lib/routingService";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import * as tripsService from "@/features/trips/services/trips.service";
import { useTripVerificationSync } from "@/features/trips/verification";
import { useTripOperationsSync } from "@/features/trips/operations";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Image,
    Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Pressable as HoldPressable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatTripDistanceForControl(
  distance: string | number | null | undefined,
): string {
  if (distance == null) return "—";
  if (typeof distance === "string" && distance.trim() === "") return "—";
  const km =
    typeof distance === "number"
      ? distance
      : parseFloat(String(distance).replace(/,/g, '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(km) || km < 0) return "—";
  return `${Math.round(km).toLocaleString("en-IN")} KM`;
}

function toEtaInterval(durationSeconds: number): string {
  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function parseTripCoordinate(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const HOLD_PRESS_RETENTION = 100;
const holdCompleteWebStyle = {
  touchAction: "none" as "none" | "auto" | "manipulation",
  userSelect: "none" as "none" | "auto" | "text" | "contain" | "all",
};

export default function DriverControlScreen() {
  const insets = useSafeAreaInsets();
  const colors = useDriverThemeColors();
  const { profile } = useAuth();
  useTripVerificationSync();
  useTripOperationsSync();
  const { avatarUri } = useDriverAvatarUri();
  const params = useLocalSearchParams<{ tripId?: string | string[] }>();
  const tripId =
    typeof params.tripId === "string"
      ? params.tripId
      : (params.tripId?.[0] ?? undefined);
  const router = useRouter();
  const queryClient = useQueryClient();

  // 1. Trip Control Hook (Status, Steps, Transitions)
  const {
    trip,
    setTrip,
    loading,
    step,
    stepLoading,
    stepError,
    setStepError,
    acceptedOffer,
    tripDriver,
    confirmArrival,
    confirmPackageCollected,
    engageTransit,
    confirmReached,
    completeTrip,
  } = useTripControl(tripId);

  // 2. Hold Button Hook (Hold-to-complete logic)
  const { holdProgress, isHolding, startHold, cancelHold } =
    useHoldButton(completeTrip);

  // 3. POD Documents Hook (Upload, View, Skip)
  const {
    podDocuments,
    setPodDocuments,
    podLoading,
    podUploading,
    podViewUrls,
    setPodViewUrls,
    podSkipped,
    setPodSkipped,
    loadPodDocuments,
    uploadPod,
    lastPodTripIdRef,
  } = usePodDocuments(tripId, profile?.uid);

  const {
    lrDocuments,
    lrUploading,
    lrViewUrls,
    setLrViewUrls,
    lrSkipped,
    setLrSkipped,
    loadLrDocuments,
    uploadLr,
    lastLrTripIdRef,
    setLrDocuments,
  } = useLrDocuments(tripId, profile?.uid);

  const {
    holdProgress: lrHoldProgress,
    isHolding: isLrHolding,
    startHold: startLrHold,
    cancelHold: cancelLrHold,
    resetHold: resetLrHold,
  } = useHoldButton(() => {
    void engageTransit();
  });

  // 4. Driver Location Hook (Live Tracking)
  useDriverLocation(tripId);

  const [_completedTripsCount, setCompletedTripsCount] = useState(0);
  const [driverTripNumberById, setDriverTripNumberById] = useState<
    Record<string, string>
  >({});
  const [routeMetricsFallback, setRouteMetricsFallback] = useState<{
    distance: number;
    estimated_duration: string;
  } | null>(null);
  const [linkedDriverIds, setLinkedDriverIds] = useState<string[]>([]);
  const [linkedDriversLoaded, setLinkedDriversLoaded] = useState(false);
  const [linkedDriversFull, setLinkedDriversFull] = useState<driversService.DriverRow[]>([]);

  const [viewingPodUrl, setViewingPodUrl] = useState<string | null>(null);
  const [viewingPodLoading, setViewingPodLoading] = useState(false);
  const [viewingPodError, setViewingPodError] = useState(false);

  useEffect(() => {
    if (!profile?.uid) return;
    driversService.getLinkedDriversForCurrentUser(profile.uid).then((res) => {
      const drivers = (res.drivers ?? []).filter((d) => !d.left_at);
      setLinkedDriverIds(drivers.map((d) => d.id));
      setLinkedDriversFull(drivers);
      setLinkedDriversLoaded(true);
      if (drivers.length === 0) return;
      tripsService.getDriverUiTripsByDriverIds(drivers.map((d) => d.id)).then((tRes) => {
        const tripsList = tRes.trips ?? [];
        setDriverTripNumberById(buildDriverTripNumberMap(tripsList));
        const count = tripsList.filter((t) =>
          tripsService.isTripCompleted(t),
        ).length;
        setCompletedTripsCount(count);
      });
    });
  }, [profile?.uid]);

  useEffect(() => {
    if (
      !linkedDriversLoaded ||
      !trip?.driver_id ||
      linkedDriverIds.includes(trip.driver_id)
    ) {
      return;
    }
    router.replace("/(driver)");
  }, [linkedDriversLoaded, trip?.id, trip?.driver_id, linkedDriverIds, router]);

  useEffect(() => {
    if (step !== "reached" && step !== "completed") {
      setPodSkipped(false);
      return;
    }
    const id = trip?.id ?? tripId;
    if (!id) return;
    if (id !== lastPodTripIdRef.current) setPodDocuments([]);
    const hasCache = lastPodTripIdRef.current === id;
    loadPodDocuments(hasCache ? { silent: true } : undefined);
  }, [
    step,
    trip?.id,
    tripId,
    loadPodDocuments,
    lastPodTripIdRef,
    setPodDocuments,
    setPodSkipped,
  ]);

  useEffect(() => {
    if (step !== "lr") {
      setLrSkipped(false);
      resetLrHold();
      return;
    }
    const id = trip?.id ?? tripId;
    if (!id) return;
    if (id !== lastLrTripIdRef.current) setLrDocuments([]);
    const hasCache = lastLrTripIdRef.current === id;
    loadLrDocuments(hasCache ? { silent: true } : undefined);
  }, [
    step,
    trip?.id,
    tripId,
    loadLrDocuments,
    lastLrTripIdRef,
    setLrDocuments,
    setLrSkipped,
    resetLrHold,
  ]);

  useEffect(() => {
    if (!trip) {
      setRouteMetricsFallback(null);
      return;
    }
    const hasDistance = trip.distance != null && String(trip.distance).trim() !== "";
    const hasEta =
      trip.estimated_duration != null && trip.estimated_duration.trim() !== "";
    if (hasDistance && hasEta) {
      setRouteMetricsFallback(null);
      return;
    }

    const pickupLat = parseTripCoordinate(trip.pickup_lat);
    const pickupLon = parseTripCoordinate(trip.pickup_lon);
    const dropLat = parseTripCoordinate(trip.drop_lat);
    const dropLon = parseTripCoordinate(trip.drop_lon);
    const hasCoords =
      pickupLat != null &&
      pickupLon != null &&
      dropLat != null &&
      dropLon != null;
    if (!hasCoords) return;

    let cancelled = false;
    const hydrateRouteMetrics = async () => {
      const route = await getOptimalRoute(
        { latitude: pickupLat, longitude: pickupLon },
        { latitude: dropLat, longitude: dropLon },
      );
      if (cancelled || !route) return;

      const distanceKm = Math.max(1, Math.round(route.distance / 1000));
      const etaInterval = toEtaInterval(route.duration);
      setRouteMetricsFallback({
        distance: distanceKm,
        estimated_duration: etaInterval,
      });

      const { trip: updated } = await tripsService.updateTripRouteMetrics(trip.id, {
        distance: hasDistance ? undefined : distanceKm,
        estimated_duration: hasEta ? undefined : etaInterval,
      });
      if (cancelled || !updated) return;
      setTrip(updated);
      setRouteMetricsFallback(null);
    };
    void hydrateRouteMetrics();
    return () => {
      cancelled = true;
    };
  }, [trip, setTrip]);

  const safeBack = useSafeBack("/(driver)");
  const goToRadar = safeBack;

  // ── Hooks hoisted above the guards below ───────────────────────────────────
  // These used to live after `if (loading)` / `if (!trip)` / `if
  // (!isAuthorizedForTrip)`, so the hook count changed as the trip loaded and
  // authorization resolved — React error #310. They are all null-safe on `trip`.
  const openVerificationFlow = useCallback(
    (side: "start" | "end") => {
      if (!trip?.id) return;
      router.push(ROUTES.tripVerification(trip.id, side) as Href);
    },
    [router, trip?.id],
  );
  const openFuelEntry = useCallback(() => {
    if (!trip?.id) return;
    router.push(ROUTES.tripFuelEntry(trip.id) as Href);
  }, [router, trip?.id]);
  const openTollEntry = useCallback(() => {
    if (!trip?.id) return;
    router.push(ROUTES.tripTollEntry(trip.id) as Href);
  }, [router, trip?.id]);

  const employerOrgIdSet = useMemo(() => {
    const set = new Set<string>();
    linkedDriversFull.forEach((d) => {
      // tracking_only rows are phone-assignment stubs an Aggregate-mode org creates
      // to assign an open/marketplace trip directly to an independent driver — not
      // real fleet employment (no salary/commission terms are ever attached to
      // them). Treating that org as an "employer" here is the same class of bug
      // already guarded against everywhere else this distinction matters
      // (DriverWalletScreen, drivers.service.ts, aggregateDrivers.ts, etc.) —
      // this screen was the one place still missing the filter.
      if (d.tracking_only === true) return;
      const orgId = String(d.organization_id ?? '');
      if (orgId) set.add(orgId);
    });
    return set;
  }, [linkedDriversFull]);

  const controlCurrentEmployer = useMemo(() => {
    const d = linkedDriversFull.find(
      (row) => !row.left_at && employerOrgIdSet.has(String(row.organization_id ?? '')),
    );
    if (!d) return null;
    return { orgId: String(d.organization_id ?? ''), driverRowId: d.id };
  }, [linkedDriversFull, employerOrgIdSet]);

  if (loading) {
    return <CenteredLoadingView message="Loading…" />;
  }

  if (!trip) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background },
        ]}
      >
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + Layout.driverHeaderTopOffset,
              paddingHorizontal: Layout.driverHeaderHorizontalPadding,
              paddingBottom: Layout.driverHeaderBottomPadding,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={() => router.push("/(driver)/profile")}
              style={styles.avatarBtn}
              activeOpacity={0.8}
            >
              <DriverSelfAvatar size={36} uri={avatarUri} borderColor={colors.emerald} />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <DriverBrandMark color={colors.textMuted} />
              <Text
                style={[styles.welcomeTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                Trip
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.emptyMissionWrap, { paddingHorizontal: 24 }]}>
          <FontAwesome name="power-off" size={80} color={colors.textMuted} />
          <Text style={[styles.noMission, { color: colors.text }]}>
            No active trip
          </Text>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.emerald }]}
            onPress={goToRadar}
            activeOpacity={0.8}
          >
            <Text style={styles.backBtnText}>Back to dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isAuthorizedForTrip =
    !!trip.driver_id && linkedDriverIds.includes(trip.driver_id);

  if (!isAuthorizedForTrip) {
    // Trip is not assigned to any of the current user's driver rows:
    // redirect is handled in useEffect above; show splash until navigation completes.
    return <CenteredLoadingView />;
  }

  // "reached" = POD upload phase; "lr" = LR upload after pickup.
  const stepIndex = STEPS.findIndex((s) => {
    if (step === "reached") return s.id === "transit";
    if (step === "lr") return s.id === "pickup";
    return s.id === step;
  });
  const pendingStepIndex =
    step === "reached"
      ? STEPS.findIndex((s) => s.id === "completed")
      : step === "lr"
        ? STEPS.findIndex((s) => s.id === "transit")
        : stepIndex;
  // isAggregateTrip() only catches supplier-mediated aggregate trips
  // (trip.supplier_id set). A direct open-trip assigned straight to an
  // independent driver has no supplier_id, but tripDriver here is the
  // phone-assignment stub (tracking_only) an Aggregate-mode org creates just to
  // assign that trip — never a real employment row with salary/commission terms.
  // Without this check, an org that has never configured any driver pay ends up
  // shown as this driver's "employer" with a fabricated earnings estimate.
  const tripIsAggregate = isAggregateTrip(trip) || tripDriver?.tracking_only === true;
  const payoutOffer = {
    payableAmount: acceptedOffer?.payableAmount ?? tripDriver?.payable_amount ?? null,
    commissionPercent:
      acceptedOffer?.commissionPercent ?? tripDriver?.commission_percent ?? null,
    commissionPerKm:
      acceptedOffer?.commissionPerKm ?? tripDriver?.commission_per_km ?? null,
  };
  // A drivers row existing is not enough on its own (same rule as the
  // tracking_only fix above) — an org that never configured pay must not produce
  // a number that looks payable just because the legacy 10% fallback returns one.
  const { hasAgreedPayoutTerms } = resolveDriverTripPayoutTerms(trip, payoutOffer);
  const commission =
    tripIsAggregate || !hasAgreedPayoutTerms
      ? 0
      : computeDriverTripEstEarningsInr(trip, payoutOffer);
  const effectiveEta =
    trip.estimated_duration?.trim() || routeMetricsFallback?.estimated_duration || null;
  const effectiveDistance = trip.distance ?? routeMetricsFallback?.distance ?? null;

  const progressPct =
    step === "completed"
      ? 100
      : step === "reached"
        ? 80
        : step === "transit"
          ? 60
          : step === "lr"
            ? 50
            : step === "pickup"
              ? 40
              : step === "accepted"
                ? 20
                : 0;

  // Employer-based attribution: employerOrgIdSet / controlCurrentEmployer are
  // computed above, before the loading + authorization guards.
  // Fleet trip: employer dispatched directly OR employer is supplier on a cross-org trip.
  const isControlTripFleet = controlCurrentEmployer
    ? (employerOrgIdSet.has(String(trip.organization_id ?? '')) ||
        (!!trip.supplier_id && employerOrgIdSet.has(String(trip.supplier_id ?? ''))))
    : false;


  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Layout.driverHeaderTopOffset,
            paddingHorizontal: Layout.driverHeaderHorizontalPadding,
            paddingBottom: Layout.driverHeaderBottomPadding,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.push("/(driver)/profile")}
            style={styles.avatarBtn}
            activeOpacity={0.8}
          >
            <DriverSelfAvatar size={36} uri={avatarUri} borderColor={colors.emerald} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <DriverBrandMark color={colors.textMuted} />
            <Text
              style={[styles.welcomeTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {getDriverTripDisplayNumber(trip, driverTripNumberById)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.headerChatBtn,
            {
              borderColor: colors.border,
              backgroundColor: colors.whiteMuted,
            },
          ]}
          onPressIn={() => {
            if (!trip?.id || linkedDriverIds.length === 0) return;
            preloadDriverChatTrip(queryClient, trip.id, linkedDriverIds);
          }}
          onPress={() => {
            const q = encodeURIComponent(String(trip.id));
            router.push(`/(driver)/chat?tripId=${q}` as Href);
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Trip chat"
          accessibilityHint="Open messages for this trip"
        >
          <FontAwesome name="comments" size={18} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.eta}>
          <Text style={[styles.etaLabel, { color: colors.textMuted }]}>
            Est. time
          </Text>
          <Text style={[styles.etaValue, { color: colors.gold }]}>
            {effectiveEta ? formatEstimatedDuration(effectiveEta) : "—"}
          </Text>
        </View>
      </View>

      <View style={styles.contentWrap}>
        {/* Step indicator with connector line */}
        <View style={styles.stepRow}>
          {/* Base connector line */}
          <View
            style={[styles.stepConnector, { backgroundColor: colors.border }]}
          />
          {/* Filled progress overlay on connector */}
          <View
            style={[
              styles.stepConnector,
              styles.stepConnectorFill,
              {
                backgroundColor: colors.emerald,
                width: `${progressPct}%` as `${number}%`,
              },
            ]}
          />
          {STEPS.map((s, idx) => {
            const isDone = idx <= stepIndex;
            const isPending = !isDone && idx === pendingStepIndex;
            return (
              <View key={s.id} style={styles.stepItem}>
                <View
                  style={[
                    styles.stepCircle,
                    { borderColor: colors.border },
                    isDone && {
                      backgroundColor: colors.emerald,
                      borderColor: colors.emerald,
                    },
                    isPending && {
                      backgroundColor: "transparent",
                      borderColor: colors.emerald,
                      borderWidth: 2,
                    },
                  ]}
                >
                  <FontAwesome
                    name={s.icon}
                    size={14}
                    color={
                      isDone
                        ? colors.textOnPrimary
                        : isPending
                          ? colors.emerald
                          : colors.textMuted
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    {
                      color:
                        isDone || isPending ? colors.text : colors.textMuted,
                    },
                  ]}
                >
                  {s.label}
                </Text>
              </View>
            );
          })}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.cardTripIdRow}>
              <Text style={[styles.cardMetaLabel, { color: colors.textMuted }]}>
                Trip
              </Text>
              <Text style={[styles.cardTripId, { color: colors.text }]}>
                {getDriverTripDisplayNumber(trip, driverTripNumberById)}
              </Text>
            </View>
            <View
              style={[
                styles.cardObjectiveRow,
                { borderTopColor: colors.border },
              ]}
            >
              <View style={[styles.cardObjectiveText, styles.cardFlexMinWidth]}>
                <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                  Current step
                </Text>
                <Text
                  style={[styles.cardTitleEmphasis, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {step === "accepted" && "Proceed to pickup"}
                  {step === "pickup" && "Confirm pickup"}
                  {step === "transit" && "In transit"}
                  {step === "reached" && "Upload POD"}
                  {step === "completed" && "Trip completed"}
                </Text>
              </View>
              <View style={styles.aeroEtaWrap}>
                <Text style={[styles.etaLabel, { color: colors.textMuted }]}>
                  Est. time
                </Text>
                <Text style={[styles.aeroEtaValue, { color: colors.gold }]}>
                  {effectiveEta ? formatEstimatedDuration(effectiveEta) : "—"}
                </Text>
              </View>
            </View>
            {trip.pickup_area?.trim() || trip.drop_location?.trim() ? (
              <View
                style={[
                  styles.cardRow,
                  styles.cardRowLocation,
                  { borderTopColor: colors.border },
                ]}
              >
                <View
                  style={[styles.cardLocationWrap, styles.cardFlexMinWidth]}
                >
                  <Text
                    style={[styles.cardMetaLabel, { color: colors.textMuted }]}
                  >
                    Pickup location
                  </Text>
                  <Text
                    style={[
                      styles.cardMeta,
                      styles.cardLocationText,
                      { color: colors.text },
                    ]}
                    numberOfLines={3}
                  >
                    {trip.pickup_area?.trim() || "—"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.cardLocationWrap,
                    styles.cardLocationDivider,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <Text
                    style={[styles.cardMetaLabel, { color: colors.textMuted }]}
                  >
                    Drop location
                  </Text>
                  <Text
                    style={[
                      styles.cardMeta,
                      styles.cardLocationText,
                      { color: colors.text },
                    ]}
                    numberOfLines={3}
                  >
                    {trip.drop_location?.trim() || "—"}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={[styles.cardRow, { borderTopColor: colors.border }]}>
              <View style={styles.cardFlexMinWidth}>
                <Text
                  style={[styles.cardMetaLabel, { color: colors.textMuted }]}
                >
                  Load type
                </Text>
                <Text
                  style={[styles.cardMeta, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {trip.load_type?.trim() || "Not specified"}
                </Text>
              </View>
              <View style={[styles.cardMetaRight, styles.cardFlexMinWidth]}>
                <Text
                  style={[styles.cardMetaLabel, { color: colors.textMuted }]}
                >
                  Client
                </Text>
                <Text
                  style={[styles.cardMeta, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {trip.client_name?.trim() || "—"}
                </Text>
              </View>
            </View>
            {formatTripDistanceForControl(effectiveDistance) !== "—" || trip.pickup_date ? (
              <View style={[styles.cardRow, { borderTopColor: colors.border }]}>
                <View style={styles.cardFlexMinWidth}>
                  <Text
                    style={[styles.cardMetaLabel, { color: colors.textMuted }]}
                  >
                    Distance
                  </Text>
                  <Text
                    style={[styles.cardMeta, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {formatTripDistanceForControl(effectiveDistance)}
                  </Text>
                </View>
                <View style={[styles.cardMetaRight, styles.cardFlexMinWidth]}>
                  <Text
                    style={[styles.cardMetaLabel, { color: colors.textMuted }]}
                  >
                    Pickup date
                  </Text>
                  <Text
                    style={[styles.cardMeta, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {trip.pickup_date
                      ? new Date(trip.pickup_date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </Text>
                </View>
              </View>
            ) : null}
            {trip.notes?.trim() ? (
              <View
                style={[
                  styles.cardRow,
                  styles.cardRowNotes,
                  { borderTopColor: colors.border },
                ]}
              >
                <View style={styles.cardFlexMinWidth}>
                  <Text
                    style={[styles.cardMetaLabel, { color: colors.textMuted }]}
                  >
                    Notes
                  </Text>
                  <Text
                    style={[
                      styles.cardMeta,
                      styles.cardNotesText,
                      { color: colors.text },
                    ]}
                    numberOfLines={4}
                  >
                    {trip.notes.trim()}
                  </Text>
                </View>
              </View>
            ) : null}
            {step === "completed" && !tripIsAggregate && hasAgreedPayoutTerms && (
              <View style={[styles.cardRow, { borderTopColor: colors.border }]}>
                <View style={styles.cardFlexMinWidth}>
                  <Text
                    style={[styles.cardMetaLabel, { color: colors.textMuted }]}
                  >
                    Trip earnings
                  </Text>
                  <Text
                    style={[
                      styles.cardMeta,
                      styles.cardEarningsValue,
                      { color: Theme.driverEmerald },
                    ]}
                  >
                    {formatINR(Math.max(0, Number(commission ?? 0) || 0))}
                  </Text>
                </View>
              </View>
            )}
            {step === "reached" && (
              <View style={[styles.cardRow, { borderTopColor: colors.border }]}>
                <Text
                  style={[styles.cardMetaLabel, { color: colors.textMuted }]}
                >
                  Proof of delivery (POD)
                </Text>
                {podLoading ? (
                  <LoadingIndicator size="small" color={colors.emerald} />
                ) : (
                  <Text style={[styles.cardMeta, { color: colors.text }]}>
                    {podDocuments.length} file
                    {podDocuments.length !== 1 ? "s" : ""} uploaded
                  </Text>
                )}
              </View>
            )}
            {(step === "accepted" ||
              step === "pickup" ||
              step === "transit" ||
              step === "reached" ||
              step === "completed") && (
              <View
                style={[
                  styles.progressBlock,
                  { borderTopColor: colors.border },
                ]}
              >
                <View style={styles.progressHeader}>
                  <View style={styles.voyageStatusRow}>
                    <FontAwesome
                      name="compass"
                      size={12}
                      color={colors.emerald}
                    />
                    <Text
                      style={[
                        styles.progressLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Progress
                    </Text>
                  </View>
                  <Text style={[styles.progressPct, { color: colors.emerald }]}>
                    {progressPct}%
                  </Text>
                </View>
                <View
                  style={[
                    styles.progressTrackWrap,
                    { backgroundColor: colors.whiteMuted },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      styles.progressFillNeon,
                      {
                        width: `${progressPct}%`,
                        backgroundColor: colors.emerald,
                        shadowColor: colors.emerald,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </View>

          {(step === "accepted" ||
            step === "pickup" ||
            step === "transit" ||
            step === "reached") && (
            <View style={styles.hwCards}>
              <View
                style={[
                  styles.hwCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.hwCardIconWrap,
                    { backgroundColor: colors.whiteMuted },
                  ]}
                >
                  <FontAwesome name="wrench" size={18} color={colors.emerald} />
                </View>
                <View>
                  <Text
                    style={[styles.hwCardLabel, { color: colors.textMuted }]}
                  >
                    Hardware
                  </Text>
                  <Text style={[styles.hwCardValue, { color: colors.text }]}>
                    Optimal
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.hwCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.hwCardIconWrap,
                    { backgroundColor: colors.whiteMuted },
                  ]}
                >
                  <FontAwesome name="lock" size={18} color={colors.emerald} />
                </View>
                <View>
                  <Text
                    style={[styles.hwCardLabel, { color: colors.textMuted }]}
                  >
                    Integrity
                  </Text>
                  <Text style={[styles.hwCardValue, { color: colors.text }]}>
                    Encrypted
                  </Text>
                </View>
              </View>
            </View>
          )}

          {stepError ? (
            <View
              style={[
                styles.stepErrorWrap,
                {
                  backgroundColor: Theme.negativeMuted,
                  borderColor: Theme.negative,
                },
              ]}
            >
              <FontAwesome
                name="exclamation-circle"
                size={14}
                color={Theme.negative}
              />
              <Text style={[styles.stepErrorText, { color: Theme.negative }]}>
                {stepError}
              </Text>
            </View>
          ) : null}

          {step === "accepted" && (
            <>
              <TouchableOpacity
                style={[
                  styles.secondaryActionBtn,
                  { borderColor: colors.border, backgroundColor: colors.whiteMuted },
                ]}
                onPress={() => openVerificationFlow("start")}
                activeOpacity={0.8}
              >
                <FontAwesome name="dashboard" size={14} color={colors.text} />
                <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>
                  Add start odometer (optional)
                </Text>
              </TouchableOpacity>
              <View style={styles.secondaryActionRow}>
                <TouchableOpacity
                  style={[
                    styles.secondaryActionBtn,
                    styles.secondaryActionHalf,
                    { borderColor: colors.border, backgroundColor: colors.whiteMuted },
                  ]}
                  onPress={openFuelEntry}
                  activeOpacity={0.8}
                >
                  <FontAwesome name="fire" size={14} color={colors.text} />
                  <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>
                    Add fuel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.secondaryActionBtn,
                    styles.secondaryActionHalf,
                    { borderColor: colors.border, backgroundColor: colors.whiteMuted },
                  ]}
                  onPress={openTollEntry}
                  activeOpacity={0.8}
                >
                  <FontAwesome name="road" size={14} color={colors.text} />
                  <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>
                    Add toll
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: colors.emerald },
                  stepLoading && styles.primaryBtnDisabled,
                ]}
                onPress={confirmArrival}
                disabled={stepLoading}
                activeOpacity={0.8}
              >
                {stepLoading ? (
                  <Text style={styles.primaryBtnText}>Updating…</Text>
                ) : (
                  <>
                    <FontAwesome
                      name="map-marker"
                      size={20}
                      color={colors.textOnPrimary}
                    />
                    <Text style={styles.primaryBtnText}>Confirm arrival</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === "pickup" && (
            <>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: colors.emerald },
                  stepLoading && styles.primaryBtnDisabled,
                ]}
                onPress={confirmPackageCollected}
                disabled={stepLoading}
                activeOpacity={0.8}
              >
                {stepLoading ? (
                  <Text style={styles.primaryBtnText}>Updating…</Text>
                ) : (
                  <>
                    <FontAwesome
                      name="archive"
                      size={20}
                      color={colors.textOnPrimary}
                    />
                    <Text style={styles.primaryBtnText}>Package collected</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === "lr" && (
            <View style={styles.reachedBlock}>
              <View
                style={[
                  styles.podUploadWrap,
                  {
                    backgroundColor: colors.whiteMuted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: colors.emerald },
                    lrUploading && styles.primaryBtnDisabled,
                  ]}
                  onPress={() => uploadLr(undefined, setStepError)}
                  disabled={lrUploading}
                  activeOpacity={0.8}
                >
                  {lrUploading ? (
                    <LoadingIndicator
                      size="small"
                      color={Theme.textOnPrimary}
                    />
                  ) : (
                    <FontAwesome
                      name="cloud-upload"
                      size={20}
                      color={colors.textOnPrimary}
                    />
                  )}
                  <Text style={styles.primaryBtnText}>
                    {lrUploading ? "Uploading…" : "Upload LR"}
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.podHint, { color: colors.textMuted }]}>
                  Upload the Lorry Receipt after loading. Proceed to drop-off after
                  at least one file is uploaded.
                </Text>
                <TouchableOpacity
                  onPress={() => setLrSkipped(true)}
                  style={[
                    styles.podSkipPill,
                    { backgroundColor: colors.whiteMuted },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.podSkipPillText, { color: colors.emerald }]}
                  >
                    Skip
                  </Text>
                </TouchableOpacity>
              </View>
              {lrDocuments.length >= 1 ? (
                <View
                  style={[styles.podListWrap, { borderColor: colors.border }]}
                >
                  <Text
                    style={[styles.podListTitle, { color: colors.textMuted }]}
                  >
                    Uploaded LR ({lrDocuments.length})
                  </Text>
                  {lrDocuments.map((doc, index) => (
                    <View
                      key={doc.id}
                      style={[
                        styles.podListItem,
                        { borderColor: colors.border },
                        index === 0 && { borderTopWidth: 0 },
                      ]}
                    >
                      <Text
                        style={[styles.podListFileName, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {doc.file_name ||
                          doc.storage_path.split("/").pop() ||
                          "LR"}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.podListViewBtn,
                          { backgroundColor: colors.emerald },
                        ]}
                        onPress={async () => {
                          setViewingPodError(false);
                          const cached = lrViewUrls[doc.id];
                          if (cached) {
                            setViewingPodUrl(cached);
                            return;
                          }
                          setViewingPodLoading(true);
                          setViewingPodUrl(null);
                          const url =
                            await tripDocumentsService.getDocumentViewUrl(
                              doc.storage_path,
                            );
                          setLrViewUrls((prev) => ({
                            ...prev,
                            [doc.id]: url,
                          }));
                          setViewingPodLoading(false);
                          setViewingPodUrl(url);
                        }}
                        activeOpacity={0.8}
                        disabled={viewingPodLoading}
                      >
                        <FontAwesome
                          name="eye"
                          size={14}
                          color={Theme.textOnPrimary}
                        />
                        <Text style={styles.podListViewBtnText}>View</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}
              {lrDocuments.length >= 1 || lrSkipped ? (
                <View style={styles.transitActions}>
                  <HoldPressable
                    onPressIn={startLrHold}
                    onPressOut={cancelLrHold}
                    pressRetentionOffset={HOLD_PRESS_RETENTION}
                    android_ripple={{ color: "transparent" }}
                    style={[
                      styles.holdBtnWrap,
                      Platform.OS === "web" && holdCompleteWebStyle,
                    ]}
                  >
                    <View
                      style={[
                        styles.holdBtnFill,
                        {
                          width: `${lrHoldProgress}%`,
                          backgroundColor: colors.emerald,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.holdBtn,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                        isLrHolding && styles.holdBtnPressed,
                      ]}
                    >
                      <FontAwesome
                        name="truck"
                        size={12}
                        color={colors.text}
                      />
                      <Text style={[styles.holdBtnText, { color: colors.text }]}>
                        {isLrHolding ? "Releasing…" : "Hold to start transit"}
                      </Text>
                    </View>
                  </HoldPressable>
                </View>
              ) : (
                <Text style={[styles.podRequired, { color: colors.textMuted }]}>
                  Upload at least one LR to proceed to drop-off.
                </Text>
              )}
            </View>
          )}

          {step === "transit" && (
            <View style={styles.transitActions}>
              <TouchableOpacity
                style={[
                  styles.issueBtn,
                  styles.transitActionBtn,
                  { borderColor: Theme.negative },
                ]}
                activeOpacity={0.8}
              >
                <FontAwesome
                  name="exclamation-triangle"
                  size={20}
                  color={Theme.negative}
                />
                <Text style={[styles.issueBtnText, { color: Theme.negative }]}>
                  SOS
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  styles.transitActionBtn,
                  { backgroundColor: colors.emerald },
                  stepLoading && styles.primaryBtnDisabled,
                ]}
                onPress={confirmReached}
                disabled={stepLoading}
                activeOpacity={0.8}
              >
                {stepLoading ? (
                  <Text style={styles.primaryBtnText}>Updating…</Text>
                ) : (
                  <>
                    <FontAwesome
                      name="map-marker"
                      size={20}
                      color={colors.textOnPrimary}
                    />
                    <Text style={styles.primaryBtnText}>Reached at drop</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === "reached" && (
            <View style={styles.reachedBlock}>
              <TouchableOpacity
                style={[
                  styles.secondaryActionBtn,
                  { borderColor: colors.border, backgroundColor: colors.whiteMuted },
                ]}
                onPress={() => openVerificationFlow("end")}
                activeOpacity={0.8}
              >
                <FontAwesome name="dashboard" size={14} color={colors.text} />
                <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>
                  Add closing odometer (optional)
                </Text>
              </TouchableOpacity>
              <View style={styles.secondaryActionRow}>
                <TouchableOpacity
                  style={[
                    styles.secondaryActionBtn,
                    styles.secondaryActionHalf,
                    { borderColor: colors.border, backgroundColor: colors.whiteMuted },
                  ]}
                  onPress={openFuelEntry}
                  activeOpacity={0.8}
                >
                  <FontAwesome name="fire" size={14} color={colors.text} />
                  <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>
                    Log fuel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.secondaryActionBtn,
                    styles.secondaryActionHalf,
                    { borderColor: colors.border, backgroundColor: colors.whiteMuted },
                  ]}
                  onPress={openTollEntry}
                  activeOpacity={0.8}
                >
                  <FontAwesome name="road" size={14} color={colors.text} />
                  <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>
                    Log toll
                  </Text>
                </TouchableOpacity>
              </View>
              <View
                style={[
                  styles.podUploadWrap,
                  {
                    backgroundColor: colors.whiteMuted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: colors.emerald },
                    podUploading && styles.primaryBtnDisabled,
                  ]}
                  onPress={() => uploadPod(undefined, setStepError)}
                  disabled={podUploading}
                  activeOpacity={0.8}
                >
                  {podUploading ? (
                    <LoadingIndicator
                      size="small"
                      color={Theme.textOnPrimary}
                    />
                  ) : (
                    <FontAwesome
                      name="cloud-upload"
                      size={20}
                      color={colors.textOnPrimary}
                    />
                  )}
                  <Text style={styles.primaryBtnText}>
                    {podUploading ? "Uploading…" : "Upload POD"}
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.podHint, { color: colors.textMuted }]}>
                  Preferred: upload proof of delivery now. You can skip for now
                  and complete without it.
                </Text>
                <TouchableOpacity
                  onPress={() => setPodSkipped(true)}
                  style={[
                    styles.podSkipPill,
                    { backgroundColor: colors.whiteMuted },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.podSkipPillText, { color: colors.emerald }]}
                  >
                    Skip for now
                  </Text>
                </TouchableOpacity>
              </View>
              {podDocuments.length >= 1 ? (
                <View
                  style={[styles.podListWrap, { borderColor: colors.border }]}
                >
                  <Text
                    style={[styles.podListTitle, { color: colors.textMuted }]}
                  >
                    Uploaded POD ({podDocuments.length})
                  </Text>
                  {podDocuments.map((doc, index) => (
                    <View
                      key={doc.id}
                      style={[
                        styles.podListItem,
                        { borderColor: colors.border },
                        index === 0 && { borderTopWidth: 0 },
                      ]}
                    >
                      <Text
                        style={[styles.podListFileName, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {doc.file_name ||
                          doc.storage_path.split("/").pop() ||
                          "POD"}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.podListViewBtn,
                          { backgroundColor: colors.emerald },
                        ]}
                        onPress={async () => {
                          setViewingPodError(false);
                          const cached = podViewUrls[doc.id];
                          if (cached) {
                            setViewingPodUrl(cached);
                            return;
                          }
                          setViewingPodLoading(true);
                          setViewingPodUrl(null);
                          const url =
                            await tripDocumentsService.getDocumentViewUrl(
                              doc.storage_path,
                            );
                          setPodViewUrls((prev) => ({
                            ...prev,
                            [doc.id]: url,
                          }));
                          setViewingPodLoading(false);
                          setViewingPodUrl(url);
                        }}
                        activeOpacity={0.8}
                        disabled={viewingPodLoading}
                      >
                        <FontAwesome
                          name="eye"
                          size={14}
                          color={Theme.textOnPrimary}
                        />
                        <Text style={styles.podListViewBtnText}>View</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}
              {podDocuments.length >= 1 || podSkipped ? (
                <View style={styles.transitActions}>
                  <HoldPressable
                    onPressIn={startHold}
                    onPressOut={cancelHold}
                    pressRetentionOffset={HOLD_PRESS_RETENTION}
                    android_ripple={{ color: "transparent" }}
                    style={[
                      styles.holdBtnWrap,
                      Platform.OS === "web" && holdCompleteWebStyle,
                    ]}
                  >
                    <View
                      style={[
                        styles.holdBtnFill,
                        {
                          width: `${holdProgress}%`,
                          backgroundColor: colors.emerald,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.holdBtn,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                        isHolding && styles.holdBtnPressed,
                      ]}
                    >
                      <FontAwesome
                        name="check-circle"
                        size={12}
                        color={colors.text}
                      />
                      <Text style={[styles.holdBtnText, { color: colors.text }]}>
                        {isHolding ? "Releasing…" : "Hold to complete trip"}
                      </Text>
                    </View>
                  </HoldPressable>
                </View>
              ) : (
                <Text style={[styles.podRequired, { color: colors.textMuted }]}>
                  Upload POD (preferred), or skip for now to complete.
                </Text>
              )}
            </View>
          )}

          {step === "completed" && (
            <>
              <View
                style={[
                  styles.earningsCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <FontAwesome name="trophy" size={44} color={colors.gold} />
                <Text style={[styles.earningsTitle, { color: colors.text }]}>
                  Trip completed
                </Text>
                <Text
                  style={[styles.earningsSubtext, { color: colors.textMuted }]}
                >
                  Earnings for this trip
                </Text>
                <View
                  style={[
                    styles.netYieldWrap,
                    {
                      backgroundColor: colors.whiteMuted,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.netYieldLabel, { color: colors.textMuted }]}
                  >
                    Your earnings
                  </Text>
                  <Text
                    style={[styles.earningsAmount, { color: colors.emerald }]}
                  >
                    {tripIsAggregate || !hasAgreedPayoutTerms
                      ? "—"
                      : formatINR(Math.max(0, Number(commission ?? 0) || 0))}
                  </Text>
                  {tripIsAggregate ? (
                    <Text
                      style={[
                        styles.netYieldLabel,
                        {
                          color: colors.textMuted,
                          fontSize: 10,
                          marginTop: 4,
                        },
                      ]}
                    >
                      Payment handled offline
                    </Text>
                  ) : null}
                </View>
              </View>

              <View
                style={[
                  styles.podListWrap,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.whiteMuted,
                    marginTop: 6,
                    padding: 16,
                    borderRadius: 16,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={[
                      styles.podListTitle,
                      { color: colors.text, fontSize: 15, fontWeight: "700" },
                    ]}
                  >
                    Proof of delivery (POD)
                  </Text>
                  {podLoading ? (
                    <LoadingIndicator size="small" color={colors.emerald} />
                  ) : (
                    <Text
                      style={[styles.podListTitle, { color: colors.textMuted }]}
                    >
                      {podDocuments.length} file
                      {podDocuments.length === 1 ? "" : "s"}
                    </Text>
                  )}
                </View>
                {podDocuments.length >= 1 ? (
                  <View
                    style={[
                      styles.podListWrap,
                      { borderColor: colors.border, borderWidth: 1, padding: 0 },
                    ]}
                  >
                    {podDocuments.map((doc, index) => (
                      <View
                        key={doc.id}
                        style={[
                          styles.podListItem,
                          { borderColor: colors.border },
                          index === 0 && { borderTopWidth: 0 },
                        ]}
                      >
                        <Text
                          style={[styles.podListFileName, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {doc.file_name ||
                            doc.storage_path.split("/").pop() ||
                            "POD"}
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.podListViewBtn,
                            { backgroundColor: colors.emerald },
                          ]}
                          onPress={async () => {
                            setViewingPodError(false);
                            const cached = podViewUrls[doc.id];
                            if (cached) {
                              setViewingPodUrl(cached);
                              return;
                            }
                            setViewingPodLoading(true);
                            setViewingPodUrl(null);
                            const url =
                              await tripDocumentsService.getDocumentViewUrl(
                                doc.storage_path,
                              );
                            setPodViewUrls((prev) => ({
                              ...prev,
                              [doc.id]: url,
                            }));
                            setViewingPodLoading(false);
                            setViewingPodUrl(url);
                          }}
                          activeOpacity={0.8}
                          disabled={viewingPodLoading}
                        >
                          <FontAwesome
                            name="eye"
                            size={14}
                            color={Theme.textOnPrimary}
                          />
                          <Text style={styles.podListViewBtnText}>View</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : !podLoading ? (
                  <Text style={[styles.podRequired, { color: colors.textMuted }]}>
                    No POD files on record for this trip.
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: colors.emerald, marginTop: 8 },
                ]}
                onPress={goToRadar}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Back to dashboard</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>

      <Modal
        visible={!!(viewingPodUrl || viewingPodLoading)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setViewingPodUrl(null);
          setViewingPodError(false);
        }}
      >
        <Pressable
          style={[
            styles.podModalBackdrop,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
          onPress={() => {
            setViewingPodUrl(null);
            setViewingPodError(false);
          }}
        >
          <View style={styles.podModalContent}>
            <TouchableOpacity
              style={[
                styles.podModalClose,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => {
                setViewingPodUrl(null);
                setViewingPodError(false);
              }}
              activeOpacity={0.8}
            >
              <FontAwesome name="times" size={18} color={colors.text} />
              <Text style={[styles.podModalCloseText, { color: colors.text }]}>
                Close
              </Text>
            </TouchableOpacity>
            {viewingPodLoading ? (
              <View style={styles.podModalImage}>
                <LoadingIndicator size="large" color={colors.emerald} />
                <Text
                  style={[
                    styles.podModalLoadingText,
                    { color: colors.textMuted },
                  ]}
                >
                  Loading…
                </Text>
              </View>
            ) : viewingPodUrl ? (
              <>
                <Image
                  source={{ uri: viewingPodUrl }}
                  style={styles.podModalImage}
                  resizeMode="contain"
                  onError={() => setViewingPodError(true)}
                  onLoad={() => setViewingPodError(false)}
                />
                {viewingPodError ? (
                  <View
                    style={[
                      styles.podModalFallback,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.podModalFallbackText,
                        { color: colors.textMuted },
                      ]}
                    >
                      Preview not available (e.g. HEIC). Open in browser to
                      view.
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.primaryBtn,
                        { backgroundColor: colors.emerald, marginTop: 12 },
                      ]}
                      onPress={() =>
                        viewingPodUrl && Linking.openURL(viewingPodUrl)
                      }
                      activeOpacity={0.8}
                    >
                      <FontAwesome
                        name="external-link"
                        size={16}
                        color={Theme.textOnPrimary}
                      />
                      <Text style={styles.primaryBtnText}>Open in browser</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.driverSurface,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    zIndex: 10,
    gap: 12,
  },
  headerBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Layout.driverHeaderGap,
    flex: 1,
    minWidth: 0,
  },
  headerChatBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  avatarBtn: { padding: 2 },
  avatarCircle: {
    width: Layout.driverHeaderAvatarSize,
    height: Layout.driverHeaderAvatarSize,
    borderRadius: Layout.driverHeaderAvatarSize / 2,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: Layout.driverHeaderAvatarSize / 2,
  },
  brand: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 1,
  },
  welcomeTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  headerBrand: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: Theme.textMuted,
    marginBottom: 4,
  },
  headerTitle: {
    ...Typography.headerTitle,
    color: Theme.textOnDark,
  },
  eta: { alignItems: "flex-end" },
  etaLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.5,
  },
  etaValue: { fontSize: 12, fontWeight: "800", color: Theme.driverGold },
  aeroEtaWrap: { alignItems: "flex-end" },
  aeroEtaValue: { fontSize: 18, fontWeight: "800", color: Theme.driverGold },
  contentWrap: {
    flex: 1,
    paddingHorizontal: Layout.spacingLarge,
  },
  stepRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    position: "relative",
  },
  stepConnector: {
    position: "absolute",
    left: 40,
    right: 40,
    top: 28,
    height: 1,
    backgroundColor: Theme.driverBorder,
    zIndex: 0,
  },
  stepConnectorFill: {
    left: 40,
    right: undefined,
  },
  stepItem: { alignItems: "center", gap: 8, zIndex: 1 },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.driverSurfaceElevated,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: {
    backgroundColor: Theme.driverEmerald,
    borderColor: Theme.driverEmerald,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  stepLabelActive: { color: Theme.textOnDark },
  stepLabelInactive: { color: Theme.textMuted },
  scroll: { flex: 1 },
  scrollContent: {
    paddingVertical: Layout.spacingSmall,
    gap: Layout.spacingMedium,
  },
  /** Wraps map + vehicle card so they fit driver layout (rounded, no overflow). */
  driverLiveTrackingWrap: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Theme.driverSurfaceElevated ?? "#f5f5f5",
  },
  driverLiveTrackingCardWrap: {
    paddingTop: 8,
    paddingHorizontal: 0,
  },
  card: {
    backgroundColor: Theme.driverWhiteMuted,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    borderRadius: 12,
    padding: Layout.spacingLarge,
  },
  cardTripIdRow: {
    paddingBottom: 10,
  },
  cardTripId: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  cardFlexMinWidth: {
    minWidth: 0,
    flex: 1,
  },
  cardObjectiveRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 10,
    paddingBottom: 0,
    borderTopWidth: 1,
  },
  cardObjectiveText: { flex: 1, minWidth: 0 },
  cardLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  cardTitleEmphasis: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: Theme.driverEmerald,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderTopWidth: 1,
    borderColor: Theme.driverBorder,
  },
  cardRowLocation: {
    flexDirection: "column",
  },
  cardLocationWrap: {
    paddingVertical: 6,
  },
  cardLocationDivider: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  cardLocationText: {
    fontSize: 13,
    fontWeight: "600",
  },
  cardRowNotes: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  cardNotesText: {
    fontSize: 13,
    fontWeight: "600",
  },
  cardMetaLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    marginBottom: 6,
  },
  cardMeta: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  cardEarningsValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  cardMetaRight: { alignItems: "flex-end", minWidth: 0 },
  progressBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.driverBorder,
    gap: 8,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  voyageStatusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.5,
  },
  progressPct: { fontSize: 18, fontWeight: "800", color: Theme.driverEmerald },
  hwCards: {
    flexDirection: "row",
    gap: 12,
  },
  hwCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Theme.driverWhiteMuted,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
  },
  hwCardIconWrap: {
    padding: 8,
    backgroundColor: Theme.driverEmeraldMuted,
    borderRadius: 8,
  },
  hwCardLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMuted,
    marginBottom: 2,
  },
  hwCardValue: { fontSize: 12, fontWeight: "800", color: Theme.textOnDark },
  progressTrackWrap: {
    height: 5,
    borderRadius: 2.5,
    overflow: "visible",
    backgroundColor: Theme.driverWhiteMuted,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressFillNeon: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: Theme.driverPrimary,
    paddingVertical: 12,
    borderRadius: 4,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  secondaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  secondaryActionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryActionHalf: {
    flex: 1,
  },
  stepErrorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.negativeMuted,
    borderWidth: 1,
    borderColor: Theme.negative,
    borderRadius: 4,
  },
  stepErrorText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.negative,
    flex: 1,
  },
  primaryBtnWhite: {
    backgroundColor: Theme.textOnDark,
    paddingVertical: 20,
    borderRadius: 4,
    alignItems: "center",
  },
  primaryBtnText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: Theme.buttonPrimaryText,
  },
  transitActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    minWidth: 0,
  },
  transitActionBtn: {
    flex: 1,
    minHeight: 56,
    minWidth: 0,
  },
  reachedBlock: {
    gap: 10,
  },
  podUploadWrap: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  podHint: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  podSkipPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignSelf: "center",
  },
  podSkipPillText: {
    fontSize: 13,
    fontWeight: "800",
  },
  podRequired: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  podListWrap: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  podListTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  podListItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  podListFileName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    minWidth: 0,
  },
  podListViewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  podListViewBtnText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.buttonPrimaryText,
  },
  podModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  podModalContent: {
    width: "100%",
    maxHeight: "90%",
    alignItems: "center",
  },
  podModalClose: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  podModalCloseText: {
    fontSize: 12,
    fontWeight: "800",
  },
  podModalImage: {
    width: "100%",
    height: 400,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  podModalLoadingText: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
  podModalFallback: {
    width: "100%",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
  },
  podModalFallbackText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  issueBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    borderRadius: 4,
  },
  issueBtnText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.textOnDark,
  },
  holdBtnWrap: {
    flex: 1,
    height: 44,
    position: "relative",
    overflow: "hidden",
    borderRadius: 4,
  },
  holdBtnFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Theme.driverEmerald,
    zIndex: 0,
  },
  holdBtn: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.driverEmeraldBorderSoft,
    borderRadius: 4,
    zIndex: 1,
  },
  holdBtnPressed: { transform: [{ scale: 0.98 }] },
  holdBtnText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  earningsCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Theme.positiveMutedDark,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
    borderRadius: 4,
    alignItems: "center",
    gap: 8,
  },
  earningsTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  earningsAmount: {
    fontSize: 30,
    fontWeight: "800",
    color: Theme.driverEmerald,
  },
  earningsSubtext: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    marginTop: 8,
  },
  netYieldWrap: {
    marginTop: 10,
    alignItems: "center",
  },
  netYieldLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  emptyMissionWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
  },
  noMission: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.textMuted,
  },
  backBtn: {
    width: "100%",
    maxWidth: 320,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    borderRadius: 12,
    backgroundColor: Theme.driverOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: Theme.textOnDark,
  },
  attributeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  attributeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  attributedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  attributedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
