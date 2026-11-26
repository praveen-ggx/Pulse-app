import { DriverHeader } from '@/components/driver/DriverHeader';
import { DriverMapAvatarMarker } from '@/components/driver/DriverMapAvatarMarker';
import { driverTabBarBottomPad } from '@/components/driver/driverTabBarInsets';
import { JobRequestCard } from '@/components/JobRequestCard';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAvatar } from '@/contexts/DriverAvatarContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import {
    useDriverCommunication,
    useDriverLocationStream,
} from '@/features/driver/communication';
import { fetchDriverStopExecution } from '@/features/driver/execution/fetchDriverStopExecution';
import { useDriverMapLivePositionWatch } from '@/features/driver/hooks/useDriverMapLivePositionWatch';
import { DriverJobCard } from '@/features/driver/job-card/DriverJobCard';
import type { DriverRoutePlanMap } from '@/features/driver/job-card/driverRoutePlanMap';
import {
    buildDriverRoutePlanMap,
    buildTripRowRoutePlanMap,
    routePlanPolyline,
    routePlanStopCaption,
} from '@/features/driver/job-card/driverRoutePlanMap';
import { RoutePlanMapPin } from '@/features/driver/job-card/parts/RoutePlanMapPin';
import * as driverLocationService from '@/features/driver/services/driverLocation.service';
import * as driversService from '@/features/drivers/services/drivers.service';
import { resolveDriverOfferDistanceKm } from '@/features/drivers/utils/driverDisplayDistance.util';
import { isAggregateTrip, isRosterTrip } from '@/features/drivers/utils/driverUtils.util';
import { computeDriverCommissionForTrip } from '@/features/finance/aggregation/aggregateDrivers';
import { isCommerceDriverTrip } from '@/features/trips/domain/driverTripExperience';
import { fetchRouteExtraStopsForTrips } from '@/features/trips/services/routeExtraStops.service';
import { claimTripByOtp, getPendingOtpTrips } from '@/features/trips/services/tripOtp.service';
import * as tripsService from '@/features/trips/services/trips.service';
import { useDriverAvatarUri } from '@/lib/avatarUpload';
import { formatINR } from '@/lib/format';
import { formatEstimatedDuration } from '@/lib/formatEstimatedDuration';
import { openExternalNavigation } from '@/lib/mapsNavigation.util';
import { darkMapStyle } from '@/lib/mapStyles';
import {
    reverseGeocodeCityStateLabel,
} from '@/lib/reverseGeocodePlace.util';
import { getOptimalRoute, RouteResult } from '@/lib/routingService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ComponentProps,
    type ComponentType,
    type ReactNode,
} from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
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
    TouchableWithoutFeedback,
    View
} from 'react-native';
import MapView, { Callout, Marker, Polyline } from 'react-native-maps';
import Reanimated, {
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickDriverRowForTrip, resolveAgreedPayTerms } from '@/features/drivers/utils/driverPayTerms.util';

type BottomSheetComponentProps = {
  children?: ReactNode;
  snapPoints?: Array<string | number>;
  index?: number;
  enablePanDownToClose?: boolean;
  bottomInset?: number;
  onChange?: (index: number) => void;
  ref?: unknown;
  backgroundStyle?: ComponentProps<typeof View>['style'];
  handleIndicatorStyle?: ComponentProps<typeof View>['style'];
};

type BottomSheetScrollViewComponentProps = ComponentProps<typeof ScrollView>;
type GestureHandlerRootViewComponentProps = ComponentProps<typeof View>;

type DriverPanelRuntime = {
  BottomSheet: ComponentType<BottomSheetComponentProps>;
  BottomSheetScrollView: ComponentType<BottomSheetScrollViewComponentProps>;
  GestureHandlerRootView: ComponentType<GestureHandlerRootViewComponentProps>;
  nativeSupported: boolean;
};

function BottomSheetFallback({ children }: BottomSheetComponentProps) {
  return <View style={{ flex: 1 }}>{children}</View>;
}

function BottomSheetScrollViewFallback({
  children,
  contentContainerStyle,
  ...props
}: BottomSheetScrollViewComponentProps) {
  return (
    <ScrollView {...props} contentContainerStyle={contentContainerStyle}>
      {children}
    </ScrollView>
  );
}

function GestureHandlerRootViewFallback({
  children,
  style,
  ...props
}: GestureHandlerRootViewComponentProps) {
  return (
    <View {...props} style={style}>
      {children}
    </View>
  );
}

const FALLBACK_DRIVER_PANEL_RUNTIME: DriverPanelRuntime = {
  BottomSheet: BottomSheetFallback,
  BottomSheetScrollView: BottomSheetScrollViewFallback,
  GestureHandlerRootView: GestureHandlerRootViewFallback,
  nativeSupported: false,
};

/** Default map region when driver location is not yet available (India center). */
const DEFAULT_MAP_REGION = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

function isAssignedNotStarted(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'assigned' || s === 'pending' || s === 'scheduled';
}

function isActiveMission(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'in_progress' || s === 'in_transit' || s === 'transit' || s === 'picked_up' || s === 'pickup' || s === 'started';
}

function isCompletedStatus(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'delivered' || s === 'done';
}

