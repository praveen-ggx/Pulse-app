import { AppLoadingSplash } from "@/components/AppLoadingSplash";
import { DriverHeader } from "@/components/driver/DriverHeader";
import { LiveRouteInfoCard } from "@/components/driver/LiveRouteInfoCard";
import {
  sheetStyles,
  TripDetailsStrip,
} from "@/components/driver/DriverTripSheetLayout";
import { DriverInviteCard } from "@/components/driver/DriverInviteCard";
import { JobRequestCard } from "@/components/JobRequestCard";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { ThemedConfirmModal } from "@/components/ThemedConfirmModal";
import { DriverMapAvatarMarker } from "@/components/driver/DriverMapAvatarMarker";
import {
    LeafletMap,
    type LeafletMapRef,
    type LeafletMarker,
    type LeafletPolylineLayer,
    type LeafletRouteLabel,
} from "@/components/driver/LeafletMap";
import { useOptionalDriverAvatar } from "@/contexts/DriverAvatarContext";
import { DriverDailySummaryCard } from "@/features/driver/components/DriverDailySummaryCard";
import { DriverDashboardMapPreview } from "@/features/driver/components/DriverDashboardMapPreview";
import { DriverExpenseCaptureFab } from "@/features/driver/components/DriverExpenseCaptureFab";
import { DriverJobCard } from "@/features/driver/job-card/DriverJobCard";
import { isCommerceDriverTrip } from "@/features/trips/domain/driverTripExperience";
import type { DriverRoutePlanMap } from "@/features/driver/job-card/driverRoutePlanMap";
import {
  buildDriverRoutePlanMap,
  buildTripRowRoutePlanMap,
  clusterRoutePlanStops,
  routeClusterCopy,
  routePlanLeafletMarkerId,
  routePlanPolyline,
  routePlanStopCaption,
} from "@/features/driver/job-card/driverRoutePlanMap";
import { RoutePlanMapPin } from "@/features/driver/job-card/parts/RoutePlanMapPin";
import { fetchDriverStopExecution } from "@/features/driver/execution/fetchDriverStopExecution";
import {
  startDriverAssignerFollowupReads,
  startDriverAssignerIdentityReads,
} from "@/features/driver/services/driverDashboardAssignerReads";
import { PilotRelationshipSummary } from "@/features/driver/components/PilotRelationshipSummary";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useDriverHomeInvites } from "@/features/driver/hooks/useDriverHomeInvites";
import {
  useDriverTheme,
  useDriverThemeColors,
} from "@/contexts/DriverThemeContext";
import { computeDriverTripEstEarningsInr } from "@/features/finance/selectors/assetTripProvisionSelectors";
import {
  useDriverCommunication,
  useDriverLocationStream,
} from "@/features/driver/communication";
import { useDriverMapLivePositionWatch } from "@/features/driver/hooks/useDriverMapLivePositionWatch";
import { useDriverHomePerfMarks } from "@/features/driver/hooks/useDriverHomePerfMarks";
import { markDriverPerfPhase } from "@/lib/driverPerfMetrics";
import { claimTripByOtp } from "@/features/trips/services/tripOtp.service";
import { useDriverHomeDriversQuery } from "@/lib/queries/useDriverHomeDriversQuery";
import { useInvalidateDriverHomeDashboard } from "@/lib/queries/useInvalidateDriverHomeDashboard";
import { useDriverUiTripsQuery } from "@/lib/queries/useDriverUiTripsQuery";
import { usePendingOtpTripsQuery } from "@/lib/queries/usePendingOtpTripsQuery";
import { insertTripAssignmentAudit } from "@/features/trips/services/trip-assignment-audit.service";
import { useDriverAvatarUri } from "@/lib/avatarUpload";
import {
    buildAssignerDisplayForTrip,
    buildJobCardAssignerPayload,
    findDriverInviteForTripOrgs,
    resolveAssignerUserId,
} from "@/features/trips/utils/driverAssignerDisplay.util";
import { boundsFromCoordinates, inflateMapBounds } from "@/features/trips/utils/mapRouteViewport.util";
import {
    DRIVER_NOTIFY_ONLY_AFTER_MISSION_KEY,
    DRIVER_POST_MISSION_PENDING_SNAPSHOT_KEY,
} from "@/features/driver/utils/driverDashboardFlags.util";
import {
    buildDriverTripNumberMap,
    getDriverTripDisplayNumber,
} from "@/features/driver/utils/driverTripSequence.util";
import {
    buildOfferText,
    canShowDriverTripEstEarnings,
    DRIVER_PAY_NA_AMOUNT,
    DRIVER_PAY_NA_LABEL,
    isActiveMission,
    isAggregateTrip,
    isAssignedNotStarted,
    isCompletedStatus,
    isRosterTrip,
} from "@/features/drivers/utils/driverUtils.util";
import { formatINR } from "@/lib/format";
import { formatEstimatedDuration } from "@/lib/formatEstimatedDuration";
import {
  setDriverLivePosition,
  shouldCommitDriverMapPosition,
  subscribeDriverLivePosition,
} from "@/lib/driverLivePositionBus";
import { darkMapStyle } from "@/lib/mapStyles";
import { subscribeSignificantAppResume } from "@/lib/significantAppResume";
import type { MapViewRef } from "@/lib/mapViewRef.types";
import MapView, {
    Callout,
    Marker,
    Polyline,
} from "@/lib/reactNativeMapsCompat";
import { supabase } from "@/lib/supabase";
import { withWebSafeShadows } from "@/lib/platformViewStyle.util";
import * as driverLocationService from "@/features/driver/services/driverLocation.service";
import * as driversService from "@/features/drivers/services/drivers.service";
import { canTagPartyOnTrip } from "@/features/drivers/utils/driverPartyReceivables.util";
import {
    buildRouteFetchKey,
    getOptimalRoute,
    parseRouteFetchKey,
    type RouteResult,
} from "@/lib/routingService";
import {
    fetchUsableRouteForKey,
    routeMidpoint,
    shouldShowDriverApproachRoute,
    shouldShowDriverToDropRoute,
} from "@/lib/driverMapRoute.util";
import * as tripsService from "@/features/trips/services/trips.service";
import { executeDriverCommand } from "@/features/driver/services/driverExecution.service";
import {
  deriveTripStage,
  getTripStageGuidance,
  getTripStopCoordinate,
  distanceMeters,
  bearingDegrees,
  subsampleRouteCoordinates,
  formatRoadDistanceM,
  formatEtaFromRouteSeconds,
  formatEtaArrivalClock,
  formatTripDistance,
  type TripStage,
} from "@/features/trips/domain";
import {
  reverseGeocodeCityStateLabel,
} from "@/lib/reverseGeocodePlace.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import BottomSheet, {
    BottomSheetScrollView,
    BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import { isExpoGo } from "@/lib/expoGoMaps";
import * as ExpoLocation from "expo-location";
import { startForegroundPositionWatch } from "@/lib/safeForegroundPositionWatch";
import { useRouter, type Href } from "expo-router";
import { ROUTES } from "@/lib/routes";
import { useDriverOperatingModeQuery } from "@/lib/queries/useDriverOperatingModeQuery";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MutableRefObject,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Reanimated, {
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import {
  effectiveKeyboardInset,
  useKeyboardVisible,
} from "@/lib/hooks/useKeyboardVisible";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchRouteExtraStopsForTrips } from "@/features/trips/services/routeExtraStops.service";

/** Default map region when driver location is not yet available (India center). */
const DEFAULT_MAP_REGION = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

const DRIVER_MAP_BOOT_KEY = "@pulse/driver-map-native-booting";
const DRIVER_MAP_BOOT_TS_KEY = "@pulse/driver-map-native-boot-ts";

/** Route overview fit — slightly wider than city corridor (more country visible). */
const DRIVER_MAP_OVERVIEW_MAX_ZOOM = 11;
/** Center-on-me / locate close-up. */
const DRIVER_MAP_MY_LOCATION_ZOOM = 15;
/** User +/- / pin taps — still below blank-tile range. */
const DRIVER_MAP_MAX_ZOOM = 16;

const MAP_CONTROLS_BAR_HEIGHT = 32;
const MAP_CONTROLS_BELOW_TOP = 6;

function mapControlsTopInset(
  controlsVariant: "modal" | "embedded",
  safeTop: number,
): number {
  return (
    (controlsVariant === "embedded" ? safeTop + 96 : safeTop + 10) +
    MAP_CONTROLS_BAR_HEIGHT +
    MAP_CONTROLS_BELOW_TOP
  );
}

/** Trip is in progress so "Accept" does not reappear after refresh (includes started_at). */
function isTripInProgress(t: tripsService.TripRow) {
  if (isCompletedStatus(t.status)) return false;
  return isActiveMission(t.status) || !!t.started_at;
}

// Stage derivation, guidance copy, and stop-coordinate resolution now live in
// features/trips/domain/ (tripStage.ts / tripStageGuidance.ts) — this screen,
// features/driver/utils/driverTripStatusNotes.util.ts, and
// features/driver/components/DriverTripFlowCard.tsx all consume the same
// canonical logic instead of each keeping their own copy.
type DriverGuidanceStep = Exclude<TripStage, "lr">;
const deriveDriverGuidanceStep = deriveTripStage as (
  t: tripsService.TripRow,
) => DriverGuidanceStep;
const getDriverGuidanceConfig = getTripStageGuidance;

const DRIVER_ACCEPTED_TRIP_ID_KEY = "driver_accepted_trip_id";
/** Set from notifications screen so dashboard selects that trip on return. */
const DRIVER_NOTIFICATION_FOCUS_TRIP_KEY = "driver_notification_focus_trip_id";
const OTP_LENGTH = 6;

let ExpoLocationModule: typeof ExpoLocation | null = null;

async function getExpoLocation(): Promise<typeof ExpoLocation | null> {
  try {
    if (!ExpoLocationModule) {
      ExpoLocationModule = await import("expo-location");
    }
    return ExpoLocationModule;
  } catch {
    return null;
  }
}

const DECLINE_WARNING_TITLE = "Decline this trip?";
const DECLINE_WARNING_MSG =
  "Warning: you will no longer be assigned to this trip. The fleet can reassign it to another driver.";