function buildInviteOfferText(inv: driversService.DriverInviteRow): string {
  const parts: string[] = [];
  if (inv.payable_amount != null && inv.payable_amount > 0) {
    parts.push(`₹${Number(inv.payable_amount).toLocaleString('en-IN')}`);
  }
  if (inv.commission_percent != null && inv.commission_percent > 0) {
    parts.push(`${inv.commission_percent}% commission`);
  }
  if (inv.commission_per_km != null && inv.commission_per_km > 0) {
    parts.push(`₹${inv.commission_per_km}/km`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Offer on accept';
}

/** Trip is in progress so "Accept" does not reappear after refresh (includes started_at). */
function isTripInProgress(t: tripsService.TripRow) {
  if (isCompletedStatus(t.status)) return false;
  return isActiveMission(t.status) || !!(t.started_at);
}

type DriverGuidanceStep = 'accepted' | 'pickup' | 'transit' | 'reached' | 'completed';

type DriverGuidanceConfig = {
  title: string;
  subtitle: string;
  toastMessage: string;
  target: 'pickup' | 'drop' | null;
  icon: 'location-arrow' | 'map-marker' | 'check-circle';
};

function deriveDriverGuidanceStep(t: tripsService.TripRow): DriverGuidanceStep {
  const s = String(t.status ?? '').toLowerCase();
  if (s === 'completed' || s === 'delivered' || s === 'done') return 'completed';
  if (s === 'at_drop') return 'reached';
  if (s === 'in_transit' || s === 'transit') return 'transit';
  if (s === 'picked_up' || s === 'pickup' || s === 'in_progress') return 'pickup';
  return 'accepted';
}

function getTripStopCoordinate(
  trip: tripsService.TripRow,
  target: 'pickup' | 'drop'
): { latitude: number; longitude: number } | null {
  const latitude = Number(target === 'pickup' ? trip.pickup_lat : trip.drop_lat);
  const longitude = Number(target === 'pickup' ? trip.pickup_lon : trip.drop_lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function getDriverGuidanceConfig(step: DriverGuidanceStep, trip: tripsService.TripRow): DriverGuidanceConfig {
  if (step === 'accepted') {
    return {
      title: 'Proceed to pickup',
      subtitle: trip.pickup_area?.trim() || 'Head to the pickup location',
      toastMessage: 'Trip accepted. Proceed to pickup.',
      target: 'pickup',
      icon: 'location-arrow',
    };
  }
  if (step === 'pickup') {
    return {
      title: 'Confirm pickup',
      subtitle: trip.pickup_area?.trim() || 'You are at the pickup point',
      toastMessage: 'You reached pickup. Confirm pickup to continue.',
      target: 'pickup',
      icon: 'map-marker',
    };
  }
  if (step === 'transit') {
    return {
      title: 'Proceed to drop-off',
      subtitle: trip.drop_location?.trim() || 'Head to the drop-off location',
      toastMessage: 'Pickup confirmed. Proceed to drop-off.',
      target: 'drop',
      icon: 'location-arrow',
    };
  }
  if (step === 'reached') {
    return {
      title: 'Upload POD',
      subtitle:
        'At drop-off. Upload POD before completing (preferred), or skip for now.',
      toastMessage:
        'You reached drop-off. Upload POD before completing the trip (preferred), or skip for now.',
      target: 'drop',
      icon: 'check-circle',
    };
  }
  return {
    title: 'Trip completed',
    subtitle: 'All steps finished.',
    toastMessage: 'Trip completed.',
    // Keep map routing/highlight active even after server marks completed.
    target: 'drop',
    icon: 'check-circle',
  };
}

const DRIVER_ACCEPTED_TRIP_ID_KEY = 'driver_accepted_trip_id';
const OTP_LENGTH = 6;

let ExpoLocationModule: typeof import('expo-location') | null = null;

async function getExpoLocation() {
  try {
    if (!ExpoLocationModule) {
      ExpoLocationModule = await import('expo-location');
    }
    return ExpoLocationModule;
  } catch {
    return null;
  }
}

/** Approximate distance in metres between two WGS84 points (Haversine-style). */
function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6_371_000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Compact label for straight-line gap (driver ↔ action pin). */
function formatStraightLineGapLabel(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Approx initial bearing (degrees 0-360) from one lat/lon to another. */
function bearingDegrees(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number | null {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const theta = Math.atan2(y, x);
  const deg = (theta * 180) / Math.PI;
  if (!Number.isFinite(deg)) return null;
  return (deg + 360) % 360;
}

function formatTripDistance(distance: unknown): string {
  if (distance == null) return '—';
  const raw = typeof distance === 'string' ? distance.trim() : '';
  if (typeof distance === 'string' && raw === '') return '—';

  // DB can return numeric km; other flows may return strings like "980 km" or "1,420 KM".
  const km =
    typeof distance === 'number'
      ? distance
      : (() => {
          const n = parseFloat(String(distance).replace(/,/g, '').replace(/[^0-9.]/g, ''));
          return Number.isFinite(n) ? n : NaN;
        })();

  if (!Number.isFinite(km) || km < 0) return '—';
  return `${Math.round(km).toLocaleString('en-IN')} km`;
}

export default function DriverDashboard() {
  const insets = useSafeAreaInsets();
  const { isDark, mapTheme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const footerPadTop = 6;
  const footerPadBottom = driverTabBarBottomPad(insets.bottom);
  const driverTabBarClearance =
    Layout.tabBarDockHeight + footerPadTop + footerPadBottom;
  /** Same clearance as the dock wrap — CTA must not sit under the glass pill. */
  const driverSheetBottomInset = driverTabBarClearance;
  // Driver home previously used a hardcoded dark map for contrast.
  // Now it respects the "Map Style" user setting (light, dark, or auto-sync with theme).
  const mapIsDark = mapTheme === 'auto' ? isDark : mapTheme === 'dark';
  const { profile } = useAuth();
  const { avatarSeed } = useDriverAvatar();
  const { avatarUri } = useDriverAvatarUri();
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [allTrips, setAllTrips] = useState<tripsService.TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [declinedTripId, setDeclinedTripId] = useState<string | null>(null);
  const [assignmentFeedback, setAssignmentFeedback] = useState<'accepted' | 'declined' | null>(null);
  const assignmentFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingAnim = useRef(new Animated.Value(0)).current;
  const pickupDotPingAnim = useRef(new Animated.Value(0)).current;
  const newAssignmentBlinkAnim = useRef(new Animated.Value(0)).current;
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [declineLoading, setDeclineLoading] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptedTripId, setAcceptedTripId] = useState<string | null>(null);
  const [pendingOtpTrips, setPendingOtpTrips] = useState<tripsService.TripRow[]>([]);
  const [otpClaimTripId, setOtpClaimTripId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isAssignmentSheetExpanded, setIsAssignmentSheetExpanded] = useState(false);
  const [routePlanMap, setRoutePlanMap] = useState<DriverRoutePlanMap | null>(null);
  const driverSheetRef = useRef<{ snapToIndex?: (index: number) => void } | null>(null);
  const planCameraHoldUntilRef = useRef(0);
  const [_reassignedTripLabels, setReassignedTripLabels] = useState<string[]>([]);
  const previousTripsRef = useRef<Map<string, string>>(new Map());
  // Mount, focus (also on initial mount), and AppState-active can all call fetch()
  // in the same window — join the in-flight Promise instead of a second Promise.all.
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const searchPulseAnim = useRef(new Animated.Value(0)).current;
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [driverMapPosition, setDriverMapPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  // Truck marker position shown on the map; animated independently from raw GPS.
  const [truckPosition, setTruckPosition] = useState<{ latitude: number; longitude: number } | null>(null);

  // Reanimated-smoothed "You" marker (Ola-style: avoid teleport between GPS fixes).
  const youLatSv = useSharedValue<number>(DEFAULT_MAP_REGION.latitude);
  const youLonSv = useSharedValue<number>(DEFAULT_MAP_REGION.longitude);
  const youHeadingSv = useSharedValue<number>(0);
  const lastHeadingFixRef = useRef<{ latitude: number; longitude: number } | null>(null);

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

  const [driverPanelRuntime, setDriverPanelRuntime] = useState<DriverPanelRuntime>(
    FALLBACK_DRIVER_PANEL_RUNTIME
  );
  const OlaAnimatedMarker = Reanimated.createAnimatedComponent(Marker);
  const [_stopsExpanded, _setStopsExpanded] = useState(false);
  const [justCompletedTrip, setJustCompletedTrip] = useState(false);
  const [isFullMapVisible, setIsFullMapVisible] = useState(false);
  const [inlineMapViewportHeight, setInlineMapViewportHeight] = useState(0);
  const [toastMessage, setToastMessage] = useState('You are online now.');
  const pingMapUiRef = useRef<{
    setDriverMapPosition: (p: { latitude: number; longitude: number } | null) => void;
    youLatSv: typeof youLatSv;
    youLonSv: typeof youLonSv;
    youHeadingSv: typeof youHeadingSv;
    lastHeadingFixRef: typeof lastHeadingFixRef;
  } | null>(null);
  const truckAnimTokenRef = useRef(0);
  const truckRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const truckLastUpdateMsRef = useRef(0);
  const lastAnimatedStepKeyRef = useRef<string | null>(null);
  const lastAnimatedTripIdRef = useRef<string | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const nativeMapZoomRef = useRef(16);
  const fullMapRef = useRef<MapView | null>(null);
  const inlineMapViewportHeightRef = useRef(0);
  const inlineMapLastFitKeyRef = useRef<string | null>(null);
  const fullMapLastFitKeyRef = useRef<string | null>(null);
  const otpInputRef = useRef<TextInput | null>(null);
  const lastGuidanceKeyRef = useRef<string | null>(null);
  const {
    BottomSheet: BottomSheetComponent,
    BottomSheetScrollView: BottomSheetScrollViewComponent,
    GestureHandlerRootView: GestureHandlerRootViewComponent,
    nativeSupported: hasNativeBottomSheetSupport,
  } = driverPanelRuntime;

  useEffect(() => {
    let cancelled = false;
    Promise.all([import('@gorhom/bottom-sheet'), import('react-native-gesture-handler')])
      .then(([bottomSheetModule, gestureHandlerModule]) => {
        if (cancelled) return;
        setDriverPanelRuntime({
          BottomSheet: bottomSheetModule.default as ComponentType<BottomSheetComponentProps>,
          BottomSheetScrollView:
            bottomSheetModule.BottomSheetScrollView as ComponentType<BottomSheetScrollViewComponentProps>,
          GestureHandlerRootView:
            gestureHandlerModule.GestureHandlerRootView as ComponentType<GestureHandlerRootViewComponentProps>,
          nativeSupported: true,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setDriverPanelRuntime(FALLBACK_DRIVER_PANEL_RUNTIME);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(DRIVER_ACCEPTED_TRIP_ID_KEY).then((id) => {
      if (id != null && id !== '') setAcceptedTripId(id);
    });
  }, []);

  const fetch = useCallback((opts?: { soft?: boolean }): Promise<void> => {
    if (fetchInFlightRef.current) return fetchInFlightRef.current;
    if (!profile?.uid) {
      setLoading(false);
      return Promise.resolve();
    }
    setAcceptError(null);
    // Soft = background sync while mission sheet is open (POD/LR). Never blank the UI.
    const soft = opts?.soft === true;
    if (!soft) setLoading(true);
    const run = Promise.all([
      driversService.getLinkedDriversForCurrentUser(profile.uid),
      driversService.getDriverInvitesReceived(),
      getPendingOtpTrips(),
    ]).then(([driversRes, invitesRes, pendingTripsRes]) => {
      setInvites(invitesRes.invites ?? []);
      setPendingOtpTrips(pendingTripsRes?.error ? [] : pendingTripsRes?.trips ?? []);
      const drivers = (driversRes.drivers ?? []).filter((d) => !d.left_at);
      if (drivers.length > 0) {
        const primaryDriver = drivers[0];
        setDriver(primaryDriver);
        const driverIds = drivers.map((d) => d.id);
        return tripsService.getDriverUiTripsByDriverIds(driverIds).then((tRes) => {
          const trips = tRes.trips ?? [];
          const currentIds = new Set(trips.map((t) => t.id));
          const disappearedLabels: string[] = [];
          previousTripsRef.current.forEach((displayNum, id) => {
            if (!currentIds.has(id)) disappearedLabels.push(displayNum);
          });
          if (disappearedLabels.length > 0) setReassignedTripLabels(disappearedLabels);
          previousTripsRef.current = new Map(trips.map((t) => [t.id, tripsService.resolveDriverFacingTripLabel(t)]));
          setAllTrips((prev) => {
            if (prev.length === trips.length) {
              const prevFp = prev
                .map((t) => `${t.id}:${t.status}:${t.updated_at ?? ''}`)
                .sort()
                .join('|');
              const nextFp = trips
                .map((t) => `${t.id}:${t.status}:${t.updated_at ?? ''}`)
                .sort()
                .join('|');
              if (prevFp === nextFp) return prev;
            }
            return trips;
          });
          const normalizedDriverStatus = String(primaryDriver.status ?? '').toLowerCase();
          const hasActiveTrip = trips.some((t) => isTripInProgress(t));
          setIsOnline((prev) =>
            prev ||
            normalizedDriverStatus === 'online' ||
            normalizedDriverStatus === 'on_trip' ||
            hasActiveTrip,
          );
          setLoading(false);
          setAcceptedTripId((prev) => {
            if (prev == null) return prev;
            const trip = trips.find((t) => t.id === prev);
            if (!trip || isTripInProgress(trip) || isCompletedStatus(trip.status)) {
              AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
              return null;
            }
            return prev;
          });
        });
      } else {
        setDriver(null);
        setAllTrips([]);
        // Do NOT reset pendingOtpTrips here — a newly registered driver with no
        // linked driver rows yet may still have phone-preassigned trips waiting
        // for OTP claim. setPendingOtpTrips was already called above from the
        // getPendingOtpTrips() result before this branch ran.
        setIsOnline(false);
        previousTripsRef.current = new Map();
        setLoading(false);
      }
    }).finally(() => {
      fetchInFlightRef.current = null;
    });
    fetchInFlightRef.current = run;
    return run;
  }, [profile?.uid]);

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

  useEffect(() => {
    fetch();
  }, [fetch]);

  const fetchLocation = useCallback(async () => {
    try {
      const Location = await getExpoLocation();
      if (!Location) {
        setLocationStatus('error');
        setLocationLabel(null);
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('error');
        setLocationLabel(null);
        return;
      }

      const current = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = current.coords;

      // Show a ready location state immediately after GPS resolves,
      // then refine with reverse geocode when available.
      setLocationStatus('success');
      setLocationLabel('Current location');

      // Best-effort background permission (for long-haul tracking); do not block UI.
      void Location.requestBackgroundPermissionsAsync().catch(() => {
        // ignore
      });

      try {
        const cityState = await reverseGeocodeCityStateLabel(latitude, longitude);
        if (cityState) setLocationLabel(cityState);
      } catch {
        // keep "Current location" when geocode fails
      }
    } catch {
      setLocationStatus('error');
      setLocationLabel(null);
    }
  }, []);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  const liveDriverGeocodeCoord = useMemo(
    () => truckPosition ?? driverMapPosition,
    [truckPosition, driverMapPosition],
  );

  useEffect(() => {
    const c = liveDriverGeocodeCoord;
    if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void reverseGeocodeCityStateLabel(c.latitude, c.longitude).then((label) => {
        if (!cancelled && label) setLocationLabel(label);
      });
    }, 750);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [liveDriverGeocodeCoord?.latitude, liveDriverGeocodeCoord?.longitude]);

  // Refetch on focus and re-read accepted trip id (e.g. after OTP claim) so Dashboard shows "View trip" not "Accept & Enter OTP".
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(DRIVER_ACCEPTED_TRIP_ID_KEY).then((id) => {
        if (id != null && id !== '') setAcceptedTripId(id);
      });
      if (profile?.uid) fetch();
    }, [profile?.uid, fetch])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && profile?.uid) fetch();
    });
    return () => sub.remove();
  }, [profile?.uid, fetch]);

  // Clear declinedTripId once the declined trip is no longer in the driver's list (RPC unassigned it).
  useEffect(() => {
    if (!declinedTripId || allTrips.length === 0) return;
    if (!allTrips.some((t) => t.id === declinedTripId)) setDeclinedTripId(null);
  }, [declinedTripId, allTrips]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setLocationStatus('loading');
    Promise.all([fetch() ?? Promise.resolve(), fetchLocation()])
      .finally(() => setRefreshing(false));
  }, [fetch, fetchLocation]);

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

  useEffect(() => {
    if (!isOnline) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pingAnim, { toValue: 1, duration: 2000, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pingAnim, { toValue: 0, duration: 2000, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline, pingAnim]);

  const triggerSuccess = (message = 'You are online now.') => {
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
      if (assignmentFeedbackTimeoutRef.current) clearTimeout(assignmentFeedbackTimeoutRef.current);
    };
  }, []);

  const handleAcceptMission = async (trip: tripsService.TripRow) => {
    // OTP applies only to non-roster aggregate trips that require claim.
    const isAssetRosterTrip = isRosterTrip(trip);
    const requiresOtp =
      !isAssetRosterTrip &&
      (pendingOtpTripsRequiringOtp.some((t) => t.id === trip.id) ||
        (isAggregateTrip(trip) && isAssignedNotStarted(trip.status)));
    if (requiresOtp) {
      openOtpClaim(trip);
      return;
    }

    setAcceptError(null);
    setAcceptLoading(true);
    triggerSuccess('Trip accepted. Proceed to pickup.');
    setAcceptedTripId(trip.id);
    AsyncStorage.setItem(DRIVER_ACCEPTED_TRIP_ID_KEY, trip.id);
    setAcceptLoading(false);
    setAssignmentFeedback('accepted');

    if (assignmentFeedbackTimeoutRef.current) clearTimeout(assignmentFeedbackTimeoutRef.current);
    assignmentFeedbackTimeoutRef.current = setTimeout(() => {
      setAssignmentFeedback(null);
      assignmentFeedbackTimeoutRef.current = null;
      // Dashboard now hosts the in-card trip flow; do not auto-navigate to Trip screen.
    }, 1200);
  };

  const handleDeclineAssignment = (tripId: string) => {
    Alert.alert(
      'Decline this trip?',
      'You will no longer be assigned to this trip. The fleet can reassign it to another driver.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline trip',
          style: 'destructive',
          onPress: async () => {
            if (declineLoading) return;
            setAcceptError(null);
            if (otpClaimTripId === tripId) closeOtpClaim();
            setDeclineLoading(true);
            const { error } = await tripsService.driverRejectTrip(tripId);
            setDeclineLoading(false);
            if (error) {
              Alert.alert(
                'Decline failed',
                error.message ?? 'Could not decline. Try again.',
                [{ text: 'OK' }],
              );
              return;
            }
            setAssignmentFeedback('declined');
            setDeclinedTripId(tripId);
            fetch();
            if (assignmentFeedbackTimeoutRef.current)
              clearTimeout(assignmentFeedbackTimeoutRef.current);
            assignmentFeedbackTimeoutRef.current = setTimeout(() => {
              setAssignmentFeedback(null);
              assignmentFeedbackTimeoutRef.current = null;
            }, 1200);
          },
        },
      ],
    );
  };

  const renderOtpClaimCard = (trip: tripsService.TripRow, opts?: { showCancel?: boolean }) => (
    <View
      style={[
        styles.centerCardWrap,
        styles.centerCardConstraint,
        styles.otpClaimCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={[styles.offlineIconWrap, { backgroundColor: colors.emeraldMuted }]}>
        <FontAwesome name="key" size={28} color={colors.emerald} />
      </View>
      <Text style={[styles.offlineCardTitle, { color: colors.text }]}>Enter trip OTP</Text>
      <Text style={[styles.offlineCardSubtitle, { color: colors.textMuted, marginTop: 4 }]}>
        Enter the 6-digit OTP shared by your dispatcher to claim this trip.
      </Text>
      <Text style={[styles.otpTripRoute, { color: colors.text }]}>
        {(trip.pickup_area?.trim() || 'Pickup')} to {(trip.drop_location?.trim() || 'Drop-off')}
      </Text>
      <TouchableOpacity
        style={styles.otpBoxRow}
        onPress={() => otpInputRef.current?.focus()}
        activeOpacity={1}
      >
        {Array.from({ length: OTP_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.otpBox,
              {
                borderColor: otpValue.length === i ? colors.emerald : colors.border,
                backgroundColor: colors.whiteMuted,
              },
            ]}
          >
            <Text style={[styles.otpBoxDigit, { color: colors.text }]}>{otpValue[i] ?? ''}</Text>
          </View>
        ))}
      </TouchableOpacity>
      <TextInput
        ref={otpInputRef}
        value={otpValue}
        onChangeText={(text) => {
          setOtpValue(text.replace(/\D/g, '').slice(0, OTP_LENGTH));
          setOtpError(null);
        }}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        style={styles.otpHiddenInput}
        caretHidden
        autoFocus
      />
      {otpError ? (
        <Text style={[styles.otpErrorText, { color: Theme.negative }]}>{otpError}</Text>
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
            <FontAwesome name="check" size={16} color={Theme.textOnPrimary} style={styles.goOnlineBtnIcon} />
            <Text style={styles.goOnlineBtnText}>Verify OTP</Text>
          </>
        )}
      </TouchableOpacity>
      {opts?.showCancel ? (
        <TouchableOpacity onPress={closeOtpClaim} activeOpacity={0.8} style={styles.otpCancelLink}>
          <Text style={[styles.otpCancelText, { color: colors.textMuted }]}>Cancel</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const activeMissionLive = allTrips.find((t) => isTripInProgress(t));
  // Keep showing the completed trip card until the driver taps Close (justCompletedTrip guard).
  const justCompletedTripRow =
    justCompletedTrip && !activeMissionLive
      ? (allTrips.find((t) => isCompletedStatus(t.status)) ?? null)
      : null;
  const activeMission = activeMissionLive ?? justCompletedTripRow ?? undefined;
  const incomingTrips = allTrips.filter((t) => isAssignedNotStarted(t.status));
  const firstIncoming = incomingTrips.find((t) => t.id !== declinedTripId) ?? null;
  // Load-based (assign by phone): trip is in pendingOtpTrips, not allTrips. Use same assignment card and flow.
  const effectiveFirstIncoming = firstIncoming ?? pendingOtpTrips[0] ?? null;
  // OTP only for non-roster (ad-hoc) trips; connected/roster trips accept directly.
  const pendingOtpTripsRequiringOtp = pendingOtpTrips.filter((t) => !isRosterTrip(t));
  // Require OTP when trip is in pending OTP list OR when it's an aggregate (assign-by-phone) trip still in assigned state
  const firstIncomingRequiresOtp = Boolean(
    effectiveFirstIncoming &&
      !isRosterTrip(effectiveFirstIncoming) &&
      (pendingOtpTripsRequiringOtp.some((t) => t.id === effectiveFirstIncoming.id) ||
        (isAggregateTrip(effectiveFirstIncoming) && isAssignedNotStarted(effectiveFirstIncoming.status))),
  );
  const otpClaimTrip =
    (otpClaimTripId
      ? [effectiveFirstIncoming, ...pendingOtpTripsRequiringOtp, ...allTrips].find(
          (trip): trip is tripsService.TripRow => Boolean(trip) && trip.id === otpClaimTripId,
        ) ?? null
      : null);

  /** Trip UI when org-linked or phone-preassigned before a `drivers` row exists. */
  const showDriverTripDashboard = Boolean(
    driver ||
      activeMission ||
      effectiveFirstIncoming != null ||
      otpClaimTripId != null ||
      assignmentFeedback != null,
  );

  const openOtpClaim = useCallback((trip: tripsService.TripRow) => {
    setAcceptError(null);
    setOtpError(null);
    setOtpValue('');
    setOtpClaimTripId(trip.id);
    setTimeout(() => otpInputRef.current?.focus(), 50);
  }, []);

  const closeOtpClaim = useCallback(() => {
    setOtpClaimTripId(null);
    setOtpValue('');
    setOtpError(null);
    setOtpSubmitting(false);
  }, []);

  const handleSubmitOtpClaim = useCallback(async () => {
    const trimmed = (otpValue ?? '').trim().replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (trimmed.length !== OTP_LENGTH) {
      setOtpError('Enter the 6-digit OTP');
      return;
    }

    setAcceptError(null);
    setOtpError(null);
    setOtpSubmitting(true);
    try {
      const { error: err, result } = await claimTripByOtp(trimmed);
      if (err) {
        setOtpError(err.message);
        return;
      }
      if (result?.ok && result.trip_id) {
        await AsyncStorage.setItem(DRIVER_ACCEPTED_TRIP_ID_KEY, result.trip_id);
        setAcceptedTripId(result.trip_id);
        setOtpClaimTripId(null);
        setOtpValue('');
        setAssignmentFeedback('accepted');
        if (assignmentFeedbackTimeoutRef.current) clearTimeout(assignmentFeedbackTimeoutRef.current);
        assignmentFeedbackTimeoutRef.current = setTimeout(() => {
          setAssignmentFeedback(null);
          assignmentFeedbackTimeoutRef.current = null;
        }, 1200);
        await fetch();
        return;
      }
      setOtpError(result?.error ?? 'Could not claim trip');
    } finally {
      setOtpSubmitting(false);
    }
  }, [fetch, otpValue]);

  const handleOpenOtpClaimFromHeader = useCallback(() => {
    const tripToClaim =
      otpClaimTrip ??
      (effectiveFirstIncoming && firstIncomingRequiresOtp ? effectiveFirstIncoming : null) ??
      pendingOtpTripsRequiringOtp[0] ??
      null;

    if (!tripToClaim) {
      Alert.alert('No OTP trip found', 'There is no trip waiting for OTP right now.');
      return;
    }

    openOtpClaim(tripToClaim);
  }, [effectiveFirstIncoming, firstIncomingRequiresOtp, openOtpClaim, otpClaimTrip, pendingOtpTripsRequiringOtp]);

  useEffect(() => {
    if (!otpClaimTripId) return;
    const tripStillExists = [effectiveFirstIncoming, ...pendingOtpTripsRequiringOtp, ...allTrips].some(
      (trip) => trip?.id === otpClaimTripId,
    );
    if (!tripStillExists) closeOtpClaim();
  }, [allTrips, closeOtpClaim, effectiveFirstIncoming, otpClaimTripId, pendingOtpTripsRequiringOtp]);

  // Use driver's accepted offer (commission % or per km) for this org so commission matches control screen.
  // Look up invite against whichever trip is active — incoming OR in-mission (so completed screen shows real earnings).
  const commissionLookupOrgId =
    (activeMission ?? effectiveFirstIncoming)?.organization_id ?? null;
  const acceptedInviteForOrg = commissionLookupOrgId
    ? (invites.find(
        (i) =>
          (i.from_organization_id ?? '').trim() === commissionLookupOrgId.trim() &&
          String(i.status ?? '').toLowerCase() === 'accepted'
      ) ?? null)
    : null;
  // Current terms: the driver row for that fleet first, old invite only as fallback.
  const commissionTrip = activeMission ?? effectiveFirstIncoming ?? null;
  const offerForCommission = commissionTrip
    ? resolveAgreedPayTerms(pickDriverRowForTrip(commissionTrip, [driver]), acceptedInviteForOrg)
    : null;
  const newAssignmentCommission =
    effectiveFirstIncoming != null && !isAggregateTrip(effectiveFirstIncoming)
      ? computeDriverCommissionForTrip(effectiveFirstIncoming, offerForCommission)
      : 0;
  const activeMissionCommission =
    activeMission != null && !isAggregateTrip(activeMission)
      ? computeDriverCommissionForTrip(activeMission, offerForCommission)
      : 0;
  const firstIncomingIsAggregate = effectiveFirstIncoming != null && isAggregateTrip(effectiveFirstIncoming);

  const activeGuidanceTrip =
    activeMission ??
    (effectiveFirstIncoming && effectiveFirstIncoming.id === acceptedTripId
      ? effectiveFirstIncoming
      : null);

  const guidanceStepForPing = activeGuidanceTrip
    ? deriveDriverGuidanceStep(activeGuidanceTrip)
    : null;
  const shouldPersistCheckpointPing = Boolean(
    guidanceStepForPing &&
      (guidanceStepForPing === 'accepted' ||
        guidanceStepForPing === 'pickup' ||
        guidanceStepForPing === 'transit' ||
        guidanceStepForPing === 'reached'),
  );

  pingMapUiRef.current = {
    setDriverMapPosition,
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
      position: { coords: { latitude: number; longitude: number; heading?: number | null } };
    }) => {
      const r = pingMapUiRef.current;
      if (!r) return;
      const { latitude, longitude, position } = args;
      r.setDriverMapPosition({ latitude, longitude });
      r.youLatSv.value = withTiming(latitude, { duration: 450 });
      r.youLonSv.value = withTiming(longitude, { duration: 450 });
      const rawHeading = (position.coords as { heading?: number | null }).heading;
      let headingDeg: number | null =
        typeof rawHeading === 'number' && Number.isFinite(rawHeading) ? rawHeading : null;
      if (headingDeg == null && r.lastHeadingFixRef.current) {
        const bearing = bearingDegrees(r.lastHeadingFixRef.current, { latitude, longitude });
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

  /** Write-only telemetry (skipHealthFetchOnTick + reportFireAndForget inside hook). */
  useDriverLocationStream({
    driver: driver ? { id: driver.id, organization_id: driver.organization_id, user_id: driver.user_id } : null,
    trip: activeGuidanceTrip,
    enabled: Boolean(driver && activeGuidanceTrip),
    communicationActive,
    shouldPersistCheckpoint: shouldPersistCheckpointPing,
    minDisplacementM: null,
    source: 'background',
    onLocationFix: onPingLocationFix,
  });

  /** Map-only foreground watch; updates Reanimated coords without table reads. */
  useDriverMapLivePositionWatch({
    enabled: Boolean(driver && activeGuidanceTrip && communicationActive),
    onFix: onPingLocationFix,
  });

  // Blink/ping for pickup dot and Live badge on the offline "Assigned trip waiting" card (must run after effectiveFirstIncoming is defined)
  const showOfflineAssignedCard = Boolean(driver && !isOnline && effectiveFirstIncoming);
  useEffect(() => {
    if (!showOfflineAssignedCard) return;
    pickupDotPingAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pickupDotPingAnim, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pickupDotPingAnim, { toValue: 0, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showOfflineAssignedCard, pickupDotPingAnim]);

  // Blink for "New assignment" card (when online and trip is pending accept, or showing accept/decline feedback)
  const showNewAssignmentCard = Boolean(
    effectiveFirstIncoming &&
      isOnline &&
      (assignmentFeedback != null || effectiveFirstIncoming.id !== acceptedTripId),
  );
  useEffect(() => {
    if (!showNewAssignmentCard) return;
    newAssignmentBlinkAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(newAssignmentBlinkAnim, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(newAssignmentBlinkAnim, { toValue: 0, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showNewAssignmentCard, newAssignmentBlinkAnim]);

  // Commerce multi-order jobs are a full page. FTL stays on the map sheet.
  const commerceJobTrip =
    activeMission && isCommerceDriverTrip(activeMission)
      ? activeMission
      : effectiveFirstIncoming &&
          effectiveFirstIncoming.id === acceptedTripId &&
          isCommerceDriverTrip(effectiveFirstIncoming)
        ? effectiveFirstIncoming
        : null;

  // Option A: Ola shell only during assignment → completion.
  // When driver is online but has no incoming assignment yet, keep the existing (offline) layout unchanged.
  const shouldShowMap = Boolean(
    !commerceJobTrip && (activeMission || (isOnline && effectiveFirstIncoming)),
  );

  useEffect(() => {
    if (activeMission) return;
    const trip = showNewAssignmentCard ? effectiveFirstIncoming : null;
    if (!trip?.id) {
      setRoutePlanMap(null);
      return;
    }
    let cancelled = false;
    const pickup = getTripStopCoordinate(trip, 'pickup');
    const drop = getTripStopCoordinate(trip, 'drop');
    const fallback = buildTripRowRoutePlanMap(
      trip.id,
      pickup
        ? { ...pickup, label: trip.pickup_area?.trim() || 'Pickup' }
        : null,
      drop
        ? { ...drop, label: trip.drop_location?.trim() || 'Drop' }
        : null,
    );
    if (fallback.stops.length > 0) setRoutePlanMap(fallback);

    void fetchDriverStopExecution(trip.id).then((result) => {
      if (cancelled) return;
      if (!result.ok || result.bundle.stops.length === 0) {
        void fetchRouteExtraStopsForTrips([trip.id]).then(({ rows }) => {
          if (cancelled || rows.length === 0) return;
          const withStops = buildTripRowRoutePlanMap(
            trip.id,
            pickup ? { ...pickup, label: trip.pickup_area?.trim() || 'Pickup' } : null,
            drop ? { ...drop, label: trip.drop_location?.trim() || 'Drop' } : null,
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
      const fromStops = buildDriverRoutePlanMap(trip.id, result.bundle.stops, null, 'pickup', null, true);
      if (fromStops.stops.length > 0) setRoutePlanMap(fromStops);
    });

    return () => {
      cancelled = true;
    };
  }, [activeMission, showNewAssignmentCard, effectiveFirstIncoming?.id]);
  const activeGuidanceStep = activeGuidanceTrip ? deriveDriverGuidanceStep(activeGuidanceTrip) : null;
  const activeGuidance =
    activeGuidanceTrip && activeGuidanceStep
      ? getDriverGuidanceConfig(activeGuidanceStep, activeGuidanceTrip)
      : null;
  const guidanceTargetCoordinate =
    activeGuidanceTrip && activeGuidance?.target
      ? getTripStopCoordinate(activeGuidanceTrip, activeGuidance.target)
      : null;
  const highlightedTarget = activeGuidance?.target ?? null;

  /** Straight-line distance from driver to the current action pin (pickup or drop) — shown as a map badge at leg midpoint. */
  const actionGapStraightLineM = useMemo(() => {
    if (!driverMapPosition || !guidanceTargetCoordinate || !highlightedTarget) return null;
    if (activeGuidanceStep === 'completed') return null;
    return distanceMeters(
      driverMapPosition.latitude,
      driverMapPosition.longitude,
      guidanceTargetCoordinate.latitude,
      guidanceTargetCoordinate.longitude,
    );
  }, [
    driverMapPosition?.latitude,
    driverMapPosition?.longitude,
    guidanceTargetCoordinate?.latitude,
    guidanceTargetCoordinate?.longitude,
    highlightedTarget,
    activeGuidanceStep,
  ]);

  const actionGapMidpointCoord = useMemo((): { latitude: number; longitude: number } | null => {
    if (!driverMapPosition || !guidanceTargetCoordinate || actionGapStraightLineM == null) return null;
    return {
      latitude: (driverMapPosition.latitude + guidanceTargetCoordinate.latitude) / 2,
      longitude: (driverMapPosition.longitude + guidanceTargetCoordinate.longitude) / 2,
    };
  }, [
    driverMapPosition?.latitude,
    driverMapPosition?.longitude,
    guidanceTargetCoordinate?.latitude,
    guidanceTargetCoordinate?.longitude,
    actionGapStraightLineM,
  ]);

  // Ola-style: keep the important route/marker in the top ~50% of the screen.
  const olaMapBottomPaddingPx = Math.round(Dimensions.get('window').height * 0.5);
  const lastCameraAnimTsRef = useRef(0);
  const lastCameraCenterRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const handleShowRouteOnMap = useCallback((stopId?: string | null) => {
    setIsAssignmentSheetExpanded(false);
    try {
      driverSheetRef.current?.snapToIndex?.(0);
    } catch {
      /* ignore */
    }
    planCameraHoldUntilRef.current = Date.now() + 16000;
    const coords = [
      ...(routePlanMap?.stops.map((s) => ({
        latitude: s.latitude,
        longitude: s.longitude,
      })) ?? []),
      ...(driverMapPosition ? [driverMapPosition] : []),
    ];
    const preview = stopId
      ? routePlanMap?.stops.find((s) => s.stopId === stopId)
      : null;
    const fitCorridor = () => {
      try {
        if (
          coords.length >= 1 &&
          mapRef.current &&
          (!preview || routePlanMap?.overview !== false)
        ) {
          mapRef.current.fitToCoordinates(coords, {
            edgePadding: { top: 96, right: 40, bottom: 168, left: 40 },
            animated: true,
          });
          return;
        }
        if (preview && mapRef.current) {
          const mapAny = mapRef.current as {
            animateCamera?: (cam: object, duration?: number) => void;
          } | null;
          mapAny?.animateCamera?.(
            {
              center: {
                latitude: preview.latitude,
                longitude: preview.longitude,
              },
              zoom: 14,
              pitch: 0,
              heading: 0,
            },
            450,
          );
        }
      } catch {
        // ignore camera failures
      }
    };
    fitCorridor();
    // Second fit after the sheet peek settles so the corridor fills the stage.
    setTimeout(fitCorridor, 480);
  }, [driverMapPosition, routePlanMap]);

  // Fit map when an active mission plan loads — do not auto-peek new offers
  // (those stay full-page until the driver taps Map view).
  useEffect(() => {
    if (!shouldShowMap || !routePlanMap?.stops.length) return;
    if (showNewAssignmentCard) return;
    const timer = setTimeout(() => handleShowRouteOnMap(), 350);
    return () => clearTimeout(timer);
  }, [
    handleShowRouteOnMap,
    routePlanMap?.tripId,
    routePlanMap?.stops.length,
    shouldShowMap,
    showNewAssignmentCard,
  ]);

  useEffect(() => {
    if (!showNewAssignmentCard || !shouldShowMap) return;
    setIsAssignmentSheetExpanded(true);
    const t = setTimeout(() => {
      try {
        driverSheetRef.current?.snapToIndex?.(1);
      } catch {
        /* ignore */
      }
    }, 80);
    return () => clearTimeout(t);
  }, [showNewAssignmentCard, shouldShowMap, effectiveFirstIncoming?.id]);

  const handleNavigateToPickup = useCallback(() => {
    const trip = effectiveFirstIncoming;
    if (!trip) return;
    const pickup = getTripStopCoordinate(trip, 'pickup');
    if (!pickup) {
      Alert.alert(
        'Pickup unavailable',
        'This trip does not have a map pin for pickup yet.',
      );
      return;
    }
    void openExternalNavigation(pickup.latitude, pickup.longitude);
  }, [effectiveFirstIncoming]);

  const handleSeeRoute = useCallback(() => {
    // Same in-app corridor preview as Map (polyline + stops), not Google Maps.
    handleShowRouteOnMap();
  }, [handleShowRouteOnMap]);

  // Smoothly follow the driver marker with `animateCamera` (avoid jitter from `fitToCoordinates`).
  useEffect(() => {
    if (!shouldShowMap) return;
    if (!driverMapPosition) return;
    if (!mapRef.current) return;
    if (Date.now() < planCameraHoldUntilRef.current) return;
    if (routePlanMap?.overview) return;

    const now = Date.now();
    // Throttle to prevent over-animating on frequent GPS updates.
    if (now - lastCameraAnimTsRef.current < 350) return;

    // Also require meaningful movement from the last camera center.
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

    try {
      const mapAny = mapRef.current as { animateCamera?: (cam: object, duration?: number) => void } | null;
      const heading = Number(youHeadingSv.value);
      mapAny?.animateCamera?.(
        {
          center: {
            latitude: driverMapPosition.latitude,
            longitude: driverMapPosition.longitude,
          },
          zoom: 16,
          pitch: 0,
          heading: Number.isFinite(heading) ? heading : 0,
        },
        450
      );
    } catch {
      // ignore camera animation failures
    }
  }, [driverMapPosition?.latitude, driverMapPosition?.longitude, routePlanMap?.overview, shouldShowMap]);

  const [optimalRoute, setOptimalRoute] = useState<RouteResult | null>(null);

  // Fetch optimal route when a trip is active or incoming
  useEffect(() => {
    if (!shouldShowMap) {
      setOptimalRoute(null);
      return;
    }
    let cancelled = false;

    const fetchRoute = async (
      from: { latitude: number; longitude: number },
      to: { latitude: number; longitude: number }
    ) => {
      const res = await getOptimalRoute(from, to);
      if (!cancelled) setOptimalRoute(res ?? null);
    };

    if (activeGuidanceTrip && driverMapPosition && guidanceTargetCoordinate) {
      // Live GPS → current target (API road route).
      fetchRoute(driverMapPosition, guidanceTargetCoordinate);
    } else if (activeGuidanceTrip) {
      // No GPS yet — still automate from→to corridor via routing API.
      const pickup = getTripStopCoordinate(activeGuidanceTrip, 'pickup');
      const drop = getTripStopCoordinate(activeGuidanceTrip, 'drop');
      if (pickup && drop) {
        fetchRoute(pickup, drop);
      } else {
        setOptimalRoute(null);
      }
    } else if (showNewAssignmentCard && effectiveFirstIncoming) {
      const pickup = getTripStopCoordinate(effectiveFirstIncoming, 'pickup');
      const drop = getTripStopCoordinate(effectiveFirstIncoming, 'drop');
      if (pickup && drop) {
        fetchRoute(pickup, drop);
      } else {
        setOptimalRoute(null);
      }
    } else {
      setOptimalRoute(null);
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeGuidanceTrip,
    driverMapPosition,
    effectiveFirstIncoming,
    guidanceTargetCoordinate,
    shouldShowMap,
    showNewAssignmentCard,
  ]);

  // When map is shown (online or active trip), get current position for map center and "You" marker.
  useEffect(() => {
    if (!shouldShowMap) {
      setDriverMapPosition(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const Location = await getExpoLocation();
        if (!Location) return;
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({});
        if (cancelled) return;
        setDriverMapPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      } catch {
        if (!cancelled) setDriverMapPosition(null);
      }
    })();
    return () => { cancelled = true; };
  }, [shouldShowMap]);

  // If we switch to a different trip, reset the truck marker so it starts from current GPS.
  useEffect(() => {
    const tripId = activeGuidanceTrip?.id ?? null;
    if (tripId === lastAnimatedTripIdRef.current) return;
    lastAnimatedTripIdRef.current = tripId;
    setTruckPosition(null);
    lastAnimatedStepKeyRef.current = null;
  }, [activeGuidanceTrip?.id]);

  // Stop any in-flight animation when the map closes.
  useEffect(() => {
    if (shouldShowMap) return;
    truckAnimTokenRef.current += 1;
    if (truckRafRef.current != null) cancelAnimationFrame(truckRafRef.current);
    truckRafRef.current = null;
  }, [shouldShowMap]);

  // Status-driven truck animation:
  // - accepted/pickup: animate current -> pickup
  // - transit: animate pickup -> midpoint between pickup & drop (and stop)
  // - reached/completed: animate current -> drop and stay
  useEffect(() => {
    if (!shouldShowMap || !activeGuidanceTrip || !activeGuidanceStep) return;

    const stepKey = `${activeGuidanceTrip.id}:${activeGuidanceStep}`;
    if (lastAnimatedStepKeyRef.current === stepKey) return;
    lastAnimatedStepKeyRef.current = stepKey;

    // Cancel any previous animation run.
    truckAnimTokenRef.current += 1;
    if (truckRafRef.current != null) cancelAnimationFrame(truckRafRef.current);
    truckRafRef.current = null;

    const run = async () => {
      const pickupCoord = getTripStopCoordinate(activeGuidanceTrip, 'pickup');
      const dropCoord = getTripStopCoordinate(activeGuidanceTrip, 'drop');

      const fromCoord = truckPosition ?? driverMapPosition;
      if (!fromCoord) return;

      const SPEED_MPS = 9; // ~32 km/h; UX timing, not real vehicle physics

      const downsample = (pts: { latitude: number; longitude: number }[]) => {
        if (pts.length <= 2) return pts;
        const minSpacingM = 25;
        const out: { latitude: number; longitude: number }[] = [pts[0]];
        let last = pts[0];
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          if (distanceMeters(last.latitude, last.longitude, p.latitude, p.longitude) >= minSpacingM) {
            out.push(p);
            last = p;
          }
        }
        const end = pts[pts.length - 1];
        if (out[out.length - 1] !== end) out.push(end);
        return out;
      };

      const buildCumDistances = (pts: { latitude: number; longitude: number }[]) => {
        const cum: number[] = [0];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          cum.push(cum[i] + distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude));
        }
        return cum;
      };

      const interpolateAtDistance = (
        pts: { latitude: number; longitude: number }[],
        cum: number[],
        dist: number
      ) => {
        if (pts.length === 0) return null;
        if (pts.length === 1) return pts[0];
        const total = cum[cum.length - 1] ?? 0;
        if (total <= 0) return pts[pts.length - 1];
        const clamped = Math.max(0, Math.min(total, dist));

        for (let i = 0; i < cum.length - 1; i++) {
          const d0 = cum[i];
          const d1 = cum[i + 1];
          if (clamped >= d0 && clamped <= d1) {
            const denom = d1 - d0;
            const t = denom <= 0 ? 0 : (clamped - d0) / denom;
            const a = pts[i];
            const b = pts[i + 1];
            return {
              latitude: a.latitude + (b.latitude - a.latitude) * t,
              longitude: a.longitude + (b.longitude - a.longitude) * t,
            };
          }
        }
        return pts[pts.length - 1];
      };

      const animateByDistance = (
        pts: { latitude: number; longitude: number }[],
        cum: number[],
        startDist: number,
        endDist: number,
        durationMs: number
      ) => {
        const token = truckAnimTokenRef.current;
        const travel = Math.max(0, endDist - startDist);
        if (travel <= 0) {
          const finalPos = interpolateAtDistance(pts, cum, endDist);
          if (finalPos && token === truckAnimTokenRef.current) setTruckPosition(finalPos);
          return;
        }

        const startTs = Date.now();
        truckLastUpdateMsRef.current = 0;

        const frame = () => {
          if (token !== truckAnimTokenRef.current) return;
          const now = Date.now();
          const elapsed = now - startTs;
          const t = Math.min(1, elapsed / Math.max(1, durationMs));
          const dist = startDist + travel * t;

          // Throttle state updates to keep UI smooth.
          if (now - truckLastUpdateMsRef.current >= 70) {
            const p = interpolateAtDistance(pts, cum, dist);
            if (p) setTruckPosition(p);
            truckLastUpdateMsRef.current = now;
          }

          if (t < 1) {
            truckRafRef.current = requestAnimationFrame(frame);
          } else {
            const finalPos = interpolateAtDistance(pts, cum, endDist);
            if (finalPos && token === truckAnimTokenRef.current) setTruckPosition(finalPos);
          }
        };

        truckRafRef.current = requestAnimationFrame(frame);
      };

      const runFullAnimation = async (routeFrom: typeof fromCoord, routeTo: typeof fromCoord, mode: 'full' | 'mid') => {
        const route = await getOptimalRoute(routeFrom, routeTo);
        if (token !== truckAnimTokenRef.current) return;
        if (!route || route.coordinates.length < 2) {
          const pts = [routeFrom, routeTo];
          const cum = buildCumDistances(pts);
          const total = cum[cum.length - 1] ?? 0;
          const endDist = mode === 'mid' ? total * 0.5 : total;
          animateByDistance(pts, cum, 0, endDist, Math.min(10000, Math.max(800, (total / SPEED_MPS) * 1000)));
          return;
        }
        const pts = downsample(route.coordinates);
        const cum = buildCumDistances(pts);
        const total = cum[cum.length - 1] ?? 0;
        if (total <= 0) return;

        const endDist = mode === 'mid' ? total * 0.5 : total;
        animateByDistance(
          pts,
          cum,
          0,
          endDist,
          Math.min(10000, Math.max(900, (route.duration * 1000) * (endDist / total)))
        );
      };

      // Needed for token checks inside route fetch helper.
      const token = truckAnimTokenRef.current;

      if (activeGuidanceStep === 'transit') {
        if (!pickupCoord || !dropCoord) return;

        // For transit, animate from the current truck position (usually at pickup)
        // toward the midpoint of pickup->drop path, then stop there.
        const route = await getOptimalRoute(pickupCoord, dropCoord);
        if (token !== truckAnimTokenRef.current) return;

        if (!route || route.coordinates.length < 2) {
          const midpoint = {
            latitude: pickupCoord.latitude + (dropCoord.latitude - pickupCoord.latitude) * 0.5,
            longitude: pickupCoord.longitude + (dropCoord.longitude - pickupCoord.longitude) * 0.5,
          };
          const pts = [fromCoord, midpoint];
          const cum = buildCumDistances(pts);
          const total = cum[cum.length - 1] ?? 0;
          animateByDistance(pts, cum, 0, total, Math.min(10000, Math.max(900, (total / SPEED_MPS) * 1000)));
          return;
        }

        const pts = downsample(route.coordinates);
        const cum = buildCumDistances(pts);
        const total = cum[cum.length - 1] ?? 0;
        if (total <= 0) return;

        const endDist = total * 0.5; // midpoint stop

        // Find a startDist along the same pickup->drop path that best matches fromCoord.
        let bestI = 0;
        let bestD = Number.POSITIVE_INFINITY;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const d = distanceMeters(fromCoord.latitude, fromCoord.longitude, p.latitude, p.longitude);
          if (d < bestD) {
            bestD = d;
            bestI = i;
          }
        }
        const startDist = cum[bestI] ?? 0;

        const travel = Math.max(0, endDist - startDist);
        const ratio = travel / total;
        animateByDistance(
          pts,
          cum,
          startDist,
          endDist,
          Math.min(11000, Math.max(900, route.duration * 1000 * ratio))
        );
        return;
      }

      if (activeGuidanceStep === 'accepted' || activeGuidanceStep === 'pickup') {
        if (!pickupCoord) return;
        await runFullAnimation(fromCoord, pickupCoord, 'full');
        return;
      }

      if (activeGuidanceStep === 'reached' || activeGuidanceStep === 'completed') {
        if (!dropCoord) return;
        await runFullAnimation(fromCoord, dropCoord, 'full');
        return;
      }
    };

    run().catch(() => {
      // If routing fails, do nothing; GPS/route will recover on next step change.
    });
  }, [
    shouldShowMap,
    activeGuidanceTrip,
    activeGuidanceStep,
    driverMapPosition,
    truckPosition,
  ]);

  useEffect(() => {
    const guidanceKey = activeGuidanceTrip && activeGuidanceStep ? `${activeGuidanceTrip.id}:${activeGuidanceStep}` : null;
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

  const defaultBoundsTrip = (activeMission || effectiveFirstIncoming) as tripsService.TripRow | null;
  const defaultBoundsPickup = defaultBoundsTrip ? getTripStopCoordinate(defaultBoundsTrip, 'pickup') : null;
  const defaultBoundsDrop = defaultBoundsTrip ? getTripStopCoordinate(defaultBoundsTrip, 'drop') : null;
  const defaultBoundsTripKey =
    defaultBoundsTrip && defaultBoundsPickup && defaultBoundsDrop
      ? `${defaultBoundsTrip.id}:${defaultBoundsPickup.latitude}:${defaultBoundsPickup.longitude}:${defaultBoundsDrop.latitude}:${defaultBoundsDrop.longitude}`
      : null;

  const fitMapToActiveContext = useCallback(
    (
      targetRef: { current: MapView | null },
      options?: { isFullScreen?: boolean; force?: boolean }
    ) => {
      if (!targetRef.current) return;
      if (routePlanMap && routePlanMap.stops.length > 0) return;
      const tripForBounds = defaultBoundsTrip;
      const pickup = defaultBoundsPickup;
      const drop = defaultBoundsDrop;

      if (!tripForBounds || !pickup || !drop) return;

      const isFullScreen = options?.isFullScreen === true;
      const screenHeight = Dimensions.get('window').height;
      const inlineMapHeight =
        inlineMapViewportHeightRef.current > 0
          ? inlineMapViewportHeightRef.current
          : Math.round(screenHeight * 0.42);

      // When using Ola-style bottom sheet, reserve the lower portion for the panel.
      // This keeps pickup/drop focus visible in the top ~50%.
      const bottomPadding = shouldShowMap
        ? olaMapBottomPaddingPx
        : isFullScreen
          ? 160
          : Math.max(110, Math.round(inlineMapHeight * 0.45));
      const fitKey = `${tripForBounds.id}:${pickup.latitude}:${pickup.longitude}:${drop.latitude}:${drop.longitude}`;
      const lastFitKeyRef = isFullScreen ? fullMapLastFitKeyRef : inlineMapLastFitKeyRef;

      if (!options?.force && lastFitKeyRef.current === fitKey) return;

      targetRef.current.fitToCoordinates([pickup, drop], {
        edgePadding: { top: 100, right: 50, bottom: bottomPadding, left: 50 },
        animated: false,
      });
      lastFitKeyRef.current = fitKey;
    },
    [defaultBoundsDrop, defaultBoundsPickup, defaultBoundsTrip, olaMapBottomPaddingPx, routePlanMap, shouldShowMap]
  );

  // Fit inline map once per trip bounds so OTP/state updates do not re-center the camera.
  useEffect(() => {
    const timer = setTimeout(() => {
      fitMapToActiveContext(mapRef, { isFullScreen: false });
    }, 500);
    return () => clearTimeout(timer);
  }, [defaultBoundsTripKey, fitMapToActiveContext]);

  // Re-fit once after inline map has an actual measured height for accurate pickup/drop framing.
  useEffect(() => {
    if (!defaultBoundsTripKey || inlineMapViewportHeight <= 0) return;
    const timer = setTimeout(() => {
      fitMapToActiveContext(mapRef, { isFullScreen: false, force: true });
    }, 120);
    return () => clearTimeout(timer);
  }, [defaultBoundsTripKey, fitMapToActiveContext, inlineMapViewportHeight]);
  // Pulsating circle when searching for assignments (online, no mission, no incoming)
  const showSearchingOverlay = Boolean(
    driver && isOnline && !activeMission && !effectiveFirstIncoming && invites.filter((i) => i.status === 'pending').length === 0
  );
  useEffect(() => {
    if (!showSearchingOverlay) return;
    searchPulseAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(searchPulseAnim, { toValue: 1, duration: 1600, useNativeDriver: Platform.OS !== 'web' })
    );
    loop.start();
    return () => loop.stop();
  }, [showSearchingOverlay, searchPulseAnim]);

  const driverName = profile?.full_name?.trim() || profile?.displayName?.trim() || 'Pilot';

  const handleFocusCurrentLocation = useCallback(() => {
    const targetRef = isFullMapVisible ? fullMapRef : mapRef;
    if (!targetRef.current || !driverMapPosition) return;

    try {
      const mapAny = targetRef.current as { animateCamera?: (cam: object, duration?: number) => void } | null;
      mapAny?.animateCamera?.(
        {
          center: {
            latitude: driverMapPosition.latitude,
            longitude: driverMapPosition.longitude,
          },
          zoom: 16,
          pitch: 0,
          heading: Number(youHeadingSv.value) || 0,
        },
        500
      );
    } catch {
      // ignore
    }
  }, [driverMapPosition, isFullMapVisible]);

  useEffect(() => {
    if (!isFullMapVisible) return;
    const timer = setTimeout(() => {
      fitMapToActiveContext(fullMapRef, { isFullScreen: true, force: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [defaultBoundsTripKey, fitMapToActiveContext, isFullMapVisible]);

  const handleSetOffline = useCallback(() => {
    setIsOnline(false);
    setJustCompletedTrip(false);
  }, []);

  const renderDriverMap = (
    targetRef: { current: MapView | null },
    options?: { fullScreen?: boolean; controlsVariant?: 'modal' | 'embedded' }
  ) => {
    const isFullScreen = options?.fullScreen === true;
    const controlsVariant = options?.controlsVariant ?? 'modal';
    const inlineMapControlsBottom = 18;
    const mapInteractionsLocked = Boolean(otpClaimTripId);

    return (
      <View
        style={isFullScreen ? styles.fullMapContainer : styles.assignedMapHalf}
        onLayout={(event) => {
          if (isFullScreen) return;
          const measured = event.nativeEvent.layout.height;
          inlineMapViewportHeightRef.current = measured;
          if (Math.abs(measured - inlineMapViewportHeight) > 1) {
            setInlineMapViewportHeight(measured);
          }
        }}
      >
        <MapView
          ref={(instance) => {
            targetRef.current = instance;
          }}
          style={isFullScreen ? styles.fullMapView : styles.assignedMapInHalf}
          initialRegion={
            driverMapPosition
              ? { ...driverMapPosition, latitudeDelta: 0.02, longitudeDelta: 0.02 }
              : DEFAULT_MAP_REGION
          }
          mapType={Platform.OS === 'ios' ? "mutedStandard" as const : 'standard'}
          userInterfaceStyle={mapIsDark ? "dark" as const : "light" as const}
          customMapStyle={mapIsDark ? (darkMapStyle as unknown as import("react-native-maps").MapStyleElement[]) : undefined}
          showsUserLocation={false}
          scrollEnabled={!mapInteractionsLocked}
          zoomEnabled={!mapInteractionsLocked}
          rotateEnabled={false}
          pitchEnabled={!mapInteractionsLocked}
          moveOnMarkerPress={false}
          pointerEvents="auto"
          onMapReady={() => {
            try {
              // Keep the map stable; we follow the driver via animateCamera in an effect.
              if (driverMapPosition && targetRef.current) {
                const mapAny = targetRef.current as { animateCamera?: (cam: object, duration?: number) => void } | null;
                mapAny?.animateCamera?.(
                  {
                    center: {
                      latitude: driverMapPosition.latitude,
                      longitude: driverMapPosition.longitude,
                    },
                    zoom: 16,
                    pitch: 0,
                    heading: Number(youHeadingSv.value) || 0,
                  },
                  450
                );
              }
            } catch {
              // ignore
            }
          }}
          mapPadding={{ top: 0, left: 0, right: 0, bottom: olaMapBottomPaddingPx }}
        >
          {/* Always render the "You" marker so the current-location indication is visible
              immediately, then it updates as driverMapPosition becomes available. */}
          <OlaAnimatedMarker
            animatedProps={youMarkerAnimatedProps}
            coordinate={driverMapPosition ?? DEFAULT_MAP_REGION}
            anchor={{ x: 0.5, y: 1 }}
          >
              <Reanimated.View style={youIconAnimatedStyle}>
                <DriverMapAvatarMarker
                  avatarUri={avatarUri}
                  avatarSeed={avatarSeed}
                  isOnline={isOnline}
                  size={48}
                />
              </Reanimated.View>
              <Callout>
                <View
                  style={[
                    styles.assignedMapCallout,
                    {
                      backgroundColor: Theme.buttonDark,
                      borderColor: 'rgba(255,255,255,0.16)',
                    },
                  ]}
                >
                  <Text style={[styles.assignedMapCalloutTitle, { color: Theme.buttonDarkText }]}>
                    You
                  </Text>
                  <Text
                    style={[styles.assignedMapCalloutSub, { color: Theme.textOnDarkMuted }]}
                    numberOfLines={2}
                  >
                    {locationLabel ?? 'Current location'}
                  </Text>
                </View>
              </Callout>
          </OlaAnimatedMarker>

          {truckPosition && (
            <Marker
              coordinate={truckPosition}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.customMapMarkerTruck}>
                <FontAwesome name="truck" size={14} color={Theme.buttonPrimaryText} />
              </View>
              <Callout tooltip>
                <View
                  style={[
                    styles.assignedMapCallout,
                    {
                      backgroundColor: Theme.buttonDark,
                      borderColor: 'rgba(255,255,255,0.16)',
                    },
                  ]}
                >
                  <Text style={[styles.assignedMapCalloutTitle, { color: Theme.buttonDarkText }]}>
                    Truck
                  </Text>
                  <Text
                    style={[styles.assignedMapCalloutSub, { color: Theme.textOnDarkMuted }]}
                    numberOfLines={2}
                  >
                    {activeGuidanceStep === 'transit' ? 'Moving to drop-off' : 'On trip'}
                  </Text>
                </View>
              </Callout>
            </Marker>
          )}

          {shouldShowMap && routePlanMap && routePlanMap.stops.length > 0 ? (
            <>
              {routePlanPolyline(routePlanMap).length >= 2 ? (
                <Polyline
                  coordinates={routePlanPolyline(routePlanMap)}
                  strokeColor={Theme.driverEmerald}
                  strokeWidth={3}
                  lineDashPattern={[8, 6]}
                  lineCap="round"
                />
              ) : null}
              {routePlanMap.stops.map((stop) => {
                const inFocus = stop.kind === routePlanMap.focusKind;
                const emphasized = stop.isCurrent || routePlanMap.previewStopId === stop.stopId;
                return (
                  <Marker
                    key={stop.stopId}
                    coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
                    anchor={{ x: 0.5, y: 1 }}
                    opacity={routePlanMap.overview || inFocus ? 1 : 0.55}
                    zIndex={emphasized ? 30 : inFocus ? 20 : 10}
                  >
                    <RoutePlanMapPin
                      kind={stop.kind}
                      index={stop.kindIndex}
                      caption={routePlanStopCaption(stop)}
                      emphasized={emphasized}
                    />
                    <Callout>
                      <View
                        style={[
                          styles.assignedMapCallout,
                          { backgroundColor: Theme.buttonDark, borderColor: 'rgba(255,255,255,0.16)' },
                        ]}
                      >
                        <Text style={[styles.assignedMapCalloutTitle, { color: Theme.buttonDarkText }]}>
                          {routePlanStopCaption(stop)}
                        </Text>
                        <Text
                          style={[styles.assignedMapCalloutSub, { color: Theme.textOnDarkMuted }]}
                          numberOfLines={2}
                        >
                          {stop.label}
                        </Text>
                      </View>
                    </Callout>
                  </Marker>
                );
              })}
            </>
          ) : shouldShowMap && (effectiveFirstIncoming || activeMission) ? (
            <>
              {getTripStopCoordinate((activeMission || effectiveFirstIncoming) as tripsService.TripRow, 'pickup') && (
                <Marker
                  coordinate={getTripStopCoordinate((activeMission || effectiveFirstIncoming) as tripsService.TripRow, 'pickup')!}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View
                    style={[
                      styles.customMapMarkerPickup,
                      highlightedTarget === 'pickup' && styles.customMapMarkerActive,
                    ]}
                  >
                    <FontAwesome name="map-marker" size={highlightedTarget === 'pickup' ? 14 : 12} color="white" />
                  </View>
                </Marker>
              )}
              {getTripStopCoordinate((activeMission || effectiveFirstIncoming) as tripsService.TripRow, 'drop') && (
                <Marker
                  coordinate={getTripStopCoordinate((activeMission || effectiveFirstIncoming) as tripsService.TripRow, 'drop')!}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View
                    style={[
                      styles.customMapMarkerDrop,
                      highlightedTarget === 'drop' && styles.customMapMarkerActive,
                    ]}
                  >
                    <FontAwesome name="flag" size={highlightedTarget === 'drop' ? 12 : 10} color="white" />
                  </View>
                </Marker>
              )}
              {optimalRoute ? (
                <>
                  <Polyline
                    coordinates={optimalRoute.coordinates}
                    strokeColor={`${Theme.primary}33`}
                    strokeWidth={8}
                    lineCap="round"
                  />
                  <Polyline
                    coordinates={optimalRoute.coordinates}
                    strokeColor={Theme.primary}
                    strokeWidth={4}
                    lineCap="round"
                  />
                </>
              ) : (
                (() => {
                  const fallbackPickup = getTripStopCoordinate(
                    (activeMission || effectiveFirstIncoming) as tripsService.TripRow,
                    'pickup'
                  );
                  const fallbackDrop = getTripStopCoordinate(
                    (activeMission || effectiveFirstIncoming) as tripsService.TripRow,
                    'drop'
                  );
                  const fallbackCoordinates =
                    activeGuidanceTrip && driverMapPosition && guidanceTargetCoordinate
                      ? [driverMapPosition, guidanceTargetCoordinate]
                      : fallbackPickup && fallbackDrop
                        ? [fallbackPickup, fallbackDrop]
                        : [];
                  return fallbackCoordinates.length >= 2 ? (
                    <Polyline
                      coordinates={fallbackCoordinates}
                      strokeColor={Theme.primary}
                      strokeWidth={3}
                      lineDashPattern={[1]}
                    />
                  ) : null;
                })()
              )}
              {actionGapMidpointCoord &&
              actionGapStraightLineM != null &&
              highlightedTarget &&
              activeGuidanceStep !== 'completed' ? (
                <Marker
                  coordinate={actionGapMidpointCoord}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  zIndex={400}
                  accessibilityLabel={`Straight-line gap ${formatStraightLineGapLabel(actionGapStraightLineM)} ${
                    highlightedTarget === 'pickup' ? 'to pickup' : 'to drop-off'
                  }`}
                >
                  <View style={styles.gapFenceMarkerOuter}>
                    <View
                      style={[
                        styles.gapFencePill,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <View
                        style={[
                          styles.gapFenceIconWrap,
                          highlightedTarget === 'pickup'
                            ? { backgroundColor: colors.emeraldMuted }
                            : { backgroundColor: `${Theme.teslaRed}22` },
                        ]}
                      >
                        <FontAwesome
                          name="arrows-h"
                          size={11}
                          color={highlightedTarget === 'pickup' ? colors.emerald : Theme.teslaRed}
                        />
                      </View>
                      <View style={styles.gapFenceTextCol}>
                        <Text style={[styles.gapFenceDistance, { color: colors.text }]} numberOfLines={1}>
                          {formatStraightLineGapLabel(actionGapStraightLineM)}
                        </Text>
                        <Text style={[styles.gapFenceCaption, { color: colors.textMuted }]} numberOfLines={1}>
                          {highlightedTarget === 'pickup'
                            ? 'Straight-line to pickup'
                            : 'Straight-line to drop'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Marker>
              ) : null}
            </>
          ) : null}
        </MapView>

        {routePlanMap && routePlanMap.stops.length > 0 ? (
          <View
            style={[
              styles.mapGuidanceChip,
              isFullScreen
                ? { top: insets.top + 16, left: 16, right: 76 }
                : { left: 14, right: 72, bottom: 18 },
              { backgroundColor: colors.surface, borderColor: colors.border, pointerEvents: 'none' },
            ]}
          >
            <Text style={[styles.mapGuidanceTitle, { color: colors.text }]} numberOfLines={1}>
              Trip plan · {routePlanMap.stops.length} {routePlanMap.stops.length === 1 ? 'stop' : 'stops'}
            </Text>
            <Text style={[styles.mapGuidanceSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
              Full route · pickup and delivery in order
            </Text>
          </View>
        ) : activeGuidance ? (
          <View
            style={[
              styles.mapGuidanceChip,
              isFullScreen
                ? { top: insets.top + 16, left: 16, right: 76 }
                : { left: 14, right: 72, bottom: 18 },
              { backgroundColor: colors.surface, borderColor: colors.border, pointerEvents: 'none' },
            ]}
          >
            <View style={styles.mapGuidanceHeaderRow}>
              <View style={[styles.mapGuidanceIconWrap, { backgroundColor: colors.emeraldMuted }]}>
                <FontAwesome name={activeGuidance.icon} size={14} color={colors.emerald} />
              </View>
              <Text style={[styles.mapGuidanceTitle, { color: colors.text }]} numberOfLines={1}>
                {activeGuidance.title}
              </Text>
            </View>
            <Text style={[styles.mapGuidanceSubtitle, { color: colors.textMuted }]} numberOfLines={2}>
              {activeGuidance.subtitle}
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.mapControlsColumn,
            isFullScreen
              ? {
                  // "embedded" mode sits above the bottom-sheet details area.
                  // Anchor around the top half boundary so the buttons align with
                  // the same vertical zone as "Estimated earnings".
                  top:
                    controlsVariant === 'embedded'
                      ? Math.max(
                          insets.top + Layout.driverHeaderTopOffset + (Layout.driverHeaderAvatarSize - 8),
                          // Nudge up to avoid overlapping the top of the bottom-sheet content.
                          olaMapBottomPaddingPx - 160
                        )
                      : insets.top + 16,
                  right: 16,
                }
              : { bottom: inlineMapControlsBottom, right: 14, pointerEvents: 'box-none' },
          ]}
        >
          <TouchableOpacity
            onPress={() => setIsFullMapVisible((prev) => !prev)}
            style={[styles.mapControlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={isFullMapVisible ? 'Exit full map' : 'Open full map'}
          >
            <FontAwesome
              name={isFullMapVisible ? 'compress' : 'expand'}
              size={16}
              color={colors.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!driverMapPosition) return;
              nativeMapZoomRef.current = Math.max(3, Math.min(20, nativeMapZoomRef.current + 1));
              try {
                targetRef.current?.animateCamera?.(
                  { center: driverMapPosition, zoom: nativeMapZoomRef.current, pitch: 0 },
                  { duration: 280 },
                );
              } catch {
                // ignore
              }
            }}
            style={[
              styles.mapControlBtn,
              { backgroundColor: colors.surface, borderColor: colors.border },
              mapInteractionsLocked && styles.mapControlBtnDisabled,
            ]}
            activeOpacity={0.9}
            disabled={mapInteractionsLocked}
            accessibilityRole="button"
            accessibilityLabel="Zoom in"
          >
            <FontAwesome name="plus" size={16} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!driverMapPosition) return;
              nativeMapZoomRef.current = Math.max(3, Math.min(20, nativeMapZoomRef.current - 1));
              try {
                targetRef.current?.animateCamera?.(
                  { center: driverMapPosition, zoom: nativeMapZoomRef.current, pitch: 0 },
                  { duration: 280 },
                );
              } catch {
                // ignore
              }
            }}
            style={[
              styles.mapControlBtn,
              { backgroundColor: colors.surface, borderColor: colors.border },
              mapInteractionsLocked && styles.mapControlBtnDisabled,
            ]}
            activeOpacity={0.9}
            disabled={mapInteractionsLocked}
            accessibilityRole="button"
            accessibilityLabel="Zoom out"
          >
            <FontAwesome name="minus" size={16} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleFocusCurrentLocation}
            style={[
              styles.mapControlBtn,
              { backgroundColor: colors.surface, borderColor: colors.border },
              !driverMapPosition && styles.mapControlBtnDisabled,
            ]}
            activeOpacity={0.9}
            disabled={!driverMapPosition}
            accessibilityRole="button"
            accessibilityLabel="Current location"
          >
            <FontAwesome name="location-arrow" size={16} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

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
              alignSelf: 'center',
              backgroundColor: Theme.buttonDark,
              pointerEvents: 'none',
            },
          ]}
        >
          <Text style={[styles.toastText, { color: Theme.buttonDarkText }]} numberOfLines={2}>
            {toastMessage}
          </Text>
        </View>
      ) : null}

      {/* Ola-style persistent Operations Panel (bottom sheet) */}
      {shouldShowMap ? (
        <GestureHandlerRootViewComponent style={styles.olaDriverRoot}>
          <KeyboardAvoidingView
            style={styles.olaDriverKeyboardAvoid}
            behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 12 : 0}
            enabled={Platform.OS !== 'web'}
          >
            {showNewAssignmentCard && effectiveFirstIncoming && (
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
              (activeMission || (effectiveFirstIncoming && effectiveFirstIncoming.id === acceptedTripId)) && (
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

            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={styles.olaMapDismissArea}>
                {renderDriverMap(mapRef, { fullScreen: true, controlsVariant: 'embedded' })}
              </View>
            </TouchableWithoutFeedback>

            <BottomSheetComponent
              ref={driverSheetRef as never}
              snapPoints={
                showNewAssignmentCard ? ['18%', '92%'] : ['20%', '45%', '88%']
              }
              index={showNewAssignmentCard ? 1 : 0}
              enablePanDownToClose={false}
              onChange={(nextIndex) =>
                setIsAssignmentSheetExpanded(
                  showNewAssignmentCard ? nextIndex >= 1 : nextIndex >= 1,
                )
              }
              bottomInset={driverSheetBottomInset}
              backgroundStyle={{
                backgroundColor: colors.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                overflow: 'hidden',
              }}
              handleIndicatorStyle={{
                backgroundColor: colors.border,
                width: 50,
                height: 4,
                borderRadius: 999,
              }}
            >
              <BottomSheetScrollViewComponent
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.olaSheetContent, { paddingBottom: 28 }]}
              >
                {!hasNativeBottomSheetSupport ? (
                  <View
                    style={[
                      styles.driverNoticeCard,
                      {
                        backgroundColor: colors.whiteMuted,
                        borderColor: colors.border,
                        marginBottom: 16,
                      },
                    ]}
                  >
                    <Text style={[styles.driverNoticeTitle, { color: colors.text }]}>Limited driver panel</Text>
                    <Text style={[styles.driverNoticeBody, { color: colors.textMuted }]}>
                      This build is missing native gesture support, so the sheet is shown in a basic scroll view.
                    </Text>
                  </View>
                ) : null}
                <View style={styles.assignedSheetContent}>
                  {showNewAssignmentCard && effectiveFirstIncoming
                    ? assignmentFeedback === 'accepted'
                      ? (
                          <View style={styles.feedbackBlock}>
                              <View
                                style={[
                                  styles.feedbackIconWrap,
                                  styles.feedbackIconWrapSuccess,
                                  { backgroundColor: colors.emeraldMuted },
                                ]}
                              >
                                <FontAwesome name="check-circle" size={36} color={colors.emerald} />
                              </View>
                              <Text style={[styles.feedbackTitle, { color: colors.text }]}>Trip booked</Text>
                              <Text style={[styles.feedbackSubtitle, { color: colors.textMuted }]}>
                                Head to pickup. Continue below.
                              </Text>
                          </View>
                        )
                      : assignmentFeedback === 'declined'
                        ? (
                            <View style={styles.feedbackBlock}>
                                <View
                                  style={[
                                    styles.feedbackIconWrap,
                                    styles.feedbackIconWrapSkipped,
                                    { backgroundColor: colors.whiteMuted },
                                  ]}
                                >
                                  <FontAwesome name="times-circle" size={36} color={colors.textMuted} />
                                </View>
                                <Text style={[styles.feedbackTitle, { color: colors.text }]}>Skipped</Text>
                                <Text style={[styles.feedbackSubtitle, { color: colors.textMuted }]}>
                                  Looking for your next trip.
                                </Text>
                            </View>
                          )
                        : (
                            <View style={{ marginHorizontal: 0 }}>
                              <JobRequestCard
                                edgeToEdge
                                variant="page"
                                assignmentId={String(effectiveFirstIncoming.id)}
                                pickup={effectiveFirstIncoming.pickup_area?.trim() || '—'}
                                dropoff={effectiveFirstIncoming.drop_location?.trim() || '—'}
                                distance={formatTripDistance(
                                  resolveDriverOfferDistanceKm(effectiveFirstIncoming) ??
                                    effectiveFirstIncoming.distance,
                                )}
                                eta={formatEstimatedDuration(effectiveFirstIncoming.estimated_duration)}
                                earnings={firstIncomingIsAggregate ? '—' : formatINR(Math.max(0, newAssignmentCommission))}
                                onAccept={() => handleAcceptMission(effectiveFirstIncoming)}
                                onDecline={() => handleDeclineAssignment(effectiveFirstIncoming.id)}
                                onViewTripPlan={() => handleShowRouteOnMap()}
                                onSeeRoute={handleSeeRoute}
                                onNavigateToPickup={handleNavigateToPickup}
                                tripPlanAvailable={(routePlanMap?.stops.length ?? 0) > 0}
                                requireOtp={firstIncomingRequiresOtp}
                                disabled={acceptLoading || declineLoading}
                                accentColor={colors.emerald}
                                errorMessage={acceptError}
                                otpMode={otpClaimTripId === effectiveFirstIncoming.id}
                                otpValue={otpValue}
                                onOtpChange={(value) => {
                                  setOtpValue(value);
                                  setOtpError(null);
                                }}
                                onOtpSubmit={handleSubmitOtpClaim}
                                otpSubmitting={otpSubmitting}
                                otpError={otpError}
                                onOtpCancel={closeOtpClaim}
                              />
                            </View>
                          )
                    : !showNewAssignmentCard &&
                        (activeMission || (effectiveFirstIncoming && effectiveFirstIncoming.id === acceptedTripId))
                      ? activeMission
                        ? (
                            <DriverJobCard
                              edgeToEdge
                                variant="page"
                              trip={activeMission}
                              commissionAmount={activeMissionCommission}
                              driverLatitude={(truckPosition ?? driverMapPosition)?.latitude ?? null}
                              driverLongitude={(truckPosition ?? driverMapPosition)?.longitude ?? null}
                              driverLocationLabel={locationLabel}
                              onRefresh={() => void fetch({ soft: true })}
                              onTripUpdated={patchTripInDashboard}
                              onTripCompleted={() => setJustCompletedTrip(true)}
                              onToggleCollapse={() => setIsAssignmentSheetExpanded((v) => !v)}
                              collapsed={!isAssignmentSheetExpanded}
                              onRoutePlanMapChange={setRoutePlanMap}
                              onShowRouteOnMap={handleShowRouteOnMap}
                              onBackToDashboard={async () => {
                                await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
                                setAcceptedTripId(null);
                                setAssignmentFeedback(null);
                                setJustCompletedTrip(false);
                                void fetch();
                              }}
                            />
                          )
                        : effectiveFirstIncoming
                          ? (
                              <DriverJobCard
                                edgeToEdge
                                    variant="page"
                                trip={effectiveFirstIncoming}
                                commissionAmount={newAssignmentCommission}
                                driverLatitude={(truckPosition ?? driverMapPosition)?.latitude ?? null}
                                driverLongitude={(truckPosition ?? driverMapPosition)?.longitude ?? null}
                                driverLocationLabel={locationLabel}
                                onRefresh={() => void fetch({ soft: true })}
                                onTripUpdated={patchTripInDashboard}
                                onTripCompleted={() => setJustCompletedTrip(true)}
                                onToggleCollapse={() => setIsAssignmentSheetExpanded((v) => !v)}
                                collapsed={!isAssignmentSheetExpanded}
                                onRoutePlanMapChange={setRoutePlanMap}
                                onShowRouteOnMap={handleShowRouteOnMap}
                                onBackToDashboard={async () => {
                                  await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
                                  setAcceptedTripId(null);
                                  setAssignmentFeedback(null);
                                  setJustCompletedTrip(false);
                                  void fetch();
                                }}
                              />
                            )
                          : null
                      : showSearchingOverlay
                        ? (
                            <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 }}>
                              <Text style={[styles.searchWaitTitle, { color: colors.text }]} numberOfLines={1}>Wait.</Text>
                              <Text style={[styles.searchWaitSubtitle, { color: colors.textMuted, marginTop: 4 }]} numberOfLines={2}>
                                Looking for trips.
                              </Text>
                              <TouchableOpacity
                                style={[
                                  styles.searchOfflineBtn,
                                  { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 16 },
                                ]}
                                onPress={handleSetOffline}
                                activeOpacity={0.8}
                                accessibilityLabel="Go offline"
                                accessibilityHint="Stop receiving new trip assignments"
                              >
                                <FontAwesome name="power-off" size={16} color={colors.text} />
                                <Text style={[styles.searchOfflineBtnText, { color: colors.text }]}>Go offline</Text>
                              </TouchableOpacity>
                            </View>
                          )
                        : invites.filter((i) => i.status === 'pending').length > 0
                          ? (
                              <View style={[styles.invitesScrollContent, styles.centerCardConstraint]}>
                                <Text style={[styles.invitesTitle, { color: colors.text }]}>Invitations</Text>
                                <Text style={[styles.invitesSubtitle, { color: colors.textMuted }]}>
                                  {!driver
                                    ? 'Accept an invitation below to connect again and receive trip assignments.'
                                    : 'Your organisation has sent you an invitation. Accept to join and receive trip assignments.'}
                                </Text>
                                {invites
                                  .filter((i) => i.status === 'pending')
                                  .map((inv) => (
                                    <View
                                      key={inv.id}
                                      style={[
                                        styles.inviteCard,
                                        { backgroundColor: colors.surface, borderColor: colors.border },
                                      ]}
                                    >
                                      <View style={styles.inviteCardHeader}>
                                        <FontAwesome name="building" size={20} color={colors.emerald} />
                                        <Text style={[styles.inviteOrgName, { color: colors.text }]}>
                                          {inv.from_org_name || 'Organisation'}
                                        </Text>
                                      </View>
                                      <Text style={[styles.inviteOffer, { color: colors.textMuted }]}>
                                        {buildInviteOfferText(inv)}
                                      </Text>
                                      <View style={styles.inviteActions}>
                                        <TouchableOpacity
                                          style={[
                                            styles.inviteRejectBtn,
                                            { borderColor: colors.border },
                                            inviteActionId === inv.id && styles.inviteBtnDisabled,
                                          ]}
                                          onPress={async () => {
                                            setInviteActionId(inv.id);
                                            await driversService.rejectDriverInvite(inv.id);
                                            setInviteActionId(null);
                                            fetch();
                                          }}
                                          disabled={!!inviteActionId}
                                          activeOpacity={0.8}
                                        >
                                          <Text style={[styles.inviteRejectBtnText, { color: colors.text }]}>Decline</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          style={[
                                            styles.inviteAcceptBtn,
                                            {
                                              backgroundColor: colors.emerald,
                                              borderColor: colors.emerald,
                                            },
                                            inviteActionId === inv.id && styles.inviteBtnDisabled,
                                          ]}
                                          onPress={async () => {
                                            setInviteActionId(inv.id);
                                            const { error } = await driversService.acceptDriverInvite(inv.id);
                                            setInviteActionId(null);
                                            if (!error) fetch();
                                          }}
                                          disabled={!!inviteActionId}
                                          activeOpacity={0.8}
                                        >
                                          <Text style={styles.inviteAcceptBtnText}>Accept</Text>
                                        </TouchableOpacity>
                                      </View>
                                    </View>
                                  ))}
                              </View>
                            )
                          : !driver && !showDriverTripDashboard
                            ? (
                                <View style={[styles.centerCardWrap, styles.noDriverWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                  <View style={[styles.offlineIconWrap, { backgroundColor: colors.whiteMuted }]}>
                                    <FontAwesome name="envelope-open" size={40} color={colors.textMuted} />
                                  </View>
                                  <Text style={[styles.offlineCardTitle, { color: colors.text }]}>No organisation linked</Text>
                                  <Text style={[styles.offlineCardSubtitle, { color: colors.textMuted }]}>
                                    Request an invitation from your organisation. Once accepted, your assigned trips will appear here.
                                  </Text>
                                </View>
                              )
                            : (
                                // Stable empty state.
                                <View style={{ paddingTop: 10 }} />
                              )}
                </View>
              </BottomSheetScrollViewComponent>
            </BottomSheetComponent>
          </KeyboardAvoidingView>
        </GestureHandlerRootViewComponent>
      ) : null}

      <Modal
        visible={isFullMapVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsFullMapVisible(false)}
      >
        <View style={[styles.fullMapModal, { backgroundColor: colors.background }]}>
          {renderDriverMap(fullMapRef, { fullScreen: true })}
        </View>
      </Modal>

      {!showNewAssignmentCard && !shouldShowMap && (
        <>
      {/* Ping rings (radar circles when online) — hidden when trip in progress so card is clean */}
      {isOnline && !activeMission && (
        <View style={[styles.pingWrap, { pointerEvents: 'none' }]}>
          <Animated.View
            style={[
              styles.pingRing,
              styles.pingRingOuter,
              { opacity: pingAnim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.35] }) },
            ]}
          />
          <View style={[styles.pingRing, styles.pingRingInner]} />
        </View>
      )}

      {/* Searching / no assignments — effect centered in radar; text in fixed position below */}
      {showSearchingOverlay && (
        <View style={[styles.radarCenterOverlay, { pointerEvents: 'box-none' }]}>
          <View style={styles.searchPulseCenterWrap}>
            <View style={styles.searchPulseWrap}>
              <Animated.View
                style={[
                  styles.searchPulseRing,
                  styles.searchPulseRingOuter,
                  {
                    opacity: searchPulseAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.08, 0.35, 0.08],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.searchPulseRing,
                  styles.searchPulseRingMid,
                  {
                    opacity: searchPulseAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.15, 0.5, 0.15],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.searchPulseRing,
                  styles.searchPulseRingInner,
                  {
                    opacity: searchPulseAnim.interpolate({
                      inputRange: [0, 0.6, 1],
                      outputRange: [0.4, 0.9, 0.4],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.searchPulseDot,
                  { backgroundColor: colors.emerald },
                  {
                    opacity: searchPulseAnim.interpolate({
                      inputRange: [0, 0.45, 0.55, 1],
                      outputRange: [1, 0.4, 0.4, 1],
                    }),
                  },
                ]}
              />
            </View>
          </View>
          <View style={styles.searchWaitTextBlock}>
            <Text style={[styles.searchWaitTitle, { color: colors.text }]}>Wait.</Text>
            <Text style={[styles.searchWaitSubtitle, { color: colors.textMuted }]}>Looking for trips.</Text>
            {showSearchingOverlay && (
              <TouchableOpacity
                style={[
                  styles.searchOfflineBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={handleSetOffline}
                activeOpacity={0.8}
                accessibilityLabel="Go offline"
                accessibilityHint="Stop receiving new trip assignments"
              >
                <FontAwesome name="power-off" size={16} color={colors.text} />
                <Text style={[styles.searchOfflineBtnText, { color: colors.text }]}>Go offline</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View
        style={[
          styles.assignedStaticHeader,
        ]}
      >
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
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={async () => {
                try {
                  const Location = await getExpoLocation();
                  if (!Location) return;
                  const { status } = await Location.getForegroundPermissionsAsync();
                  if (status !== 'granted') return;
                  const pos = await Location.getCurrentPositionAsync({});
                  const { latitude, longitude } = pos.coords;
                  const acc = pos.coords.accuracy ?? null;
                  await reportLocationToDb(
                    activeMission?.id ?? null,
                    latitude,
                    longitude,
                    acc,
                    'tap'
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
                  locationStatus === 'success'
                    ? colors.emerald
                    : locationStatus === 'error'
                      ? Theme.negative
                      : colors.textMuted
                }
                style={styles.locationStatusIcon}
              />
              <Text
                style={[styles.dashboardLocationBadgeText, { color: colors.text }]}
                numberOfLines={1}
              >
                {locationStatus === 'success'
                  ? locationLabel ?? 'Current location'
                  : locationStatus === 'error'
                  ? 'Location not found'
                  : 'Fetching location...'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.content,
          commerceJobTrip ? styles.contentJobPage : null,
          {
            paddingHorizontal: commerceJobTrip ? 0 : 20,
            paddingTop: commerceJobTrip ? 0 : 20,
            backgroundColor: shouldShowMap ? 'transparent' : colors.background,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <ScrollView
            style={styles.tripsScroll}
            contentContainerStyle={[
              styles.tripsScrollContent,
              { paddingBottom: driverTabBarClearance },
              commerceJobTrip ? styles.tripsScrollContentPage : null,
              // When map is showing and we're rendering the single in-progress trip card,
              // keep it anchored near the footer (same feel as accept-card overlay).
              shouldShowMap && activeMission && styles.tripsScrollContentBottom,
              !driver && invites.filter((i) => i.status === 'pending').length === 0 && styles.tripsScrollContentCentered,
              driver && !isOnline && invites.filter((i) => i.status === 'pending').length === 0 && styles.tripsScrollContentCentered,
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.emerald} />
            }
          >
            {/* Only show separate OTP block when first pending OTP (non-roster) is not already the main assignment card */}
            {pendingOtpTripsRequiringOtp.length > 0 && !(effectiveFirstIncoming && pendingOtpTripsRequiringOtp[0]?.id === effectiveFirstIncoming.id) && (
              <View style={[styles.centerCardWrap, styles.centerCardConstraint, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 16 }]}>
                <View style={[styles.offlineIconWrap, { backgroundColor: colors.emeraldMuted }]}>
                  <FontAwesome name="key" size={28} color={colors.emerald} />
                </View>
                <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
                  Trip{pendingOtpTripsRequiringOtp.length > 1 ? 's' : ''} waiting for OTP
                </Text>
                <Text style={[styles.offlineCardSubtitle, { color: colors.textMuted, marginTop: 4 }]}>
                  Enter the OTP from your dispatcher in the app to claim {pendingOtpTripsRequiringOtp.length > 1 ? 'them' : 'it'}.
                </Text>
                <TouchableOpacity
                  style={[styles.goOnlineBtn, { backgroundColor: colors.emerald, marginTop: 16 }]}
                  onPress={() => openOtpClaim(pendingOtpTripsRequiringOtp[0])}
                  activeOpacity={0.8}
                >
                  <FontAwesome name="key" size={16} color={Theme.textOnPrimary} style={styles.goOnlineBtnIcon} />
                  <Text style={styles.goOnlineBtnText}>Enter OTP to claim</Text>
                  <FontAwesome name="chevron-right" size={14} color={Theme.textOnPrimary} />
                </TouchableOpacity>
              </View>
            )}
            {pendingOtpTripsRequiringOtp.length > 0 && !(effectiveFirstIncoming && pendingOtpTripsRequiringOtp[0]?.id === effectiveFirstIncoming.id) && (
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
                      {trip.pickup_area?.trim() || 'Pickup'} → {trip.drop_location?.trim() || 'Drop-off'}
                    </Text>
                    {otpClaimTripId === trip.id ? (
                      renderOtpClaimCard(trip, { showCancel: true })
                    ) : (
                      <>
                        <Text style={[styles.offlineCardSubtitle, { color: colors.textMuted, marginTop: 2 }]}>
                          {tripsService.resolveDriverFacingTripLabel(trip)}
                        </Text>
                        <Text style={[styles.offlineCardSubtitle, { color: colors.textMuted, marginTop: 4 }]}>
                          Aggregate trip reassigned by phone — accept and enter OTP to claim.
                        </Text>
                        <TouchableOpacity
                          style={[styles.goOnlineBtn, { backgroundColor: colors.emerald, marginTop: 12 }]}
                          onPress={() => openOtpClaim(trip)}
                          activeOpacity={0.8}
                        >
                          <FontAwesome
                            name="check"
                            size={14}
                            color={Theme.textOnPrimary}
                            style={styles.goOnlineBtnIcon}
                          />
                          <Text style={styles.goOnlineBtnText}>Accept and enter OTP</Text>
                          <FontAwesome name="chevron-right" size={14} color={Theme.textOnPrimary} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ))}
              </View>
            )}
            {invites.filter((i) => i.status === 'pending').length > 0 && (
              <View style={[styles.invitesScrollContent, styles.centerCardConstraint]}>
                <Text style={[styles.invitesTitle, { color: colors.text }]}>Invitations</Text>
                <Text style={[styles.invitesSubtitle, { color: colors.textMuted }]}>
                  {!driver
                    ? 'Accept an invitation below to connect again and receive trip assignments.'
                    : 'Your organisation has sent you an invitation. Accept to join and receive trip assignments.'}
                </Text>
                {invites
                  .filter((i) => i.status === 'pending')
                  .map((inv) => (
                    <View key={inv.id} style={[styles.inviteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={styles.inviteCardHeader}>
                        <FontAwesome name="building" size={20} color={colors.emerald} />
                        <Text style={[styles.inviteOrgName, { color: colors.text }]}>{inv.from_org_name || 'Organisation'}</Text>
                      </View>
                      <Text style={[styles.inviteOffer, { color: colors.textMuted }]}>
                        {buildInviteOfferText(inv)}
                      </Text>
                      <View style={styles.inviteActions}>
                        <TouchableOpacity
                          style={[styles.inviteRejectBtn, { borderColor: colors.border }, inviteActionId === inv.id && styles.inviteBtnDisabled]}
                          onPress={async () => {
                            setInviteActionId(inv.id);
                            await driversService.rejectDriverInvite(inv.id);
                            setInviteActionId(null);
                            fetch();
                          }}
                          disabled={!!inviteActionId}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.inviteRejectBtnText, { color: colors.text }]}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.inviteAcceptBtn, { backgroundColor: colors.emerald, borderColor: colors.emerald }, inviteActionId === inv.id && styles.inviteBtnDisabled]}
                          onPress={async () => {
                            setInviteActionId(inv.id);
                            const { error } = await driversService.acceptDriverInvite(inv.id);
                            setInviteActionId(null);
                            if (!error) fetch();
                          }}
                          disabled={!!inviteActionId}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.inviteAcceptBtnText}>Accept</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
              </View>
            )}
            {!driver &&
              invites.filter((i) => i.status === 'pending').length === 0 &&
              !showDriverTripDashboard && (
              <View style={[styles.centerCardWrap, styles.noDriverWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.offlineIconWrap, { backgroundColor: colors.whiteMuted }]}>
                  <FontAwesome name="envelope-open" size={40} color={colors.textMuted} />
                </View>
                <Text style={[styles.offlineCardTitle, { color: colors.text }]}>No organisation linked</Text>
                <Text style={[styles.offlineCardSubtitle, { color: colors.textMuted }]}>
                  Request an invitation from your organisation. Once accepted, your assigned trips will appear here.
                </Text>
              </View>
            )}
            {showDriverTripDashboard ? (
              activeMission ? (
          <DriverJobCard
            variant={isCommerceDriverTrip(activeMission) ? 'page' : 'card'}
            edgeToEdge={isCommerceDriverTrip(activeMission)}
            collapsed={false}
            trip={activeMission}
            commissionAmount={activeMissionCommission}
            driverLatitude={(truckPosition ?? driverMapPosition)?.latitude ?? null}
            driverLongitude={(truckPosition ?? driverMapPosition)?.longitude ?? null}
            driverLocationLabel={locationLabel}
            onRefresh={() => void fetch({ soft: true })}
            onTripUpdated={patchTripInDashboard}
            onTripCompleted={() => setJustCompletedTrip(true)}
            onRoutePlanMapChange={setRoutePlanMap}
            onShowRouteOnMap={handleShowRouteOnMap}
            onBackToDashboard={async () => {
              await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
              setAcceptedTripId(null);
              setAssignmentFeedback(null);
              setJustCompletedTrip(false);
              void fetch();
            }}
          />
        ) : !isOnline && !effectiveFirstIncoming ? (
          <View
            style={[
              styles.centerCardWrap,
              styles.offlineCardContent,
            ]}
          >
            <View style={styles.offlineIconContainer}>
              <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
                You are currently offline
              </Text>
              <Text style={[styles.offlineCardSubtitle, { color: colors.textMuted }]}>
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
                  triggerSuccess('You are online now.');
                  fetch();
                  setLocationStatus('loading');
                  fetchLocation();
                }}
                activeOpacity={0.8}
              >
                <FontAwesome name="wifi" size={16} color={colors.text} />
                <Text style={[styles.searchOfflineBtnText, { color: colors.text }]}>Go online</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : effectiveFirstIncoming && effectiveFirstIncoming.id === acceptedTripId ? (
          <DriverJobCard
            variant={isCommerceDriverTrip(effectiveFirstIncoming) ? 'page' : 'card'}
            edgeToEdge={isCommerceDriverTrip(effectiveFirstIncoming)}
            collapsed={false}
            trip={effectiveFirstIncoming}
            commissionAmount={newAssignmentCommission}
            driverLatitude={(truckPosition ?? driverMapPosition)?.latitude ?? null}
            driverLongitude={(truckPosition ?? driverMapPosition)?.longitude ?? null}
            driverLocationLabel={locationLabel}
            onRefresh={() => void fetch({ soft: true })}
            onTripUpdated={patchTripInDashboard}
            onTripCompleted={() => setJustCompletedTrip(true)}
            onRoutePlanMapChange={setRoutePlanMap}
            onShowRouteOnMap={handleShowRouteOnMap}
            onBackToDashboard={async () => {
              await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
              setAcceptedTripId(null);
              setAssignmentFeedback(null);
              setJustCompletedTrip(false);
              void fetch();
            }}
          />
        ) : effectiveFirstIncoming && otpClaimTripId === effectiveFirstIncoming.id ? (
          <JobRequestCard
            assignmentId={String(effectiveFirstIncoming.id)}
            pickup={effectiveFirstIncoming.pickup_area?.trim() || '—'}
            dropoff={effectiveFirstIncoming.drop_location?.trim() || '—'}
            distance={formatTripDistance(
              resolveDriverOfferDistanceKm(effectiveFirstIncoming) ??
                effectiveFirstIncoming.distance,
            )}
            eta={formatEstimatedDuration(effectiveFirstIncoming.estimated_duration)}
            earnings={firstIncomingIsAggregate ? '—' : formatINR(Math.max(0, newAssignmentCommission))}
            onAccept={() => handleAcceptMission(effectiveFirstIncoming)}
            onDecline={() => handleDeclineAssignment(effectiveFirstIncoming.id)}
            onViewTripPlan={() => handleShowRouteOnMap()}
            onSeeRoute={handleSeeRoute}
            onNavigateToPickup={handleNavigateToPickup}
            tripPlanAvailable={(routePlanMap?.stops.length ?? 0) > 0}
            requireOtp={firstIncomingRequiresOtp}
            disabled={acceptLoading || declineLoading}
            accentColor={colors.emerald}
            errorMessage={acceptError}
            otpMode
            otpValue={otpValue}
            onOtpChange={(value) => {
              setOtpValue(value);
              setOtpError(null);
            }}
            onOtpSubmit={handleSubmitOtpClaim}
            otpSubmitting={otpSubmitting}
            otpError={otpError}
            onOtpCancel={closeOtpClaim}
          />
        ) : effectiveFirstIncoming ? (
          <JobRequestCard
            assignmentId={String(effectiveFirstIncoming.id)}
            pickup={effectiveFirstIncoming.pickup_area?.trim() || '—'}
            dropoff={effectiveFirstIncoming.drop_location?.trim() || '—'}
            distance={formatTripDistance(
              resolveDriverOfferDistanceKm(effectiveFirstIncoming) ??
                effectiveFirstIncoming.distance,
            )}
            eta={formatEstimatedDuration(effectiveFirstIncoming.estimated_duration)}
            earnings={firstIncomingIsAggregate ? '—' : formatINR(Math.max(0, newAssignmentCommission))}
            onAccept={() => handleAcceptMission(effectiveFirstIncoming)}
            onDecline={() => handleDeclineAssignment(effectiveFirstIncoming.id)}
            onViewTripPlan={() => handleShowRouteOnMap()}
            onSeeRoute={handleSeeRoute}
            onNavigateToPickup={handleNavigateToPickup}
            tripPlanAvailable={(routePlanMap?.stops.length ?? 0) > 0}
            requireOtp={firstIncomingRequiresOtp}
            disabled={acceptLoading || declineLoading}
            accentColor={colors.emerald}
            errorMessage={acceptError}
            otpMode={otpClaimTripId === effectiveFirstIncoming.id}
            otpValue={otpValue}
            onOtpChange={(value) => {
              setOtpValue(value);
              setOtpError(null);
            }}
            onOtpSubmit={handleSubmitOtpClaim}
            otpSubmitting={otpSubmitting}
            otpError={otpError}
            onOtpCancel={closeOtpClaim}
          />
        ) : (
          <View style={styles.radarCenterPlaceholder} />
        )
            ) : null}
          </ScrollView>
        )}
      </View>

        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.driverBackground,
  },
  // Ola-style layout: full-screen map + persistent bottom sheet.
  olaDriverRoot: {
    flex: 1,
    minHeight: 0,
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
  },
  pingWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  pingRing: {
    position: 'absolute',
    borderRadius: 9999,
  },
  pingRingOuter: {
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  pingRingInner: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    opacity: 0.8,
  },
  radarCenterOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 32,
    zIndex: 6,
  },
  searchPulseCenterWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchPulseWrap: {
    width: 140,
    height: 140,
    position: 'relative',
  },
  searchWaitTextBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '56%',
    paddingTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPulseRing: {
    position: 'absolute',
    borderRadius: 9999,
  },
  searchPulseRingOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    left: 0,
    top: 0,
    backgroundColor: 'rgba(16, 185, 129, 0.35)',
  },
  searchPulseRingMid: {
    width: 100,
    height: 100,
    borderRadius: 50,
    left: 20,
    top: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.5)',
  },
  searchPulseRingInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    left: 38,
    top: 38,
    backgroundColor: 'rgba(16, 185, 129, 0.6)',
  },
  searchPulseDot: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    left: (140 - 24) / 2,
    top: (140 - 24) / 2,
  },
  searchWaitTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 8,
  },
  searchWaitSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  searchOfflineBtn: {
    marginTop: 20,
    minHeight: Layout.minTouchTargetSize,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  searchOfflineBtnText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  radarCenterPlaceholder: {
    minHeight: 1,
    width: '100%',
  },
  toast: {
    position: 'absolute',
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.buttonDarkText,
    letterSpacing: 0.5,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 4,
    maxWidth: '80%',
    flexShrink: 1,
  },
  locationStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  locationStatusIcon: {
    alignSelf: 'center',
  },
  locationText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  locationValueText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginLeft: 6,
    flexShrink: 1,
  },
  tripsScroll: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
  },
  tripsScrollContent: {
    flexGrow: 1,
    paddingTop: 16,
  },
  tripsScrollContentPage: {
    paddingTop: 0,
    width: '100%',
    alignItems: 'stretch',
  },
  tripsScrollContentBottom: {
    justifyContent: 'flex-end',
    paddingTop: 0,
  },
  tripsScrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  offlineCardCentered: {
    alignSelf: 'center',
  },
  centerCardWrap: {
    width: '100%',
    marginBottom: 16,
    alignSelf: 'center', // Add this for proper centering
  },
  centerCardConstraint: {
    width: '100%',
    maxWidth: 400, // Add max width for better centering on larger screens
    alignSelf: 'center', // Add this for proper centering
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  contentJobPage: {
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    width: '100%',
  },
  locationBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
    backgroundColor: Theme.driverWhiteMuted,
  },
  locationBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 13,
    flexShrink: 1,
  },
  noDriverWrap: {
    width: '100%',
    maxWidth: 400, // Add max width for better layout
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    alignSelf: 'center', // Add this for proper centering
  },
  invitesScroll: { width: '100%', maxHeight: 400 },
  invitesScrollContent: { paddingVertical: 16, gap: 16 },
  invitesTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: Theme.driverEmerald,
    marginBottom: 4,
  },
  invitesSubtitle: {
    fontSize: 11,
    color: Theme.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  inviteCard: {
    width: '100%',
    backgroundColor: Theme.driverWhiteMuted,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    borderRadius: 12,
    padding: 20,
  },
  inviteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  inviteOrgName: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textOnDark,
  },
  inviteOffer: {
    fontSize: 11,
    color: Theme.textMuted,
    marginBottom: 16,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 12,
  },
  inviteRejectBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    borderRadius: 4,
  },
  inviteRejectBtnText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: Theme.textOnDark },
  inviteAcceptBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.driverPrimary,
    borderRadius: 4,
  },
  inviteAcceptBtnText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: Theme.buttonPrimaryText },
  inviteBtnDisabled: { opacity: 0.6 },
  activeMissionWrap: {
    alignSelf: 'stretch',
    width: '100%',
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 12 }
      : { elevation: 3 }),
  },
  activeMissionIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Theme.driverEmerald,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center', // Add this for proper centering
  },
  activeMissionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: Theme.driverEmerald,
    textAlign: 'center',
  },
  activeMissionId: {
    fontSize: 24,
    fontWeight: '800',
    color: Theme.textOnDark,
    marginBottom: 4,
    textAlign: 'center',
  },
  statusCardHint: {
    fontSize: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  tacticalHudBtn: {
    alignSelf: 'stretch',
    minHeight: 44,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: Theme.textOnDark,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tacticalHudBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: Theme.driverBackground,
  },
  offlineCard: {
    width: '100%',
    backgroundColor: Theme.driverWhiteMuted,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    borderRadius: 24,
    padding: 0,
    alignItems: 'center',
    overflow: 'hidden',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 }
      : { elevation: 4 }),
  },
  offlineCardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    opacity: 0.5,
  },
  offlineCardContent: {
    width: '100%',
    maxWidth: 400, // Add max width for better layout
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
    alignSelf: 'center', // Add this for proper centering
  },
  offlineIconContainer: {
    position: 'relative',
    marginBottom: 20,
    alignSelf: 'center', // Add this for proper centering
    alignItems: 'center', // Add this for inner content centering
  },
  offlineIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center', // Add this for proper centering
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }
      : { elevation: 2 }),
  },
  offlineIconInner: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center', // Add this for proper centering
  },
  offlineLiveBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    gap: 4,
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }
      : { elevation: 2 }),
  },
  offlineLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  offlineLiveText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  offlineCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Theme.textOnDark,
    marginBottom: 8,
    letterSpacing: 0.3,
    textAlign: 'center',
    alignSelf: 'center', // Changed from 'stretch' to 'center'
    paddingHorizontal: 16, // Add horizontal padding for better text wrapping
  },
  offlineCardSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textMuted,
    textAlign: 'center',
    alignSelf: 'center', // Changed from 'stretch' to 'center'
    marginBottom: 28,
    lineHeight: 20,
    paddingHorizontal: 16, // Increased from 8 for better text wrapping
    maxWidth: 320, // Add max width for better readability
  },
  offlineTripIdBadge: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  offlineTripIdText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  offlineRouteCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  offlineRouteLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  offlineRouteTimeline: {
    alignItems: 'flex-start',
    marginRight: 14,
    paddingTop: 2,
  },
  offlineRouteDotWrap: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  offlineRouteDotPingRing: {
    position: 'absolute',
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
    borderStyle: 'dashed',
    marginLeft: 17,
    marginVertical: 2,
    borderColor: Theme.borderMedium,
  },
  offlineRouteDestIcon: {
    width: 36,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  offlineRouteValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  offlineRouteRight: {
    alignItems: 'flex-end',
  },
  offlineRouteDistance: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  offlineRouteEst: {
    fontSize: 10,
    fontWeight: '600',
  },
  offlineCardHintBold: {
    fontWeight: '800',
  },
  offlineTrustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 12,
  },
  offlineTrustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offlineTrustText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  offlineTrustDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  offlineCardLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
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
    fontWeight: '600',
    lineHeight: 18,
    letterSpacing: 0.2,
    textAlign: 'left',
  },
  offlineCardHint: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    alignSelf: 'center', // Changed from 'stretch' to 'center'
    marginBottom: 16,
    paddingHorizontal: 16, // Increased from 8 for consistency
    lineHeight: 18,
    color: Theme.textMuted,
    maxWidth: 320, // Add max width for consistency
  },
  goOnlineBtn: {
    width: '100%',
    maxWidth: 320, // Add max width for better proportions
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18, // Increased from 16 for better touch area
    paddingHorizontal: 24, // Add horizontal padding
    backgroundColor: Theme.driverEmerald,
    borderRadius: 12,
    alignSelf: 'center', // Add this for proper centering
  },
  goOnlineBtnIcon: {
    opacity: 1,
  },
  goOnlineBtnText: {
    fontSize: 14, // Increased from 13 for better readability
    fontWeight: '800',
    letterSpacing: 0.8,
    color: Theme.buttonPrimaryText,
    textAlign: 'center',
    flex: 1, // Add flex to allow proper text centering
  },
  otpClaimCard: {
    marginTop: 12,
    padding: 20,
    borderWidth: 1,
    borderRadius: 20,
    alignItems: 'center',
  },
  otpTripRoute: {
    marginTop: 12,
    marginBottom: 16,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  otpBoxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
    width: '100%',
  },
  otpBox: {
    width: 42,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxDigit: {
    fontSize: 20,
    fontWeight: '700',
  },
  otpHiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  otpErrorText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  otpCancelLink: {
    marginTop: 14,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  otpCancelText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newMissionDotWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  newMissionDotPingRing: {
    position: 'absolute',
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
    fontWeight: '800',
    letterSpacing: 0.5,
    color: Theme.driverEmerald,
  },
  commissionBlock: { alignItems: 'flex-end' },
  commissionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMuted,
    marginBottom: 2,
  },
  newAssignmentRouteCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  newAssignmentRouteLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  newAssignmentTimeline: {
    alignItems: 'flex-start',
    marginRight: 12,
    paddingTop: 2,
  },
  newAssignmentDotWrap: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  newAssignmentDotPingRing: {
    position: 'absolute',
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
    borderStyle: 'dashed',
    marginLeft: 17,
    marginVertical: 2,
    borderColor: Theme.borderMedium,
  },
  newAssignmentDestIcon: {
    width: 36,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  newAssignmentRouteValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  newAssignmentRouteRight: {
    alignItems: 'flex-end',
  },
  newAssignmentRouteDistance: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  newAssignmentRouteEst: {
    fontSize: 10,
    fontWeight: '600',
  },
  nodeLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.textMuted,
    marginBottom: 4,
  },
  nodeValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.textOnDark,
  },
  distanceClientRow: {
    flexDirection: 'row',
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
    fontWeight: '700',
    letterSpacing: 0.3,
    color: Theme.textMuted,
    marginBottom: 6,
  },
  miniBoxValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textOnDark,
  },
  declineBtn: {
    marginTop: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
  },
  acceptDeclineRow: {
    flexDirection: 'row',
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
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  empty: {
    alignItems: 'center',
    gap: 16,
    opacity: 0.9,
  },
  emptyCard: {
    width: '100%',
    alignItems: 'center',
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  syncingText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  card: {
    width: '100%',
    backgroundColor: Theme.driverWhiteMuted,
    borderWidth: 1,
    borderTopWidth: 4,
    borderTopColor: Theme.driverEmerald,
    borderColor: Theme.driverBorder,
    borderRadius: 20,
    padding: 20,
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 12 }
      : { elevation: 3 }),
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  revenue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: Theme.driverEmerald,
  },
  acceptBtn: {
    minHeight: 52,
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    ...(Platform.OS === 'ios'
      ? { shadowColor: Theme.driverEmerald, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 8 }
      : { elevation: 4 }),
  },
  acceptBtnDisabled: { opacity: 0.7 },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: '800',
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
    flexDirection: 'column',
    minHeight: 0,
  },
  assignedMapDismissArea: {
    flex: 1,
  },
  assignedMapHalf: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  fullMapModal: {
    flex: 1,
  },
  fullMapContainer: {
    flex: 1,
    position: 'relative',
  },
  assignedMapInHalf: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  fullMapView: {
    ...StyleSheet.absoluteFillObject,
  },
  assignedCardHalf: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 0,
    paddingTop: 12,
  },
  assignedCardHalfScroll: { flex: 1, minHeight: 0 },
  assignedCardHalfScrollContent: { flexGrow: 1, paddingBottom: 0, paddingHorizontal: 0 },
  assignedMapGrid: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    opacity: 0.12,
  },
  assignedMapView: {
    width: '100%',
    height: '100%',
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
    fontWeight: '800',
    marginBottom: 4,
  },
  assignedMapCalloutSub: {
    fontSize: 12,
  },
  assignedHudWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 50,
  },
  assignedHudCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 28,
    borderWidth: 1,
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 }
      : { elevation: 8 }),
  },
  assignedHudLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  assignedHudAvatarWrap: {
    width: 48,
    height: 48,
    borderWidth: 1,
    overflow: 'hidden',
  },
  assignedHudAvatar: { width: '100%', height: '100%', borderRadius: 16 },
  assignedHudTextWrap: { flex: 1, minWidth: 0 },
  assignedHudLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  assignedHudNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assignedHudName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  assignedHudRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  assignedHudRatingText: { fontSize: 10, fontWeight: '800' },
  assignedHudRight: { alignItems: 'flex-end' },
  assignedHudStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 4,
  },
  assignedHudStatusDot: { width: 8, height: 8, borderRadius: 4 },
  assignedHudStatusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  assignedHudEarnings: { fontSize: 18, fontWeight: '800' },
  mapControlsColumn: {
    position: 'absolute',
    // Must stay above the Ola bottom sheet content.
    zIndex: 1200,
    elevation: 40,
    gap: 8,
  },
  mapGuidanceChip: {
    position: 'absolute',
    zIndex: 45,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }
      : { elevation: 6 }),
  },
  mapGuidanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapGuidanceIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapGuidanceTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  mapGuidanceSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 }
      : { elevation: 6 }),
  },
  mapControlBtnDisabled: {
    opacity: 0.45,
  },
  assignedFabColumn: {
    position: 'absolute',
    left: 16,
    zIndex: 40,
    gap: 12,
  },
  assignedFabSafety: {
    width: 56,
    height: 56,
    borderRadius: 22,
    backgroundColor: '#e11d48',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 }
      : { elevation: 6 }),
  },
  assignedFabCompass: {
    width: 56,
    height: 56,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 }
      : { elevation: 6 }),
  },
  assignedSheet: {
    position: 'absolute',
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
    backgroundColor: 'transparent',
    maxHeight: '60%',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 16 }
      : { elevation: 12 }),
  },
  /** Map overlay: no extra white card or handle; JobRequestCard is the only card, close via X. */
  assignedSheetNoCard: {
    backgroundColor: 'transparent',
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
    minHeight: '42%',
    justifyContent: 'flex-end',
  },
  assignedSheetContent: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  driverNoticeCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  driverNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  driverNoticeBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  assignedNewOrderTitleWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  assignedNewOrderTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  assignedNewOrderDivider: {
    width: '100%',
    height: 1,
    marginTop: 8,
  },
  // Reference-style incoming trip card (same layout as design)
  incomingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  incomingCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  incomingTripPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  incomingTripPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  incomingCardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  incomingTripType: {
    fontSize: 13,
    fontWeight: '700',
  },
  incomingTripBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  incomingTripBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  incomingEarningsWrap: {
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 4,
  },
  incomingCollapsedWrap: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    gap: 4,
  },
  incomingCollapsedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  incomingCollapsedAmount: {
    fontSize: 20,
    fontWeight: '700',
  },
  incomingCollapsedRoute: {
    fontSize: 13,
    fontWeight: '500',
  },
  incomingEarningsAmount: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  incomingEarningsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  incomingEarningsBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  incomingRouteWrap: {
    position: 'relative',
    paddingLeft: 28,
    marginBottom: 20,
  },
  incomingRouteDashed: {
    position: 'absolute',
    left: 11,
    top: 24,
    bottom: 24,
    width: 2,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
  },
  incomingRoutePickup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  incomingRouteIconPickup: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -28,
    marginTop: 2,
  },
  incomingRouteDrop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  incomingRouteMetaPickup: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  incomingRouteMetaDrop: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  incomingRouteMetaDist: {
    fontSize: 10,
    fontWeight: '700',
  },
  incomingRouteTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 2,
  },
  incomingRouteSub: {
    fontSize: 13,
    fontWeight: '600',
  },
  incomingMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  incomingMetaBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingMetaTextWrap: { flex: 1, minWidth: 0 },
  incomingMetaLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  incomingMetaValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  incomingCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingVertical: 4,
  },
  incomingCustomerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  incomingCustomerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingCustomerInfo: {
    marginLeft: 12,
    flex: 1,
    minWidth: 0,
  },
  incomingCustomerName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  incomingCustomerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  incomingCustomerSubText: {
    fontSize: 11,
    fontWeight: '700',
  },
  incomingCustomerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  incomingCustomerActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  incomingRejectBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingAcceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingLeft: 20,
    paddingRight: 12,
    borderRadius: 20,
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 }
      : { elevation: 3 }),
  },
  incomingAcceptBtnLabel: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: Theme.textOnPrimary,
  },
  incomingAcceptBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignedSheetGreetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  assignedSheetGreetingText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
    textAlign: 'left',
  },
  assignedStaticHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 60,
  },
  assignedStaticHeaderContent: {
    alignItems: 'stretch',
  },
  dashboardLocationBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginLeft: Layout.driverHeaderHorizontalPadding,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '82%',
  },
  dashboardLocationBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 13,
    flexShrink: 1,
  },
  assignedSheetStatusRow: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignedSheetStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
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
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  assignedSheetEarningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 0,
    marginBottom: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  assignedSheetEarningsLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  assignedSheetEarningsValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  assignedSheetEarningsHint: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 8,
  },
  assignedSheetEarningsRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  assignedCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 0,
    paddingRight: 0,
  },
  assignedCustomerAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignedCustomerTextWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  assignedCustomerEarningsBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 10,
    borderBottomWidth: 0,
    flexShrink: 0,
  },
  assignedCustomerEarningsAmount: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'right',
  },
  assignedCustomerEarningsDistance: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'right',
  },
  assignedCustomerEarningsDivider: {
    width: 22,
    height: 2,
    borderRadius: 1,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  assignedTripDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingVertical: 6,
  },
  assignedTripDistanceLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  assignedTripDistanceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignedTripDistanceLabel: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    textAlign: 'left',
  },
  assignedTripDistanceValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
    textAlign: 'right',
  },
  assignedCustomerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  assignedCustomerName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'left',
  },
  assignedCustomerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
    marginTop: 2,
    textAlign: 'left',
  },
  assignedCustomerRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  assignedCustomerRatingText: { fontSize: 11, fontWeight: '800' },
  assignedItinerary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  assignedItineraryCol: {
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
    alignItems: 'flex-start',
  },
  assignedItineraryDots: {
    width: 46,
    alignItems: 'center',
    marginRight: 10,
  },
  assignedItineraryDotPickup: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: '#333333',
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignedItineraryDotPickupInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333333',
  },
  assignedItineraryLine: {
    width: 2,
    height: 24,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    marginLeft: 9,
    marginTop: 0,
    marginBottom: 0,
  },
  assignedItineraryDotDrop: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignedItineraryLabels: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingLeft: 0,
  },
  assignedItineraryRow: {
    marginBottom: 6,
    flexDirection: 'column',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  assignedItineraryRowLast: {
    marginBottom: 0,
    marginTop: 6,
    flexDirection: 'column',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  assignedItineraryLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 3,
    textTransform: 'uppercase',
    textAlign: 'left',
  },
  assignedItineraryValue: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'left',
  },
  assignedItineraryRight: { alignItems: 'flex-end' },
  assignedItineraryDistance: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  assignedItineraryEst: { fontSize: 10, fontWeight: '600' },
  assignedCtaWrap: { marginTop: 4 },
  assignedCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  assignedCtaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 }
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
    fontWeight: '700',
    letterSpacing: 0,
    color: Theme.textOnPrimary,
  },
  assignedAcceptError: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  assignedDeclineBtn: {
    marginTop: 0,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 0,
  },
  assignedDeclineBtnInRow: {
    flex: 1,
    marginTop: 0,
  },
  assignedDeclineBtnText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
    color: Theme.buttonPrimaryText,
  },
  assignedTrustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 12,
  },
  assignedTrustItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assignedTrustText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  assignedTrustDot: { width: 4, height: 4, borderRadius: 2 },
  reassignedBanner: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  reassignedBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  reassignedBannerDismiss: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  reassignedBannerDismissText: {
    fontSize: 14,
    fontWeight: '700',
  },
  // Trip booked / Skipped feedback (single card, green & black theme)
  /** Wrapper so feedback has a visible card on transparent map overlay */
  feedbackCardWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  feedbackBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  feedbackIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  feedbackIconWrapSuccess: {},
  feedbackIconWrapSkipped: {},
  feedbackTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  feedbackSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  customMapMarkerPickup: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.positive,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  customMapMarkerDrop: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.teslaRed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  customMapMarkerTruck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.buttonPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 6,
  },
  olaYouMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3.5,
    elevation: 5,
  },
  planMapMarkerText: {
    color: Theme.textOnPrimary,
    fontSize: 11,
    fontWeight: '800',
  },
  customMapMarkerActive: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  /** Mid-leg badge: straight-line gap from driver GPS to current action pin (pickup/drop). */
  gapFenceMarkerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapFencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  gapFenceIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapFenceTextCol: {
    flexShrink: 1,
    gap: 2,
  },
  gapFenceDistance: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  gapFenceCaption: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
});