export default function DriverRadarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark, mapTheme } = useDriverTheme();
  const colors = useDriverThemeColors();
  // Match DriverTabBar (footerPadTop 6) so clearance math agrees with the dock.
  const footerPadTop = 6;
  const footerPadBottom = Math.max(Math.round(insets.bottom * 0.35), 10);
  /** Space reserved under floating dock (includes air above the glass pill). */
  const driverTabBarClearance =
    Layout.tabBarDockHeight + footerPadTop + footerPadBottom;
  /**
   * Lift the job/mission sheet fully above the floating glass dock
   * (padTop + dock + home-indicator pad). Flush inset sat the CTA on the tab bar.
   */
  const driverSheetBottomInset = driverTabBarClearance;
  // Driver home previously used a hardcoded dark map for contrast.
  // Now it respects the "Map Style" user setting (light, dark, or auto-sync with theme).
  const mapIsDark = mapTheme === "auto" ? isDark : mapTheme === "dark";
  /** Job request bottom sheet: earnings, addresses, pills; muted labels */
  const jobRequestSheetPrimary = isDark
    ? Theme.textOnPrimary
    : Theme.textPrimaryDark;
  const jobRequestSheetMuted = isDark ? Theme.textOnDarkMuted : Theme.textMuted;
  const { profile } = useAuth();
  const uid = profile?.uid ?? null;
  const { canTagOfflineParty } = useDriverOperatingModeQuery(uid);
  const invalidateDriverHome = useInvalidateDriverHomeDashboard();
  const refreshDashboard = useCallback(() => {
    if (uid) void invalidateDriverHome(uid);
  }, [uid, invalidateDriverHome]);
  const patchTripInDashboard = useCallback((updated: tripsService.TripRow) => {
    setAllTrips((prev) =>
      prev.map((t) =>
        t.id === updated.id
          ? {
              ...t,
              ...updated,
              status: updated.status ?? t.status,
              updated_at: updated.updated_at ?? t.updated_at,
              started_at: updated.started_at ?? t.started_at,
              completed_at: updated.completed_at ?? t.completed_at,
            }
          : t,
      ),
    );
  }, []);
  const linkedDriversQuery = useDriverHomeDriversQuery(uid);
  const tripsQuery = useDriverUiTripsQuery(uid);
  const linkedDriver = linkedDriversQuery.primaryDriver;
  const pendingOtpQuery = usePendingOtpTripsQuery(uid);
  const pendingOtpTrips = pendingOtpQuery.pendingTrips;
  const {
    invites,
  } = useDriverHomeInvites();
  const { avatarUri } = useDriverAvatarUri();
  const optionalDriverAvatar = useOptionalDriverAvatar();
  /** Prefer DB seed so map/markers match business profile, not stale AsyncStorage. */
  const driverAvatarSeed =
    profile?.avatar_seed?.trim() ||
    optionalDriverAvatar?.avatarSeed ||
    undefined;
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [allTrips, setAllTrips] = useState<tripsService.TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tripsSyncing, setTripsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [declinedTripId, setDeclinedTripId] = useState<string | null>(null);
  const justClaimedTripIdRef = useRef<string | null>(null);
  const justClaimedOldTripIdRef = useRef<string | null>(null);

  const [assignmentFeedback, setAssignmentFeedback] = useState<
    "accepted" | "declined" | null
  >(null);
  const [isOtpClaiming, setIsOtpClaiming] = useState(false);
  const assignmentFeedbackTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pingAnim = useRef(new Animated.Value(0)).current;
  const pickupDotPingAnim = useRef(new Animated.Value(0)).current;
  const newAssignmentBlinkAnim = useRef(new Animated.Value(0)).current;
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [_showNotification, setShowNotification] = useState(false);
  const [invitationAccepted, setInvitationAccepted] = useState(false);
  const [invitationDeclined, setInvitationDeclined] = useState(false);
  const [invitationDismissed, setInvitationDismissed] = useState(false);

  // Show notification if there's any pending invite and user hasn't acted recently
  useEffect(() => {
    if (
      invites.filter((i) => i.status === "pending").length > 0 &&
      !invitationAccepted &&
      !invitationDeclined &&
      !invitationDismissed
    ) {
      setShowNotification(true);
    } else {
      setShowNotification(false);
    }
  }, [invites, invitationAccepted, invitationDeclined, invitationDismissed]);
  const pendingInvite = invites.find((i) => i.status === "pending") ?? null;

  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [declineLoading, setDeclineLoading] = useState(false);
  const [declineConfirmTripId, setDeclineConfirmTripId] = useState<string | null>(null);
  // Alert.alert is a no-op on web (react-native-web stub) — decline failures must
  // use this themed modal, matching the web-safe pattern already used for the
  // decline confirmation itself, or the driver sees nothing on mobile web.
  const [declineErrorMessage, setDeclineErrorMessage] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [acceptedTripId, setAcceptedTripId] = useState<string | null>(null);
  // Stays false until the AsyncStorage check completes so we never flash the
  // accept-trip card for a driver who already accepted this trip.
  const [acceptedTripIdResolved, setAcceptedTripIdResolved] = useState(false);
  const [routePlanMap, setRoutePlanMap] = useState<DriverRoutePlanMap | null>(null);
  // Bumped whenever we explicitly clear acceptedTripId so an in-flight
  // AsyncStorage read from before the clear can't resurrect the stale value.
  const acceptedTripIdClearTokenRef = useRef(0);
  const [selectedIncomingTripId, setSelectedIncomingTripId] = useState<
    string | null
  >(null);
  const [notificationHistory, setNotificationHistory] = useState<
    { tripId: string; reason: "accepted_other" | "declined"; movedAt: string }[]
  >([]);
  const [assignerNamesByUserId, setAssignerNamesByUserId] = useState<
    Record<string, string>
  >({});
  const [assignerOrgNameByUserId, setAssignerOrgNameByUserId] = useState<
    Record<string, string>
  >({});
  /** Resolved server-side (RPC); drivers cannot read dispatcher profiles via RLS. */
  const [assignerDisplayByTripId, setAssignerDisplayByTripId] = useState<
    Record<string, string>
  >({});
  const [assignerTripOrgNameByTripId, setAssignerTripOrgNameByTripId] = useState<
    Record<string, string>
  >({});
  const [assignerTripOrgIdByTripId, setAssignerTripOrgIdByTripId] = useState<
    Record<string, string>
  >({});
  const [organizationNamesById, setOrganizationNamesById] = useState<
    Record<string, string>
  >({});
  const [organizationLogoById, setOrganizationLogoById] = useState<
    Record<string, string>
  >({});
  const [organizationAvatarSeedById, setOrganizationAvatarSeedById] = useState<
    Record<string, string>
  >({});
  const [organizationAvatarUrlById, setOrganizationAvatarUrlById] = useState<
    Record<string, string>
  >({});
  const [assignmentActorByTripId, setAssignmentActorByTripId] = useState<
    Record<string, string>
  >({});
  const [rpcAssignerUserIdByTripId, setRpcAssignerUserIdByTripId] = useState<
    Record<string, string>
  >({});
  const [otpClaimTripId, setOtpClaimTripId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();
  const otpKeyboardInset = useMemo(
    () =>
      otpClaimTripId
        ? effectiveKeyboardInset(keyboardVisible, keyboardHeight)
        : 0,
    [otpClaimTripId, keyboardVisible, keyboardHeight],
  );
  const previousTripsRef = useRef<Map<string, string>>(new Map());
  const searchPulseAnim = useRef(new Animated.Value(0)).current;
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "loading" | "success" | "error"
  >("loading");
  const [driverMapPosition, setDriverMapPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  // DEV: last 3 background-pinned coordinates for the active trip
  const [recentPinPoints, setRecentPinPoints] = useState<
    { latitude: number; longitude: number; recorded_at: string }[]
  >([]);
  // Truck marker position shown on the map; animated independently from raw GPS.
  const [truckPosition, setTruckPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Reanimated-smoothed "You" marker (Ola-style: avoid teleport between GPS fixes).
  const youLatSv = useSharedValue<number>(DEFAULT_MAP_REGION.latitude);
  const youLonSv = useSharedValue<number>(DEFAULT_MAP_REGION.longitude);
  const youHeadingSv = useSharedValue<number>(0);
  const lastHeadingFixRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const youMarkerAnimatedProps = useAnimatedProps(() => ({
    coordinate: {
      latitude: youLatSv.value,
      longitude: youLonSv.value,
    },
  }));

  const youIconAnimatedStyle = useAnimatedStyle(() => {
    // Heading rotation (if no heading yet, heading stays 0).
    return { transform: [{ rotate: `${youHeadingSv.value}deg` }] };
  });

  const OlaAnimatedMarker = useMemo((): ComponentType<
    Record<string, unknown>
  > | null => {
    if (Platform.OS === "web") return null;
    return Reanimated.createAnimatedComponent(
      Marker,
    ) as unknown as ComponentType<Record<string, unknown>>;
  }, []);
  const justCompletedTripRef = useRef(false);
  /** After completing a trip, keep remaining assignments notification-only on Home (mirrors behaviour during another active trip). */
  const [
    assignableTripsNotifyOnlyAfterMission,
    setAssignableTripsNotifyOnlyAfterMission,
  ] = useState(false);

  const clearNotifyOnlyAfterMission = useCallback(() => {
    setAssignableTripsNotifyOnlyAfterMission(false);
    void AsyncStorage.removeItem(DRIVER_NOTIFY_ONLY_AFTER_MISSION_KEY);
    void AsyncStorage.removeItem(DRIVER_POST_MISSION_PENDING_SNAPSHOT_KEY);
  }, []);

  const [isFullMapVisible, setIsFullMapVisible] = useState(false);
  const [inlineMapViewportHeight, setInlineMapViewportHeight] = useState(0);
  const [toastMessage, setToastMessage] = useState("You are online now.");
  const pingMapUiRef = useRef<{
    commitMapPosition: (
      p: { latitude: number; longitude: number } | null,
      opts?: { force?: boolean },
    ) => void;
    youLatSv: typeof youLatSv;
    youLonSv: typeof youLonSv;
    youHeadingSv: typeof youHeadingSv;
    lastHeadingFixRef: typeof lastHeadingFixRef;
  } | null>(null);
  const truckAnimTokenRef = useRef(0);
  const truckRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(
    null,
  );
  const lastAnimatedStepKeyRef = useRef<string | null>(null);
  const lastAnimatedTripIdRef = useRef<string | null>(null);
  const mapRef = useRef<MapViewRef | null>(null);
  const fullMapRef = useRef<MapViewRef | null>(null);
  const leafletRef = useRef<LeafletMapRef | null>(null);
  const fullLeafletRef = useRef<LeafletMapRef | null>(null);
  const nativeMapZoomRef = useRef(DRIVER_MAP_MY_LOCATION_ZOOM);
  const bottomSheetRef = useRef<BottomSheet | null>(null);
  /** Tracks sheet top Y so expense FAB floats above the job card as it minimizes. */
  const missionSheetAnimatedPosition = useSharedValue(0);
  const sheetOperationActiveRef = useRef(false);
  /** True while an in-progress mission sheet is mounted — skip resume invalidate (camera/POD). */
  const hasActiveMissionRef = useRef(false);
  const sheetSnapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoExpandedIncomingTripIdRef = useRef<string | null>(null);
  const inlineMapViewportHeightRef = useRef(0);
  const inlineMapLastFitKeyRef = useRef<string | null>(null);
  const fullMapLastFitKeyRef = useRef<string | null>(null);
  /** Real rendered height of the mission sheet (measured via onLayout), not a screen-fraction guess. */
  const [measuredSheetHeight, setMeasuredSheetHeight] = useState(0);
  /** 0 = stage peek ("Deliver to Delhi"), 1 = full mission card. */
  const [missionSheetIndex, setMissionSheetIndex] = useState(1);
  const [deliveryDetailsNonce, setDeliveryDetailsNonce] = useState(0);
  const expandedSheetHeightRef = useRef(0);
  /** Suppressed once the driver manually pans/pinches, until a meaningful context change or "Center" re-enables it. */
  const inlineMapUserInteractedRef = useRef(false);
  const fullMapUserInteractedRef = useRef(false);
  const OtpInputComponent =
    Platform.OS === "web" ? TextInput : BottomSheetTextInput;
  const otpInputRef = useRef<TextInput | null>(null);
  const lastGuidanceKeyRef = useRef<string | null>(null);
  const [isFollowingLocation, setIsFollowingLocation] = useState(false);
  /** Tap Tracking pill to show distance + ETA card (toggle). */
  const [showTrackingInfoCard, setShowTrackingInfoCard] = useState(false);
  /** Default off = map-first (ref 1); tap route icon to show FROM/distance/TO overlay (ref 2). */
  const [showRouteSummary, setShowRouteSummary] = useState(false);
  /** Locate control: true = close-up on driver; false = full route overview. */
  const [mapLocateCloseUp, setMapLocateCloseUp] = useState(false);
  const locationWatchRef = useRef<{ remove: () => void } | null>(null);
  const gpsFallbackWarnedKeyRef = useRef<string | null>(null);
  /** Phase 1: FG location requested once per active mission (resume / mid-session start). */
  const fgLocationRequestedForMissionRef = useRef<string | null>(null);
  const initialLoadDoneRef = useRef(false);
  const isRefreshingRef = useRef(false);

  // Map fallback:
  // - Force Leaflet via env (debug): EXPO_PUBLIC_DRIVER_MAP_FALLBACK=leaflet
  // - Expo Go: prefer Leaflet (native maps often grey after heavy Home / avatar loads)
  // - If the app crashed while native map was booting last time, use Leaflet on next launch (prevents boot-loop).
  const googleMapsAndroidKey = String(
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || "",
  ).trim();
  const leafLetForced =
    String(process.env.EXPO_PUBLIC_DRIVER_MAP_FALLBACK || "").toLowerCase() ===
      "leaflet" ||
    isExpoGo() ||
    // If we don't have a Google Maps key on Android, native tiles may render blank or crash on some devices.
    // Default to Leaflet in that case so the driver app is usable out of the box.
    (Platform.OS === "android" && !googleMapsAndroidKey);
  // Seed from leafLetForced so the first frame is not a grey native MapView.
  const [useLeafletFallback, setUseLeafletFallback] = useState(leafLetForced);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (leafLetForced) {
        if (mounted) setUseLeafletFallback(true);
        return;
      }
      try {
        const [booting, ts] = await Promise.all([
          AsyncStorage.getItem(DRIVER_MAP_BOOT_KEY).catch(() => null),
          AsyncStorage.getItem(DRIVER_MAP_BOOT_TS_KEY).catch(() => null),
        ]);
        const isBooting = booting === "1";
        const bootTs = ts ? Number(ts) : 0;
        const recently = bootTs > 0 && Date.now() - bootTs < 2 * 60 * 1000;
        if (mounted && isBooting && recently) {
          setUseLeafletFallback(true);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [leafLetForced]);

  // When we attempt to render native map, mark "booting" so if the process dies we can switch next launch.
  useEffect(() => {
    if (useLeafletFallback || leafLetForced) return;
    void AsyncStorage.setItem(DRIVER_MAP_BOOT_KEY, "1");
    void AsyncStorage.setItem(DRIVER_MAP_BOOT_TS_KEY, String(Date.now()));
  }, [useLeafletFallback, leafLetForced]);

  useEffect(() => {
    const tokenAtRead = acceptedTripIdClearTokenRef.current;
    AsyncStorage.getItem(DRIVER_ACCEPTED_TRIP_ID_KEY)
      .then((id) => {
        if (tokenAtRead === acceptedTripIdClearTokenRef.current && id != null && id !== "") {
          setAcceptedTripId(id);
        }
        setAcceptedTripIdResolved(true);
      })
      .catch(() => {
        setAcceptedTripIdResolved(true);
      });
    AsyncStorage.getItem(DRIVER_NOTIFY_ONLY_AFTER_MISSION_KEY).then((v) => {
      if (v === "1") setAssignableTripsNotifyOnlyAfterMission(true);
    });
  }, []);

  const lastOtpClaimingRef = useRef(isOtpClaiming);
  const lastDriverMapCommitAtRef = useRef(0);
  const driverMapPositionRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const lastCommittedMapPosRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const commitMapPosition = useCallback(
    (
      p: { latitude: number; longitude: number } | null,
      opts?: { force?: boolean },
    ) => {
      driverMapPositionRef.current = p;
      setDriverLivePosition(p);
      if (p == null) {
        lastCommittedMapPosRef.current = null;
        lastDriverMapCommitAtRef.current = Date.now();
        setDriverMapPosition(null);
        return;
      }
      if (
        !shouldCommitDriverMapPosition({
          prev: lastCommittedMapPosRef.current,
          next: p,
          lastCommitAt: lastDriverMapCommitAtRef.current,
          force: opts?.force === true,
        })
      ) {
        return;
      }
      lastCommittedMapPosRef.current = p;
      lastDriverMapCommitAtRef.current = Date.now();
      setDriverMapPosition(p);
    },
    [],
  );

  const driverIdsKey = linkedDriversQuery.driverIdsKey;
  const driversQueryFailed =
    linkedDriversQuery.isError &&
    linkedDriversQuery.isFetched &&
    linkedDriversQuery.activeLinkedDrivers.length === 0;

  useEffect(() => {
    if (!linkedDriver?.id) return;
    setDriver((prev) => (prev?.id === linkedDriver.id ? prev : linkedDriver));
  }, [linkedDriver?.id, linkedDriver]);

  /**
   * Apply the shared ui-trips query (same cache as DriverTripOpsProvider).
   * First paint waits on linked-drivers only — not the trip list.
   */
  useEffect(() => {
    const finishLoading = () => {
      setLoading(false);
      initialLoadDoneRef.current = true;
      isRefreshingRef.current = false;
      setRefreshing(false);
    };

    if (!uid) {
      setLoading(false);
      return;
    }

    setAcceptError(null);
    if (!initialLoadDoneRef.current && !isRefreshingRef.current) {
      setLoading(true);
    }

    if (driversQueryFailed) {
      setAcceptError(
        linkedDriversQuery.error instanceof Error
          ? linkedDriversQuery.error.message
          : "Could not load your fleet. Pull down to retry.",
      );
      finishLoading();
      return;
    }

    if (linkedDriversQuery.isPending && !linkedDriversQuery.isFetched) {
      return;
    }

    const active = linkedDriversQuery.activeLinkedDrivers;
    if (active.length === 0) {
      setDriver((prev) => (prev === null ? prev : null));
      setAllTrips((prev) => (prev.length === 0 ? prev : []));
      setIsOnline((prev) => (prev === false ? prev : false));
      previousTripsRef.current = new Map();
      setTripsSyncing(false);
      finishLoading();
      return;
    }

    const primaryDriver = active[0];
    setDriver((prev) =>
      prev?.id === primaryDriver.id ? prev : primaryDriver,
    );

    if (!initialLoadDoneRef.current) {
      finishLoading();
    }

    setTripsSyncing(tripsQuery.isFetching);

    if (!tripsQuery.isFetched && tripsQuery.isPending) {
      return;
    }

    const trips = tripsQuery.trips;
    const tripSyncFingerprint = (list: tripsService.TripRow[]) =>
      list
        .map(
          (t) =>
            `${t.id}:${String(t.status ?? "").toLowerCase()}:${t.updated_at ?? ""}`,
        )
        .sort()
        .join("|");

    const seqByTrip = buildDriverTripNumberMap(trips);
    previousTripsRef.current = new Map(
      trips.map((t) => [t.id, getDriverTripDisplayNumber(t, seqByTrip)]),
    );

    setAllTrips((prev) =>
      tripSyncFingerprint(prev) === tripSyncFingerprint(trips) ? prev : trips,
    );

    const normalizedDriverStatus = String(primaryDriver.status ?? "").toLowerCase();
    const hasActiveTrip = trips.some((t) => isTripInProgress(t));
    const nextOnline =
      normalizedDriverStatus === "online" ||
      normalizedDriverStatus === "on_trip" ||
      hasActiveTrip;
    setIsOnline((prev) => (prev || nextOnline ? true : prev));

    finishLoading();

    setAcceptedTripId((prev) => {
      if (prev == null) return prev;
      const trip = trips.find((t) => t.id === prev);
      if (!isOtpClaiming && trip && isCompletedStatus(trip.status)) {
        acceptedTripIdClearTokenRef.current += 1;
        void AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
        return null;
      }
      return prev;
    });
  }, [
    uid,
    driverIdsKey,
    driversQueryFailed,
    linkedDriversQuery.isFetched,
    linkedDriversQuery.isPending,
    linkedDriversQuery.error,
    linkedDriversQuery.activeLinkedDrivers,
    tripsQuery.isFetched,
    tripsQuery.isPending,
    tripsQuery.isFetching,
    tripsQuery.trips,
    isOtpClaiming,
  ]);

  useEffect(() => {
    if (lastOtpClaimingRef.current === isOtpClaiming) return;
    lastOtpClaimingRef.current = isOtpClaiming;
    void tripsQuery.refetch();
  }, [isOtpClaiming, tripsQuery.refetch]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      setLoading(false);
      initialLoadDoneRef.current = true;
    }, 10_000);
    return () => clearTimeout(t);
  }, [loading]);


  const runDeclineTrip = useCallback(
    async (tripId: string) => {
      if (declineLoading) return;
      setAcceptError(null);
      if (otpClaimTripId === tripId) {
        setOtpClaimTripId(null);
        setOtpValue("");
        setOtpError(null);
      }
      setDeclineLoading(true);
      // Pre-OTP assignment (drivers.user_id IS NULL) needs a different RPC —
      // driver_reject_trip() can never authorize an unclaimed driver. Mirrors
      // the same requiresOtp check handleAcceptMission already uses
      // (pendingOtpTripsRequiringOtp itself is declared later in this
      // component, so this recomputes from pendingOtpTrips directly to avoid
      // a temporal-dead-zone reference).
      const pendingOtpTrip = pendingOtpTrips.find((t) => t.id === tripId);
      const requiresOtp = !!pendingOtpTrip && !isRosterTrip(pendingOtpTrip);
      const { error } = requiresOtp
        ? await tripsService.driverDeclinePendingAssignment(tripId)
        : await tripsService.driverRejectTrip(tripId);
      setDeclineLoading(false);
      if (error) {
        // Alert.alert is a no-op on web — use the themed modal so the failure
        // is actually visible instead of silently doing nothing.
        setDeclineErrorMessage(error.message ?? "Could not decline. Try again.");
        return;
      }
      if (
        String(acceptedTripId ?? "").toLowerCase() ===
        String(tripId).toLowerCase()
      ) {
        acceptedTripIdClearTokenRef.current += 1;
        setAcceptedTripId(null);
        await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
      }
      setSelectedIncomingTripId((prev) =>
        String(prev ?? "").toLowerCase() === String(tripId).toLowerCase()
          ? null
          : prev,
      );
      setNotificationHistory((prev) => {
        if (prev.some((item) => item.tripId === tripId)) return prev;
        return [
          ...prev,
          { tripId, reason: "declined", movedAt: new Date().toISOString() },
        ];
      });
      setAssignmentFeedback("declined");
      setDeclinedTripId(tripId);
      if (uid) void invalidateDriverHome(uid);
      if (assignmentFeedbackTimeoutRef.current)
        clearTimeout(assignmentFeedbackTimeoutRef.current);
      assignmentFeedbackTimeoutRef.current = setTimeout(() => {
        setAssignmentFeedback(null);
        assignmentFeedbackTimeoutRef.current = null;
      }, 1200);
    },
    [
      declineLoading,
      otpClaimTripId,
      acceptedTripId,
      uid,
      invalidateDriverHome,
      setDeclinedTripId,
      pendingOtpTrips,
    ],
  );

  const confirmDeclineTrip = useCallback(
    (tripId: string) => {
      // Some mobile browsers (in-app/WebView tabs) silently block window.confirm,
      // so use the app's own themed modal on web instead of relying on it.
      if (Platform.OS === "web") {
        setDeclineConfirmTripId(tripId);
        return;
      }

      Alert.alert(DECLINE_WARNING_TITLE, DECLINE_WARNING_MSG, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline trip",
          style: "destructive",
          onPress: () => runDeclineTrip(tripId),
        },
      ]);
    },
    [runDeclineTrip],
  );

  // Ensure notification channel exists for Android foreground services (fixes APK crashes).
  // Do not import expo-notifications in Expo Go on Android (SDK 53+): it triggers a noisy error
  // and push is unsupported there; dev/standalone builds still run this.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (Constants.executionEnvironment === "storeClient") return;
    import("expo-notifications").then((Notifications) => {
      Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: Theme.primary,
      }).catch(() => {
        /* ignore */
      });
    });
  }, []);

  /** Foreground-only location bootstrap (Go Online / active-trip resume / pull-refresh). */
  const fetchLocation = useCallback(async () => {
    markDriverPerfPhase("gps_request_start");
    try {
      const expoLocation = await getExpoLocation();
      if (!expoLocation) {
        setLocationStatus("error");
        setLocationLabel(null);
        return;
      }

      const { status: foregroundStatus } =
        await ExpoLocation.requestForegroundPermissionsAsync();
      if (foregroundStatus !== "granted") {
        setLocationStatus("error");
        setLocationLabel(null);
        return;
      }

      const current = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });

      const { latitude, longitude } = current.coords;

      setLocationStatus("success");
      setLocationLabel("Current location");

      try {
        const cityState = await reverseGeocodeCityStateLabel(latitude, longitude);
        if (cityState) setLocationLabel(cityState);
      } catch {
        // keep "Current location" when geocode fails
      }
    } catch (err) {
      console.error("[DriverIndex] fetchLocation error:", err);
      setLocationStatus("error");
      setLocationLabel(null);
    }
  }, []);

  // Coarse city label only — full GPS precision caused reverse-geocode spam.
  const liveDriverGeocodeCoord = useMemo(() => {
    const c = driverMapPosition ?? truckPosition;
    if (!c) return null;
    return {
      latitude: Number(c.latitude.toFixed(3)),
      longitude: Number(c.longitude.toFixed(3)),
    };
  }, [
    truckPosition?.latitude,
    truckPosition?.longitude,
    driverMapPosition?.latitude,
    driverMapPosition?.longitude,
  ]);

  useEffect(() => {
    const c = liveDriverGeocodeCoord;
    if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void reverseGeocodeCityStateLabel(c.latitude, c.longitude).then((label) => {
        if (!cancelled && label) setLocationLabel(label);
      });
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [liveDriverGeocodeCoord?.latitude, liveDriverGeocodeCoord?.longitude]);

  // Focus: local storage only — no invalidate (invalidate + unstable query observers caused update loops).
  useFocusEffect(
    useCallback(() => {
      const tokenAtRead = acceptedTripIdClearTokenRef.current;
      Promise.all([
        AsyncStorage.getItem(DRIVER_ACCEPTED_TRIP_ID_KEY),
        AsyncStorage.getItem(DRIVER_NOTIFICATION_FOCUS_TRIP_KEY),
        AsyncStorage.getItem(DRIVER_NOTIFY_ONLY_AFTER_MISSION_KEY),
      ]).then(([acceptedId, focusTripId, notifyOnly]) => {
        // A newer explicit clear happened while this read was in flight — drop it.
        if (tokenAtRead !== acceptedTripIdClearTokenRef.current) return;
        if (acceptedId != null && acceptedId !== "") setAcceptedTripId(acceptedId);
        if (focusTripId != null && focusTripId !== "") {
          setSelectedIncomingTripId(focusTripId);
          void AsyncStorage.removeItem(DRIVER_NOTIFICATION_FOCUS_TRIP_KEY);
        }
        setAssignableTripsNotifyOnlyAfterMission(notifyOnly === "1");
      });
    }, []),
  );

  /** Invalidate only on significant resume (not every web tab flick). */
  useEffect(() => {
    if (!uid) return;
    return subscribeSignificantAppResume(() => {
      // Camera / gallery for POD & LR briefly flips AppState inactive → active.
      // A full invalidate remounts the mission sheet and flashes the map underneath.
      if (hasActiveMissionRef.current) return;
      void invalidateDriverHome(uid);
    });
  }, [uid, invalidateDriverHome]);

  // Clear declinedTripId once the declined trip is no longer present in any assignment source.
  useEffect(() => {
    if (!declinedTripId) return;
    const stillVisibleInAssigned = allTrips.some(
      (t) => t.id === declinedTripId,
    );
    const stillVisibleInPendingOtp = pendingOtpTrips.some(
      (t) => t.id === declinedTripId,
    );
    if (!stillVisibleInAssigned && !stillVisibleInPendingOtp) {
      setDeclinedTripId(null);
    }
  }, [declinedTripId, allTrips, pendingOtpTrips]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    isRefreshingRef.current = true;
    setLocationStatus("loading");
    Promise.all([
      uid
        ? invalidateDriverHome(uid, { syncLinkedDrivers: true })
        : Promise.resolve(),
      fetchLocation(),
    ]).finally(() => {
      isRefreshingRef.current = false;
      setRefreshing(false);
    });
  }, [uid, invalidateDriverHome, fetchLocation]);

  const reportLocationToDb = useCallback(
    async (
      tripId: string | null,
      lat: number,
      lng: number,
      accuracy: number | null,
      source: driverLocationService.DriverLocationSource,
      extras?: { odometerKm?: number | null; recordedAt?: string },
    ) => {
      if (!driver?.organization_id) return false;
      const { error } = await driverLocationService.reportDriverLocation({
        driverId: driver.id,
        organizationId: driver.organization_id,
        tripId,
        latitude: lat,
        longitude: lng,
        accuracy,
        source,
        odometerKm: extras?.odometerKm ?? null,
        recordedAt: extras?.recordedAt ?? null,
        ownerUserId: driver.user_id,
      });
      return !error;
    },
    [driver],
  );

  const fetchAndLogRecentPins = useCallback(async (tripId: string) => {
    const { points } = await driverLocationService.getLastNLocationsForTrip(tripId, 3);
    // DEV: log last 3 pinned coordinates
    console.log('[DEV] Last 3 pinned coordinates for trip', tripId, points);
    setRecentPinPoints(points);
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pingAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pingAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline, pingAnim]);

  const triggerSuccess = (message = "You are online now.") => {
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    setToastMessage(message);
    setShowSuccess(true);
    successTimeoutRef.current = setTimeout(() => {
      setShowSuccess(false);
      successTimeoutRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      if (assignmentFeedbackTimeoutRef.current)
        clearTimeout(assignmentFeedbackTimeoutRef.current);
    };
  }, []);

  const handleAcceptMission = async (trip: tripsService.TripRow) => {
    clearNotifyOnlyAfterMission();
    // OTP applies only to non-roster aggregate trips that require claim.
    const isAssetRosterTrip = isRosterTrip(trip);
    const requiresOtp =
      !isAssetRosterTrip &&
      pendingOtpTripsRequiringOtp.some((t) => t.id === trip.id);
    if (requiresOtp) {
      openOtpClaim(trip);
      return;
    }

    setAcceptError(null);
    setAcceptLoading(true);
    const { error: acceptSyncError } = await executeDriverCommand(
      { tripId: trip.id, command: "ACCEPT_TRIP" },
      trip,
    );
    if (acceptSyncError) {
      setAcceptError(acceptSyncError.message);
      setAcceptLoading(false);
      return;
    }
    // Durable, server-side record of the driver's tap. ACCEPT_TRIP above leaves
    // the trip on 'assigned', so without this row nothing outside this device can
    // tell acceptance apart from the dispatcher's assignment — which is why the web
    // manifest used to guess. Awaited (not fire-and-forget) so this row's changed_at
    // is committed before the driver can proceed to pickup; otherwise a fast tap-through
    // can race a later started_at write ahead of this insert, making driver_accepted
    // appear to happen after pickup. The audit helper still swallows duplicate-tap
    // and pre-migration errors, so this can't block a driver who has already accepted.
    await insertTripAssignmentAudit({
      trip_id: trip.id,
      event_type: "driver_accepted",
      driver_id_prev: null,
      driver_id_new: trip.driver_id ?? null,
      vehicle_id_prev: null,
      vehicle_id_new: trip.vehicle_id ?? null,
      changed_by: uid,
    });
    triggerSuccess("Trip accepted. Proceed to pickup.");
    setSelectedIncomingTripId(trip.id);
    setAcceptedTripId(trip.id);
    AsyncStorage.setItem(DRIVER_ACCEPTED_TRIP_ID_KEY, trip.id);
    setAcceptLoading(false);
  };

  const handleDeclineAssignment = (tripId: string) => {
    confirmDeclineTrip(tripId);
  };

  const renderOtpClaimCard = (
    trip: tripsService.TripRow,
    opts?: { showCancel?: boolean },
  ) => (
    <View
      style={[
        styles.centerCardWrap,
        styles.centerCardConstraint,
        styles.otpClaimCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        otpKeyboardInset > 0 && { paddingBottom: otpKeyboardInset },
      ]}
    >
      <Text style={[styles.otpClaimTitle, { color: colors.text }]}>
        Enter trip OTP
      </Text>
      <Text
        style={[
          styles.otpClaimSubtitle,
          { color: colors.textMuted },
        ]}
      >
        Enter the 6-digit OTP shared by your dispatcher to claim this trip.
      </Text>
      <Text style={[styles.otpTripRoute, { color: colors.text }]}>
        {trip.pickup_area?.trim() || "Pickup"} to{" "}
        {trip.drop_location?.trim() || "Drop-off"}
      </Text>
      <TouchableOpacity
        style={styles.otpBoxRow}
        onPress={() => {
          if (shouldShowMap) snapSheetToIndex(2);
          otpInputRef.current?.focus();
        }}
        activeOpacity={1}
      >
        {Array.from({ length: OTP_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.otpBox,
              {
                borderColor:
                  otpValue.length === i ? colors.emerald : colors.border,
                backgroundColor: colors.whiteMuted,
              },
            ]}
          >
            <Text style={[styles.otpBoxDigit, { color: colors.text }]}>
              {otpValue[i] ?? ""}
            </Text>
          </View>
        ))}
      </TouchableOpacity>
      <OtpInputComponent
        ref={otpInputRef as never}
        value={otpValue}
        onFocus={() => {
          if (shouldShowMap) snapSheetToIndex(2);
        }}
        onChangeText={(text) => {
          setOtpValue(text.replace(/\D/g, "").slice(0, OTP_LENGTH));
          setOtpError(null);
        }}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        style={styles.otpHiddenInput}
        caretHidden
        autoFocus
      />
      {otpError ? (
        <Text style={[styles.otpErrorText, { color: Theme.negative }]}>
          {otpError}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[
          styles.goOnlineBtn,
          {
            backgroundColor: colors.emerald,
            marginTop: 8,
            opacity: otpSubmitting || otpValue.length !== OTP_LENGTH ? 0.7 : 1,
          },
        ]}
        onPress={handleSubmitOtpClaim}
        disabled={otpSubmitting || otpValue.length !== OTP_LENGTH}
        activeOpacity={0.8}
      >
        {otpSubmitting ? (
          <ActivityIndicator size="small" color={Theme.textOnPrimary} />
        ) : (
          <>
            <FontAwesome
              name="check"
              size={16}
              color={Theme.textOnPrimary}
              style={styles.goOnlineBtnIcon}
            />
            <Text style={styles.goOnlineBtnText}>Verify OTP</Text>
          </>
        )}
      </TouchableOpacity>
      {opts?.showCancel ? (
        <TouchableOpacity
          onPress={closeOtpClaim}
          activeOpacity={0.8}
          style={styles.otpCancelLink}
        >
          <Text style={[styles.otpCancelText, { color: colors.textMuted }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const activeMission = useMemo(
    () => allTrips.find((t) => isTripInProgress(t)),
    [allTrips],
  );
  hasActiveMissionRef.current = Boolean(activeMission?.id);

  // Active-trip resume (and first time a mission becomes active): request FG location.
  // Startup offline dashboard must not request permissions.
  useEffect(() => {
    const missionId = activeMission?.id ?? null;
    if (!missionId) return;
    if (fgLocationRequestedForMissionRef.current === missionId) return;
    fgLocationRequestedForMissionRef.current = missionId;
    setLocationStatus("loading");
    void fetchLocation();
  }, [activeMission?.id, fetchLocation]);

  const incomingTrips = useMemo(
    () =>
      allTrips.filter(
        (t) =>
          isAssignedNotStarted(t.status) ||
          // mover_asset shell trips are created in 'draft' (exempt from the
          // single-active-trip guard) but still dispatched to this driver.
          // Draft matches neither isActiveMission nor isAssignedNotStarted, so
          // without this it renders in fleet/history but vanishes from the
          // driver's own dashboard. Surface it as an incoming/assigned card.
          (String(t.status ?? "").toLowerCase() === "draft" &&
            String(t.source ?? "").toLowerCase() === "mover_asset"),
      ),
    [allTrips],
  );
  const mergedIncomingTrips = useMemo(() => {
    const byId = new Map<string, tripsService.TripRow>();
    for (const trip of [...incomingTrips, ...pendingOtpTrips]) {
      if (!trip?.id) continue;
      if (declinedTripId && String(trip.id) === String(declinedTripId)) continue;
      if (!byId.has(trip.id)) byId.set(trip.id, trip);
    }
    return Array.from(byId.values()).sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    );
  }, [incomingTrips, pendingOtpTrips, declinedTripId]);
  /** Incoming + active mission — assigner RPC must not clear when inbox is empty mid-trip. */
  const tripsNeedingAssignerDisplay = useMemo(() => {
    const byId = new Map<string, tripsService.TripRow>();
    for (const trip of mergedIncomingTrips) {
      if (trip?.id) byId.set(String(trip.id), trip);
    }
    if (activeMission?.id) {
      byId.set(String(activeMission.id), activeMission);
    }
    return Array.from(byId.values());
  }, [mergedIncomingTrips, activeMission]);
  const notificationHistoryTripIds = useMemo(
    () => new Set(notificationHistory.map((entry) => entry.tripId)),
    [notificationHistory],
  );
  const visibleIncomingTrips = useMemo(
    () =>
      mergedIncomingTrips.filter((trip) => !notificationHistoryTripIds.has(trip.id)),
    [mergedIncomingTrips, notificationHistoryTripIds],
  );
  const driverTripNumberById = useMemo(
    () => buildDriverTripNumberMap([...allTrips, ...pendingOtpTrips]),
    [allTrips, pendingOtpTrips],
  );
  /** Trips still needing accept/OTP — excludes the trip we've already accepted (trip progress owns it). */
  const visibleAssignableIncomingTrips = useMemo(
    () =>
      visibleIncomingTrips.filter((trip) => {
        if (!acceptedTripId || String(acceptedTripId).trim() === "") return true;
        return (
          String(trip.id).toLowerCase() !==
          String(acceptedTripId).toLowerCase()
        );
      }),
    [visibleIncomingTrips, acceptedTripId],
  );

  /** Oldest assignment first (FCFS) — used for dashboard queue + default selection. */
  const visibleAssignableIncomingTripsFcfs = useMemo(
    () =>
      [...visibleAssignableIncomingTrips].sort((a, b) =>
        String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
      ),
    [visibleAssignableIncomingTrips],
  );

  useEffect(() => {
    if (visibleAssignableIncomingTrips.length === 0) {
      clearNotifyOnlyAfterMission();
    }
  }, [visibleAssignableIncomingTrips.length, clearNotifyOnlyAfterMission]);

  /**
   * Canonical row for the accepted trip — survives pending→linked refresh lag after OTP claim.
   * Never resolves to a completed trip: a stale/resurrected acceptedTripId (e.g. a late
   * AsyncStorage read racing a Close) must not be able to re-open the completed-trip flow.
   */
  const resolvedAcceptedIncomingTrip = useMemo(() => {
    if (!acceptedTripId || String(acceptedTripId).trim() === "") return null;
    const want = String(acceptedTripId).toLowerCase();
    const fromMerged = mergedIncomingTrips.find(
      (t) => String(t.id).toLowerCase() === want,
    );
    const fromAll = allTrips.find((t) => String(t.id).toLowerCase() === want);
    const fromPendingOtp = pendingOtpTrips.find(
      (t) => String(t.id).toLowerCase() === want,
    );
    const match = fromMerged ?? fromAll ?? fromPendingOtp ?? null;
    if (match && isCompletedStatus(match.status)) return null;
    return match;
  }, [acceptedTripId, mergedIncomingTrips, allTrips, pendingOtpTrips]);

  const selectedIncomingTrip =
    visibleIncomingTrips.find((trip) => trip.id === selectedIncomingTripId) ??
    null;
  /**
   * FCFS queue: post-trip notify-only stays passive until the driver selects / resumes.
   * Otherwise the oldest waiting assignment is the default "next" trip on the dashboard.
   */
  const pickerFocusedIncoming = useMemo(() => {
    const queue = visibleAssignableIncomingTripsFcfs;
    if (!queue.length) return null;

    if (assignableTripsNotifyOnlyAfterMission) {
      if (!selectedIncomingTripId) return null;
      const want = String(selectedIncomingTripId).toLowerCase();
      return queue.find((t) => String(t.id).toLowerCase() === want) ?? null;
    }

    if (queue.length === 1) return queue[0];

    if (selectedIncomingTripId) {
      const want = String(selectedIncomingTripId).toLowerCase();
      const hit = queue.find((t) => String(t.id).toLowerCase() === want);
      if (hit) return hit;
    }
    return queue[0];
  }, [
    visibleAssignableIncomingTripsFcfs,
    selectedIncomingTripId,
    assignableTripsNotifyOnlyAfterMission,
  ]);
  /**
   * In multi-trip mode, when driver taps "Accept and verify OTP", force that tapped
   * trip into the active card context so OTP UI appears immediately.
   */
  const otpFocusedIncoming = useMemo(() => {
    if (!otpClaimTripId) return null;
    const wanted = String(otpClaimTripId).toLowerCase();
    if (
      selectedIncomingTrip &&
      String(selectedIncomingTrip.id).toLowerCase() === wanted
    ) {
      return selectedIncomingTrip;
    }
    return (
      visibleIncomingTrips.find(
        (trip) => String(trip.id).toLowerCase() === wanted,
      ) ?? null
    );
  }, [otpClaimTripId, selectedIncomingTrip, visibleIncomingTrips]);
  /**
   * Prefer accepted assignment first so we never flash the notification list during fetch lag.
   * Otherwise `pickerFocusedIncoming` (FCFS + selection; notify-only stays null until the driver resumes).
   * OTP claim keeps a focused row when applicable.
   */
  const effectiveFirstIncoming =
    resolvedAcceptedIncomingTrip ??
    pickerFocusedIncoming ??
    otpFocusedIncoming;

  // Keep incoming assignments in explicit accept/reject state until the driver acts.
  // This prevents single asset-based assignments from auto-entering trip flow.

  /** Keep selection aligned when only one assignable incoming trip remains. */
  useEffect(() => {
    if (visibleAssignableIncomingTripsFcfs.length !== 1) return;
    const onlyId = visibleAssignableIncomingTripsFcfs[0]?.id;
    if (!onlyId) return;
    setSelectedIncomingTripId((prev) =>
      prev == null || prev === "" ? String(onlyId) : prev,
    );
  }, [visibleAssignableIncomingTripsFcfs]);

  /**
   * Multi-assignment (not notify-only): default selection to FCFS head so dashboard + map
   * always wire to a real trip row without an extra tap.
   */
  useEffect(() => {
    if (assignableTripsNotifyOnlyAfterMission) return;
    const q = visibleAssignableIncomingTripsFcfs;
    if (q.length <= 1) return;
    const headId = String(q[0]?.id ?? "");
    if (!headId) return;
    setSelectedIncomingTripId((prev) => {
      if (prev == null || String(prev).trim() === "") return headId;
      const want = String(prev).toLowerCase();
      if (q.some((t) => String(t.id).toLowerCase() === want)) return prev;
      return headId;
    });
  }, [assignableTripsNotifyOnlyAfterMission, visibleAssignableIncomingTripsFcfs]);
  // OTP only for non-roster (ad-hoc) trips; connected/roster trips accept directly.
  const pendingOtpTripsRequiringOtp = pendingOtpTrips.filter(
    (t) => !isRosterTrip(t),
  );
  // Require OTP when trip is in pending OTP list OR when it's an aggregate (assign-by-phone) trip still in assigned state
  const firstIncomingRequiresOtp = Boolean(
    effectiveFirstIncoming &&
    !isRosterTrip(effectiveFirstIncoming) &&
    pendingOtpTripsRequiringOtp.some(
      (t) => t.id === effectiveFirstIncoming.id,
    ),
  );
  const otpClaimTrip = otpClaimTripId
    ? ([
        selectedIncomingTrip,
        effectiveFirstIncoming,
        ...pendingOtpTripsRequiringOtp,
        ...allTrips,
      ].find(
        (trip): trip is tripsService.TripRow =>
          trip != null &&
          String(trip.id).toLowerCase() === String(otpClaimTripId).toLowerCase(),
      ) ?? null)
    : null;

  const hasIncomingTrip = visibleIncomingTrips.length > 0;
  const effectiveDriver = driver ?? linkedDriver;
  /** Assign / OTP / trip-flow when org-linked or phone-preassigned before a `drivers` row exists. */
  const showDriverTripDashboard = Boolean(
    effectiveDriver ||
      activeMission ||
      mergedIncomingTrips.length > 0 ||
      otpClaimTripId ||
      assignmentFeedback != null,
  );
  const hasAssignableIncomingTrip = visibleAssignableIncomingTrips.length > 0;
  const hasSingleAssignableIncomingTrip =
    visibleAssignableIncomingTrips.length === 1;
  const showDeferredInviteCard = false;
  const effectiveIncomingId = String(
    effectiveFirstIncoming?.id ?? "",
  ).toLowerCase();

  /** 1-based position in the FCFS assignable queue (oldest first) for the trip shown on the job card. */
  const incomingAssignmentQueueMeta = useMemo(() => {
    const list = visibleAssignableIncomingTripsFcfs;
    const activeId = effectiveFirstIncoming?.id;
    if (!activeId || list.length <= 1) return null;
    const idx = list.findIndex(
      (t) => String(t.id).toLowerCase() === String(activeId).toLowerCase(),
    );
    if (idx < 0) return null;
    return { position: idx + 1, total: list.length };
  }, [visibleAssignableIncomingTripsFcfs, effectiveFirstIncoming?.id]);

  /** Invite rows carry fleet names; fills gaps when `organizations` is empty under driver RLS. */
  const organizationNamesFromInvites = useMemo(() => {
    const byId: Record<string, string> = {};
    for (const inv of invites) {
      const oid = String(inv.from_organization_id ?? "").trim();
      const oname = String(inv.from_org_name ?? "").trim();
      if (oid && oname) byId[oid] = oname;
    }
    return byId;
  }, [invites]);

  const mergedOrganizationNamesById = useMemo(
    () => ({ ...organizationNamesFromInvites, ...organizationNamesById }),
    [organizationNamesFromInvites, organizationNamesById],
  );
  const effectiveAssignmentActorByTripId = useMemo(
    () => ({ ...rpcAssignerUserIdByTripId, ...assignmentActorByTripId }),
    [rpcAssignerUserIdByTripId, assignmentActorByTripId],
  );

  // Use driver's accepted offer (salary + commission) for this org so EST. EARNINGS
  // matches Finance Hub labor — but NEVER invent ₹ for supplier-mediated
  // (aggregate) assignments: shipper→supplier rate ≠ driver pay until
  // Driver-cum-Owner earnings are defined.
  const incomingFleetLinked = useMemo(() => {
    if (!effectiveFirstIncoming) return false;
    const tripOrgId = String(effectiveFirstIncoming.organization_id ?? "").trim();
    if (!tripOrgId) return false;
    if (String(effectiveFirstIncoming.source ?? "").trim() === "market_bid") return false;
    return linkedDriversQuery.activeLinkedDrivers.some((row) => {
      if (String(row.organization_id ?? "").trim() !== tripOrgId) return false;
      if (row.tracking_only === true) return false;
      return driversService.isActiveFleetRelationshipDriver(row);
    });
  }, [effectiveFirstIncoming, linkedDriversQuery.activeLinkedDrivers]);
  const incomingIsOfflineParty = canTagPartyOnTrip(
    effectiveFirstIncoming,
    incomingFleetLinked,
  );

  const acceptedInviteForOrg =
    effectiveFirstIncoming &&
    (invites.find(
      (i) =>
        (i.from_organization_id ?? "").trim() ===
          (effectiveFirstIncoming.organization_id ?? "").trim() &&
        String(i.status ?? "").toLowerCase() === "accepted",
    ) ??
      null);
  const offerForCommission = {
    payableAmount:
      acceptedInviteForOrg?.payable_amount ?? driver?.payable_amount ?? null,
    commissionPercent:
      acceptedInviteForOrg?.commission_percent ??
      driver?.commission_percent ??
      null,
    commissionPerKm:
      acceptedInviteForOrg?.commission_per_km ??
      driver?.commission_per_km ??
      null,
  };
  const newAssignmentCommission =
    effectiveFirstIncoming != null &&
    canShowDriverTripEstEarnings(effectiveFirstIncoming, offerForCommission, {
      trackingOnly: driver?.tracking_only,
    })
      ? computeDriverTripEstEarningsInr(
          effectiveFirstIncoming,
          offerForCommission,
        )
      : 0;
  const activeMissionCommission =
    activeMission != null &&
    canShowDriverTripEstEarnings(activeMission, offerForCommission, {
      trackingOnly: driver?.tracking_only,
    })
      ? computeDriverTripEstEarningsInr(activeMission, offerForCommission)
      : 0;
  const incomingNotificationsWithMeta = useMemo(
    () =>
      visibleIncomingTrips.map((trip) => {
        const {
          assignedByUserName,
          assignedByOrgName,
          assignerPersonDisplay,
          assignerLinePrimary,
          assignerLineSecondary,
          assignedByName,
        } = buildAssignerDisplayForTrip(
          trip,
          invites,
          driver?.organization_id,
          {
            assignmentActorByTripId: effectiveAssignmentActorByTripId,
            assignerNamesByUserId,
            assignerOrgNameByUserId,
            assignerDisplayByTripId,
            assignerTripOrgNameByTripId,
            assignerTripOrgIdByTripId,
            organizationNamesById: mergedOrganizationNamesById,
          },
        );
        const requiresOtp =
          !isRosterTrip(trip) &&
          pendingOtpTripsRequiringOtp.some((t) => t.id === trip.id);
        const acceptedInviteForTrip =
          invites.find(
            (i) =>
              (i.from_organization_id ?? "").trim() ===
                (trip.organization_id ?? "").trim() &&
              String(i.status ?? "").toLowerCase() === "accepted",
          ) ??
          (trip.supplier_id
            ? invites.find(
                (i) =>
                  (i.from_organization_id ?? "").trim() ===
                    (trip.supplier_id ?? "").trim() &&
                  String(i.status ?? "").toLowerCase() === "accepted",
              )
            : undefined) ??
          null;
        const payoutOffer = {
          payableAmount:
            acceptedInviteForTrip?.payable_amount ?? driver?.payable_amount ?? null,
          commissionPercent:
            acceptedInviteForTrip?.commission_percent ??
            driver?.commission_percent ??
            null,
          commissionPerKm:
            acceptedInviteForTrip?.commission_per_km ??
            driver?.commission_per_km ??
            null,
        };
        const commissionForTrip = canShowDriverTripEstEarnings(trip, payoutOffer, {
          trackingOnly: driver?.tracking_only,
        })
          ? computeDriverTripEstEarningsInr(trip, payoutOffer)
          : 0;
        return {
          trip,
          assignedByName,
          assignedByUserName,
          assignedByOrgName,
          assignerPersonDisplay,
          assignerLinePrimary,
          assignerLineSecondary,
          requiresOtp,
          commissionForTrip,
        };
      }),
    [
      visibleIncomingTrips,
      invites,
      driver?.organization_id,
      driver?.payable_amount,
      driver?.commission_percent,
      driver?.commission_per_km,
      driver?.tracking_only,
      pendingOtpTripsRequiringOtp,
      assignerNamesByUserId,
      assignerOrgNameByUserId,
      assignerDisplayByTripId,
      assignerTripOrgNameByTripId,
      assignerTripOrgIdByTripId,
      mergedOrganizationNamesById,
      effectiveAssignmentActorByTripId,
    ],
  );
  /** Notification picker shows all currently visible incoming trips (including accepted). */
  const assignableIncomingNotificationsWithMeta = useMemo(
    () => incomingNotificationsWithMeta,
    [incomingNotificationsWithMeta],
  );
  const persistPostMissionPendingSnapshot = useCallback(() => {
    try {
      const payload = assignableIncomingNotificationsWithMeta.map((item) => ({
        trip: item.trip,
        assignedByName: item.assignedByName,
        assignedByUserName: item.assignedByUserName,
        assignedByOrgName: item.assignedByOrgName,
        assignerPersonDisplay: item.assignerPersonDisplay,
        assignerLinePrimary: item.assignerLinePrimary,
        assignerLineSecondary: item.assignerLineSecondary,
        requiresOtp: item.requiresOtp,
        commissionForTrip: item.commissionForTrip,
      }));
      void AsyncStorage.setItem(
        DRIVER_POST_MISSION_PENDING_SNAPSHOT_KEY,
        JSON.stringify(payload),
      );
    } catch {
      // ignore snapshot persistence failures
    }
  }, [assignableIncomingNotificationsWithMeta]);
  /**
   * Keep pending assignments in Notifications only.
   * Dashboard should surface only the selected/accepted trip flow.
   */
  const selectedIncomingMeta =
    incomingNotificationsWithMeta.find(
      (item) => item.trip.id === effectiveFirstIncoming?.id,
    ) ?? null;
  const buildAssignerPayloadForTrip = useCallback(
    (trip: tripsService.TripRow, requiresOtp: boolean) => {
      // Always use the full resolver so `effectiveAssignerOrgId` is available for
      // org logo lookup (PartyAvatar: logo → seed → contact → initials).
      const assignerDisplay = buildAssignerDisplayForTrip(
        trip,
        invites,
        driver?.organization_id,
        {
          assignmentActorByTripId: effectiveAssignmentActorByTripId,
          assignerNamesByUserId,
          assignerOrgNameByUserId,
          assignerDisplayByTripId,
          assignerTripOrgNameByTripId,
          assignerTripOrgIdByTripId,
          organizationNamesById: mergedOrganizationNamesById,
        },
      );
      const inviteForTrip = findDriverInviteForTripOrgs(invites, [
        assignerDisplay.effectiveAssignerOrgId,
        trip.supplier_id,
        trip.organization_id,
      ]);
      const orgId = (assignerDisplay.effectiveAssignerOrgId ?? "").trim();
      return buildJobCardAssignerPayload(
        trip,
        assignerDisplay,
        driver?.organization_id,
        inviteForTrip,
        {
          requiresOtp,
          isAggregate: isAggregateTrip(trip),
          isRoster: isRosterTrip(trip),
        },
        organizationLogoById[orgId] ?? null,
        {
          seed: organizationAvatarSeedById[orgId] ?? null,
          url: organizationAvatarUrlById[orgId] ?? null,
        },
      );
    },
    [
      invites,
      driver?.organization_id,
      effectiveAssignmentActorByTripId,
      assignerNamesByUserId,
      assignerOrgNameByUserId,
      assignerDisplayByTripId,
      assignerTripOrgNameByTripId,
      assignerTripOrgIdByTripId,
      mergedOrganizationNamesById,
      organizationLogoById,
      organizationAvatarSeedById,
      organizationAvatarUrlById,
    ],
  );
  const jobCardAssigner = useMemo(
    () =>
      effectiveFirstIncoming
        ? buildAssignerPayloadForTrip(
            effectiveFirstIncoming,
            firstIncomingRequiresOtp,
          )
        : null,
    [
      effectiveFirstIncoming,
      firstIncomingRequiresOtp,
      buildAssignerPayloadForTrip,
    ],
  );
  const activeFlowAssigner = useMemo(
    () =>
      activeMission
        ? buildAssignerPayloadForTrip(activeMission, false)
        : null,
    [activeMission, buildAssignerPayloadForTrip],
  );
  const assignerLineForJobCard = useMemo(() => {
    if (!effectiveFirstIncoming) return null;
    const fromList = incomingNotificationsWithMeta.find(
      (item) => item.trip.id === effectiveFirstIncoming.id,
    );
    if (fromList?.assignedByName?.trim()) return fromList.assignedByName.trim();
    return buildAssignerDisplayForTrip(
      effectiveFirstIncoming,
      invites,
      driver?.organization_id,
      {
        assignmentActorByTripId: effectiveAssignmentActorByTripId,
        assignerNamesByUserId,
        assignerOrgNameByUserId,
        assignerDisplayByTripId,
        assignerTripOrgNameByTripId,
        assignerTripOrgIdByTripId,
        organizationNamesById: mergedOrganizationNamesById,
      },
    ).assignedByName;
  }, [
    effectiveFirstIncoming,
    incomingNotificationsWithMeta,
    invites,
    driver?.organization_id,
    effectiveAssignmentActorByTripId,
    assignerNamesByUserId,
    assignerOrgNameByUserId,
    assignerDisplayByTripId,
    assignerTripOrgNameByTripId,
    assignerTripOrgIdByTripId,
    mergedOrganizationNamesById,
  ]);
  useEffect(() => {
    if (activeMission) return;
    if (
      selectedIncomingTripId &&
      !visibleIncomingTrips.some((trip) => trip.id === selectedIncomingTripId)
    ) {
      // Keep selection while the accepted trip reparents between pending OTP and driver-linked lists.
      if (
        acceptedTripId &&
        String(selectedIncomingTripId).toLowerCase() ===
          String(acceptedTripId).toLowerCase()
      ) {
        return;
      }
      setSelectedIncomingTripId(null);
    }
  }, [
    selectedIncomingTripId,
    visibleIncomingTrips,
    activeMission,
    acceptedTripId,
  ]);
  useEffect(() => {
    let cancelled = false;
    const loadAssignmentSources = async () => {
      const trips = tripsNeedingAssignerDisplay;
      if (trips.length === 0) {
        if (!cancelled) {
          setAssignerNamesByUserId({});
          setAssignerOrgNameByUserId({});
          setAssignerDisplayByTripId({});
          setAssignerTripOrgNameByTripId({});
          setAssignerTripOrgIdByTripId({});
          setOrganizationNamesById({});
          setOrganizationLogoById({});
          setOrganizationAvatarSeedById({});
          setOrganizationAvatarUrlById({});
          setAssignmentActorByTripId({});
        }
        return;
      }

      const tripIdsForRpc = trips
        .map((t) => t.id)
        .filter((id): id is string => Boolean(id && String(id).length > 0));
      // Assigner RPC and assignment audit are independent. Waiting for one
      // before the other, then starting this effect again when the audit
      // landed, downloaded the same rows twice on every dashboard open.
      const [assignerRpc, audit] = await startDriverAssignerIdentityReads(tripIdsForRpc);
      const { data: assignerRpcRows, error: assignerRpcError } = assignerRpc;
      const { byTripId: auditByTrip } = audit;
      const assignmentActorFromAudit: Record<string, string> = {};
      auditByTrip.forEach((value, key) => {
        const actorId = (value.changed_by ?? "").trim();
        if (actorId) assignmentActorFromAudit[key] = actorId;
      });
      if (!cancelled) setAssignmentActorByTripId(assignmentActorFromAudit);
      const rpcAssignerUserIdByTrip: Record<string, string> = {};
      const rpcOrgIdByTrip: Record<string, string> = {};
      if (!cancelled && !assignerRpcError && Array.isArray(assignerRpcRows)) {
        const byTrip: Record<string, string> = {};
        const orgByTrip: Record<string, string> = {};
        const logosById: Record<string, string> = {};
        const namesById: Record<string, string> = {};
        const seedsById: Record<string, string> = {};
        const avatarUrlsById: Record<string, string> = {};
        for (const row of assignerRpcRows as Array<{
          trip_id?: string;
          display_name?: string | null;
          assigner_user_id?: string | null;
          assigning_organization_name?: string | null;
          assigning_organization_id?: string | null;
          assigning_organization_logo_url?: string | null;
          assigning_organization_avatar_seed?: string | null;
          assigning_organization_avatar_url?: string | null;
        }>) {
          const tid = row.trip_id != null ? String(row.trip_id) : "";
          const dn = String(row.display_name ?? "").trim();
          const uid = String(row.assigner_user_id ?? "").trim();
          const orgName = String(row.assigning_organization_name ?? "").trim();
          const orgId = String(row.assigning_organization_id ?? "").trim();
          const logo = String(row.assigning_organization_logo_url ?? "").trim();
          const seed = String(row.assigning_organization_avatar_seed ?? "").trim();
          const avatarUrl = String(
            row.assigning_organization_avatar_url ?? "",
          ).trim();
          if (tid && dn) byTrip[tid] = dn;
          if (tid && uid) rpcAssignerUserIdByTrip[tid] = uid;
          if (tid && orgName) orgByTrip[tid] = orgName;
          if (tid && orgId) {
            rpcOrgIdByTrip[tid] = orgId;
            if (orgName) namesById[orgId] = orgName;
            if (logo) logosById[orgId] = logo;
            if (seed) seedsById[orgId] = seed;
            if (avatarUrl) avatarUrlsById[orgId] = avatarUrl;
          }
        }
        setAssignerDisplayByTripId(byTrip);
        setRpcAssignerUserIdByTripId(rpcAssignerUserIdByTrip);
        setAssignerTripOrgNameByTripId(orgByTrip);
        setAssignerTripOrgIdByTripId(rpcOrgIdByTrip);
        if (Object.keys(namesById).length > 0) {
          setOrganizationNamesById((prev) => ({ ...prev, ...namesById }));
        }
        if (Object.keys(logosById).length > 0) {
          setOrganizationLogoById((prev) => ({ ...prev, ...logosById }));
        }
        if (Object.keys(seedsById).length > 0) {
          setOrganizationAvatarSeedById((prev) => ({ ...prev, ...seedsById }));
        }
        if (Object.keys(avatarUrlsById).length > 0) {
          setOrganizationAvatarUrlById((prev) => ({
            ...prev,
            ...avatarUrlsById,
          }));
        }
      }

      const userIds = Array.from(
        new Set(
          trips
            .map((trip) =>
              resolveAssignerUserId(trip, {
                ...rpcAssignerUserIdByTrip,
                ...assignmentActorFromAudit,
              }),
            )
            .filter((id) => id.length > 0),
        ),
      );
      const organizationIds = Array.from(
        new Set(
          [
            ...trips.flatMap((trip) => {
              const tripMeta = trip as tripsService.TripRow &
                Record<string, string | number | boolean | null | undefined>;
              return [
                (trip.organization_id ?? "").trim(),
                (trip.supplier_id ?? "").trim(),
                (
                  (tripMeta.from_organization_id as string | null | undefined) ?? ""
                ).trim(),
                ((tripMeta.from_org_id as string | null | undefined) ?? "").trim(),
              ];
            }),
            ...Object.values(rpcOrgIdByTrip),
          ]
            .map((id) => String(id ?? "").trim())
            .filter((id) => id.length > 0),
        ),
      );

      const [profileBundle, organizationBundle] = await startDriverAssignerFollowupReads(
        userIds,
        organizationIds,
      );

      if (cancelled) return;

      if (profileBundle) {
        const [profileRes, ownedOrgsRes, memberRes] = profileBundle;
        if (!profileRes.error) {
          const byId: Record<string, string> = {};
          const orgById: Record<string, string> = {};
          for (const row of
            (profileRes.data ?? []) as Array<{
              id: string;
              full_name?: string | null;
              email?: string | null;
              company_name?: string | null;
            }>) {
            const fallbackEmailName =
              (row.email ?? "").trim().split("@")[0]?.trim() || "Dispatcher";
            byId[row.id] = (row.full_name ?? "").trim() || fallbackEmailName;
            const company = (row.company_name ?? "").trim();
            if (company) orgById[row.id] = company;
          }
          if (!ownedOrgsRes.error && Array.isArray(ownedOrgsRes.data)) {
            for (const row of ownedOrgsRes.data as Array<{
              owner_id?: string | null;
              name?: string | null;
            }>) {
              const uid = String(row.owner_id ?? "").trim();
              if (!uid || orgById[uid]) continue;
              const oname = String(row.name ?? "").trim();
              if (oname) orgById[uid] = oname;
            }
          }
          const memberRows = !memberRes.error && Array.isArray(memberRes.data)
            ? (memberRes.data as Array<{
                user_id?: string | null;
                organization_id?: string | null;
              }>)
            : [];
          if (memberRows.length > 0) {
            const memberOrgIds = Array.from(
              new Set(
                memberRows
                  .map((m) => String(m.organization_id ?? "").trim())
                  .filter((id) => id.length > 0),
              ),
            );
            if (memberOrgIds.length > 0) {
              const { data: memberOrgs, error: memberOrgsError } = await supabase()
                .from("organizations")
                .select("id, name")
                .in("id", memberOrgIds);
              if (!cancelled && !memberOrgsError && Array.isArray(memberOrgs)) {
                const memberOrgNameById: Record<string, string> = {};
                for (const row of memberOrgs as Array<{ id: string; name?: string | null }>) {
                  const name = String(row.name ?? "").trim();
                  if (name) memberOrgNameById[row.id] = name;
                }
                for (const row of memberRows) {
                  const uid = String(row.user_id ?? "").trim();
                  if (!uid || orgById[uid]) continue;
                  const oid = String(row.organization_id ?? "").trim();
                  const oname = memberOrgNameById[oid] ?? "";
                  if (oname) orgById[uid] = oname;
                }
              }
            }
          }
          if (!cancelled) {
            setAssignerNamesByUserId(byId);
            setAssignerOrgNameByUserId(orgById);
          }
        }
      } else if (!cancelled) {
        setAssignerNamesByUserId({});
        setAssignerOrgNameByUserId({});
      }

      if (organizationBundle && !cancelled) {
        const [orgNameRes, branding] = organizationBundle;
        if (!orgNameRes.error) {
          const byId: Record<string, string> = {};
          for (const row of
            (orgNameRes.data ?? []) as Array<{ id: string; name?: string | null }>) {
            const name = (row.name ?? "").trim();
            if (name) byId[row.id] = name;
          }
          setOrganizationNamesById((prev) => ({ ...prev, ...byId }));
        }
        if (Object.keys(branding).length > 0) {
          const logosById: Record<string, string> = {};
          const seedsById: Record<string, string> = {};
          const urlsById: Record<string, string> = {};
          for (const [orgId, row] of Object.entries(branding)) {
            if (row.logoUrl) logosById[orgId] = row.logoUrl;
            if (row.avatarSeed) seedsById[orgId] = row.avatarSeed;
            if (row.avatarUrl) urlsById[orgId] = row.avatarUrl;
          }
          setOrganizationLogoById((prev) => ({ ...prev, ...logosById }));
          setOrganizationAvatarSeedById((prev) => ({ ...prev, ...seedsById }));
          setOrganizationAvatarUrlById((prev) => ({ ...prev, ...urlsById }));
        }
      }
    };
    void loadAssignmentSources();
    return () => {
      cancelled = true;
    };
  }, [tripsNeedingAssignerDisplay]);
  const activeGuidanceTrip =
    activeMission ??
    (effectiveFirstIncoming &&
    String(effectiveFirstIncoming.id).toLowerCase() ===
      String(acceptedTripId ?? "").toLowerCase()
      ? effectiveFirstIncoming
      : null);

  const guidanceStepForPing = activeGuidanceTrip
    ? deriveDriverGuidanceStep(activeGuidanceTrip)
    : null;
  const shouldPersistCheckpointPing = Boolean(
    guidanceStepForPing &&
      (guidanceStepForPing === "accepted" ||
        guidanceStepForPing === "pickup" ||
        guidanceStepForPing === "transit" ||
        guidanceStepForPing === "reached"),
  );

  pingMapUiRef.current = {
    commitMapPosition,
    youLatSv,
    youLonSv,
    youHeadingSv,
    lastHeadingFixRef,
  };

  const onPingLocationFix = useCallback(
    (args: {
      latitude: number;
      longitude: number;
      accuracy: number | null;
      position: {
        coords: { latitude: number; longitude: number; heading?: number | null };
      };
    }) => {
      const r = pingMapUiRef.current;
      if (!r) return;
      const { latitude, longitude, position } = args;
      // Real GPS always wins over any leftover fabricated truckPosition.
      setTruckPosition(null);
      r.commitMapPosition({ latitude, longitude });
      r.youLatSv.value = withTiming(latitude, { duration: 450 });
      r.youLonSv.value = withTiming(longitude, { duration: 450 });
      const rawHeading = (
        position.coords as {
          heading?: number | null;
        }
      ).heading;
      let headingDeg: number | null =
        typeof rawHeading === "number" && Number.isFinite(rawHeading)
          ? rawHeading
          : null;
      if (headingDeg == null && r.lastHeadingFixRef.current) {
        const bearing = bearingDegrees(r.lastHeadingFixRef.current, {
          latitude,
          longitude,
        });
        if (bearing != null) headingDeg = bearing;
      }
      if (headingDeg != null && Number.isFinite(headingDeg)) {
        r.youHeadingSv.value = withTiming(headingDeg, { duration: 350 });
      }
      r.lastHeadingFixRef.current = { latitude, longitude };
    },
    [],
  );

  const { communicationActive } = useDriverCommunication();

  useDriverLocationStream({
    driver: driver ? { id: driver.id, organization_id: driver.organization_id, user_id: driver.user_id } : null,
    trip: activeGuidanceTrip,
    enabled: Boolean(driver && activeGuidanceTrip),
    communicationActive,
    shouldPersistCheckpoint: shouldPersistCheckpointPing,
    minDisplacementM: null,
    source: "background",
    onLocationFix: onPingLocationFix,
  });

  // DEV only: one-time pin preview when active trip changes (not on every GPS tick).
  useEffect(() => {
    if (!__DEV__ || !activeGuidanceTrip?.id) {
      if (!activeGuidanceTrip?.id) setRecentPinPoints([]);
      return;
    }
    void fetchAndLogRecentPins(activeGuidanceTrip.id);
  }, [activeGuidanceTrip?.id, fetchAndLogRecentPins]);

  // Blink/ping for pickup dot and Live badge on the offline "Assigned trip waiting" card (must run after effectiveFirstIncoming is defined)
  const showOfflineAssignedCard = Boolean(
    driver && !isOnline && hasIncomingTrip,
  );
  useEffect(() => {
    if (!showOfflineAssignedCard) return;
    pickupDotPingAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pickupDotPingAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pickupDotPingAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showOfflineAssignedCard, pickupDotPingAnim]);

  // Blink for "New assignment" card (pending accept, or showing accept/decline feedback).
  // Guard on acceptedTripIdResolved: don't show the card until we've checked AsyncStorage —
  // cached trips may load synchronously before AsyncStorage answers, causing a false flash
  // of the accept-trip card for drivers who already accepted the trip.
  const showNewAssignmentCard = Boolean(
    acceptedTripIdResolved &&
    ((otpClaimTripId && otpClaimTrip) ||
      (effectiveFirstIncoming &&
        (assignmentFeedback != null ||
          (!assignableTripsNotifyOnlyAfterMission &&
            effectiveIncomingId !== String(acceptedTripId ?? "").toLowerCase() &&
            effectiveIncomingId !== justClaimedTripIdRef.current &&
            effectiveIncomingId !== justClaimedOldTripIdRef.current &&
            !activeMission)))),
  );
  const isAcceptedIncomingFlow = Boolean(
    effectiveFirstIncoming &&
    String(acceptedTripId ?? "").toLowerCase() ===
      String(effectiveFirstIncoming.id).toLowerCase(),
  );
  /** Static sizing hides OTP behind the keyboard; use scrollable sheet while entering OTP. */
  const shouldUseStaticMapSheetCard = Boolean(
    (showNewAssignmentCard || activeMission || isAcceptedIncomingFlow) &&
      !otpClaimTripId,
  );
  /** Active trip flow can drag to a slim stage-status peek (not OTP / new-assignment). */
  const canMinimizeMissionSheet = Boolean(
    (activeMission || isAcceptedIncomingFlow) &&
      !otpClaimTripId &&
      !showNewAssignmentCard,
  );
  /** Incoming assignment: peek so “View trip plan” can show the full route. */
  const canPeekAssignmentSheet = Boolean(showNewAssignmentCard && !otpClaimTripId);
  const canPeekSheetForMap = canMinimizeMissionSheet || canPeekAssignmentSheet;
  const missionSheetCollapsed = canPeekSheetForMap && missionSheetIndex <= 0;
  const commerceOnMap = Boolean(
    (activeMission && isCommerceDriverTrip(activeMission)) ||
      (isAcceptedIncomingFlow &&
        effectiveFirstIncoming &&
        isCommerceDriverTrip(effectiveFirstIncoming)),
  );
  useEffect(() => {
    if (!canMinimizeMissionSheet) return;
    const start = 1;
    setMissionSheetIndex(start);
    const t = setTimeout(() => {
      try {
        bottomSheetRef.current?.snapToIndex(start);
      } catch {
        /* ignore */
      }
    }, 60);
    return () => clearTimeout(t);
  }, [canMinimizeMissionSheet, commerceOnMap, activeMission?.id, acceptedTripId]);

  useEffect(() => {
    if (!showNewAssignmentCard) return;
    newAssignmentBlinkAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(newAssignmentBlinkAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(newAssignmentBlinkAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showNewAssignmentCard, newAssignmentBlinkAnim]);

  useEffect(() => {
    if (activeMission) return;
    const trip = showNewAssignmentCard ? effectiveFirstIncoming : null;
    if (!trip?.id) {
      setRoutePlanMap(null);
      return;
    }
    let cancelled = false;
    const pickup = getTripStopCoordinate(trip, "pickup");
    const drop = getTripStopCoordinate(trip, "drop");
    const fallback = buildTripRowRoutePlanMap(
      trip.id,
      pickup ? { ...pickup, label: trip.pickup_area?.trim() || "Pickup" } : null,
      drop ? { ...drop, label: trip.drop_location?.trim() || "Drop" } : null,
    );
    if (fallback.stops.length > 0) setRoutePlanMap(fallback);
    void fetchDriverStopExecution(trip.id).then((result) => {
      if (cancelled) return;
      if (!result.ok || result.bundle.stops.length === 0) {
        void fetchRouteExtraStopsForTrips([trip.id]).then(({ rows }) => {
          if (cancelled || rows.length === 0) return;
          const withStops = buildTripRowRoutePlanMap(
            trip.id,
            pickup ? { ...pickup, label: trip.pickup_area?.trim() || "Pickup" } : null,
            drop ? { ...drop, label: trip.drop_location?.trim() || "Drop" } : null,
            rows.map((row) => ({
              id: row.id,
              latitude: row.latitude,
              longitude: row.longitude,
              label: row.location,
            })),
          );
          if (withStops.stops.length > 0) setRoutePlanMap(withStops);
        });
        return;
      }
      const fromStops = buildDriverRoutePlanMap(
        trip.id,
        result.bundle.stops,
        null,
        "pickup",
        null,
        true,
      );
      if (fromStops.stops.length > 0) setRoutePlanMap(fromStops);
    });
    return () => {
      cancelled = true;
    };
  }, [activeMission, showNewAssignmentCard, effectiveFirstIncoming?.id]);

  // Show map shell for active mission, incoming assignment (including load-based pending OTP),
  // or assignment feedback. Commerce uses the same map, with a summary sheet.
  const shouldShowMap = Boolean(
    activeMission ||
      isAcceptedIncomingFlow ||
      otpClaimTripId ||
      (effectiveFirstIncoming &&
        !assignableTripsNotifyOnlyAfterMission &&
        (hasSingleAssignableIncomingTrip || hasAssignableIncomingTrip)) ||
      assignmentFeedback != null,
  );

  /** Idle dashboard map card — preview current area when not in trip map mode. */
  const showDashboardMapPreview = !shouldShowMap && Boolean(driver);

  useDriverHomePerfMarks({
    loading,
    tripsSyncing,
    driversFetched: linkedDriversQuery.isFetched,
    driversFetching: linkedDriversQuery.isFetching,
    hasDriverRows: linkedDriversQuery.activeLinkedDrivers.length > 0,
    shouldShowMap,
    showDashboardMapPreview,
    activeTripId: activeGuidanceTrip?.id ?? null,
  });

  /** Map GPS stream during live trip (including follow mode). Follow mode still
   * owns camera recenter; this keeps the marker on real device fixes. */
  useDriverMapLivePositionWatch({
    enabled: Boolean(driver && activeGuidanceTrip && shouldShowMap),
    onFix: onPingLocationFix,
  });

  const activeGuidanceStep = activeGuidanceTrip
    ? deriveDriverGuidanceStep(activeGuidanceTrip)
    : null;
  const activeGuidance =
    activeGuidanceTrip && activeGuidanceStep
      ? getDriverGuidanceConfig(activeGuidanceStep, activeGuidanceTrip)
      : null;
  const routeContextTrip = useMemo(
    () =>
      (activeGuidanceTrip ??
        resolvedAcceptedIncomingTrip ??
        activeMission ??
        effectiveFirstIncoming ??
        null) as tripsService.TripRow | null,
    [
      activeGuidanceTrip,
      resolvedAcceptedIncomingTrip,
      activeMission,
      effectiveFirstIncoming,
    ],
  );
  const guidanceTargetCoordinate =
    activeGuidanceTrip && activeGuidance?.target
      ? getTripStopCoordinate(activeGuidanceTrip, activeGuidance.target)
      : null;
  const highlightedTarget = activeGuidance?.target ?? null;

  // Visible wedge = above the job card. Fit uses edgePadding only — do not also
  // stuff this into MapView mapPadding (Expo Go / Apple Maps double-counts and
  // pins the route under the header).
  const screenHeight = Dimensions.get("window").height;
  const MISSION_SHEET_PEEK_HEIGHT = 86;
  const olaMapBottomPaddingPx = (() => {
    if (missionSheetCollapsed) {
      return Math.min(MISSION_SHEET_PEEK_HEIGHT + 28, Math.round(screenHeight * 0.28));
    }
    const raw =
      measuredSheetHeight > 0
        ? measuredSheetHeight + 36
        : Math.round(screenHeight * 0.38);
    return Math.min(raw, Math.round(screenHeight * 0.62));
  })();
  const sheetSnapPoints = useMemo(() => {
    if (canPeekSheetForMap && commerceOnMap) {
      const peek = 96;
      const dashboard = Math.max(
        peek + 200,
        screenHeight - insets.top - 72 - driverSheetBottomInset,
      );
      return [peek, dashboard];
    }
    if (canPeekSheetForMap) {
      const maxExpanded = Math.min(
        Math.round(screenHeight * 0.52),
        Math.max(280, screenHeight - insets.top - driverSheetBottomInset - 120),
      );
      // Snap height is content only — no BottomSheet handle chrome on mission card.
      const handleSlop = 0;
      const contentH =
        expandedSheetHeightRef.current > 160
          ? expandedSheetHeightRef.current
          : measuredSheetHeight > 160
            ? measuredSheetHeight
            : Math.round(screenHeight * 0.48);
      const expanded = Math.min(
        Math.max(contentH + handleSlop, MISSION_SHEET_PEEK_HEIGHT + 120),
        maxExpanded,
      );
      return [MISSION_SHEET_PEEK_HEIGHT, expanded];
    }
    if (shouldUseStaticMapSheetCard) {
      // Dynamic sizing for new-assignment / OTP flows.
      return ["100%"];
    }
    const mid = Math.round(Dimensions.get("window").height * 0.5); // Fixed half-screen
    const min = Math.max(
      200,
      Math.min(mid - 60, Math.round(Dimensions.get("window").height * 0.22)),
    ); // Tighter card → more map
    const expanded = Math.max(
      mid + 80,
      Math.min(
        Math.round(Dimensions.get("window").height * 0.78),
        Math.round(Dimensions.get("window").height - insets.top - 84),
      ),
    );
    return [min, mid, expanded];
  }, [
    screenHeight,
    insets.top,
    shouldUseStaticMapSheetCard,
    canPeekSheetForMap,
    measuredSheetHeight,
    driverSheetBottomInset,
    commerceOnMap,
  ]);

  /**
   * Cap for `enableDynamicSizing` on the static (active-mission) sheet.
   * Without it the library computes
   *   dynamicSnapPoint = containerHeight - min(contentHeight, containerHeight)
   * so content taller than the container clamps to 0 and overflows past the
   * sheet's touchable bounds — rows near the bottom (LR view/delete) render but
   * never receive taps. Capping to the space the sheet actually owns keeps
   * every row inside the hit-test rect; the content scrolls instead.
   */
  const sheetMaxDynamicContentSize = useMemo(
    () => Math.max(240, screenHeight - insets.top - driverTabBarClearance),
    [screenHeight, insets.top, driverTabBarClearance],
  );

  const snapSheetToIndex = useCallback(
    (idx: number) => {
      try {
        const sheet = bottomSheetRef.current;
        // If we only have one snap point (static mode), always snap to index 0
        const targetIdx = sheetSnapPoints.length === 1 ? 0 : idx;
        if (sheet && targetIdx < sheetSnapPoints.length) {
          sheet.snapToIndex(targetIdx);
        }
      } catch {
        // ignore
      }
    },
    [sheetSnapPoints.length],
  );

  const expandMissionSheetFromPeek = useCallback(() => {
    setMissionSheetIndex(1);
    try {
      bottomSheetRef.current?.snapToIndex(1);
    } catch {
      /* ignore */
    }
  }, []);

  const openDeliveryDetails = useCallback(() => {
    expandMissionSheetFromPeek();
    setDeliveryDetailsNonce((value) => value + 1);
  }, [expandMissionSheetFromPeek]);

  const handleTripFlowOperationActiveChange = useCallback(
    (active: boolean) => {
      sheetOperationActiveRef.current = active;

      if (sheetSnapTimerRef.current) {
        clearTimeout(sheetSnapTimerRef.current);
        sheetSnapTimerRef.current = null;
      }

      if (active) {
        // Keep at mid (index 1) or allow manual scroll during operation.
        // snapSheetToIndex(1); // Optionally snap to mid if not at mid
        return;
      }

      // Return to the "resting" half position shortly after operations end.
      sheetSnapTimerRef.current = setTimeout(() => {
        if (!sheetOperationActiveRef.current) snapSheetToIndex(1);
      }, 180);
    },
    [snapSheetToIndex],
  );

  // When a fresh assignment appears, expand the bottom sheet once so the full card is visible.
  // This does not lock scrolling; user can still drag/scroll the sheet normally afterward.
  useEffect(() => {
    if (!shouldShowMap || !showNewAssignmentCard || !effectiveFirstIncoming)
      return;
    const tripId = String(effectiveFirstIncoming.id).toLowerCase();
    if (lastAutoExpandedIncomingTripIdRef.current === tripId) return;

    lastAutoExpandedIncomingTripIdRef.current = tripId;
    const t = setTimeout(() => {
      if (!sheetOperationActiveRef.current) snapSheetToIndex(1);
    }, 120);
    return () => clearTimeout(t);
  }, [
    effectiveFirstIncoming,
    showNewAssignmentCard,
    shouldShowMap,
    snapSheetToIndex,
  ]);

  const openOtpClaim = useCallback(
    (trip: tripsService.TripRow) => {
      clearNotifyOnlyAfterMission();
      setAcceptError(null);
      setOtpError(null);
      setOtpValue("");
      // Keep dashboard/map focus on the same trip user tapped "Accept" on.
      setSelectedIncomingTripId(trip.id);
      setOtpClaimTripId(trip.id);
      if (shouldShowMap) snapSheetToIndex(2);
      setTimeout(() => otpInputRef.current?.focus(), 150);
    },
    [snapSheetToIndex, shouldShowMap, clearNotifyOnlyAfterMission],
  );

  useEffect(() => {
    if (!otpClaimTripId || !shouldShowMap) return;
    snapSheetToIndex(2);
  }, [otpClaimTripId, shouldShowMap, snapSheetToIndex]);

  useEffect(() => {
    if (!otpClaimTripId || !shouldShowMap || otpKeyboardInset <= 0) return;
    snapSheetToIndex(2);
  }, [otpClaimTripId, shouldShowMap, otpKeyboardInset, snapSheetToIndex]);

  // Clear OTP claim UI only on explicit cancel or after a successful claim feedback timeout.
  // We removed the auto-clear useEffect to prevent race conditions during backend lag.
  const closeOtpClaim = useCallback(() => {
    setOtpClaimTripId(null);
    setOtpValue("");
    setOtpError(null);
    setOtpSubmitting(false);
  }, []);

  const handleSubmitOtpClaim = useCallback(async () => {
    if (otpSubmitting || assignmentFeedback != null) return;

    const trimmed = (otpValue ?? "")
      .trim()
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (trimmed.length !== OTP_LENGTH) {
      setOtpError("Enter the 6-digit OTP");
      return;
    }

    setAcceptError(null);
    setOtpError(null);
    setOtpSubmitting(true);
    setIsOtpClaiming(true);
    try {
      const { error: err, result } = await claimTripByOtp(trimmed);
      if (err) {
        setOtpError(err.message);
        return;
      }
      if (result?.ok) {
        // 1. Force the success state IMMEDIATELY and await it to ensure React processes the render
        setAssignmentFeedback("accepted");
        setOtpValue("");
        setOtpSubmitting(false);

        // Give the UI a moment to lock into the success state before doing background work
        await new Promise((resolve) => setTimeout(resolve, 50));

        const tripIdToSet = result.trip_id || otpClaimTripId;
        if (tripIdToSet) {
          justClaimedTripIdRef.current = String(tripIdToSet).toLowerCase();
          // Also track the original ID used to claim, as it may change during the process
          if (otpClaimTripId) {
            justClaimedOldTripIdRef.current =
              String(otpClaimTripId).toLowerCase();
          }
          void AsyncStorage.setItem(DRIVER_ACCEPTED_TRIP_ID_KEY, tripIdToSet);
          setAcceptedTripId(tripIdToSet);
          setSelectedIncomingTripId(tripIdToSet);
          // Claiming by OTP is an acceptance too — record it so the web manifest
          // reflects it. driver_id comes from the RPC, which resolves/creates the
          // driver row for auth.uid(); a local trip object would be stale here.
          // Awaited so changed_at commits before the driver can proceed to pickup —
          // see handleAcceptMission for the same fire-and-forget race this avoids.
          await insertTripAssignmentAudit({
            trip_id: tripIdToSet,
            event_type: "driver_accepted",
            driver_id_prev: null,
            driver_id_new: result.driver_id ?? null,
            vehicle_id_prev: null,
            vehicle_id_new: null,
            changed_by: uid,
          });
        }

        // Delay background refresh slightly more
        setTimeout(() => {
          if (uid) void invalidateDriverHome(uid);
        }, 500);

        if (assignmentFeedbackTimeoutRef.current)
          clearTimeout(assignmentFeedbackTimeoutRef.current);
        assignmentFeedbackTimeoutRef.current = setTimeout(() => {
          setAssignmentFeedback(null);
          setOtpClaimTripId(null);
          assignmentFeedbackTimeoutRef.current = null;
          setOtpValue(""); // Clear OTP value here, after feedback timeout
          setIsOtpClaiming(false); // Reset the flag after feedback timeout
        }, 2500); // 2.5 seconds of stable feedback
        return;
      }
      setOtpError(result?.error ?? "Could not claim trip");
    } finally {
      setOtpSubmitting(false);
    }
  }, [uid, invalidateDriverHome, otpValue, otpClaimTripId, otpSubmitting, assignmentFeedback]);

  const handleOpenOtpClaimFromHeader = useCallback(() => {
    const firstIncomingRequiringOtp =
      incomingNotificationsWithMeta.find((item) => item.requiresOtp)?.trip ??
      null;
    const tripToClaim =
      otpClaimTrip ??
      (effectiveFirstIncoming && firstIncomingRequiresOtp
        ? effectiveFirstIncoming
        : null) ??
      firstIncomingRequiringOtp ??
      pendingOtpTripsRequiringOtp[0] ??
      null;

    if (!tripToClaim) {
      Alert.alert(
        "No OTP trip found",
        "There is no trip waiting for OTP right now.",
      );
      return;
    }

    openOtpClaim(tripToClaim);
  }, [
    effectiveFirstIncoming,
    firstIncomingRequiresOtp,
    incomingNotificationsWithMeta,
    openOtpClaim,
    otpClaimTrip,
    pendingOtpTripsRequiringOtp,
  ]);

  useEffect(() => {
    return () => {
      if (sheetSnapTimerRef.current) clearTimeout(sheetSnapTimerRef.current);
    };
  }, []);
  const lastCameraAnimTsRef = useRef(0);
  const lastCameraCenterRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Phase 4b: move the Leaflet "you" marker from the live bus without React commits.
  useEffect(() => {
    if (!shouldShowMap) return;
    return subscribeDriverLivePosition((pos) => {
      if (!pos) return;
      const leaf = isFullMapVisible ? fullLeafletRef : leafletRef;
      leaf.current?.setMarkerCoordinate?.("you", pos);
    });
  }, [shouldShowMap, isFullMapVisible]);

  // Smoothly follow the driver marker with `animateCamera` (avoid jitter from `fitToCoordinates`).
  // Subscribes to the live position bus so follow works without React commits every GPS tick.
  useEffect(() => {
    if (!shouldShowMap) return;
    if (!isFollowingLocation) return;

    const showLeaflet =
      Platform.OS === "web" || useLeafletFallback || leafLetForced;

    const activeNativeMapRef = isFullMapVisible ? fullMapRef : mapRef;

    return subscribeDriverLivePosition((driverMapPosition) => {
      if (!driverMapPosition) return;
      if (!showLeaflet && !activeNativeMapRef.current) return;

      const now = Date.now();
      if (now - lastCameraAnimTsRef.current < 350) return;

      if (lastCameraCenterRef.current) {
        const movedM = distanceMeters(
          lastCameraCenterRef.current.latitude,
          lastCameraCenterRef.current.longitude,
          driverMapPosition.latitude,
          driverMapPosition.longitude,
        );
        if (movedM < 120) return;
      }

      lastCameraAnimTsRef.current = now;
      lastCameraCenterRef.current = driverMapPosition;

      if (showLeaflet) {
        const targetRef = isFullMapVisible ? fullLeafletRef : leafletRef;
        if (targetRef.current) {
          targetRef.current.focusCurrentLocation(driverMapPosition);
        }
        return;
      }

      try {
        const map = activeNativeMapRef.current;
        const heading = Number(youHeadingSv.value);
        map?.animateCamera?.(
          {
            center: {
              latitude: driverMapPosition.latitude,
              longitude: driverMapPosition.longitude,
            },
            pitch: 0,
            heading: Number.isFinite(heading) ? heading : 0,
          },
          { duration: 450 },
        );
      } catch {
        // ignore camera animation failures
      }
    });
  }, [
    shouldShowMap,
    isFollowingLocation,
    isFullMapVisible,
    leafLetForced,
    useLeafletFallback,
    youHeadingSv,
  ]);

  const [optimalRoute, setOptimalRoute] = useState<RouteResult | null>(null);
  const [tripLegRoute, setTripLegRoute] = useState<RouteResult | null>(null);
  const [approachRoute, setApproachRoute] = useState<RouteResult | null>(null);
  const [_optimalRouteLoading, setOptimalRouteLoading] = useState(false);
  const [tripLegRouteLoading, setTripLegRouteLoading] = useState(false);
  const [_approachRouteLoading, setApproachRouteLoading] = useState(false);
  const optimalRouteKeyRef = useRef<string | null>(null);
  const tripLegRouteKeyRef = useRef<string | null>(null);
  const approachRouteKeyRef = useRef<string | null>(null);
  const [_showRouteFallback, setShowRouteFallback] = useState(false);

  const routeContextPickup = useMemo(
    () =>
      routeContextTrip ? getTripStopCoordinate(routeContextTrip, "pickup") : null,
    [routeContextTrip],
  );
  const routeContextDrop = useMemo(
    () => (routeContextTrip ? getTripStopCoordinate(routeContextTrip, "drop") : null),
    [routeContextTrip],
  );

  const tripLegRouteKey = useMemo(() => {
    if (!shouldShowMap || !routeContextTrip || !routeContextPickup || !routeContextDrop) {
      return null;
    }
    return buildRouteFetchKey(
      `${routeContextTrip.id}:leg`,
      routeContextPickup,
      routeContextDrop,
    );
  }, [shouldShowMap, routeContextTrip, routeContextPickup, routeContextDrop]);

  /**
   * Start for active navigation polyline: live device GPS only.
   * After Package collected with no GPS yet, fall back to pickup.
   */
  const navStartCoordinate = useMemo(() => {
    const live = driverMapPosition ?? truckPosition;
    if (live) return live;
    if (
      shouldShowDriverToDropRoute(activeGuidanceStep) &&
      routeContextPickup
    ) {
      return routeContextPickup;
    }
    return null;
  }, [
    driverMapPosition,
    truckPosition,
    activeGuidanceStep,
    routeContextPickup,
  ]);

  // Current location → pickup (road) while heading to / at pickup.
  const approachRouteKey = useMemo(() => {
    if (!shouldShowMap || !shouldShowDriverApproachRoute(activeGuidanceStep)) {
      return null;
    }
    const start = navStartCoordinate ?? driverMapPosition ?? truckPosition;
    if (!start || !routeContextPickup || !routeContextTrip) return null;
    // 3 decimals ≈ 100m — GPS ticks must not refetch approach every meter.
    return buildRouteFetchKey(
      `${routeContextTrip.id}:approach`,
      start,
      routeContextPickup,
      3,
    );
  }, [
    shouldShowMap,
    activeGuidanceStep,
    navStartCoordinate,
    truckPosition,
    driverMapPosition,
    routeContextPickup,
    routeContextTrip,
  ]);

  // Active guidance road route: driver (or pickup fallback) → current target.
  // To-pickup uses approachRouteKey; this key is for to-drop navigation.
  const routeFetchKey = useMemo(() => {
    if (!shouldShowMap) return null;
    const tripForRoute = routeContextTrip;
    if (!tripForRoute) return null;

    if (shouldShowDriverApproachRoute(activeGuidanceStep)) return null;

    if (shouldShowDriverToDropRoute(activeGuidanceStep)) {
      const start = navStartCoordinate;
      const end = guidanceTargetCoordinate ?? routeContextDrop;
      if (!start || !end) return null;
      return buildRouteFetchKey(tripForRoute.id, start, end, 3);
    }

    // Preview / no active guidance: fixed pickup → drop.
    if (!routeContextPickup || !routeContextDrop) return null;
    return buildRouteFetchKey(
      tripForRoute.id,
      routeContextPickup,
      routeContextDrop,
      6,
    );
  }, [
    shouldShowMap,
    routeContextTrip,
    activeGuidanceStep,
    navStartCoordinate,
    guidanceTargetCoordinate,
    routeContextPickup,
    routeContextDrop,
  ]);

  useEffect(() => {
    if (!tripLegRouteKey) {
      setTripLegRoute(null);
      setTripLegRouteLoading(false);
      tripLegRouteKeyRef.current = null;
      return;
    }

    let cancelled = false;
    const isNewKey = tripLegRouteKeyRef.current !== tripLegRouteKey;
    tripLegRouteKeyRef.current = tripLegRouteKey;
    // Only flash loading on first key; keep prior geometry while a rare refetch runs.
    if (isNewKey) setTripLegRouteLoading(true);

    void fetchUsableRouteForKey(tripLegRouteKey).then((res) => {
      if (cancelled || tripLegRouteKeyRef.current !== tripLegRouteKey) return;
      setTripLegRoute(res);
      setTripLegRouteLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tripLegRouteKey]);

  useEffect(() => {
    if (!approachRouteKey) {
      setApproachRoute(null);
      setApproachRouteLoading(false);
      approachRouteKeyRef.current = null;
      return;
    }

    let cancelled = false;
    const isNewKey = approachRouteKeyRef.current !== approachRouteKey;
    approachRouteKeyRef.current = approachRouteKey;
    if (isNewKey) setApproachRouteLoading(true);

    void fetchUsableRouteForKey(approachRouteKey).then((res) => {
      if (cancelled || approachRouteKeyRef.current !== approachRouteKey) return;
      // Keep last usable approach if a grid hop returns empty — avoids "—" flicker.
      if (res) setApproachRoute(res);
      setApproachRouteLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [approachRouteKey]);

  useEffect(() => {
    if (!routeFetchKey) {
      setOptimalRoute(null);
      setOptimalRouteLoading(false);
      optimalRouteKeyRef.current = null;
      setShowRouteFallback(
        activeGuidanceStep === "accepted" && !!routeContextTrip,
      );
      return;
    }

    let cancelled = false;

    const performFetch = async () => {
      const isNewKey = optimalRouteKeyRef.current !== routeFetchKey;
      optimalRouteKeyRef.current = routeFetchKey;
      if (isNewKey) setOptimalRouteLoading(true);
      setShowRouteFallback(false);

      const parsed = parseRouteFetchKey(routeFetchKey);
      if (!parsed) {
        if (!cancelled) {
          console.warn("[driver-map][route] invalid-route-key", { routeFetchKey });
          setOptimalRoute(null);
          setOptimalRouteLoading(false);
          setShowRouteFallback(true);
        }
        return;
      }
      const res = await getOptimalRoute(parsed.from, parsed.to);

      if (cancelled) return;

      const hasDistinctEndpoints =
        !!res &&
        Array.isArray(res.coordinates) &&
        res.coordinates.length >= 2 &&
        distanceMeters(
          res.coordinates[0].latitude,
          res.coordinates[0].longitude,
          res.coordinates[res.coordinates.length - 1].latitude,
          res.coordinates[res.coordinates.length - 1].longitude,
        ) > 25;
      const hasUsableRoute =
        !!res &&
        Array.isArray(res.coordinates) &&
        res.coordinates.length >= 2 &&
        hasDistinctEndpoints;
      if (!hasUsableRoute) {
        console.warn("[driver-map][route] unusable-route-response", {
          tripId: parsed.tripId,
          points: Array.isArray(res?.coordinates) ? res.coordinates.length : 0,
          distance: res?.distance ?? null,
          duration: res?.duration ?? null,
        });
      }
      if (hasUsableRoute) setOptimalRoute(res);
      else if (isNewKey) setOptimalRoute(null);
      setOptimalRouteLoading(false);
      setShowRouteFallback(!hasUsableRoute && isNewKey);
    };

    void performFetch();

    return () => {
      cancelled = true;
    };
  }, [routeFetchKey, activeGuidanceStep, routeContextTrip?.id]);

  // When map or dashboard preview is shown, get current position for center and "You" marker.
  useEffect(() => {
    if (!shouldShowMap && !showDashboardMapPreview) {
      commitMapPosition(null, { force: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === "web") {
          if (typeof navigator === "undefined" || !navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (cancelled) return;
              commitMapPosition(
                {
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                },
                { force: true },
              );
            },
            () => {
              // Keep null so fallback/route guards handle no-position state cleanly.
              if (!cancelled) commitMapPosition(null, { force: true });
            },
            {
              enableHighAccuracy: true,
              maximumAge: 0,
              timeout: 15000,
            },
          );
          return;
        }

        const expoLocation = await getExpoLocation();
        if (!expoLocation) return;
        // Do not prompt here — FG is requested on Go Online / active-trip resume.
        const { status } = await expoLocation.getForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const pos = await expoLocation.getCurrentPositionAsync({});
        if (cancelled) return;
        commitMapPosition(
          {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          },
          { force: true },
        );
      } catch {
        if (!cancelled) commitMapPosition(null, { force: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldShowMap, showDashboardMapPreview, commitMapPosition]);

  // Web/permission fallback: recover last known driver position from DB so routing can still render.
  useEffect(() => {
    if (!shouldShowMap) return;
    if (driverMapPosition) return;
    if (!activeGuidanceTrip?.id) return;
    if (!driver?.id) return;
    let cancelled = false;
    (async () => {
      const { error, location } =
        await driverLocationService.getLatestDriverLocationForTripOrDriver(
          activeGuidanceTrip.id,
          driver.id,
        );
      if (cancelled) return;
      if (error || !location) {
        const warnKey = `${activeGuidanceTrip.id}:${driver.id}`;
        if (gpsFallbackWarnedKeyRef.current !== warnKey) {
          gpsFallbackWarnedKeyRef.current = warnKey;
          console.warn("[driver-map][gps-fallback] unavailable", {
            tripId: activeGuidanceTrip.id,
            driverId: driver.id,
            reason: error ? "query_error" : "no_location_rows",
            error: error?.message ?? null,
          });
        }
        return;
      }
      commitMapPosition(
        {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        { force: true },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldShowMap, driverMapPosition, activeGuidanceTrip?.id, driver?.id, commitMapPosition]);

  // If we switch to a different trip, reset the truck marker so it starts from current GPS.
  useEffect(() => {
    const tripId = activeGuidanceTrip?.id ?? null;
    if (tripId === lastAnimatedTripIdRef.current) return;
    lastAnimatedTripIdRef.current = tripId;
    setTruckPosition(null);
    lastAnimatedStepKeyRef.current = null;
  }, [activeGuidanceTrip?.id]);

  // Road distance from driver's current position to the active guidance target (pickup or drop).
  const activeNavigationRoute = useMemo(() => {
    if (shouldShowDriverApproachRoute(activeGuidanceStep)) return approachRoute;
    if (shouldShowDriverToDropRoute(activeGuidanceStep)) return optimalRoute;
    return optimalRoute ?? tripLegRoute;
  }, [activeGuidanceStep, approachRoute, optimalRoute, tripLegRoute]);

  const distanceToTargetKmGlobal = useMemo(
    () =>
      activeGuidanceTrip && driverMapPosition && activeNavigationRoute
        ? activeNavigationRoute.distance / 1000
        : null,
    [activeGuidanceTrip, driverMapPosition, activeNavigationRoute],
  );

  // Stop any in-flight animation when the map closes.
  useEffect(() => {
    if (shouldShowMap) return;
    truckAnimTokenRef.current += 1;
    if (truckRafRef.current != null) cancelAnimationFrame(truckRafRef.current);
    truckRafRef.current = null;
  }, [shouldShowMap]);

  // Reset route summary when the active trip changes.
  useEffect(() => {
    setShowRouteSummary(false);
  }, [activeMission?.id]);

  /** Default camera to driver-tracking for the active leg (long-press "Tracking" to pan the map freely). */
  useEffect(() => {
    if (!activeMission?.id) {
      setIsFollowingLocation(false);
      return;
    }
    setIsFollowingLocation(true);
  }, [activeMission?.id]);

  useEffect(() => {
    setShowTrackingInfoCard(false);
  }, [activeMission?.id, shouldShowMap]);

  // Live GPS owns the "You" marker. A previous status-driven animation walked
  // the avatar along a fabricated polyline (to pickup / mid-corridor / drop)
  // and overwrote youLatSv + truckPosition, so the map ignored real device
  // GPS and chat/nav start preferred the fake point. Cancel any leftover
  // animation when the trip/step changes; do not re-animate along the route.
  useEffect(() => {
    truckAnimTokenRef.current += 1;
    if (truckRafRef.current != null) cancelAnimationFrame(truckRafRef.current);
    truckRafRef.current = null;
    setTruckPosition(null);
    lastAnimatedStepKeyRef.current = null;
  }, [shouldShowMap, activeGuidanceTrip?.id, activeGuidanceStep]);

  useEffect(() => {
    const guidanceKey =
      activeGuidanceTrip && activeGuidanceStep
        ? `${activeGuidanceTrip.id}:${activeGuidanceStep}`
        : null;
    if (!guidanceKey) {
      lastGuidanceKeyRef.current = null;
      return;
    }
    if (lastGuidanceKeyRef.current == null) {
      lastGuidanceKeyRef.current = guidanceKey;
      return;
    }
    if (lastGuidanceKeyRef.current !== guidanceKey && activeGuidance) {
      lastGuidanceKeyRef.current = guidanceKey;
      triggerSuccess(activeGuidance.toastMessage);
    }
  }, [activeGuidance, activeGuidanceStep, activeGuidanceTrip]);

  const defaultBoundsTrip = routeContextTrip;
  const defaultBoundsPickup = defaultBoundsTrip
    ? getTripStopCoordinate(defaultBoundsTrip, "pickup")
    : null;
  const defaultBoundsDrop = defaultBoundsTrip
    ? getTripStopCoordinate(defaultBoundsTrip, "drop")
    : null;
  const defaultBoundsTripKey =
    defaultBoundsTrip && defaultBoundsPickup && defaultBoundsDrop
      ? `${defaultBoundsTrip.id}:${defaultBoundsPickup.latitude}:${defaultBoundsPickup.longitude}:${defaultBoundsDrop.latitude}:${defaultBoundsDrop.longitude}`
      : null;

  const fitMapToActiveContext = useCallback(
    (
      targetRef: MutableRefObject<MapViewRef | null>,
      options?: { isFullScreen?: boolean; force?: boolean },
    ) => {
      const tripForBounds = defaultBoundsTrip;
      const pickup = defaultBoundsPickup;
      const drop = defaultBoundsDrop;
      const planCoords =
        routePlanMap?.overview && routePlanMap.stops.length > 0
          ? routePlanMap.stops.map((s) => ({
              latitude: s.latitude,
              longitude: s.longitude,
            }))
          : null;

      if (!planCoords && (!tripForBounds || !pickup || !drop)) return;

      const isFullScreen = options?.isFullScreen === true;

      // Camera policy: once the driver manually pans/pinches, stop stealing
      // the camera. `force: true` is only ever passed by a real context
      // change (trip/stage/route actually changed) or the "Center" action --
      // that's what re-enables auto-fit, not a timer.
      const userInteractedRef = isFullScreen
        ? fullMapUserInteractedRef
        : inlineMapUserInteractedRef;
      if (!options?.force && userInteractedRef.current) return;
      if (options?.force) userInteractedRef.current = false;

      // Uber/Porter-style: once delivered, leave the camera alone. Drivers
      // routinely pan around the completed trip; fighting that is exactly
      // the "camera feels random" complaint this exists to fix.
      if (activeGuidanceStep === "completed") return;

      const showLeafletEarly =
        Platform.OS === "web" || useLeafletFallback || leafLetForced;
      if (!showLeafletEarly && !targetRef.current) return;

      const screenHeight = Dimensions.get("window").height;
      const inlineMapHeight =
        inlineMapViewportHeightRef.current > 0
          ? inlineMapViewportHeightRef.current
          : Math.round(screenHeight * 0.42);

      // Bottom: job card + tab dock. Top: absolute header + map chips.
      // (Header overlays the map — top pad must clear it.)
      const bottomPadding = isFullScreen
        ? Math.max(100, insets.bottom + 64)
        : shouldShowMap
          ? olaMapBottomPaddingPx
          : Math.max(110, Math.round(inlineMapHeight * 0.45));
      const topPadding = mapControlsTopInset(
        isFullScreen ? "modal" : "embedded",
        insets.top,
      );

      const livePosition = navStartCoordinate ?? driverMapPosition ?? truckPosition;

      // Goal-based framing: ask "what is the driver trying to see", not just
      // "which stage". At the endpoints the goal is a tight look at driver +
      // that one stop, not the whole corridor -- the corridor belongs to transit.
      const isTightStopFit =
        !planCoords &&
        (activeGuidanceStep === "pickup" || activeGuidanceStep === "reached");

      const coordsForFit = (() => {
        if (planCoords && planCoords.length > 0) {
          const live = navStartCoordinate ?? driverMapPosition ?? truckPosition;
          return live ? [...planCoords, live] : planCoords;
        }
        const merged: { latitude: number; longitude: number }[] = [];
        const pushCoords = (coords: { latitude: number; longitude: number }[] | undefined) => {
          if (!coords?.length) return;
          merged.push(...subsampleRouteCoordinates(coords, 120));
        };
        if (activeGuidanceStep === "pickup" && livePosition) return [livePosition, pickup];
        if (activeGuidanceStep === "reached" && livePosition) return [livePosition, drop];

        // Transit: fit the remaining road to drop (not the full trip corridor).
        if (shouldShowDriverToDropRoute(activeGuidanceStep)) {
          pushCoords(optimalRoute?.coordinates);
          if (merged.length >= 2) return merged;
          const end = guidanceTargetCoordinate ?? drop;
          if (livePosition && end) return [livePosition, end];
        }
        // Assigned: fit driver + pickup along the approach route.
        if (shouldShowDriverApproachRoute(activeGuidanceStep)) {
          pushCoords(approachRoute?.coordinates);
          if (merged.length >= 2) return merged;
          if (livePosition && pickup) return [livePosition, pickup];
        }
        pushCoords(tripLegRoute?.coordinates);
        if (merged.length >= 2) return merged;
        if (driverMapPosition && guidanceTargetCoordinate) {
          return [driverMapPosition, guidanceTargetCoordinate];
        }
        return [pickup, drop];
      })();
      const baseFitKey = planCoords
        ? `plan:${routePlanMap?.tripId}:${planCoords.length}`
        : `${tripForBounds!.id}:${pickup!.latitude}:${pickup!.longitude}:${drop!.latitude}:${drop!.longitude}`;
      const fitKey = `${baseFitKey}:step:${activeGuidanceStep ?? ""}:nav:${
        shouldShowDriverApproachRoute(activeGuidanceStep)
          ? approachRoute?.coordinates?.length ?? 0
          : optimalRoute?.coordinates?.length ?? 0
      }:leg:${tripLegRoute?.coordinates?.length ?? 0}`;
      const lastFitKeyRef = isFullScreen
        ? fullMapLastFitKeyRef
        : inlineMapLastFitKeyRef;

      if (!options?.force && lastFitKeyRef.current === fitKey) return;

      const rawBounds = boundsFromCoordinates(
        coordsForFit,
        isTightStopFit ? 0.035 : 0.05,
      );
      if (!rawBounds) return;
      // Inflate just enough that short legs aren't glued to max zoom, without
      // pulling so far that the corridor feels lost in the city.
      const bounds = inflateMapBounds(
        rawBounds,
        planCoords ? 1.35 : isTightStopFit ? 0.5 : 1.05,
        planCoords ? 0.12 : isTightStopFit ? 0.032 : 0.07,
      );

      const showLeaflet =
        Platform.OS === "web" || useLeafletFallback || leafLetForced;
      if (showLeaflet) {
        const leafRef = isFullScreen ? fullLeafletRef : leafletRef;
        const leafPad = isFullScreen
          ? 120
          : Math.max(
              160,
              Math.round((topPadding + bottomPadding) * 0.45),
            );
        leafRef.current?.fitBounds(
          bounds.ne,
          bounds.sw,
          leafPad,
          isTightStopFit ? DRIVER_MAP_MY_LOCATION_ZOOM : DRIVER_MAP_OVERVIEW_MAX_ZOOM,
        );
        lastFitKeyRef.current = fitKey;
        return;
      }

      if (!targetRef.current) return;
      const padTop = Math.max(topPadding + 36, Math.round(topPadding * 1.2));
      const padBottom = Math.max(160, bottomPadding + 40);
      const padSide = isFullScreen ? 72 : 88;
      targetRef.current.fitToCoordinates(
        [bounds.ne, bounds.sw],
        {
          edgePadding: {
            top: padTop,
            right: padSide,
            bottom: padBottom,
            left: padSide,
          },
          animated: false,
        },
      );
      lastFitKeyRef.current = fitKey;
    },
    [
      defaultBoundsDrop,
      defaultBoundsPickup,
      defaultBoundsTrip,
      activeGuidanceTrip,
      activeGuidanceStep,
      driverMapPosition,
      truckPosition,
      navStartCoordinate,
      guidanceTargetCoordinate,
      tripLegRoute,
      approachRoute,
      optimalRoute,
      shouldShowMap,
      olaMapBottomPaddingPx,
      leafLetForced,
      useLeafletFallback,
      insets.top,
      insets.bottom,
      routePlanMap,
    ],
  );

  // Never depend on fitMapToActiveContext identity in the effects below, or
  // they re-fire on every GPS tick and undo Focus/follow.
  const fitMapToActiveContextRef = useRef(fitMapToActiveContext);
  fitMapToActiveContextRef.current = fitMapToActiveContext;
  const lastNavFocusStepKeyRef = useRef<string | null>(null);

  // Single shared debounce for every auto-fit trigger below. Trip-key
  // change, route-geometry finishing load, and a guidance-step change used
  // to each schedule their own independent timer -- a burst of two of these
  // near-simultaneously produced two visible camera jumps instead of one
  // settled fit, which read as "random" framing. Scheduling through one
  // shared timer means only the LAST trigger in a burst actually fits,
  // using whatever context is current by then.
  const pendingFitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleFit = useCallback(
    (
      targetRef: MutableRefObject<MapViewRef | null>,
      options: { isFullScreen?: boolean; force?: boolean },
      delayMs: number,
    ) => {
      if (pendingFitTimerRef.current) clearTimeout(pendingFitTimerRef.current);
      pendingFitTimerRef.current = setTimeout(() => {
        pendingFitTimerRef.current = null;
        try {
          fitMapToActiveContextRef.current(targetRef, options);
        } catch {
          /* ignore */
        }
      }, delayMs);
    },
    [],
  );
  const handleViewTripPlan = useCallback(() => {
    setMissionSheetIndex(0);
    try {
      bottomSheetRef.current?.snapToIndex(0);
    } catch {
      /* ignore */
    }
    inlineMapUserInteractedRef.current = false;
    fullMapUserInteractedRef.current = false;
    setIsFollowingLocation(false);
    scheduleFit(mapRef, { force: true }, 220);
  }, [scheduleFit]);
  useEffect(
    () => () => {
      if (pendingFitTimerRef.current) clearTimeout(pendingFitTimerRef.current);
    },
    [],
  );

  // Overview-first: fit route bounds whenever the assigned trip key changes.
  useEffect(() => {
    if (!shouldShowMap) return;
    if (!defaultBoundsTripKey) return;
    if (isFollowingLocation) return;
    if (missionSheetCollapsed) return;
    scheduleFit(mapRef, { force: true }, 200);
  }, [
    defaultBoundsTripKey,
    shouldShowMap,
    scheduleFit,
    isFollowingLocation,
    missionSheetCollapsed,
  ]);

  // Fit the full trip plan (all stops) when it loads or stop count changes.
  useEffect(() => {
    if (!shouldShowMap) return;
    if (!routePlanMap?.overview || routePlanMap.stops.length === 0) return;
    if (isFollowingLocation) return;
    scheduleFit(mapRef, { force: true }, 200);
  }, [
    routePlanMap?.tripId,
    routePlanMap?.overview,
    routePlanMap?.stops.length,
    shouldShowMap,
    scheduleFit,
    isFollowingLocation,
  ]);

  // Re-center into the open map band once the job card height is known.
  useEffect(() => {
    if (!shouldShowMap) return;
    if (measuredSheetHeight <= 0) return;
    if (isFollowingLocation) return;
    if (missionSheetCollapsed) return;
    scheduleFit(mapRef, { force: true }, 160);
  }, [
    measuredSheetHeight,
    shouldShowMap,
    scheduleFit,
    isFollowingLocation,
    missionSheetCollapsed,
  ]);

  // Refit inline map when road geometry loads so the full path is visible (not just A→B).
  useEffect(() => {
    if (!shouldShowMap) return;
    const hasGeometry =
      (tripLegRoute?.coordinates?.length ?? 0) >= 2 ||
      (shouldShowDriverApproachRoute(activeGuidanceStep)
        ? (approachRoute?.coordinates?.length ?? 0) >= 2
        : (optimalRoute?.coordinates?.length ?? 0) >= 2);
    if (!hasGeometry) return;
    if (isFollowingLocation) return;
    if (missionSheetCollapsed) return;
    scheduleFit(mapRef, { force: true }, 150);
  }, [
    tripLegRoute,
    approachRoute,
    optimalRoute,
    activeGuidanceStep,
    shouldShowMap,
    scheduleFit,
    isFollowingLocation,
    missionSheetCollapsed,
  ]);

  // Active leg: one overview fit when the step changes, plus the UI-state
  // resets (route summary, tracking card, follow-mode) that only belong to
  // an actual step transition -- kept separate from the two triggers above
  // since those fire on trip/geometry changes where these resets don't apply.
  useEffect(() => {
    if (!shouldShowMap) return;
    if (!activeGuidanceTrip?.id) return;
    const onApproach = shouldShowDriverApproachRoute(activeGuidanceStep);
    const onToDrop = shouldShowDriverToDropRoute(activeGuidanceStep);
    if (!onApproach && !onToDrop) return;

    const stepKey = `${activeGuidanceTrip.id}:${activeGuidanceStep ?? ""}`;
    if (lastNavFocusStepKeyRef.current === stepKey) return;
    lastNavFocusStepKeyRef.current = stepKey;

    setShowRouteSummary(false);
    // Keep ETA card visible for the active leg — Focus button stays inactive until tapped
    // (green = live follow on me, not "card open").
    setShowTrackingInfoCard(true);
    setIsFollowingLocation(false);
    scheduleFit(mapRef, { force: true }, 280);
  }, [activeGuidanceStep, activeGuidanceTrip?.id, shouldShowMap, scheduleFit]);

  // Pulsating circle when searching for assignments (online, no mission, nothing to decide).
  // When multiple assignments exist, incoming is surfaced via notifications only — do not treat as "searching".
  const showSearchingOverlay = Boolean(
    driver &&
      isOnline &&
      !activeMission &&
      !effectiveFirstIncoming &&
      !hasAssignableIncomingTrip,
  );

  /** Notify-only after a mission: no primary row until the driver opens Notifications or taps Resume. */
  const showNotifyOnlyAssignmentsHint = Boolean(
    driver &&
      isOnline &&
      !activeMission &&
      !otpClaimTrip &&
      !effectiveFirstIncoming &&
      hasAssignableIncomingTrip &&
      !assignmentFeedback &&
      assignableTripsNotifyOnlyAfterMission,
  );

  useEffect(() => {
    if (!showSearchingOverlay) return;
    searchPulseAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(searchPulseAnim, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [showSearchingOverlay, searchPulseAnim]);

  const driverName =
    profile?.full_name?.trim() || profile?.displayName?.trim() || "Pilot";

  /**
   * Minimized card keeps the full-route overview framing (corridor in view).
   * Disable follow-me so GPS recenter cannot steal the camera, then re-fit.
   */
  const missionPeekZoomArmedRef = useRef(false);
  useEffect(() => {
    if (!shouldShowMap || !canPeekSheetForMap) {
      missionPeekZoomArmedRef.current = false;
      return;
    }

    if (missionSheetCollapsed) {
      if (missionPeekZoomArmedRef.current) return;
      missionPeekZoomArmedRef.current = true;
      if (isFollowingLocation) setIsFollowingLocation(false);
      setMapLocateCloseUp(false);
      inlineMapUserInteractedRef.current = false;
      const t = setTimeout(() => {
        inlineMapUserInteractedRef.current = false;
        // fitMapToActiveContext routes to leafletRef on web/Expo Go WebView maps.
        scheduleFit(mapRef, { force: true }, 0);
      }, 280);
      return () => clearTimeout(t);
    }

    if (missionPeekZoomArmedRef.current) {
      missionPeekZoomArmedRef.current = false;
      if (!isFollowingLocation) {
        inlineMapUserInteractedRef.current = false;
        scheduleFit(mapRef, { force: true }, 240);
      }
    }
  }, [
    missionSheetCollapsed,
    shouldShowMap,
    canPeekSheetForMap,
    scheduleFit,
    isFollowingLocation,
  ]);

  // Live follow mode: keep centering on device GPS until toggled off.
  useEffect(() => {
    if (!shouldShowMap || !isFollowingLocation) {
      locationWatchRef.current?.remove?.();
      locationWatchRef.current = null;
      return;
    }

    const applyFollowPosition = (latitude: number, longitude: number) => {
      const next = { latitude, longitude };
      setTruckPosition(null);
      commitMapPosition(next);
      youLatSv.value = withTiming(next.latitude, { duration: 450 });
      youLonSv.value = withTiming(next.longitude, { duration: 450 });

      const showLeaflet =
        Platform.OS === "web" || useLeafletFallback || leafLetForced;
      if (showLeaflet) {
        const targetRef = isFullMapVisible ? fullLeafletRef : leafletRef;
        // Preserve zoom while following so control +/- isn't undone every GPS tick.
        targetRef.current?.focusCurrentLocation?.(next);
        return;
      }

      const targetRef = isFullMapVisible ? fullMapRef : mapRef;
      const map = targetRef.current;
      if (!map) return;
      try {
        if (map.animateCamera) {
          map.animateCamera(
            {
              center: next,
              pitch: 0,
              heading: Number(youHeadingSv.value) || 0,
            },
            { duration: 450 },
          );
        } else if (map.animateToRegion) {
          map.animateToRegion(
            {
              latitude: next.latitude,
              longitude: next.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            },
            450,
          );
        }
      } catch {
        // ignore
      }
    };

    let cancelled = false;

    void (async () => {
      try {
        const expoLocation =
          Platform.OS === "web" ? await getExpoLocation() : ExpoLocation;
        if (!expoLocation || cancelled) return;
        // Do not prompt here — FG is requested on Go Online / active-trip resume.
        const { status } = await expoLocation.getForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;

        locationWatchRef.current?.remove?.();
        const watch = await startForegroundPositionWatch(
          {
            accuracy: ExpoLocation.Accuracy.Balanced,
            distanceInterval: 20,
            timeInterval: 5000,
          },
          (pos) => {
            if (cancelled) return;
            applyFollowPosition(pos.coords.latitude, pos.coords.longitude);
          },
        );
        if (cancelled) {
          watch?.remove();
          return;
        }
        if (watch) locationWatchRef.current = watch;

        const snap = await expoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.High,
        });
        if (!cancelled) {
          applyFollowPosition(snap.coords.latitude, snap.coords.longitude);
        }
      } catch (e) {
        if (__DEV__) {
          console.warn(
            "[location] follow watch setup failed",
            e instanceof Error ? e.message : e,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      locationWatchRef.current?.remove?.();
      locationWatchRef.current = null;
    };
  }, [
    isFollowingLocation,
    isFullMapVisible,
    leafLetForced,
    shouldShowMap,
    useLeafletFallback,
    youHeadingSv,
    commitMapPosition,
  ]);

  useEffect(() => {
    if (!isFullMapVisible) return;
    if (isFollowingLocation) return;
    const timer = setTimeout(() => {
      fitMapToActiveContext(fullMapRef, { isFullScreen: true, force: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [defaultBoundsTripKey, fitMapToActiveContext, isFullMapVisible, isFollowingLocation]);

  const handleSetOffline = useCallback(() => {
    setIsOnline(false);
    justCompletedTripRef.current = false;
    // Persist it. Without this the row keeps status "online", so dispatchers
    // still see the driver as available and the next rehydration reads a stale
    // "online" back out of the DB (see the sticky-true setIsOnline above).
    // updateDriver resolves with { error } instead of throwing, so the failure
    // has to be checked in .then — a bare .catch would miss the common case.
    if (driver?.organization_id && driver?.id) {
      void driversService
        .updateDriver(driver.organization_id, driver.id, { status: "offline" })
        .then(({ error }) => {
          if (error) {
            setIsOnline(true); // revert — the DB still says online
            setAcceptError("Could not go offline. Check connection and retry.");
          }
        })
        .catch(() => {
          setIsOnline(true);
          setAcceptError("Could not go offline. Check connection and retry.");
        });
    }
  }, [driver?.organization_id, driver?.id]);

  const renderDriverMap = (
    targetRef: MutableRefObject<MapViewRef | null>,
    options?: { fullScreen?: boolean; controlsVariant?: "modal" | "embedded" },
  ) => {
    const isFullScreen = options?.fullScreen === true;
    const MapMarker = Marker as ComponentType<Record<string, unknown>>;
    const MapPolyline = Polyline as ComponentType<Record<string, unknown>>;
    const MapCallout = Callout as ComponentType<Record<string, unknown>>;
    const mapInteractionsLocked = Boolean(otpClaimTripId);
    const controlsVariant = options?.controlsVariant ?? "modal";
    /**
     * Only hard-lock pan/zoom for OTP entry (modal). When the driver is in follow mode
     * (Head to Pickup, In-Transit, etc.) we keep gestures enabled and instead disable
     * follow on the first pan/pinch — same UX as Google Maps / Uber. Without this,
     * mobile drivers cannot zoom/scroll the map while a trip is active.
     */
    const mapViewportLocked = mapInteractionsLocked;

    const showLeaflet =
      Platform.OS === "web" || useLeafletFallback || leafLetForced;

    const pickup =
      shouldShowMap && routeContextTrip
        ? getTripStopCoordinate(
            routeContextTrip,
            "pickup",
          )
        : null;
    const drop =
      shouldShowMap && routeContextTrip
        ? getTripStopCoordinate(
            routeContextTrip,
            "drop",
          )
        : null;
    const toDropNav = shouldShowDriverToDropRoute(activeGuidanceStep);
    const showApproachRoute = shouldShowDriverApproachRoute(activeGuidanceStep);
    const youCoordinate =
      driverMapPosition ??
      truckPosition ??
      navStartCoordinate ??
      (toDropNav ? pickup : null);
    const mapCenter =
      youCoordinate ?? pickup ?? drop ?? DEFAULT_MAP_REGION;

    const leafletMarkers: LeafletMarker[] = [];
    if (youCoordinate) {
      leafletMarkers.push({
        id: "you",
        coordinate: youCoordinate,
        avatarUri,
        avatarSeed: driverAvatarSeed,
        isOnline,
        onPress: () => {
          setIsFollowingLocation(false);
          setShowTrackingInfoCard(false);
          const leafRef = isFullScreen ? fullLeafletRef : leafletRef;
          leafRef.current?.focusCurrentLocation(
            youCoordinate,
            DRIVER_MAP_MY_LOCATION_ZOOM,
          );
        },
      });
    }
    // Approach: Pickup is the hero. Transit+: Drop is the hero (pickup muted).
    const planStops = routePlanMap?.stops?.length ? routePlanMap.stops : [];
    const planClusters = clusterRoutePlanStops(planStops);
    if (planClusters.length > 0) {
      for (const group of planClusters) {
        const lead = group.find((stop) => stop.isCurrent) ?? group[0]!;
        const copy = routeClusterCopy(group);
        leafletMarkers.push({
          id: routePlanLeafletMarkerId(lead),
          coordinate: { latitude: lead.latitude, longitude: lead.longitude },
          label: copy.label,
          nextLabel: copy.nextLabel,
          color: lead.kind === "drop" ? Theme.driverGold : Theme.driverEmerald,
          highlighted: group.some((stop) => stop.isCurrent),
          kindIndex: lead.kindIndex,
          clusterBadges: group.map((stop) => ({
            kind: stop.kind === "pickup" ? "pickup" : "drop",
            index: stop.kindIndex,
          })),
        });
      }
    } else if (pickup && showApproachRoute) {
      leafletMarkers.push({
        id: "pickup",
        coordinate: pickup,
        label: "Pickup",
        color: Theme.driverEmerald,
        highlighted: true,
      });
    } else if (pickup && toDropNav) {
      const youAtPickup =
        youCoordinate &&
        distanceMeters(
          youCoordinate.latitude,
          youCoordinate.longitude,
          pickup.latitude,
          pickup.longitude,
        ) < 80;
      if (!youAtPickup) {
        leafletMarkers.push({
          id: "pickup",
          coordinate: pickup,
          label: "Pickup",
          color: Theme.driverEmeraldMutedText2,
          highlighted: false,
        });
      }
    } else if (pickup) {
      leafletMarkers.push({
        id: "pickup",
        coordinate: pickup,
        label: "Pickup",
        color: Theme.driverEmerald,
        highlighted: highlightedTarget === "pickup",
      });
    }
    if (planStops.length === 0 && drop) {
      leafletMarkers.push({
        id: "drop",
        coordinate: drop,
        label: "Drop",
        // Dim drop while navigating to pickup so Pickup reads as the hero.
        color: showApproachRoute
          ? Theme.driverEmeraldMutedText2
          : Theme.driverGold,
        highlighted: toDropNav || (!showApproachRoute && highlightedTarget === "drop"),
      });
    }
    // DEV: recent pins — skip ones sitting on the avatar so the green status stays tappable.
    recentPinPoints.forEach((pt, i) => {
      if (youCoordinate) {
        const gapM = distanceMeters(
          pt.latitude,
          pt.longitude,
          youCoordinate.latitude,
          youCoordinate.longitude,
        );
        if (gapM < 45) return;
      }
      leafletMarkers.push({
        id: `pin-${i}`,
        coordinate: { latitude: pt.latitude, longitude: pt.longitude },
        color: "#94a3b8",
        label: "View location",
        onPress: () => {
          setIsFollowingLocation(false);
          setShowTrackingInfoCard(false);
          const leafRef = isFullScreen ? fullLeafletRef : leafletRef;
          leafRef.current?.focusCurrentLocation(
            { latitude: pt.latitude, longitude: pt.longitude },
            DRIVER_MAP_MAX_ZOOM,
          );
        },
      });
    });

    const mapPolylines: LeafletPolylineLayer[] = [];
    const planLine = routePlanPolyline(routePlanMap);
    if (planLine.length >= 2) {
      mapPolylines.push({
        id: "trip-plan",
        coordinates: planLine,
        color: Theme.driverEmerald,
        dashed: true,
        width: 5,
        glowWidth: 9,
      });
    }
    const pickupDropSpanM =
      pickup && drop
        ? distanceMeters(
            pickup.latitude,
            pickup.longitude,
            drop.latitude,
            drop.longitude,
          )
        : 0;

    if (toDropNav) {
      // Hero: remaining road to destination.
      if (optimalRoute?.coordinates && optimalRoute.coordinates.length >= 2) {
        mapPolylines.push({
          id: "to-drop",
          coordinates: optimalRoute.coordinates,
          color: Theme.driverPrimary,
          width: 6,
          glowWidth: 12,
        });
      } else if (navStartCoordinate && drop) {
        mapPolylines.push({
          id: "to-drop-fallback",
          coordinates: [navStartCoordinate, drop],
          color: Theme.driverPrimary,
          dashed: true,
          width: 5,
        });
      }
      // Muted full trip corridor underneath when it adds context (distinct stops).
      if (
        tripLegRoute?.coordinates &&
        tripLegRoute.coordinates.length >= 2 &&
        pickupDropSpanM > 400
      ) {
        mapPolylines.unshift({
          id: "trip-leg",
          coordinates: tripLegRoute.coordinates,
          color: Theme.driverEmeraldBorderSoft,
          width: 3,
        });
      }
    } else if (showApproachRoute) {
      // Muted full trip corridor underneath when it adds context.
      if (pickupDropSpanM > 400) {
        if (tripLegRoute?.coordinates && tripLegRoute.coordinates.length >= 2) {
          mapPolylines.push({
            id: "trip-leg",
            coordinates: tripLegRoute.coordinates,
            color: Theme.driverEmeraldBorderSoft,
            width: 3,
          });
        } else if (pickup && drop) {
          mapPolylines.push({
            id: "trip-leg-fallback",
            coordinates: [pickup, drop],
            color: Theme.driverEmeraldBorderSoft,
            dashed: true,
            width: 3,
          });
        }
      }
      // Hero: current location → pickup road (same weight as to-drop nav).
      if (approachRoute?.coordinates && approachRoute.coordinates.length >= 2) {
        mapPolylines.push({
          id: "to-pickup",
          coordinates: approachRoute.coordinates,
          color: Theme.driverEmerald,
          dashed: true,
          width: 6,
          glowWidth: 12,
        });
      } else if (youCoordinate && pickup) {
        const spanM = distanceMeters(
          youCoordinate.latitude,
          youCoordinate.longitude,
          pickup.latitude,
          pickup.longitude,
        );
        if (spanM > 25) {
          mapPolylines.push({
            id: "to-pickup-fallback",
            coordinates: [youCoordinate, pickup],
            color: Theme.driverEmerald,
            dashed: true,
            width: 5,
          });
        }
      }
    } else {
      if (tripLegRoute?.coordinates && tripLegRoute.coordinates.length >= 2) {
        mapPolylines.push({
          id: "trip-leg",
          coordinates: tripLegRoute.coordinates,
          color: Theme.driverPrimary,
          width: 5,
        });
      } else if (pickup && drop && pickupDropSpanM > 40) {
        mapPolylines.push({
          id: "trip-leg-fallback",
          coordinates: [pickup, drop],
          color: Theme.driverPrimary,
          dashed: true,
          width: 4,
        });
      }
    }

    const mapRouteLabels: LeafletRouteLabel[] = [];
    if (showApproachRoute) {
      const approachCoords =
        approachRoute?.coordinates && approachRoute.coordinates.length >= 2
          ? approachRoute.coordinates
          : youCoordinate && pickup
            ? [youCoordinate, pickup]
            : null;
      const approachDistanceM =
        approachRoute?.distance ??
        (youCoordinate && pickup
          ? distanceMeters(
              youCoordinate.latitude,
              youCoordinate.longitude,
              pickup.latitude,
              pickup.longitude,
            )
          : null);
      const approachMid = approachCoords ? routeMidpoint(approachCoords) : null;
      if (approachMid && approachDistanceM != null && approachDistanceM > 25) {
        const eta = formatEtaFromRouteSeconds(approachRoute?.duration);
        mapRouteLabels.push({
          id: "to-pickup-distance",
          coordinate: approachMid,
          text: eta
            ? `${formatRoadDistanceM(approachDistanceM)} · ${eta}`
            : formatRoadDistanceM(approachDistanceM),
        });
      }
    } else if (toDropNav) {
      const toDropCoords =
        optimalRoute?.coordinates && optimalRoute.coordinates.length >= 2
          ? optimalRoute.coordinates
          : navStartCoordinate && drop
            ? [navStartCoordinate, drop]
            : null;
      const toDropDistanceM =
        optimalRoute?.distance ??
        (navStartCoordinate && drop
          ? distanceMeters(
              navStartCoordinate.latitude,
              navStartCoordinate.longitude,
              drop.latitude,
              drop.longitude,
            )
          : null);
      const toDropMid = toDropCoords ? routeMidpoint(toDropCoords) : null;
      if (toDropMid && toDropDistanceM != null) {
        const eta = formatEtaFromRouteSeconds(optimalRoute?.duration);
        mapRouteLabels.push({
          id: "to-drop-distance",
          coordinate: toDropMid,
          text: eta
            ? `${formatRoadDistanceM(toDropDistanceM)} · ${eta}`
            : formatRoadDistanceM(toDropDistanceM),
        });
      }
    }

    // Road distance from driver to current guidance target (pickup or drop)
    const pinnedPosition =
      driverMapPosition ?? truckPosition ?? navStartCoordinate ?? DEFAULT_MAP_REGION;
    const distanceToTargetKm =
      activeGuidanceTrip && pinnedPosition && activeNavigationRoute
        ? activeNavigationRoute.distance / 1000
        : null;

    // Locate: 1st tap = close-up on driver; 2nd tap = full route overview.
    const handleZoomToDriver = () => {
      setIsFollowingLocation(false);
      setShowTrackingInfoCard(false);
      setShowRouteSummary(false);

      if (mapLocateCloseUp) {
        setMapLocateCloseUp(false);
        inlineMapUserInteractedRef.current = false;
        fullMapUserInteractedRef.current = false;
        try {
          const ref = isFullScreen ? fullMapRef : mapRef;
          fitMapToActiveContext(ref, { isFullScreen, force: true });
        } catch {
          /* ignore */
        }
        return;
      }

      const you = pinnedPosition ?? driverMapPosition ?? truckPosition;
      if (!you) return;
      setMapLocateCloseUp(true);
      if (isFullScreen) fullMapUserInteractedRef.current = true;
      else inlineMapUserInteractedRef.current = true;
      if (showLeaflet) {
        const leafRef = isFullScreen ? fullLeafletRef : leafletRef;
        leafRef.current?.focusCurrentLocation(you, DRIVER_MAP_MY_LOCATION_ZOOM);
      } else {
        nativeMapZoomRef.current = DRIVER_MAP_MY_LOCATION_ZOOM;
        const map = targetRef.current;
        try {
          if (map?.animateCamera) {
            map.animateCamera(
              {
                center: you,
                zoom: DRIVER_MAP_MY_LOCATION_ZOOM,
                pitch: 0,
              },
              { duration: 450 },
            );
          } else if (map?.animateToRegion) {
            map.animateToRegion(
              {
                ...you,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              },
              450,
            );
          }
        } catch {}
      }
    };

    const handleMapZoomDelta = (delta: number) => {
      setIsFollowingLocation(false);
      setShowTrackingInfoCard(false);
      // Without this, auto-fit with force:true immediately undoes +/- on web/Leaflet.
      if (isFullScreen) fullMapUserInteractedRef.current = true;
      else inlineMapUserInteractedRef.current = true;
      if (showLeaflet) {
        const leafRef = isFullScreen ? fullLeafletRef : leafletRef;
        if (delta > 0) leafRef.current?.zoomIn();
        else leafRef.current?.zoomOut();
        nativeMapZoomRef.current = Math.max(
          3,
          Math.min(DRIVER_MAP_MAX_ZOOM, nativeMapZoomRef.current + delta),
        );
        return;
      }
      const center =
        driverMapPosition ??
        pinnedPosition ??
        lastCameraCenterRef.current ??
        null;
      if (!center) return;
      nativeMapZoomRef.current = Math.max(
        3,
        Math.min(DRIVER_MAP_MAX_ZOOM, nativeMapZoomRef.current + delta),
      );
      const map = isFullScreen ? fullMapRef.current : targetRef.current;
      try {
        if (map?.animateCamera) {
          map.animateCamera(
            {
              center,
              zoom: nativeMapZoomRef.current,
              pitch: 0,
            },
            { duration: 280 },
          );
        } else if (map?.animateToRegion) {
          const d = 360 / Math.pow(2, nativeMapZoomRef.current);
          const deltaDeg = Number.isFinite(d)
            ? Math.min(180, Math.max(0.0005, d))
            : 0.02;
          map.animateToRegion(
            {
              ...center,
              latitudeDelta: deltaDeg,
              longitudeDelta: deltaDeg,
            },
            280,
          );
        }
      } catch {}
    };

    return (
      <View
        style={isFullScreen ? styles.fullMapContainer : styles.assignedMapHalf}
        pointerEvents="box-none"
        onLayout={(event) => {
          if (isFullScreen) return;
          const measured = event.nativeEvent.layout.height;
          inlineMapViewportHeightRef.current = measured;
          if (Math.abs(measured - inlineMapViewportHeight) > 1) {
            setInlineMapViewportHeight(measured);
          }
        }}
      >
        {showLeaflet ? (
          <LeafletMap
            ref={isFullScreen ? fullLeafletRef : leafletRef}
            style={isFullScreen ? styles.fullMapView : styles.assignedMapInHalf}
            center={mapCenter}
            zoom={DRIVER_MAP_OVERVIEW_MAX_ZOOM}
            markers={leafletMarkers}
            polylines={mapPolylines}
            routeLabels={mapRouteLabels}
            polylineColor={Theme.driverPrimary}
            lowPower={false}
            interactionLocked={mapViewportLocked}
            showZoomControls={false}
            autoFitBoundsOnRouteChange={false}
          />
        ) : (
          <MapView
            ref={(instance: MapViewRef | null) => {
              targetRef.current = instance;
            }}
            style={isFullScreen ? styles.fullMapView : styles.assignedMapInHalf}
            initialRegion={
              driverMapPosition
                ? {
                    ...driverMapPosition,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  }
                : DEFAULT_MAP_REGION
            }
            mapType={isExpoGo() ? "standard" : Platform.OS === "ios" ? "mutedStandard" : "standard"}
            userInterfaceStyle={isExpoGo() ? "light" : mapIsDark ? "dark" : "light"}
            customMapStyle={isExpoGo() ? undefined : mapIsDark ? darkMapStyle : undefined}
            showsUserLocation={false}
            scrollEnabled={!mapViewportLocked}
            zoomEnabled={!mapViewportLocked}
            rotateEnabled={false}
            pitchEnabled={!mapViewportLocked}
            moveOnMarkerPress={false}
            pointerEvents="auto"
            onPanDrag={() => {
              // Manual gesture: drop follow so we don't snap the camera back on the
              // next GPS tick. Driver can re-engage via the "My location" pill.
              if (isFollowingLocation) setIsFollowingLocation(false);
              // Also suppress auto-fit until a real context change or "Center" --
              // don't fight a driver who's deliberately exploring the map.
              (isFullScreen ? fullMapUserInteractedRef : inlineMapUserInteractedRef).current = true;
            }}
            onMapReady={() => {
              // Native map became ready — clear "booting" so we don't fallback on next launch.
              void AsyncStorage.setItem(DRIVER_MAP_BOOT_KEY, "0").catch(
                () => {},
              );
              void AsyncStorage.removeItem(DRIVER_MAP_BOOT_TS_KEY).catch(
                () => {},
              );
              // Do not animateCamera here — it fights fitMapToActiveContext and user pan/pinch
              // (including at drop-off / Upload POD when the bottom sheet layout shifts).
            }}
            mapPadding={{
              // Fit framing owns the wedge via fitToCoordinates edgePadding.
              // Keeping the same bottom here double-counts on Apple Maps / Expo Go.
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            {/* You marker: live GPS when available; at pickup after Package collected if GPS lagging. */}
            {OlaAnimatedMarker && driverMapPosition ? (
              <OlaAnimatedMarker
                animatedProps={youMarkerAnimatedProps}
                coordinate={driverMapPosition}
                anchor={{ x: 0.5, y: 1 }}
              >
                <Reanimated.View style={youIconAnimatedStyle}>
                  {isExpoGo() ? (
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: Theme.driverEmerald,
                        borderWidth: 3,
                        borderColor: isOnline ? Theme.darkGreen : Theme.teslaRed,
                      }}
                    />
                  ) : (
                    <DriverMapAvatarMarker
                      avatarUri={avatarUri}
                      avatarSeed={driverAvatarSeed}
                      isOnline={isOnline}
                      size={48}
                      onPressStatus={handleZoomToDriver}
                    />
                  )}
                </Reanimated.View>
                <MapCallout>
                  <View
                    style={[
                      styles.assignedMapCallout,
                      {
                        backgroundColor: Theme.buttonDark,
                        borderColor: "rgba(255,255,255,0.16)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.assignedMapCalloutTitle,
                        { color: Theme.buttonDarkText },
                      ]}
                    >
                      You
                    </Text>
                    <Text
                      style={[
                        styles.assignedMapCalloutSub,
                        { color: Theme.textOnDarkMuted },
                      ]}
                      numberOfLines={2}
                    >
                      {locationLabel ?? "Current location"}
                    </Text>
                  </View>
                </MapCallout>
              </OlaAnimatedMarker>
            ) : youCoordinate ? (
              <MapMarker
                coordinate={youCoordinate}
                anchor={{ x: 0.5, y: 1 }}
              >
                {isExpoGo() ? (
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: Theme.driverEmerald,
                      borderWidth: 3,
                      borderColor: isOnline ? Theme.darkGreen : Theme.teslaRed,
                    }}
                  />
                ) : (
                  <DriverMapAvatarMarker
                    avatarUri={avatarUri}
                    avatarSeed={driverAvatarSeed}
                    isOnline={isOnline}
                    size={48}
                    onPressStatus={handleZoomToDriver}
                  />
                )}
              </MapMarker>
            ) : null}

            {/* DEV: recent pins far from current avatar — tap to view that fix */}
            {recentPinPoints.map((pt, i) => {
              if (driverMapPosition) {
                const gapM = distanceMeters(
                  pt.latitude,
                  pt.longitude,
                  driverMapPosition.latitude,
                  driverMapPosition.longitude,
                );
                if (gapM < 45) return null;
              }
              return (
                <MapMarker
                  key={`pin-${i}`}
                  coordinate={{ latitude: pt.latitude, longitude: pt.longitude }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  onPress={() => {
                    nativeMapZoomRef.current = DRIVER_MAP_MAX_ZOOM;
                    setIsFollowingLocation(false);
                    setShowTrackingInfoCard(false);
                    const map = targetRef.current;
                    try {
                      map?.animateCamera?.(
                        {
                          center: {
                            latitude: pt.latitude,
                            longitude: pt.longitude,
                          },
                          zoom: DRIVER_MAP_MAX_ZOOM,
                          pitch: 0,
                        },
                        { duration: 450 },
                      );
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <View style={styles.pinHistoryDot} />
                </MapMarker>
              );
            })}

            {shouldShowMap && routePlanMap && routePlanMap.stops.length > 0 ? (
              <>
                {clusterRoutePlanStops(routePlanMap.stops).map((group) => {
                  const lead = group.find((stop) => stop.isCurrent) ?? group[0]!;
                  const copy = routeClusterCopy(group);
                  return (
                    <MapMarker
                      key={lead.stopId}
                      coordinate={{ latitude: lead.latitude, longitude: lead.longitude }}
                      anchor={{ x: 0.5, y: 1 }}
                    >
                      <RoutePlanMapPin
                        kind={lead.kind}
                        index={lead.kindIndex}
                        caption={copy.label}
                        nextLabel={copy.nextLabel}
                        emphasized={group.some((stop) => stop.isCurrent)}
                        badges={group.map((stop) => ({
                          kind: stop.kind,
                          index: stop.kindIndex,
                        }))}
                      />
                    </MapMarker>
                  );
                })}
              </>
            ) : shouldShowMap && routeContextTrip ? (
              <>
                {pickup &&
                  (!toDropNav ||
                    !(
                      youCoordinate &&
                      distanceMeters(
                        youCoordinate.latitude,
                        youCoordinate.longitude,
                        pickup.latitude,
                        pickup.longitude,
                      ) < 80
                    )) && (
                  <MapMarker coordinate={pickup} anchor={{ x: 0.5, y: 0.5 }}>
                    <View
                      style={[
                        styles.customMapMarkerPickup,
                        (showApproachRoute ||
                          (highlightedTarget === "pickup" && !toDropNav)) &&
                          styles.customMapMarkerActive,
                        toDropNav && { opacity: 0.55 },
                      ]}
                    >
                      <FontAwesome
                        name="map-marker"
                        size={
                          showApproachRoute ||
                          (highlightedTarget === "pickup" && !toDropNav)
                            ? 14
                            : 12
                        }
                        color="white"
                      />
                    </View>
                  </MapMarker>
                )}
                {drop && (
                  <MapMarker coordinate={drop} anchor={{ x: 0.5, y: 0.5 }}>
                    <View
                      style={[
                        styles.customMapMarkerDrop,
                        (highlightedTarget === "drop" || toDropNav) &&
                          styles.customMapMarkerActive,
                        showApproachRoute && { opacity: 0.5 },
                      ]}
                    >
                      <FontAwesome
                        name="flag"
                        size={highlightedTarget === "drop" || toDropNav ? 12 : 10}
                        color="white"
                      />
                    </View>
                  </MapMarker>
                )}
              </>
            ) : null}
            {shouldShowMap ? (
              <>
                {mapPolylines.map((layer) => {
                  const color = layer.color ?? Theme.driverPrimary;
                  const mainWidth = layer.width ?? 5;
                  const glowWidth = layer.glowWidth ?? mainWidth + 5;
                  return (
                    <Fragment key={layer.id}>
                      <MapPolyline
                        coordinates={layer.coordinates}
                        strokeColor={`${color}40`}
                        strokeWidth={glowWidth}
                        lineCap="round"
                        lineJoin="round"
                        lineDashPattern={layer.dashed ? [6, 8] : undefined}
                      />
                      <MapPolyline
                        coordinates={layer.coordinates}
                        strokeColor={color}
                        strokeWidth={mainWidth}
                        lineCap="round"
                        lineJoin="round"
                        lineDashPattern={layer.dashed ? [6, 8] : undefined}
                      />
                    </Fragment>
                  );
                })}
                {mapRouteLabels.map((label) => (
                  <MapMarker
                    key={label.id}
                    coordinate={label.coordinate}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                  >
                    <View style={styles.routeDistanceLabel}>
                      <Text style={styles.routeDistanceLabelText}>{label.text}</Text>
                    </View>
                  </MapMarker>
                ))}
              </>
            ) : null}
          </MapView>
        )}

        {/* Map controls + route summary — hidden during OTP entry */}
        {otpClaimTripId == null ? (
          <>
            {/* Top row: LIVE ROUTE (left) + zoom / locate (right) */}
            <View
              style={[
                styles.mapTopControlsRow,
                {
                  top:
                    controlsVariant === "embedded"
                      ? insets.top + 96
                      : insets.top + 10,
                },
              ]}
              pointerEvents="box-none"
            >
              {showTrackingInfoCard &&
              otpClaimTripId == null &&
              (activeMission || effectiveFirstIncoming) ? (
                (() => {
                  const toLabel =
                    activeGuidanceStep === "accepted" ||
                    activeGuidanceStep === "pickup"
                      ? "pickup"
                      : "destination";
                  const distM =
                    distanceToTargetKm != null
                      ? formatRoadDistanceM(distanceToTargetKm * 1000)
                      : null;
                  const etaText = formatEtaFromRouteSeconds(
                    activeNavigationRoute?.duration,
                  );
                  const arrivalClock = formatEtaArrivalClock(
                    activeNavigationRoute?.duration,
                  );
                  const bottomHint =
                    !arrivalClock && !activeMission
                      ? "Start trip for live ETA"
                      : !arrivalClock && activeMission && distM == null
                        ? "Getting GPS…"
                        : undefined;
                  return (
                    <View style={styles.mapTopLiveRouteWrap} pointerEvents="box-none">
                      <LiveRouteInfoCard
                        compact
                        colors={colors}
                        toLabel={toLabel}
                        distanceDisplay={distM}
                        etaDisplay={etaText ?? "—"}
                        arrivalClock={arrivalClock}
                        bottomHint={bottomHint}
                      />
                    </View>
                  );
                })()
              ) : (
                <View style={styles.mapTopLiveRouteSpacer} />
              )}

              <View style={styles.mapTopRightGroup}>
                <TouchableOpacity
                  style={[
                    styles.mapTopIconBtn,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => {
                    setMapLocateCloseUp(false);
                    handleMapZoomDelta(1);
                  }}
                  disabled={mapViewportLocked}
                  accessibilityLabel="Zoom in"
                  accessibilityRole="button"
                >
                  <FontAwesome name="plus" size={12} color={colors.text} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.mapTopIconBtn,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => {
                    setMapLocateCloseUp(false);
                    handleMapZoomDelta(-1);
                  }}
                  disabled={mapViewportLocked}
                  accessibilityLabel="Zoom out"
                  accessibilityRole="button"
                >
                  <FontAwesome name="minus" size={12} color={colors.text} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.mapTopIconBtn,
                    {
                      backgroundColor: mapLocateCloseUp
                        ? colors.emerald
                        : colors.surface,
                      borderColor: mapLocateCloseUp
                        ? colors.emerald
                        : colors.border,
                    },
                  ]}
                  onPress={handleZoomToDriver}
                  disabled={!(driverMapPosition ?? truckPosition ?? pinnedPosition)}
                  accessibilityLabel={
                    mapLocateCloseUp
                      ? "Show full route overview"
                      : "Zoom to my location"
                  }
                  accessibilityRole="button"
                >
                  <FontAwesome
                    name="street-view"
                    size={12}
                    color={mapLocateCloseUp ? "#fff" : colors.text}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {routePlanMap && routePlanMap.stops.length > 0 ? (
              <View
                pointerEvents="none"
                style={[
                  styles.mapGuidanceChip,
                  {
                    top:
                      controlsVariant === "embedded"
                        ? insets.top + 168
                        : insets.top + 88,
                    left: 16,
                    right: 88,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.mapGuidanceTitle, { color: colors.text }]} numberOfLines={1}>
                  Trip plan · {routePlanMap.stops.length}{" "}
                  {routePlanMap.stops.length === 1 ? "stop" : "stops"}
                </Text>
                <View style={styles.mapPlanList}>
                  {routePlanMap.stops.slice(0, 6).map((stop) => {
                    const drop = stop.kind === "drop";
                    const place = stop.label.trim();
                    const caption = routePlanStopCaption(stop);
                    return (
                      <View key={stop.stopId} style={styles.mapPlanRow}>
                        <View
                          style={[
                            styles.mapPlanDot,
                            { backgroundColor: drop ? Theme.driverGold : Theme.driverEmerald },
                          ]}
                        />
                        <Text
                          style={[styles.mapPlanCaption, { color: drop ? Theme.driverGold : Theme.driverEmerald }]}
                          numberOfLines={1}
                        >
                          {caption}
                        </Text>
                        <Text
                          style={[styles.mapPlanPlace, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {place && place !== caption ? place : ""}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {activeMission || isAcceptedIncomingFlow ? (
              <TouchableOpacity
                onPress={openDeliveryDetails}
                accessibilityRole="button"
                accessibilityLabel="View delivery details"
                activeOpacity={0.88}
                style={[
                  styles.mapDetailsBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <FontAwesome name="cube" size={14} color={colors.emerald} />
                <Text style={[styles.mapDetailsBtnText, { color: colors.text }]}>
                  View details
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Route summary panel — readable pickup/drop addresses */}
            {showRouteSummary && (activeMission || effectiveFirstIncoming) ? (() => {
              const trip = (activeMission || effectiveFirstIncoming) as tripsService.TripRow;
              const routeDist =
                tripLegRoute?.distance != null
                  ? formatRoadDistanceM(tripLegRoute.distance)
                  : trip.distance != null && Number(trip.distance) > 0
                    ? `${Number(trip.distance)} km`
                    : "—";
              const routeEta =
                formatEtaFromRouteSeconds(tripLegRoute?.duration) ??
                (trip.estimated_duration
                  ? String(trip.estimated_duration)
                  : "—");
              return (
                <View
                  pointerEvents="box-none"
                  style={[
                    styles.routeSummaryPanel,
                    {
                      top: mapControlsTopInset(controlsVariant, insets.top),
                    },
                  ]}
                >
                  <Text style={[sheetStyles.sectionLabel, { color: colors.textMuted }]}>
                    TRIP ROUTE
                  </Text>
                  <TripDetailsStrip
                    statLeft={routeDist}
                    statRight={routeEta}
                    pickup={trip.pickup_area?.trim() || "—"}
                    dropoff={
                      (trip.drop_location || trip.drop_area)?.trim() || "—"
                    }
                    primaryTextColor={colors.text}
                    mutedTextColor={colors.textMuted}
                  />
                </View>
              );
            })() : null}
          </>
        ) : null}
      </View>
    );
  };

  const renderDriverDashboardTripInner = (mapSheet: boolean) => (
    <>
      {/* Only show separate OTP block when first pending OTP (non-roster) is not already the main assignment card */}
      {pendingOtpTripsRequiringOtp.length > 0 &&
        !(
          effectiveFirstIncoming &&
          pendingOtpTripsRequiringOtp[0]?.id === effectiveFirstIncoming.id
        ) && (
          <View
            style={[
              styles.centerCardWrap,
              styles.centerCardConstraint,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                marginBottom: 16,
              },
            ]}
          >
            <View
              style={[
                styles.offlineIconWrap,
                { backgroundColor: colors.emeraldMuted },
              ]}
            >
              <FontAwesome name="key" size={28} color={colors.emerald} />
            </View>
            <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
              Trip{pendingOtpTripsRequiringOtp.length > 1 ? "s" : ""} waiting
              for OTP
            </Text>
            <Text
              style={[
                styles.offlineCardSubtitle,
                { color: colors.textMuted, marginTop: 4 },
              ]}
            >
              Enter the OTP from your dispatcher in the app to claim{" "}
              {pendingOtpTripsRequiringOtp.length > 1 ? "them" : "it"}.
            </Text>
            <TouchableOpacity
              style={[
                styles.goOnlineBtn,
                { backgroundColor: colors.emerald, marginTop: 16 },
              ]}
              onPress={() => openOtpClaim(pendingOtpTripsRequiringOtp[0])}
              activeOpacity={0.8}
            >
              <FontAwesome
                name="key"
                size={16}
                color={Theme.textOnPrimary}
                style={styles.goOnlineBtnIcon}
              />
              <Text style={styles.goOnlineBtnText}>Enter OTP to claim</Text>
              <FontAwesome
                name="chevron-right"
                size={14}
                color={Theme.textOnPrimary}
              />
            </TouchableOpacity>
          </View>
        )}
      {pendingOtpTripsRequiringOtp.length > 0 &&
        !(
          effectiveFirstIncoming &&
          pendingOtpTripsRequiringOtp[0]?.id === effectiveFirstIncoming.id
        ) && (
          <View style={styles.centerCardConstraint}>
            {pendingOtpTripsRequiringOtp.map((trip) => (
              <View
                key={trip.id}
                style={[
                  styles.centerCardWrap,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    marginBottom: 12,
                  },
                ]}
              >
                <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
                  {trip.pickup_area?.trim() || "Pickup"} →{" "}
                  {trip.drop_location?.trim() || "Drop-off"}
                </Text>
                {otpClaimTripId != null &&
                String(otpClaimTripId).toLowerCase() ===
                  String(trip.id).toLowerCase() ? (
                  assignmentFeedback === "accepted" ? (
                    <View style={styles.feedbackBlock}>
                      <View
                        style={[
                          styles.feedbackIconWrap,
                          styles.feedbackIconWrapSuccess,
                          { backgroundColor: colors.emeraldMuted },
                        ]}
                      >
                        <FontAwesome
                          name="check-circle"
                          size={36}
                          color={colors.emerald}
                        />
                      </View>
                      <Text
                        style={[styles.feedbackTitle, { color: colors.text }]}
                      >
                        Trip booked
                      </Text>
                      <Text
                        style={[
                          styles.feedbackSubtitle,
                          { color: colors.textMuted },
                        ]}
                      >
                        Head to pickup. Continue below.
                      </Text>
                    </View>
                  ) : (
                    renderOtpClaimCard(trip, { showCancel: true })
                  )
                ) : (
                  <>
                    <Text
                      style={[
                        styles.offlineCardSubtitle,
                        { color: colors.textMuted, marginTop: 2 },
                      ]}
                    >
                      {getDriverTripDisplayNumber(trip, driverTripNumberById)}
                    </Text>
                    <Text
                      style={[
                        styles.offlineCardSubtitle,
                        { color: colors.textMuted, marginTop: 4 },
                      ]}
                    >
                      Aggregate trip reassigned by phone — accept and enter OTP
                      to claim.
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.goOnlineBtn,
                        {
                          backgroundColor: colors.emerald,
                          marginTop: 12,
                        },
                      ]}
                      onPress={() => openOtpClaim(trip)}
                      activeOpacity={0.8}
                    >
                      <FontAwesome
                        name="check"
                        size={14}
                        color={Theme.textOnPrimary}
                        style={styles.goOnlineBtnIcon}
                      />
                      <Text style={styles.goOnlineBtnText}>
                        Accept and enter OTP
                      </Text>
                      <FontAwesome
                        name="chevron-right"
                        size={14}
                        color={Theme.textOnPrimary}
                      />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ))}
          </View>
        )}
      {!effectiveDriver &&
        invites.filter((i) => i.status === "pending").length === 0 &&
        !showDriverTripDashboard &&
        !loading && (
        <View
          style={[
            styles.centerCardWrap,
            styles.noDriverWrap,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.offlineIconWrap,
              { backgroundColor: colors.whiteMuted },
            ]}
          >
            <FontAwesome
              name="envelope-open"
              size={40}
              color={colors.textMuted}
            />
          </View>
          <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
            No organisation linked
          </Text>
          <Text
            style={[styles.offlineCardSubtitle, { color: colors.textMuted }]}
          >
            Request an invitation from your organisation. Once accepted, your
            assigned trips will appear here.
          </Text>
        </View>
      )}
      {showDriverTripDashboard ? (
        activeMission ? (
          <>
            <DriverJobCard
              trip={activeMission}
              isFleetLinked={linkedDriversQuery.activeLinkedDrivers.some((row) => {
                const tripOrgId = String(activeMission.organization_id ?? "").trim();
                if (!tripOrgId || String(activeMission.source ?? "").trim() === "market_bid") {
                  return false;
                }
                if (String(row.organization_id ?? "").trim() !== tripOrgId) return false;
                if (row.tracking_only === true) return false;
                return driversService.isActiveFleetRelationshipDriver(row);
              })}
              commissionAmount={activeMissionCommission}
              assignedBy={activeFlowAssigner}
              distanceToTargetKm={distanceToTargetKmGlobal}
              driverLatitude={(driverMapPosition ?? truckPosition)?.latitude ?? null}
              driverLongitude={(driverMapPosition ?? truckPosition)?.longitude ?? null}
              driverLocationLabel={locationLabel}
              onRefresh={refreshDashboard}
              onTripUpdated={patchTripInDashboard}
              onRoutePlanMapChange={setRoutePlanMap}
              onShowRouteOnMap={handleViewTripPlan}
              deliveryDetailsNonce={deliveryDetailsNonce}
              onTripCompleted={() => {
                justCompletedTripRef.current = true;
                setSelectedIncomingTripId(null);
                setAssignableTripsNotifyOnlyAfterMission(true);
                void AsyncStorage.setItem(DRIVER_NOTIFY_ONLY_AFTER_MISSION_KEY, "1");
                persistPostMissionPendingSnapshot();
                if (uid) void invalidateDriverHome(uid);
              }}
              onBackToDashboard={async () => {
                acceptedTripIdClearTokenRef.current += 1;
                setAcceptedTripId(null);
                setSelectedIncomingTripId(null);
                setAssignmentFeedback(null);
                justCompletedTripRef.current = false;
                justClaimedTripIdRef.current = null;
                justClaimedOldTripIdRef.current = null;
                await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
                if (uid) void invalidateDriverHome(uid);
              }}
              {...(mapSheet
                ? {
                    edgeToEdge: true,
                    variant: "page" as const,
                    onOperationActiveChange: handleTripFlowOperationActiveChange,
                    collapsed: missionSheetCollapsed,
                    onToggleCollapse: expandMissionSheetFromPeek,
                  }
                : {})}
              onExpense={() => {
                router.push(ROUTES.tripOtherExpenseEntry(activeMission.id) as Href);
              }}
            />
          </>
        ) : effectiveFirstIncoming &&
          acceptedTripId &&
          String(effectiveFirstIncoming.id).toLowerCase() ===
            String(acceptedTripId).toLowerCase() ? (
          <>
            <DriverJobCard
              trip={effectiveFirstIncoming}
              isFleetLinked={incomingFleetLinked}
              commissionAmount={newAssignmentCommission}
              assignedBy={jobCardAssigner}
              distanceToTargetKm={distanceToTargetKmGlobal}
              driverLatitude={(driverMapPosition ?? truckPosition)?.latitude ?? null}
              driverLongitude={(driverMapPosition ?? truckPosition)?.longitude ?? null}
              driverLocationLabel={locationLabel}
              onRefresh={refreshDashboard}
              onTripUpdated={patchTripInDashboard}
              onRoutePlanMapChange={setRoutePlanMap}
              onShowRouteOnMap={handleViewTripPlan}
              deliveryDetailsNonce={deliveryDetailsNonce}
              onTripCompleted={() => {
                justCompletedTripRef.current = true;
                setSelectedIncomingTripId(null);
                setAssignableTripsNotifyOnlyAfterMission(true);
                void AsyncStorage.setItem(DRIVER_NOTIFY_ONLY_AFTER_MISSION_KEY, "1");
                persistPostMissionPendingSnapshot();
                if (uid) void invalidateDriverHome(uid);
              }}
              onBackToDashboard={async () => {
                acceptedTripIdClearTokenRef.current += 1;
                setAcceptedTripId(null);
                setSelectedIncomingTripId(null);
                setAssignmentFeedback(null);
                justCompletedTripRef.current = false;
                justClaimedTripIdRef.current = null;
                justClaimedOldTripIdRef.current = null;
                await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
                if (uid) void invalidateDriverHome(uid);
              }}
              {...(mapSheet
                ? {
                    edgeToEdge: true,
                    variant: "page" as const,
                    onOperationActiveChange: handleTripFlowOperationActiveChange,
                    collapsed: missionSheetCollapsed,
                    onToggleCollapse: expandMissionSheetFromPeek,
                  }
                : {})}
              onExpense={() => {
                router.push(
                  ROUTES.tripOtherExpenseEntry(effectiveFirstIncoming.id) as Href,
                );
              }}
            />
          </>
        ) : assignmentFeedback === "accepted" ? (
          <View style={styles.feedbackBlock}>
            <View
              style={[
                styles.feedbackIconWrap,
                styles.feedbackIconWrapSuccess,
                { backgroundColor: colors.emeraldMuted },
              ]}
            >
              <FontAwesome
                name="check-circle"
                size={36}
                color={colors.emerald}
              />
            </View>
            <Text style={[styles.feedbackTitle, { color: colors.text }]}>
              Trip booked
            </Text>
            <Text
              style={[styles.feedbackSubtitle, { color: colors.textMuted }]}
            >
              Head to pickup. Continue below.
            </Text>
          </View>
        ) : assignmentFeedback === "declined" ? (
          <View style={styles.feedbackBlock}>
            <View
              style={[
                styles.feedbackIconWrap,
                styles.feedbackIconWrapSkipped,
                { backgroundColor: colors.whiteMuted },
              ]}
            >
              <FontAwesome
                name="times-circle"
                size={36}
                color={colors.textMuted}
              />
            </View>
            <Text style={[styles.feedbackTitle, { color: colors.text }]}>
              Skipped
            </Text>
            <Text
              style={[styles.feedbackSubtitle, { color: colors.textMuted }]}
            >
              Looking for your next trip.
            </Text>
          </View>
        ) : !isOnline && !hasIncomingTrip && !mergedIncomingTrips.length ? (
          <View style={[styles.centerCardWrap, styles.offlineCardContent]}>
            <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
              You are currently offline
            </Text>
            <Text
              style={[styles.offlineCardSubtitle, { color: colors.textMuted }]}
            >
              Go online to view and accept trip assignments.
            </Text>
            <TouchableOpacity
              style={[
                styles.searchOfflineBtn,
                {
                  marginTop: 12,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => {
                setIsOnline(true);
                triggerSuccess("You are online now.");
                if (uid) void invalidateDriverHome(uid);
                setLocationStatus("loading");
                fetchLocation();
                if (driver?.organization_id && driver?.id) {
                  void driversService
                    .updateDriver(driver.organization_id, driver.id, {
                      status: "online",
                    })
                    .then(({ error }) => {
                      if (error) {
                        setIsOnline(false);
                        setAcceptError(
                          "Could not go online. Check connection and retry.",
                        );
                      }
                    })
                    .catch(() => {
                      setIsOnline(false);
                      setAcceptError(
                        "Could not go online. Check connection and retry.",
                      );
                    });
                }
              }}
              activeOpacity={0.8}
            >
              <FontAwesome name="wifi" size={16} color={colors.text} />
              <Text
                style={[styles.searchOfflineBtnText, { color: colors.text }]}
              >
                Go online
              </Text>
            </TouchableOpacity>
          </View>
        ) : otpClaimTrip ? (
          renderOtpClaimCard(otpClaimTrip, { showCancel: true })
        ) : assignableTripsNotifyOnlyAfterMission &&
          hasAssignableIncomingTrip &&
          !isOnline ? (
            <View style={[styles.centerCardWrap, styles.offlineCardContent]}>
              <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
                You are currently offline
              </Text>
              <Text
                style={[styles.offlineCardSubtitle, { color: colors.textMuted }]}
              >
                Go online when you are ready for your next assignment.
              </Text>
              <TouchableOpacity
                style={[
                  styles.searchOfflineBtn,
                  {
                    marginTop: 12,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  setIsOnline(true);
                  triggerSuccess("You are online now.");
                  if (uid) void invalidateDriverHome(uid);
                  setLocationStatus("loading");
                  fetchLocation();
                  if (driver?.organization_id && driver?.id) {
                    void driversService
                      .updateDriver(driver.organization_id, driver.id, {
                        status: "online",
                      })
                      .then(({ error }) => {
                        if (error) {
                          setIsOnline(false);
                          setAcceptError(
                            "Could not go online. Check connection and retry.",
                          );
                        }
                      })
                      .catch(() => {
                        setIsOnline(false);
                        setAcceptError(
                          "Could not go online. Check connection and retry.",
                        );
                      });
                  }
                }}
                activeOpacity={0.8}
              >
                <FontAwesome name="wifi" size={16} color={colors.text} />
                <Text
                  style={[styles.searchOfflineBtnText, { color: colors.text }]}
                >
                  Go online
                </Text>
              </TouchableOpacity>
            </View>
        ) : showNewAssignmentCard &&
          effectiveFirstIncoming &&
          !assignmentFeedback ? (
          <>
            {incomingAssignmentQueueMeta ? (
              <Text
                style={[
                  styles.offlineCardSubtitle,
                  {
                    color: colors.textMuted,
                    textAlign: "center",
                    marginBottom: 10,
                    paddingHorizontal: 8,
                  },
                ]}
              >
                Queue (oldest first): {incomingAssignmentQueueMeta.position} of{" "}
                {incomingAssignmentQueueMeta.total} — next up is the earliest
                assignment.
              </Text>
            ) : null}
            <JobRequestCard
            assignmentId={String(effectiveFirstIncoming.id)}
            pickup={effectiveFirstIncoming.pickup_area?.trim() || "—"}
            dropoff={effectiveFirstIncoming.drop_location?.trim() || "—"}
            distance={(() => {
              const d = effectiveFirstIncoming.distance;
              const dNum =
                d != null ? parseFloat(String(d).replace(/[^0-9.]/g, "")) : NaN;
              if (!Number.isNaN(dNum) && dNum > 0) return formatTripDistance(d);
              if (tripLegRouteLoading) return "...";
              if (tripLegRoute && "distance" in tripLegRoute)
                return formatTripDistance(tripLegRoute.distance / 1000);
              return "—";
            })()}
            eta={(() => {
              const e = effectiveFirstIncoming.estimated_duration;
              if (
                e != null &&
                String(e).trim() !== "" &&
                !String(e).includes("00:00:00")
              )
                return formatEstimatedDuration(e);
              if (tripLegRouteLoading) return "...";
              if (tripLegRoute && "duration" in tripLegRoute) {
                const dur = tripLegRoute.duration;
                return formatEstimatedDuration(
                  dur >= 3600
                    ? `${Math.floor(dur / 3600)}H ${Math.round((dur % 3600) / 60)}M`
                    : `${Math.round(dur / 60)}M`,
                );
              }
              return "—";
            })()}
            earnings={
              (selectedIncomingMeta?.commissionForTrip ?? 0) > 0
                ? formatINR(selectedIncomingMeta?.commissionForTrip ?? 0)
                : DRIVER_PAY_NA_AMOUNT
            }
            earningsLabel={
              (selectedIncomingMeta?.commissionForTrip ?? 0) > 0
                ? "EST. EARNINGS"
                : DRIVER_PAY_NA_LABEL
            }
            onAccept={() => handleAcceptMission(effectiveFirstIncoming)}
            onDecline={() => handleDeclineAssignment(effectiveFirstIncoming.id)}
            onViewTripPlan={handleViewTripPlan}
            tripPlanAvailable={Boolean(routePlanMap && routePlanMap.stops.length > 0)}
            requireOtp={firstIncomingRequiresOtp}
            disabled={acceptLoading || declineLoading}
            earningsAmountColor={jobRequestSheetPrimary}
            primaryTextColor={jobRequestSheetPrimary}
            mutedTextColor={jobRequestSheetMuted}
            accentColor={colors.emerald}
            errorMessage={acceptError}
            otpMode={
              otpClaimTripId != null &&
              String(otpClaimTripId).toLowerCase() ===
                String(effectiveFirstIncoming.id).toLowerCase()
            }
            otpValue={otpValue}
            onOtpChange={(value) => {
              setOtpValue(value);
              setOtpError(null);
            }}
            onOtpSubmit={handleSubmitOtpClaim}
            otpSubmitting={otpSubmitting}
            otpError={otpError}
            onOtpCancel={closeOtpClaim}
            edgeToEdge={mapSheet}
            variant={mapSheet ? "page" : "card"}
            assignedBy={jobCardAssigner}
            assignedByLine={assignerLineForJobCard}
            onAssignerPress={
              canTagOfflineParty && incomingIsOfflineParty
                ? () => {
                    router.push(
                      ROUTES.driverAddClient({
                        tripId: String(effectiveFirstIncoming.id),
                        partyName:
                          jobCardAssigner?.orgName?.trim() ||
                          jobCardAssigner?.linePrimary?.trim() ||
                          undefined,
                      }) as Href,
                    );
                  }
                : undefined
            }
            OtpInputComponent={mapSheet ? OtpInputComponent : undefined}
            onOtpFocus={
              mapSheet
                ? () => {
                    snapSheetToIndex(2);
                  }
                : undefined
            }
            otpKeyboardInset={mapSheet ? otpKeyboardInset : 0}
          />
          </>
        ) : showNotifyOnlyAssignmentsHint ? (
          <View
            style={[
              styles.centerCardWrap,
              styles.centerCardConstraint,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                paddingVertical: 20,
                paddingHorizontal: 18,
              },
            ]}
          >
            <Text style={[styles.offlineCardTitle, { color: colors.text, textAlign: "center" }]}>
              Assignments waiting
            </Text>
            <Text
              style={[
                styles.offlineCardSubtitle,
                {
                  color: colors.textMuted,
                  textAlign: "center",
                  marginTop: 10,
                },
              ]}
            >
              {visibleAssignableIncomingTripsFcfs.length > 1
                ? "Several trips are waiting (oldest first in queue). Open Notifications to pick one, or resume to show the next assignment on the dashboard."
                : "Your next assignment is paused on the dashboard after your last trip. Open Notifications, or resume here to accept it."}
            </Text>
            {assignableTripsNotifyOnlyAfterMission ? (
              <TouchableOpacity
                style={[
                  styles.goOnlineBtn,
                  { backgroundColor: colors.emerald, marginTop: 16, width: "100%" },
                ]}
                onPress={() => {
                  clearNotifyOnlyAfterMission();
                  if (visibleAssignableIncomingTripsFcfs.length > 1) {
                    const first = visibleAssignableIncomingTripsFcfs[0];
                    if (first?.id) setSelectedIncomingTripId(String(first.id));
                  }
                  triggerSuccess("Assignments shown on dashboard.");
                }}
                activeOpacity={0.88}
              >
                <FontAwesome name="th-large" size={16} color={Theme.textOnPrimary} />
                <Text style={styles.goOnlineBtnText}>Resume on dashboard</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.searchOfflineBtn,
                {
                  marginTop: 10,
                  width: "100%",
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => router.push("/(driver)/notifications")}
              activeOpacity={0.88}
            >
              <FontAwesome name="bell" size={16} color={colors.text} />
              <Text style={[styles.searchOfflineBtnText, { color: colors.text }]}>
                Open notifications
              </Text>
            </TouchableOpacity>
          </View>
        ) : showSearchingOverlay ? (
          <View style={styles.driverSearchingEmptyWrap}>
            <View style={styles.driverSearchingEmptyContent}>
              <View style={styles.driverSearchingVisualWrap}>
                <Animated.View
                  style={[
                    styles.driverSearchingRingOuter,
                    {
                      backgroundColor: colors.emerald,
                      opacity: searchPulseAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.05, 0.15, 0.05],
                      }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.driverSearchingRingMid,
                    {
                      backgroundColor: colors.emerald,
                      opacity: searchPulseAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.1, 0.25, 0.1],
                      }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.driverSearchingRingInner,
                    {
                      backgroundColor: colors.emerald,
                      opacity: searchPulseAnim.interpolate({
                        inputRange: [0, 0.6, 1],
                        outputRange: [0.2, 0.5, 0.2],
                      }),
                    },
                  ]}
                />
                <View
                  style={[
                    styles.driverSearchingVisualInner,
                    { backgroundColor: colors.emerald },
                  ]}
                >
                  <FontAwesome name="truck" size={40} color={colors.surface} />
                  <View style={styles.driverSearchingDots}>
                    <View
                      style={[
                        styles.driverSearchingDot,
                        { backgroundColor: colors.surface },
                      ]}
                    />
                    <View
                      style={[
                        styles.driverSearchingDot,
                        { backgroundColor: colors.surface, opacity: 0.7 },
                      ]}
                    />
                    <View
                      style={[
                        styles.driverSearchingDot,
                        { backgroundColor: colors.surface, opacity: 0.4 },
                      ]}
                    />
                  </View>
                </View>
              </View>

              <Text
                style={[styles.driverSearchingTitle, { color: colors.text }]}
              >
                No trips available
              </Text>
              <Text
                style={[
                  styles.driverSearchingSubtitle,
                  { color: colors.textMuted, marginTop: 8 },
                ]}
              >
                We’re looking for trips in your area.
              </Text>

              <TouchableOpacity
                style={[
                  styles.searchOfflineBtn,
                  {
                    marginTop: 18,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={handleSetOffline}
                activeOpacity={0.8}
              >
                <FontAwesome name="power-off" size={16} color={colors.text} />
                <Text
                  style={[styles.searchOfflineBtnText, { color: colors.text }]}
                >
                  Go offline
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.centerCardWrap, styles.offlineCardContent]}>
            <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
              {isOnline ? "Ready for the next trip" : "You are currently offline"}
            </Text>
            <Text
              style={[styles.offlineCardSubtitle, { color: colors.textMuted }]}
            >
              {isOnline
                ? "Assignments will show here when they arrive."
                : "Go online to view and accept trip assignments."}
            </Text>
            {!isOnline ? (
              <TouchableOpacity
                style={[
                  styles.searchOfflineBtn,
                  {
                    marginTop: 12,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  setIsOnline(true);
                  triggerSuccess("You are online now.");
                  if (uid) void invalidateDriverHome(uid);
                  setLocationStatus("loading");
                  fetchLocation();
                }}
                activeOpacity={0.8}
              >
                <FontAwesome name="wifi" size={16} color={colors.text} />
                <Text
                  style={[styles.searchOfflineBtnText, { color: colors.text }]}
                >
                  Go online
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )
      ) : null}
    </>
  );

  return (
    <View
      style={[
        styles.container,
        {
          // Keep a solid screen background behind the footer tabs (matches other driver pages).
          // The map itself still renders on top; this only prevents "transparent" gaps showing through.
          backgroundColor: colors.background,
        },
      ]}
    >
      {showSuccess ? (
        <View
          style={[
            styles.toast,
            {
              top: insets.top + 12,
              alignSelf: "center",
              backgroundColor: Theme.buttonDark,
            },
          ]}
          pointerEvents="none"
        >
          <FontAwesome name="location-arrow" size={14} color={Theme.buttonDarkText} />
          <Text
            style={[styles.toastText, { color: Theme.buttonDarkText }]}
            numberOfLines={2}
          >
            {toastMessage}
          </Text>
        </View>
      ) : null}

      {/* When the map is visible, the footer dock is semi-transparent.
          Add a solid backdrop behind the footer so the map doesn't show through. */}
      {shouldShowMap ? (
        <View
          pointerEvents="none"
          style={[
            styles.tabBarBackdrop,
            {
              height: driverTabBarClearance,
              backgroundColor: colors.background,
              zIndex: 999,
            },
          ]}
        />
      ) : null}

      {/* Ola-style persistent Operations Panel (bottom sheet) */}
      {shouldShowMap ? (
        <GestureHandlerRootView style={styles.olaDriverRoot}>
          <KeyboardAvoidingView
            style={styles.olaDriverKeyboardAvoid}
            behavior={
              Platform.OS === "ios"
                ? "padding"
                : Platform.OS === "android"
                  ? "padding"
                  : undefined
            }
            keyboardVerticalOffset={
              Platform.OS === "ios" ? insets.top + 12 : 0
            }
          >
            {/* Common Header for Map Mode */}
            {(showNewAssignmentCard ||
              activeMission ||
              (effectiveFirstIncoming &&
                String(effectiveFirstIncoming.id).toLowerCase() ===
                  String(acceptedTripId ?? "").toLowerCase())) && (
              <DriverHeader
                colors={colors}
                avatarUri={avatarUri}
                driverName={driverName}
                isOnline
                variant="assigned"
                style={[
                  styles.assignedStaticHeader,
                  {
                    paddingTop: insets.top + 20,
                    paddingBottom: 12,
                    paddingHorizontal: 20,
                    backgroundColor: colors.surface,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                ]}
              />
            )}

            {shouldShowMap &&
              !showNewAssignmentCard &&
              (activeMission ||
                (effectiveFirstIncoming &&
                  effectiveFirstIncoming.id === acceptedTripId)) && (
                <DriverHeader
                  colors={colors}
                  avatarUri={avatarUri}
                  driverName={driverName}
                  isOnline
                  variant="assigned"
                  style={[
                    styles.assignedStaticHeader,
                    {
                      paddingTop: insets.top + 20,
                      paddingBottom: 12,
                      paddingHorizontal: 20,
                      backgroundColor: colors.surface,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                  ]}
                />
              )}

            {/* Do not wrap MapView in TouchableWithoutFeedback — it steals the responder
                and prevents pan/pinch on the map. Dismiss keyboard via BottomSheet onChange. */}
            <View style={styles.olaMapDismissArea} pointerEvents="box-none">
              {renderDriverMap(mapRef, {
                fullScreen: true,
                controlsVariant: "embedded",
              })}
            </View>

            <BottomSheet
              snapPoints={sheetSnapPoints}
              index={
                canPeekSheetForMap
                  ? missionSheetIndex
                  : sheetSnapPoints.length === 1
                    ? 0
                    : shouldUseStaticMapSheetCard
                      ? 0
                      : 1
              }
              animatedPosition={missionSheetAnimatedPosition}
              enablePanDownToClose={false}
              enableHandlePanningGesture={
                !shouldUseStaticMapSheetCard || canPeekSheetForMap
              }
              enableContentPanningGesture={
                !shouldUseStaticMapSheetCard || canPeekSheetForMap
              }
              enableOverDrag={
                !shouldUseStaticMapSheetCard || canPeekSheetForMap
              }
              enableDynamicSizing={
                shouldUseStaticMapSheetCard && !canPeekSheetForMap
              }
              maxDynamicContentSize={sheetMaxDynamicContentSize}
              ref={bottomSheetRef}
              keyboardBehavior={otpClaimTripId ? "extend" : "interactive"}
              keyboardBlurBehavior="restore"
              android_keyboardInputMode="adjustResize"
              onChange={(index) => {
                if (canPeekSheetForMap && index >= 0) {
                  setMissionSheetIndex(index);
                }
                // Only dismiss keyboard if we're snapping to a very low point or closing
                if (index <= 0 && !shouldUseStaticMapSheetCard) {
                  Keyboard.dismiss();
                }
              }}
              bottomInset={driverSheetBottomInset}
              // No gray handle chrome — mission card green hero is the sheet top
              // again (drag via content pan / card surface).
              handleComponent={
                shouldUseStaticMapSheetCard || canPeekSheetForMap
                  ? () => null
                  : undefined
              }
              backgroundStyle={{
                backgroundColor: colors.surface,
                borderTopLeftRadius:
                  shouldUseStaticMapSheetCard || canPeekSheetForMap
                    ? 28
                    : 28,
                borderTopRightRadius:
                  shouldUseStaticMapSheetCard || canPeekSheetForMap
                    ? 28
                    : 28,
                overflow: "hidden",
              }}
              handleIndicatorStyle={{
                backgroundColor: "transparent",
                width: 50,
                height: 0,
                borderRadius: 999,
              }}
            >
              {shouldUseStaticMapSheetCard ? (
                /**
                 * Scroll view (not BottomSheetView): the active-mission card can
                 * be taller than the sheet. In a fixed view the overflow renders
                 * outside the sheet's touchable bounds, so the LR view/delete
                 * icons never receive taps. Scrolling keeps every row hittable.
                 */
                <BottomSheetScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.olaSheetContent,
                    {
                      paddingBottom: 8,
                      paddingHorizontal: 0,
                      // Fill the snap so the map does not show through under a short card.
                      flexGrow: 1,
                      backgroundColor: colors.surface,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.assignedSheetContent,
                      {
                        flexGrow: 1,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    onLayout={(e) => {
                      const h = Math.round(e.nativeEvent.layout.height);
                      // Don't let peek height overwrite the expanded measure used for snap #1.
                      if (missionSheetCollapsed && h < 140) return;
                      if (h > 160) expandedSheetHeightRef.current = h;
                      setMeasuredSheetHeight((prev) =>
                        Math.abs(prev - h) > 2 ? h : prev,
                      );
                    }}
                  >
                    {showDeferredInviteCard && pendingInvite ? (
                      <DriverInviteCard
                        invite={pendingInvite}
                        colors={colors}
                        offerText={buildOfferText(pendingInvite)}
                        busy={inviteActionId === pendingInvite.id}
                        fallbackAvatarUri={avatarUri}
                        onClose={() => setInvitationDismissed(true)}
                        onIgnore={async () => {
                          setInviteActionId(pendingInvite.id);
                          await driversService.rejectDriverInvite(
                            pendingInvite.id,
                          );
                          setInviteActionId(null);
                          setInvitationDeclined(true);
                          if (uid) void invalidateDriverHome(uid);
                        }}
                        onAccept={async () => {
                          setInviteActionId(pendingInvite.id);
                          const { error } =
                            await driversService.acceptDriverInvite(
                              pendingInvite.id,
                            );
                          setInviteActionId(null);
                          if (!error) {
                            setInvitationAccepted(true);
                            if (uid) void invalidateDriverHome(uid);
                          }
                        }}
                      />
                    ) : null}
                    {tripsSyncing && !assignmentFeedback ? (
                      <ActivityIndicator
                        style={{ marginTop: 20 }}
                        size="large"
                        color={colors.primary}
                      />
                    ) : (
                      <View style={{ paddingTop: 0 }}>
                        {renderDriverDashboardTripInner(true)}
                      </View>
                    )}
                  </View>
                </BottomSheetScrollView>
              ) : (
                <BottomSheetScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.olaSheetContent,
                    {
                      paddingBottom:
                        insets.bottom +
                        (otpClaimTripId ? otpKeyboardInset : 0),
                      paddingHorizontal: Layout.screenPaddingHorizontal,
                    },
                  ]}
                >
                  <View style={styles.assignedSheetContent}>
                    {showDeferredInviteCard && pendingInvite ? (
                      <DriverInviteCard
                        invite={pendingInvite}
                        colors={colors}
                        offerText={buildOfferText(pendingInvite)}
                        busy={inviteActionId === pendingInvite.id}
                        fallbackAvatarUri={avatarUri}
                        onClose={() => setInvitationDismissed(true)}
                        onIgnore={async () => {
                          setInviteActionId(pendingInvite.id);
                          await driversService.rejectDriverInvite(
                            pendingInvite.id,
                          );
                          setInviteActionId(null);
                          setInvitationDeclined(true);
                          if (uid) void invalidateDriverHome(uid);
                        }}
                        onAccept={async () => {
                          setInviteActionId(pendingInvite.id);
                          const { error } =
                            await driversService.acceptDriverInvite(
                              pendingInvite.id,
                            );
                          setInviteActionId(null);
                          if (!error) {
                            setInvitationAccepted(true);
                            if (uid) void invalidateDriverHome(uid);
                          }
                        }}
                      />
                    ) : null}
                    {tripsSyncing && !assignmentFeedback ? (
                      <ActivityIndicator
                        style={{ marginTop: 20 }}
                        size="large"
                        color={colors.primary}
                      />
                    ) : (
                      <View style={{ paddingTop: 8 }}>
                        {renderDriverDashboardTripInner(true)}
                      </View>
                    )}
                  </View>
                </BottomSheetScrollView>
              )}
            </BottomSheet>

            {(activeMission?.id ||
              (effectiveFirstIncoming &&
                acceptedTripId &&
                String(effectiveFirstIncoming.id).toLowerCase() ===
                  String(acceptedTripId).toLowerCase())) ? (
              <DriverExpenseCaptureFab
                animatedSheetTop={missionSheetAnimatedPosition}
                onPress={() => {
                  const tripId =
                    activeMission?.id ?? effectiveFirstIncoming?.id ?? null;
                  if (!tripId) return;
                  router.push(ROUTES.tripOtherExpenseEntry(tripId) as Href);
                }}
              />
            ) : null}
          </KeyboardAvoidingView>
        </GestureHandlerRootView>
      ) : null}

      <Modal
        visible={isFullMapVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsFullMapVisible(false)}
      >
        <View
          style={[styles.fullMapModal, { backgroundColor: colors.background }]}
        >
          {renderDriverMap(fullMapRef, { fullScreen: true })}
          <View
            style={[styles.fullMapCloseWrap, { top: insets.top + 10 }]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={[
                styles.mapTopIconBtn,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => setIsFullMapVisible(false)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Close map"
              hitSlop={Layout.touchTargetHitSlop}
            >
              <FontAwesome name="times" size={16} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {!showNewAssignmentCard && !shouldShowMap && (
        <>
          <View style={[styles.assignedStaticHeader]}>
            <View style={styles.assignedStaticHeaderContent}>
              <DriverHeader
                colors={colors}
                avatarUri={avatarUri}
                driverName={driverName}
                isOnline={isOnline}
                onPressOtpClaim={handleOpenOtpClaimFromHeader}
              />
              {driver?.organization_id ? (
                <TouchableOpacity
                  style={[
                    styles.dashboardLocationBadge,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={async () => {
                    try {
                      const expoLocation = await getExpoLocation();
                      if (!expoLocation) return;
                      const { status } =
                        await expoLocation.getForegroundPermissionsAsync();
                      if (status !== "granted") return;
                      const pos = await expoLocation.getCurrentPositionAsync(
                        {},
                      );
                      const { latitude, longitude } = pos.coords;
                      const acc = pos.coords.accuracy ?? null;
                      await reportLocationToDb(
                        activeMission?.id ?? null,
                        latitude,
                        longitude,
                        acc,
                        "tap",
                      );
                    } catch {
                      // ignore
                    }
                  }}
                  activeOpacity={0.8}
                  accessibilityLabel="Report location"
                  accessibilityHint="Tap to send your current location to the server"
                >
                  <FontAwesome
                    name="map-marker"
                    size={14}
                    color={
                      locationStatus === "success"
                        ? colors.emerald
                        : locationStatus === "error"
                          ? Theme.negative
                          : colors.textMuted
                    }
                    style={styles.locationStatusIcon}
                  />
                  <Text
                    style={[
                      styles.dashboardLocationBadgeText,
                      { color: colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {locationStatus === "success"
                      ? (locationLabel ?? "Current location")
                      : locationStatus === "error"
                        ? "Location not found"
                        : "Fetching location..."}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {showDeferredInviteCard && pendingInvite ? (
                <DriverInviteCard
                  invite={pendingInvite}
                  colors={colors}
                  offerText={buildOfferText(pendingInvite)}
                  busy={inviteActionId === pendingInvite.id}
                  fallbackAvatarUri={avatarUri}
                  onClose={() => setInvitationDismissed(true)}
                  onIgnore={async () => {
                    setInviteActionId(pendingInvite.id);
                    await driversService.rejectDriverInvite(pendingInvite.id);
                    setInviteActionId(null);
                    setInvitationDeclined(true);
                    if (uid) void invalidateDriverHome(uid);
                  }}
                  onAccept={async () => {
                    setInviteActionId(pendingInvite.id);
                    const { error } = await driversService.acceptDriverInvite(
                      pendingInvite.id,
                    );
                    setInviteActionId(null);
                    if (!error) {
                      setInvitationAccepted(true);
                      if (uid) void invalidateDriverHome(uid);
                    }
                  }}
                />
              ) : null}
            </View>
          </View>

          <View
            style={[
              styles.content,
              {
                paddingHorizontal: 20,
                // Header is absolutely positioned; reserve vertical space so
                // dashboard cards start below the location badge.
                paddingTop: driver?.organization_id ? 108 : 84,
                backgroundColor: shouldShowMap
                  ? "transparent"
                  : colors.background,
              },
            ]}
          >
            {loading && !assignmentFeedback ? (
              <AppLoadingSplash
                variant="preparing"
                accentColor={colors.primary}
                style={{ flex: 1, minHeight: 280, width: "100%", alignSelf: "stretch" }}
              />
            ) : (
              <ScrollView
                style={styles.tripsScroll}
                contentContainerStyle={[
                  styles.tripsScrollContent,
                  { paddingBottom: driverTabBarClearance },
                  // When map is showing and we're rendering the single in-progress trip card,
                  // keep it anchored near the footer (same feel as accept-card overlay).
                  shouldShowMap &&
                    activeMission &&
                    styles.tripsScrollContentBottom,
                  !driver && styles.tripsScrollContentCentered,
                  driver &&
                    (!isOnline || showSearchingOverlay) &&
                    !hasAssignableIncomingTrip &&
                    styles.tripsScrollContentCentered,
                ]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor={colors.emerald}
                  />
                }
              >
                {showDashboardMapPreview ? (
                  <DriverDashboardMapPreview
                    center={
                      driverMapPosition ?? {
                        latitude: DEFAULT_MAP_REGION.latitude,
                        longitude: DEFAULT_MAP_REGION.longitude,
                      }
                    }
                    avatarUri={avatarUri}
                    avatarSeed={driverAvatarSeed}
                    isOnline={isOnline}
                    borderColor={colors.border}
                    surfaceColor={colors.surface}
                    textColor={colors.text}
                    textMuted={colors.textMuted}
                    locationLabel={locationLabel}
                    onPressExpand={() => setIsFullMapVisible(true)}
                  />
                ) : null}
                <PilotRelationshipSummary uid={uid} />
                <DriverDailySummaryCard uid={uid} />
                {renderDriverDashboardTripInner(false)}
              </ScrollView>
            )}
          </View>
        </>
      )}
      <ThemedConfirmModal
        variant="warning"
        confirmVariant="destructive"
        visible={declineConfirmTripId != null}
        title={DECLINE_WARNING_TITLE}
        message={DECLINE_WARNING_MSG}
        confirmText="Decline trip"
        onCancel={() => setDeclineConfirmTripId(null)}
        onConfirm={() => {
          const tripId = declineConfirmTripId;
          setDeclineConfirmTripId(null);
          if (tripId) void runDeclineTrip(tripId);
        }}
      />
      <ThemedAlertModal
        variant="warning"
        visible={declineErrorMessage != null}
        title="Decline failed"
        message={declineErrorMessage ?? "Could not decline. Try again."}
        onOk={() => setDeclineErrorMessage(null)}
      />
    </View>
  );
}

const styles = withWebSafeShadows(
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.driverBackground,
  },
  driverSearchingEmptyWrap: {
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 0,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  driverSearchingEmptyContent: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },
  driverSearchingVisualWrap: {
    width: 280,
    height: 280,
    borderRadius: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    overflow: "visible",
    position: "relative",
  },
  driverSearchingRingOuter: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    left: 0,
    top: 0,
  },
  driverSearchingRingMid: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    left: (280 - 200) / 2,
    top: (280 - 200) / 2,
  },
  driverSearchingRingInner: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    left: (280 - 140) / 2,
    top: (280 - 140) / 2,
  },
  driverSearchingVisualInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  driverSearchingDots: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  driverSearchingDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  driverSearchingTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  driverSearchingSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  // Ola-style layout: full-screen map + persistent bottom sheet.
  olaDriverRoot: {
    flex: 1,
    minHeight: 0,
  },
  classicDashboardScroll: {
    flex: 1,
  },
  classicDashboardContent: {
    flexGrow: 1,
    paddingTop: 16,
  },
  olaDriverKeyboardAvoid: {
    flex: 1,
    minHeight: 0,
  },
  olaMapDismissArea: {
    flex: 1,
    minHeight: 0,
  },
  olaSheetContent: {
    paddingHorizontal: 0,
    flexGrow: 1,
  },
  searchOfflineBtn: {
    marginTop: 20,
    minHeight: Layout.minTouchTargetSize,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  searchOfflineBtnText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  toast: {
    position: "absolute",
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  toastText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    letterSpacing: 0.5,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginTop: 4,
    maxWidth: "80%",
    flexShrink: 1,
  },
  locationStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  locationStatusIcon: {
    alignSelf: "center",
  },
  locationText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  locationValueText: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.2,
    marginLeft: 6,
    flexShrink: 1,
  },
  tripsScroll: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    minWidth: 0,
  },
  tripsScrollContent: {
    flexGrow: 1,
    paddingTop: 16,
  },
  tripsScrollContentBottom: {
    justifyContent: "flex-end",
    paddingTop: 0,
  },
  tripsScrollContentCentered: {
    flexGrow: 1,
    justifyContent: "center",
  },
  offlineCardCentered: {
    alignSelf: "center",
  },
  centerCardWrap: {
    width: "100%",
    marginBottom: 16,
    alignSelf: "center", // Add this for proper centering
  },
  centerCardConstraint: {
    width: "100%",
    alignSelf: "center",
  },
  notificationListSection: {
    marginTop: 6,
  },
  notificationViewAllLinkWrap: {
    alignSelf: "center",
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  notificationViewAllLinkText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
    textDecorationLine: "underline",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 0,
  },
  locationBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
    backgroundColor: Theme.driverWhiteMuted,
  },
  locationBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
    lineHeight: 13,
    flexShrink: 1,
  },
  noDriverWrap: {
    width: "100%",
    maxWidth: 400, // Add max width for better layout
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    alignSelf: "center", // Add this for proper centering
  },
  invitesScroll: { width: "100%" },
  invitesScrollContent: { paddingTop: 8, paddingBottom: 12, gap: 14 },
  invitesTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: Theme.driverEmerald,
    marginBottom: 4,
  },
  invitesSubtitle: {
    fontSize: 11,
    color: Theme.textMuted,
    textAlign: "center",
    marginBottom: 20,
  },
  notificationListIntro: {
    marginBottom: 2,
  },
  notificationListHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  notificationListTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  notificationListSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  notificationSelectCard: {
    width: "100%",
    alignSelf: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  notificationSelectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  notificationSelectTripId: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  notificationOtpBadgeMinimal: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  notificationOtpBadgeMinimalText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  notificationSelectRoute: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  notificationAssignedByLine: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  notificationAssignedByPrefix: {
    fontWeight: "400",
  },
  notificationAssignedByName: {
    fontWeight: "600",
  },
  notificationSelectMeta: {
    fontSize: 12,
    fontWeight: "400",
  },
  notificationSelectFooter: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  notificationSelectActionTextMuted: {
    fontSize: 13,
    fontWeight: "500",
  },
  notificationHistoryHint: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "500",
  },
  notificationHistoryWrap: {
    marginTop: 8,
    gap: 4,
  },
  notificationHistoryItem: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "500",
  },
  inviteCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
  },
  inviteCloseBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  inviteCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  inviteAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  inviteAvatarImg: {
    width: "100%",
    height: "100%",
  },
  inviteOrgInfo: {
    flex: 1,
  },
  inviteOrgNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inviteOrgName: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  inviteVerifiedBadge: {
    backgroundColor: "#E6F4EA",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inviteVerifiedText: {
    color: "#137333",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  inviteOrgStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  inviteOrgStatsText: {
    fontSize: 12,
    fontWeight: "600",
  },
  inviteOrgStatsDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.textMuted,
    marginHorizontal: 6,
    opacity: 0.5,
  },
  inviteOffer: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 16,
  },
  inviteActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  inviteOfferBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  inviteOfferText: {
    fontSize: 12,
    fontWeight: "700",
  },
  inviteActionBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inviteRejectBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteRejectBtnText: { fontSize: 13, fontWeight: "700" },
  inviteAcceptBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#3B82F6",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
        }
      : { elevation: 4 }),
  },
  inviteAcceptBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  inviteBtnDisabled: { opacity: 0.6 },
  activeMissionWrap: {
    alignSelf: "stretch",
    width: "100%",
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
        }
      : { elevation: 3 }),
  },
  activeMissionIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Theme.driverEmerald,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center", // Add this for proper centering
  },
  activeMissionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: Theme.driverEmerald,
    textAlign: "center",
  },
  activeMissionId: {
    fontSize: 24,
    fontWeight: "800",
    color: Theme.textOnDark,
    marginBottom: 4,
    textAlign: "center",
  },
  statusCardHint: {
    fontSize: 12,
    marginBottom: 16,
    textAlign: "center",
  },
  tacticalHudBtn: {
    alignSelf: "stretch",
    minHeight: 44,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: Theme.textOnDark,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tacticalHudBtnText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: Theme.driverBackground,
  },
  offlineCard: {
    width: "100%",
    backgroundColor: Theme.driverWhiteMuted,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    borderRadius: 24,
    padding: 0,
    alignItems: "center",
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        }
      : { elevation: 4 }),
  },
  offlineCardAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    opacity: 0.5,
  },
  offlineCardContent: {
    width: "100%",
    maxWidth: 400, // Add max width for better layout
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: "center",
    alignSelf: "center", // Add this for proper centering
  },
  offlineIconContainer: {
    position: "relative",
    marginBottom: 20,
    alignSelf: "center", // Add this for proper centering
    alignItems: "center", // Add this for inner content centering
  },
  offlineIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center", // Add this for proper centering
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        }
      : { elevation: 2 }),
  },
  offlineIconInner: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center", // Add this for proper centering
  },
  offlineLiveBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    gap: 4,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        }
      : { elevation: 2 }),
  },
  offlineLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  offlineLiveText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  offlineCardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textOnDark,
    marginBottom: 8,
    letterSpacing: 0.3,
    textAlign: "center",
    alignSelf: "center", // Changed from 'stretch' to 'center'
    paddingHorizontal: 16, // Add horizontal padding for better text wrapping
  },
  offlineCardSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    alignSelf: "center", // Changed from 'stretch' to 'center'
    marginBottom: 28,
    lineHeight: 20,
    paddingHorizontal: 16, // Increased from 8 for better text wrapping
    maxWidth: 320, // Add max width for better readability
  },
  offlineTripIdBadge: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  offlineTripIdText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  offlineRouteCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  offlineRouteLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 0,
  },
  offlineRouteTimeline: {
    alignItems: "flex-start",
    marginRight: 14,
    paddingTop: 2,
  },
  offlineRouteDotWrap: {
    width: 36,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  offlineRouteDotPingRing: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  offlineRouteDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  offlineRouteLine: {
    width: 2,
    height: 22,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    marginLeft: 17,
    marginVertical: 2,
    borderColor: Theme.borderMedium,
  },
  offlineRouteDestIcon: {
    width: 36,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  offlineRouteLabels: {
    flex: 1,
    minWidth: 0,
  },
  offlineRouteRow: {
    marginBottom: 18,
  },
  offlineRouteRowLast: {
    marginBottom: 0,
  },
  offlineRouteLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  offlineRouteValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  offlineRouteRight: {
    alignItems: "flex-end",
  },
  offlineRouteDistance: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  offlineRouteEst: {
    fontSize: 10,
    fontWeight: "600",
  },
  offlineCardHintBold: {
    fontWeight: "800",
  },
  offlineTrustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 12,
  },
  offlineTrustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  offlineTrustText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  offlineTrustDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  offlineCardLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    marginBottom: 10,
    paddingHorizontal: 0,
    minWidth: 0,
  },
  offlineCardLocationIcon: {
    marginRight: 8,
  },
  offlineCardLocationText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    letterSpacing: 0.2,
    textAlign: "left",
  },
  offlineCardHint: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    alignSelf: "center", // Changed from 'stretch' to 'center'
    marginBottom: 16,
    paddingHorizontal: 16, // Increased from 8 for consistency
    lineHeight: 18,
    color: Theme.textMuted,
    maxWidth: 320, // Add max width for consistency
  },
  goOnlineBtn: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? undefined : 320,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18, // Increased from 16 for better touch area
    paddingHorizontal: 24, // Add horizontal padding
    backgroundColor: Theme.driverEmerald,
    borderRadius: 12,
    alignSelf: "center", // Add this for proper centering
  },
  goOnlineBtnIcon: {
    opacity: 1,
  },
  notificationAcceptButtonSideSpacer: {
    width: 14,
    height: 14,
  },
  goOnlineBtnText: {
    fontSize: 14, // Increased from 13 for better readability
    fontWeight: "800",
    letterSpacing: 0.8,
    color: Theme.buttonPrimaryText,
    textAlign: "center",
    flex: 1, // Add flex to allow proper text centering
  },
  otpClaimCard: {
    marginTop: 12,
    padding: 20,
    borderWidth: 1,
    borderRadius: 20,
    alignItems: "center",
  },
  otpClaimTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  otpClaimSubtitle: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  otpTripRoute: {
    marginTop: 0,
    marginBottom: 16,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    width: "100%",
  },
  otpBoxRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
    width: "100%",
  },
  otpBox: {
    width: 42,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxDigit: {
    fontSize: 20,
    fontWeight: "700",
  },
  otpHiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  otpErrorText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  otpCancelLink: {
    marginTop: 14,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  otpCancelText: {
    fontSize: 13,
    fontWeight: "700",
  },
  cardTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  newMissionDotWrap: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  newMissionDotPingRing: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  newMissionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  newMissionBadge: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.driverEmerald,
  },
  commissionBlock: { alignItems: "flex-end" },
  commissionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    marginBottom: 2,
  },
  newAssignmentRouteCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  newAssignmentRouteLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 0,
  },
  newAssignmentTimeline: {
    alignItems: "flex-start",
    marginRight: 12,
    paddingTop: 2,
  },
  newAssignmentDotWrap: {
    width: 36,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  newAssignmentDotPingRing: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  newAssignmentRouteDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  newAssignmentRouteLine: {
    width: 2,
    height: 22,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    marginLeft: 17,
    marginVertical: 2,
    borderColor: Theme.borderMedium,
  },
  newAssignmentDestIcon: {
    width: 36,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  newAssignmentRouteLabels: {
    flex: 1,
    minWidth: 0,
  },
  newAssignmentRouteRow: {
    marginBottom: 16,
  },
  newAssignmentRouteRowLast: {
    marginBottom: 0,
  },
  newAssignmentRouteLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
  },
  newAssignmentRouteValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  newAssignmentRouteRight: {
    alignItems: "flex-end",
  },
  newAssignmentRouteDistance: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  newAssignmentRouteEst: {
    fontSize: 10,
    fontWeight: "600",
  },
  nodeLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    marginBottom: 4,
  },
  nodeValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  distanceClientRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  miniBox: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.driverOverlayLight,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
  },
  miniBoxLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: Theme.textMuted,
    marginBottom: 6,
  },
  miniBoxValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  declineBtn: {
    marginTop: 10,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
  },
  acceptDeclineRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  declineBtnInRow: {
    flex: 1,
    marginTop: 0,
  },
  acceptBtnInRow: {
    flex: 1,
  },
  declineBtnText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  empty: {
    alignItems: "center",
    gap: 16,
    opacity: 0.9,
  },
  emptyCard: {
    width: "100%",
    alignItems: "center",
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  syncingText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  card: {
    width: "100%",
    backgroundColor: Theme.driverWhiteMuted,
    borderWidth: 1,
    borderTopWidth: 4,
    borderTopColor: Theme.driverEmerald,
    borderColor: Theme.driverBorder,
    borderRadius: 20,
    padding: 20,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
        }
      : { elevation: 3 }),
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  revenue: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: Theme.driverEmerald,
  },
  acceptBtn: {
    minHeight: 52,
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: Theme.driverEmerald,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
        }
      : { elevation: 4 }),
  },
  acceptBtnDisabled: { opacity: 0.7 },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.buttonPrimaryText,
  },

  // --- Assigned trip waiting (reference-style: map + HUD + bottom sheet) ---
  assignedMapBg: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  /** Wrapper for map branch so header + split share vertical space. */
  assignedMapRoot: {
    flex: 1,
    minHeight: 0,
  },
  assignedKeyboardAvoid: {
    flex: 1,
  },
  /** Half map / half card split layout (no overlay). */
  assignedSplitWrap: {
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
  },
  assignedMapDismissArea: {
    flex: 1,
  },
  assignedMapHalf: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  mapTopControlsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    zIndex: 60,
    elevation: 24,
  },
  mapTopLiveRouteWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: 2,
    alignSelf: "center",
  },
  mapTopLiveRouteSpacer: {
    flex: 1,
    minWidth: 0,
  },
  mapTopPillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: MAP_CONTROLS_BAR_HEIGHT,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  mapTopPillLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.1,
    maxWidth: 72,
  },
  trackingInfoCardWrap: {
    position: "absolute",
    zIndex: 36,
    width: 220,
    maxWidth: 220,
    right: Layout.screenPaddingHorizontal,
  },
  /** Scrollable inbox below active / accepted trip flow — never blocks with a modal. */
  otherPendingTripsWrap: {
    marginTop: 18,
    marginBottom: 8,
  },
  fullMapModal: {
    flex: 1,
  },
  fullMapCloseWrap: {
    position: "absolute",
    left: Layout.screenPaddingHorizontal,
    zIndex: 80,
    elevation: 12,
  },
  fullMapContainer: {
    flex: 1,
    position: "relative",
  },
  assignedMapInHalf: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    zIndex: 0,
  },
  fullMapView: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  assignedCardHalf: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 0,
    paddingTop: 12,
  },
  assignedCardHalfScroll: { flex: 1, minHeight: 0 },
  assignedCardHalfScrollContent: {
    flexGrow: 1,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  assignedMapGrid: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    opacity: 0.12,
  },
  assignedMapView: {
    width: "100%",
    height: "100%",
  },
  assignedMapCallout: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 200,
  },
  assignedMapCalloutTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  assignedMapCalloutSub: {
    fontSize: 12,
  },
  assignedHudWrap: {
    position: "absolute",
    left: 24,
    right: 24,
    zIndex: 50,
  },
  assignedHudCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 28,
    borderWidth: 1,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        }
      : { elevation: 8 }),
  },
  assignedHudLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  assignedHudAvatarWrap: {
    width: 48,
    height: 48,
    borderWidth: 1,
    overflow: "hidden",
  },
  assignedHudAvatar: { width: "100%", height: "100%", borderRadius: 16 },
  assignedHudTextWrap: { flex: 1, minWidth: 0 },
  assignedHudLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  assignedHudNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  assignedHudName: { fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  assignedHudRatingBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  assignedHudRatingText: { fontSize: 10, fontWeight: "800" },
  assignedHudRight: { alignItems: "flex-end" },
  assignedHudStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 4,
  },
  assignedHudStatusDot: { width: 8, height: 8, borderRadius: 4 },
  assignedHudStatusText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  assignedHudEarnings: { fontSize: 18, fontWeight: "800" },
  mapControlsColumn: {
    position: "absolute",
    // Must stay above the Ola bottom sheet content.
    zIndex: 1200,
    elevation: 40,
    gap: 8,
  },
  mapGuidanceChip: {
    position: "absolute",
    zIndex: 45,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
        }
      : { elevation: 6 }),
  },
  mapGuidanceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mapGuidanceIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  mapGuidanceTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  mapGuidanceSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  mapPlanList: {
    marginTop: 8,
    gap: 6,
  },
  mapPlanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  mapPlanDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  mapPlanCaption: {
    fontSize: 10,
    fontWeight: "700",
    flexShrink: 0,
  },
  mapPlanPlace: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "600",
  },
  mapDetailsBtn: {
    position: "absolute",
    left: 16,
    bottom: 16,
    zIndex: 46,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 10,
        }
      : { elevation: 6 }),
  },
  mapDetailsBtnText: {
    fontSize: 14,
    fontWeight: "800",
  },
  mapGuidanceDistance: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  mapTopRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  mapTopIconBtn: {
    width: MAP_CONTROLS_BAR_HEIGHT,
    height: MAP_CONTROLS_BAR_HEIGHT,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    // Ensure controls stay above map gestures / transparent sheet hosts on web.
    zIndex: 61,
  },
  routeSummaryPanel: {
    position: "absolute",
    left: Layout.screenPaddingHorizontal,
    right: Layout.screenPaddingHorizontal,
    zIndex: 40,
    elevation: 6,
    gap: 5,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
        }
      : { elevation: 6 }),
  },
  mapControlBtnDisabled: {
    opacity: 0.45,
  },
  assignedFabColumn: {
    position: "absolute",
    left: 16,
    zIndex: 40,
    gap: 12,
  },
  assignedFabSafety: {
    width: 56,
    height: 56,
    borderRadius: 22,
    backgroundColor: "#e11d48",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
        }
      : { elevation: 6 }),
  },
  assignedFabCompass: {
    width: 56,
    height: 56,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
        }
      : { elevation: 6 }),
  },
  assignedSheet: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    zIndex: 50,
    paddingHorizontal: 20,
    backgroundColor: "transparent",
    maxHeight: "60%",
    paddingBottom: 12,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        }
      : { elevation: 12 }),
  },
  /** Map overlay: no extra white card or handle; JobRequestCard is the only card, close via X. */
  assignedSheetNoCard: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    paddingHorizontal: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    borderRadius: 0,
    minHeight: "42%",
    justifyContent: "flex-end",
  },
  assignedSheetContent: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    flexGrow: 1,
  },
  assignedNewOrderTitleWrap: {
    alignItems: "center",
    marginBottom: 10,
  },
  assignedNewOrderTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  assignedNewOrderDivider: {
    width: "100%",
    height: 1,
    marginTop: 8,
  },
  // Reference-style incoming trip card (same layout as design)
  incomingCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  incomingCardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  incomingTripPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  incomingTripPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  incomingCardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  incomingTripType: {
    fontSize: 13,
    fontWeight: "700",
  },
  incomingTripBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  incomingTripBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  incomingEarningsWrap: {
    alignItems: "center",
    marginBottom: 16,
    paddingVertical: 4,
  },
  incomingCollapsedWrap: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    gap: 4,
  },
  incomingCollapsedTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  incomingCollapsedAmount: {
    fontSize: 20,
    fontWeight: "700",
  },
  incomingCollapsedRoute: {
    fontSize: 13,
    fontWeight: "500",
  },
  incomingEarningsAmount: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  incomingEarningsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  incomingEarningsBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  incomingRouteWrap: {
    position: "relative",
    paddingLeft: 28,
    marginBottom: 20,
  },
  incomingRouteDashed: {
    position: "absolute",
    left: 11,
    top: 24,
    bottom: 24,
    width: 2,
    borderLeftWidth: 2,
    borderStyle: "dashed",
  },
  incomingRoutePickup: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  incomingRouteIconPickup: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -28,
    marginTop: 2,
  },
  incomingRouteDrop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  incomingRouteIconDrop: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    marginLeft: -28,
    marginTop: 2,
  },
  incomingRouteBody: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  incomingRouteMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  incomingRouteMetaPickup: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  incomingRouteMetaDrop: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  incomingRouteMetaDist: {
    fontSize: 10,
    fontWeight: "700",
  },
  incomingRouteTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 2,
  },
  incomingRouteSub: {
    fontSize: 13,
    fontWeight: "600",
  },
  incomingMetaRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  incomingMetaBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 0,
  },
  incomingMetaIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingMetaTextWrap: { flex: 1, minWidth: 0 },
  incomingMetaLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  incomingMetaValue: {
    fontSize: 14,
    fontWeight: "800",
  },
  incomingCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingVertical: 4,
  },
  incomingCustomerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  incomingCustomerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingCustomerInfo: {
    marginLeft: 12,
    flex: 1,
    minWidth: 0,
  },
  incomingCustomerName: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  incomingCustomerSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  incomingCustomerSubText: {
    fontSize: 11,
    fontWeight: "700",
  },
  incomingCustomerActions: {
    flexDirection: "row",
    gap: 8,
  },
  incomingCustomerActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  incomingRejectBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingAcceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    paddingLeft: 20,
    paddingRight: 12,
    borderRadius: 20,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 6,
        }
      : { elevation: 3 }),
  },
  incomingAcceptBtnLabel: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.textOnPrimary,
  },
  incomingAcceptBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedSheetGreetingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  assignedSheetGreetingText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.2,
    textAlign: "left",
  },
  assignedStaticHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 60,
  },
  assignedStaticHeaderContent: {
    alignItems: "stretch",
  },
  dashboardLocationBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    marginLeft: Layout.driverHeaderHorizontalPadding,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "82%",
  },
  dashboardLocationBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
    lineHeight: 13,
    flexShrink: 1,
  },
  assignedSheetStatusRow: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedSheetStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  assignedSheetStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  assignedSheetStatusText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  assignedSheetEarningsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 0,
    marginBottom: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  assignedSheetEarningsLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  assignedSheetEarningsValue: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  assignedSheetEarningsHint: {
    fontSize: 10,
    fontWeight: "600",
    marginLeft: 8,
  },
  assignedSheetEarningsRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  assignedCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    borderBottomWidth: 0,
    paddingRight: 0,
  },
  assignedCustomerAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedCustomerTextWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  assignedCustomerEarningsBlock: {
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 10,
    borderBottomWidth: 0,
    flexShrink: 0,
  },
  assignedCustomerEarningsAmount: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "right",
  },
  assignedCustomerEarningsDistance: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
    textAlign: "right",
  },
  assignedCustomerEarningsDivider: {
    width: 22,
    height: 2,
    borderRadius: 1,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  assignedTripDistanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingVertical: 6,
  },
  assignedTripDistanceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  assignedTripDistanceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedTripDistanceLabel: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0,
    textAlign: "left",
  },
  assignedTripDistanceValue: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "right",
  },
  assignedCustomerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  assignedCustomerName: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "left",
  },
  assignedCustomerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0,
    marginTop: 2,
    textAlign: "left",
  },
  assignedCustomerRatingBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  assignedCustomerRatingText: { fontSize: 11, fontWeight: "800" },
  assignedItinerary: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  assignedItineraryCol: {
    flex: 1,
    flexDirection: "row",
    minWidth: 0,
    alignItems: "flex-start",
  },
  assignedItineraryDots: {
    width: 46,
    alignItems: "center",
    marginRight: 10,
  },
  assignedItineraryDotPickup: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: "#333333",
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedItineraryDotPickupInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#333333",
  },
  assignedItineraryLine: {
    width: 2,
    height: 24,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    marginLeft: 9,
    marginTop: 0,
    marginBottom: 0,
  },
  assignedItineraryDotDrop: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedItineraryLabels: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingLeft: 0,
  },
  assignedItineraryRow: {
    marginBottom: 6,
    flexDirection: "column",
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  assignedItineraryRowLast: {
    marginBottom: 0,
    marginTop: 6,
    flexDirection: "column",
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  assignedItineraryLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 3,
    textTransform: "uppercase",
    textAlign: "left",
  },
  assignedItineraryValue: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "left",
  },
  assignedItineraryRight: { alignItems: "flex-end" },
  assignedItineraryDistance: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  assignedItineraryEst: { fontSize: 10, fontWeight: "600" },
  assignedCtaWrap: { marginTop: 4 },
  assignedCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  assignedCtaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
        }
      : { elevation: 3 }),
  },
  assignedCtaBtnGoOnline: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  assignedCtaBtnDisabled: { opacity: 0.7 },
  assignedCtaIcon: { marginRight: 6 },
  assignedCtaText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0,
    color: Theme.textOnPrimary,
  },
  assignedAcceptError: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  assignedDeclineBtn: {
    marginTop: 0,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 0,
  },
  assignedDeclineBtnInRow: {
    flex: 1,
    marginTop: 0,
  },
  assignedDeclineBtnText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
    color: Theme.buttonPrimaryText,
  },
  assignedTrustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 12,
  },
  assignedTrustItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  assignedTrustText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  assignedTrustDot: { width: 4, height: 4, borderRadius: 2 },
  reassignedBanner: {
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  reassignedBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  reassignedBannerDismiss: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  reassignedBannerDismissText: {
    fontSize: 14,
    fontWeight: "700",
  },
  // Trip booked / Skipped feedback (single card, green & black theme)
  /** Wrapper so feedback has a visible card on transparent map overlay */
  feedbackCardWrap: {
    borderRadius: 16,
    overflow: "hidden",
    marginHorizontal: 16,
  },
  feedbackBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  feedbackIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  feedbackIconWrapSuccess: {},
  feedbackIconWrapSkipped: {},
  feedbackTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 8,
  },
  feedbackSubtitle: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  customMapMarkerPickup: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.driverEmerald,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2.5,
    borderColor: "white",
    shadowColor: Theme.driverEmeraldDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  customMapMarkerDrop: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.driverGold,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2.5,
    borderColor: "white",
    shadowColor: "#b45309",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  customMapMarkerTruck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.buttonPrimary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 6,
  },
  olaYouMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3.5,
    elevation: 5,
  },
  tabBarBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  customMapMarkerActive: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
  },
  planMapMarkerText: {
    color: "white",
    fontSize: 12,
    fontWeight: "800",
  },
  pinHistoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#94a3b8',
    borderWidth: 1.5,
    borderColor: 'white',
  },
  routeDistanceLabel: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(4,120,87,0.28)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  routeDistanceLabelText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.driverEmeraldDark,
    letterSpacing: 0.2,
  },
  compactInviteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  compactInviteText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  notificationCard: {
    width: "92%",
    alignSelf: "center",
    marginVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  notificationContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
  },
  notificationIconWrap: {
    padding: 8,
    borderRadius: 12,
  },
  notificationTextContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  notificationOrgName: {
    fontSize: 14,
    fontWeight: "bold",
    lineHeight: 18,
  },
  notificationSubtitle: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  notificationRightWrap: {
    alignItems: "flex-end",
    gap: 12,
  },
  notificationCloseBtn: {
    padding: 2,
  },
  notificationTime: {
    fontSize: 10,
    marginTop: 4,
  },
}),
);
