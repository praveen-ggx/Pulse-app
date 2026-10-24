/**
 * Full-screen trip history detail (stack route).
 */
import { releaseStoragePreviewUrl } from "@/features/trips/utils/storagePreviewObjectUrl.util";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useDriverTheme, useDriverThemeColors } from "@/contexts/DriverThemeContext";
import { getLatestAssignmentAuditByTripIds } from "@/features/trips/services/trip-assignment-audit.service";
import {
  buildAssignerDisplayForTrip,
} from "@/features/trips/utils/driverAssignerDisplay.util";
import {
  buildDriverTripNumberMap,
  getDriverTripDisplayNumber,
} from "@/features/driver/utils/driverTripSequence.util";
import { formatLedgerDateTime } from "@/lib/format";
import { formatEstimatedDuration } from "@/lib/formatEstimatedDuration";
import { withWebSafeShadows } from "@/lib/platformViewStyle.util";
import { getOptimalRoute } from "@/lib/routingService";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import * as driversService from "@/features/drivers/services/drivers.service";
import * as salaryRequestsService from "@/features/drivers/services/salaryRequests.service";
import * as tripsService from "@/features/trips/services/trips.service";
import { resolveDriverTripPayoutTerms } from "@/features/drivers/utils/driverUtils.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useRouter } from "expo-router";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileImage,
  MessageSquare,
  Navigation,
  Route,
  Share2,
  ShieldCheck,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  ScrollView,
  Image,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTripAppLocationsForTimeline } from "@/features/driver/services/driverLocation.service";
import { reverseGeocodeCityStateLabel } from "@/lib/reverseGeocodePlace.util";
import {
  attachDriverAppLocations,
  buildMissionLog,
  formatDistance,
  formatDurationForTrip,
  getTripProgressTitle,
  isCompleted,
  isInTransitStatus,
  parseTripCoordinate,
  splitLocationPrimarySecondary,
  toEtaInterval,
  type DriverAppLocationPoint,
} from "@/features/driver/tripHistory/tripHistoryDetail.util";
import { tripHistoryDetailStyles as styles } from "@/features/driver/tripHistory/tripHistoryDetail.styles";
import { TripDetailSettlementPanel } from "@/features/driver/components/TripDetailSettlementPanel";
import { DriverDocumentGalleryPreview } from "@/features/driver/components/DriverDocumentGalleryPreview";
import { useTripVerificationSync } from "@/features/trips/verification";
import { DriverTripOperationsTab } from "@/features/driver/components/DriverTripOperationsTab";
import { useRegisterDriverContextTrip } from "@/contexts/DriverTripOpsContext";

function TimelinePulseIcon({
  expanded,
  children,
  style,
}: {
  expanded: boolean;
  children: ReactNode;
  style?: object;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(scale);
    if (expanded) {
      scale.value = withRepeat(
        withSequence(withTiming(1.07, { duration: 700 }), withTiming(1, { duration: 700 })),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1, { duration: 220 });
    }
  }, [expanded, scale]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}

export type DriverTripHistoryDetailScreenProps = {
  tripId: string;
  initialTab?: "journey" | "operations" | "settlement";
  initialSelectedExpenseId?: string | null;
};

const mountedDriverDetailTrips = new Map<string, tripsService.TripRow>();

/** Currently mounted Driver Trip Detail trip, if any. Used by Odometer/Expense routes to skip a redundant fetch. */
export function peekMountedDriverDetailTrip(tripId: string): tripsService.TripRow | null {
  const id = tripId.trim();
  if (!id) return null;
  return mountedDriverDetailTrips.get(id) ?? null;
}

export function rememberMountedDriverDetailTrip(
  tripId: string,
  trip: tripsService.TripRow | null,
): void {
  const id = tripId.trim();
  if (!id) return;
  if (trip && trip.id === id) mountedDriverDetailTrips.set(id, trip);
  else mountedDriverDetailTrips.delete(id);
}

export function forgetMountedDriverDetailTrip(tripId: string): void {
  const id = tripId.trim();
  if (id) mountedDriverDetailTrips.delete(id);
}

export function DriverTripHistoryDetailScreen({
  tripId,
  initialTab,
  initialSelectedExpenseId,
}: DriverTripHistoryDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const colors = useDriverThemeColors();
  const { theme } = useDriverTheme();
  const isDark = theme === "dark";
  const router = useRouter();
  useTripVerificationSync();
  const [trip, setTrip] = useState<tripsService.TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [invites, setInvites] = useState<
    Awaited<ReturnType<typeof driversService.getDriverInvitesReceived>>["invites"]
  >([]);
  const [assignmentActorByTripId, setAssignmentActorByTripId] = useState<Record<string, string>>({});
  const [routeMetricsByTripId, setRouteMetricsByTripId] = useState<
    Record<string, { distance: number; estimated_duration: string }>
  >({});
  const [detailTab, setDetailTab] = useState<"journey" | "operations" | "settlement">(
    initialTab ?? (initialSelectedExpenseId ? "settlement" : "journey"),
  );
  const [expandedLogIndex, setExpandedLogIndex] = useState<number | null>(null);
  const [detailPodDocuments, setDetailPodDocuments] = useState<tripDocumentsService.TripDocumentRow[]>([]);
  const [detailPodLoading, setDetailPodLoading] = useState(false);
  const [detailPodViewUrls, setDetailPodViewUrls] = useState<Record<string, string>>({});
  const detailPodUrlRequestedRef = useRef<Set<string>>(new Set());
  const heldPodPreviewUrls = useRef<Map<string, string>>(new Map());
  useEffect(() => () => {
    for (const url of heldPodPreviewUrls.current.values()) releaseStoragePreviewUrl(url);
    heldPodPreviewUrls.current.clear();
  }, []);
  const retainPodPreview = (docId: string, url: string | null) => {
    const previous = heldPodPreviewUrls.current.get(docId);
    if (previous) {
      releaseStoragePreviewUrl(previous);
      heldPodPreviewUrls.current.delete(docId);
    }
    if (url) heldPodPreviewUrls.current.set(docId, url);
    return url;
  };
  useEffect(() => {
    const live = new Set(detailPodDocuments.map((doc) => doc.id));
    for (const [id, url] of heldPodPreviewUrls.current) {
      if (live.has(id)) continue;
      releaseStoragePreviewUrl(url);
      heldPodPreviewUrls.current.delete(id);
    }
  }, [detailPodDocuments]);

  useEffect(() => {
    if (detailTab !== "journey") return;
    if (!trip?.id) {
      setAppLocationPoints([]);
      return;
    }
    let mounted = true;
    void getTripAppLocationsForTimeline(
      trip.id,
      trip.driver_id,
      trip.created_at,
      trip.completed_at ?? trip.updated_at,
    ).then(async ({ points }) => {
      if (!mounted) return;
      const labeled = points.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        recorded_at: point.recorded_at,
        address_label: point.address_label,
        source: point.source,
      }));
      setAppLocationPoints(labeled);

      const missing = labeled.filter((point) => !point.address_label?.trim());
      const seen = new Set<string>();
      const unique = missing.filter((point) => {
        const key = `${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 8);

      if (unique.length === 0) return;
      const resolved = new Map<string, string>();
      await Promise.all(
        unique.map(async (point) => {
          const label = await reverseGeocodeCityStateLabel(point.latitude, point.longitude);
          if (label?.trim()) {
            resolved.set(`${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`, label.trim());
          }
        }),
      );
      if (!mounted || resolved.size === 0) return;
      setAppLocationPoints((current) =>
        current.map((point) => {
          if (point.address_label?.trim()) return point;
          const key = `${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`;
          const label = resolved.get(key);
          return label ? { ...point, address_label: label } : point;
        }),
      );
    });
    return () => {
      mounted = false;
    };
  }, [detailTab, trip?.id, trip?.driver_id, trip?.created_at, trip?.completed_at, trip?.updated_at]);

  // Fleet attribution state
  const [linkedDriversFull, setLinkedDriversFull] = useState<driversService.DriverRow[]>([]);
  const [attrSalaryRequests, setAttrSalaryRequests] = useState<salaryRequestsService.SalaryRequestRow[]>([]);
  const [attributeLoading, setAttributeLoading] = useState(false);

  const tripRef = useRef<tripsService.TripRow | null>(null);
  tripRef.current = trip;

  const loadTrip = useCallback(async (isMounted: () => boolean) => {
    const hasLoadedTrip = tripRef.current != null && tripRef.current.id === tripId;
    // Only the first load for this tripId may take the full-screen spinner.
    if (isMounted() && !hasLoadedTrip) setLoading(true);
    const res = await tripsService.getDriverTripById(tripId);
    if (!isMounted()) return;
    if (res.trip) {
      setTrip(tripsService.driverRowToTripRow(res.trip));
    } else if (!hasLoadedTrip) {
      setTrip(null);
    }
    if (isMounted()) setLoading(false);
  }, [tripId]);

  // useFocusEffect also runs on first focus (initial mount). Do not also fetch in a
  // mount useEffect — that duplicated getDriverTripById and blanked the screen on back.
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void loadTrip(() => mounted);
      return () => {
        mounted = false;
      };
    }, [loadTrip]),
  );

  useEffect(() => {
    rememberMountedDriverDetailTrip(tripId, trip);
    return () => {
      forgetMountedDriverDetailTrip(tripId);
    };
  }, [trip, tripId]);

  useEffect(() => {
    const uid = profile?.uid;
    if (!uid) return;
    let mounted = true;
    void driversService.getLinkedDriversForCurrentUser(uid).then((res) => {
      if (!mounted) return;
      const d = res.drivers?.[0] ?? null;
      setDriver(d);
      // Keep ALL rows (including left_at) so former-employer trips classify as fleet trips.
      const allRows = res.drivers ?? [];
      setLinkedDriversFull(allRows);
      if (!d?.id) return;
      void driversService.getDriverInvitesReceived().then((inv) => {
        if (!mounted || inv.error) return;
        setInvites(inv.invites);
      });
      const activeRows = allRows.filter((r) => !r.left_at);
      if (activeRows.length > 0) {
        void salaryRequestsService.getSalaryRequestsByDriverIds(activeRows.map((r) => r.id))
          .then((sRes) => { if (mounted) setAttrSalaryRequests(sRes.requests ?? []); });
      }
    });
    return () => {
      mounted = false;
    };
  }, [profile?.uid]);

  useEffect(() => {
    if (!tripId) return;
    let mounted = true;
    void getLatestAssignmentAuditByTripIds([tripId]).then(({ byTripId }) => {
      if (!mounted) return;
      const map: Record<string, string> = {};
      byTripId.forEach((value, key) => {
        const actorId = String(value.changed_by ?? "").trim();
        if (actorId) map[key] = actorId;
      });
      setAssignmentActorByTripId(map);
    });
    return () => {
      mounted = false;
    };
  }, [tripId]);

  const seenTripIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (seenTripIdRef.current === tripId) return;
    const isTripSwitch = seenTripIdRef.current != null;
    seenTripIdRef.current = tripId;
    setExpandedLogIndex(null);
    if (isTripSwitch) {
      setDetailTab(initialTab ?? (initialSelectedExpenseId ? "settlement" : "journey"));
    }
  }, [tripId, initialTab, initialSelectedExpenseId]);

  useEffect(() => {
    if (!trip?.id) {
      setDetailPodDocuments([]);
      setDetailPodViewUrls({});
      detailPodUrlRequestedRef.current.clear();
      setPodPreviewIndex(null);
      return;
    }
    const tid = trip.id;
    detailPodUrlRequestedRef.current.clear();
    setDetailPodViewUrls({});
    setDetailPodLoading(true);
    let cancelled = false;
    tripDocumentsService.getDocumentsByTripId(tid).then(({ documents, error }) => {
      if (cancelled) return;
      setDetailPodLoading(false);
      if (!error) setDetailPodDocuments(documents.filter((d) => d.document_type === 'pod'));
      else setDetailPodDocuments([]);
    });
    return () => {
      cancelled = true;
    };
  }, [trip?.id]);

  useEffect(() => {
    let cancelled = false;
    detailPodDocuments.forEach((doc) => {
      const requestKey = `${doc.id}:${doc.storage_path}`;
      if (detailPodUrlRequestedRef.current.has(requestKey)) return;
      detailPodUrlRequestedRef.current.add(requestKey);
      void tripDocumentsService.tryGetDocumentViewUrl(doc.storage_path).then((url) => {
        if (cancelled) {
          detailPodUrlRequestedRef.current.delete(requestKey);
          releaseStoragePreviewUrl(url);
          return;
        }
        retainPodPreview(doc.id, url);
        if (!url) return;
        setDetailPodViewUrls((prev) => ({ ...prev, [doc.id]: url }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [detailPodDocuments]);

  const handleUnusablePodDocument = useCallback(
    (doc: tripDocumentsService.TripDocumentRow) => {
      setDetailPodDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setDetailPodViewUrls((prev) => {
        if (!prev[doc.id]) return prev;
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!trip) return;
    const tid = String(trip.id ?? "").trim();
    const hasDistance = trip.distance != null && String(trip.distance).trim() !== "";
    const hasEta = trip.estimated_duration != null && trip.estimated_duration.trim() !== "";
    if (!tid || (hasDistance && hasEta)) return;
    const pickupLat = parseTripCoordinate(trip.pickup_lat);
    const pickupLon = parseTripCoordinate(trip.pickup_lon);
    const dropLat = parseTripCoordinate(trip.drop_lat);
    const dropLon = parseTripCoordinate(trip.drop_lon);
    if (pickupLat == null || pickupLon == null || dropLat == null || dropLon == null) return;
    let cancelled = false;
    void getOptimalRoute(
      { latitude: pickupLat, longitude: pickupLon },
      { latitude: dropLat, longitude: dropLon },
    ).then((route) => {
      if (cancelled || !route) return;
      const distanceKm = Math.max(1, Math.round(route.distance / 1000));
      const etaInterval = toEtaInterval(route.duration);
      setRouteMetricsByTripId((prev) => ({
        ...prev,
        [tid]: { distance: distanceKm, estimated_duration: etaInterval },
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [trip]);

  const driverTripNumberById = useMemo(
    () => (trip ? buildDriverTripNumberMap([trip]) : {}),
    [trip],
  );

  const assignerDisplay = useMemo(() => {
    if (!trip) return "Fleet dispatcher";
    return (
      buildAssignerDisplayForTrip(trip, invites, driver?.organization_id ?? null, {
        assignmentActorByTripId,
        assignerNamesByUserId: {},
        assignerOrgNameByUserId: {},
        assignerDisplayByTripId: {},
        assignerTripOrgNameByTripId: {},
        organizationNamesById: {},
      }).assignedByName || "Fleet dispatcher"
    );
  }, [trip, invites, driver?.organization_id, assignmentActorByTripId]);

  const [appLocationPoints, setAppLocationPoints] = useState<DriverAppLocationPoint[]>([]);

  const archiveMissionLog = useMemo(() => {
    if (!trip) return [];
    return attachDriverAppLocations(buildMissionLog(trip), appLocationPoints);
  }, [trip, appLocationPoints]);
  const pickupParts = useMemo(
    () => splitLocationPrimarySecondary(trip?.pickup_area),
    [trip?.pickup_area],
  );
  const dropParts = useMemo(
    () => splitLocationPrimarySecondary(trip?.drop_location),
    [trip?.drop_location],
  );
  const routeFallback = useMemo(() => {
    if (!trip) return null;
    return routeMetricsByTripId[String(trip.id)] ?? null;
  }, [trip, routeMetricsByTripId]);
  const distanceDisplay = useMemo(() => {
    if (!trip) return "—";
    return formatDistance(trip.distance ?? routeFallback?.distance);
  }, [trip, routeFallback]);
  const durationDisplay = useMemo(() => {
    if (!trip) return "—";
    if (trip.estimated_duration?.trim()) return formatDurationForTrip(trip);
    if (routeFallback?.estimated_duration) {
      return formatEstimatedDuration(routeFallback.estimated_duration);
    }
    return formatDurationForTrip(trip);
  }, [trip, routeFallback]);

  const historyEmployerOrgIdSet = useMemo(() => {
    const set = new Set<string>();
    linkedDriversFull.forEach((d) => {
      if (
        (d.payable_amount != null && d.payable_amount > 0) ||
        (d.commission_percent != null && d.commission_percent > 0) ||
        (d.commission_per_km != null && d.commission_per_km > 0)
      ) {
        const orgId = String(d.organization_id ?? "");
        if (orgId) set.add(orgId);
      }
    });
    return set;
  }, [linkedDriversFull]);

  const historyCurrentEmployer = useMemo(() => {
    const d =
      linkedDriversFull.find((row) => !row.left_at && historyEmployerOrgIdSet.has(String(row.organization_id ?? ""))) ??
      linkedDriversFull.find((row) => historyEmployerOrgIdSet.has(String(row.organization_id ?? "")));
    if (!d) return null;
    const orgName =
      invites.find((i) => String(i.from_organization_id ?? "") === String(d.organization_id ?? ""))?.from_org_name?.trim() ||
      "Employer";
    return { orgId: String(d.organization_id ?? ""), driverRowId: d.id, orgName };
  }, [linkedDriversFull, historyEmployerOrgIdSet, invites]);

  const isTripHistoryFleet = useMemo(() => {
    if (!trip || !historyCurrentEmployer) return false;
    return historyEmployerOrgIdSet.has(String(trip.organization_id ?? ""));
  }, [trip, historyCurrentEmployer, historyEmployerOrgIdSet]);

  const isTripHistoryAttributed = useMemo(() => {
    if (!historyCurrentEmployer || !trip) return false;
    return attrSalaryRequests.some(
      (r) =>
        r.request_type === "trip_based" &&
        String(r.organization_id ?? "") === historyCurrentEmployer.orgId &&
        (r.trip_ids ?? []).includes(trip.id),
    );
  }, [attrSalaryRequests, historyCurrentEmployer, trip]);

  const handleHistoryAttributeTrip = useCallback(async () => {
    if (!historyCurrentEmployer || !trip) return;
    setAttributeLoading(true);
    try {
      // Independent write-path gate: the employer-relationship check above
      // only proves an employer exists somewhere, not that it applies to
      // THIS trip. Re-resolve this trip's actual agreed terms — an employee
      // relationship does not imply the legacy 10% guess is payable.
      const driverRow = linkedDriversFull.find((d) => d.id === historyCurrentEmployer.driverRowId);
      const invite = invites.find(
        (i) =>
          String(i.status ?? "").toLowerCase() === "accepted" &&
          String(i.from_organization_id ?? "") === historyCurrentEmployer.orgId,
      );
      const { hasAgreedPayoutTerms, commissionDetail } = resolveDriverTripPayoutTerms(trip, {
        commissionPercent: invite?.commission_percent ?? driverRow?.commission_percent ?? null,
        commissionPerKm: invite?.commission_per_km ?? driverRow?.commission_per_km ?? null,
        payableAmount: invite?.payable_amount ?? driverRow?.payable_amount ?? null,
      });
      if (!hasAgreedPayoutTerms || commissionDetail.amount <= 0) {
        Alert.alert("No agreed payout terms", "This trip has no agreed payout terms and can't be attributed.");
        return;
      }
      const earnings = Math.round(commissionDetail.amount);
      const tripDate = trip.pickup_date ?? trip.started_at ?? trip.created_at ?? "";
      const tripDateStr = tripDate
        ? new Date(tripDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "";
      const tripRef = getDriverTripDisplayNumber(trip, driverTripNumberById);
      const attrNote = [`Fleet trip · ${tripRef}`, tripDateStr, `₹${earnings.toLocaleString("en-IN")}`]
        .filter(Boolean).join(" · ");
      const { error } = await salaryRequestsService.createSalaryRequest(
        historyCurrentEmployer.driverRowId,
        historyCurrentEmployer.orgId,
        "trip_based",
        earnings,
        { tripIds: [trip.id], note: attrNote, createdBy: profile?.uid ?? null },
      );
      if (error) {
        Alert.alert("Error", error.message);
      } else {
        Alert.alert("Trip attributed", `Sent to ${historyCurrentEmployer.orgName} for review.`);
        void salaryRequestsService.getSalaryRequestsByDriverIds(linkedDriversFull.map((d) => d.id))
          .then((sRes) => setAttrSalaryRequests(sRes.requests ?? []));
      }
    } finally {
      setAttributeLoading(false);
    }
  }, [historyCurrentEmployer, trip, driverTripNumberById, linkedDriversFull, invites, profile?.uid]);

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(driver)/trip-history");
  };

  if (loading || !trip) {
    return (
      <View style={[styles.detailWrap, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <View style={styles.detailLoading}>
          <LoadingIndicator color={colors.emerald} />
          <Text style={{ color: colors.textMuted, marginTop: 12 }}>Loading trip…</Text>
        </View>
      </View>
    );
  }

  const selectedTrip = trip;
  const showHistoryAttributionBar =
    detailTab === "settlement" && !isTripHistoryFleet && !!historyCurrentEmployer;

  return (
    <View
      style={[
        styles.detailWrap,
        {
          paddingTop: insets.top,
          backgroundColor: colors.background,
        },
      ]}
    >
            <View
              style={[
                styles.detailHeaderRef,
                styles.detailHeaderStyled,
                {
                  paddingTop: 12,
                  paddingBottom: 12,
                  paddingHorizontal: Layout.screenPaddingHorizontal,
                  backgroundColor: colors.surface,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => onBack()}
                style={[
                  styles.detailBack,
                  styles.detailBackStyled,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                hitSlop={{ top: 12, right: 16, bottom: 12, left: 16 }}
                activeOpacity={0.75}
                accessibilityLabel="Back"
              >
                <FontAwesome
                  name="chevron-left"
                  size={18}
                  color={colors.text}
                />
              </TouchableOpacity>
              <View style={styles.tdHeaderCenter}>
                <Text
                  style={[
                    styles.detailHeaderLabelRef,
                    { color: colors.textMuted },
                  ]}
                >
                  TRIP HISTORY
                </Text>
                <View style={styles.detailHeaderIdRowRef}>
                  <Text
                    style={[styles.detailTitleRef, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {getDriverTripDisplayNumber(selectedTrip, driverTripNumberById)}
                  </Text>
                  <View
                    style={[
                      styles.tdStatusDot,
                      {
                        backgroundColor: colors.emerald,
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.detailHeaderActions}>
                {selectedTrip.driver_id ? (
                  <TouchableOpacity
                    style={[
                      styles.detailBack,
                      styles.detailBackStyled,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      const id = encodeURIComponent(String(selectedTrip.id));
                      router.push(`/(driver)/chat?tripId=${id}` as Href);
                    }}
                    activeOpacity={0.75}
                    accessibilityLabel="Trip chat"
                  >
                    <MessageSquare size={17} color={colors.text} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.detailBack,
                    styles.detailBackStyled,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => {
                    void Share.share({
                      message: `Trip ${getDriverTripDisplayNumber(selectedTrip, driverTripNumberById)}`,
                    }).catch(() => {});
                  }}
                  activeOpacity={0.75}
                  accessibilityLabel="Share trip"
                >
                  <Share2 size={17} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView
              style={[
                styles.detailScrollRef,
                { backgroundColor: colors.background },
              ]}
              contentContainerStyle={[
                styles.detailContentRef,
                {
                  paddingHorizontal: Layout.screenPaddingHorizontal,
                  paddingBottom:
                    Layout.modalBottomPadding +
                    insets.bottom +
                    Layout.tabBarDockHeight +
                    (showHistoryAttributionBar ? 88 : 0),
                  paddingTop: 16,
                },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              bounces
            >
              <View style={styles.tdHeroOuter}>
                <LinearGradient
                  colors={["#0f172a", "#020617"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.tdHeroCard}
                >
                  <View style={styles.tdHeroGlow} pointerEvents="none" />
                  <View style={styles.tdHeroWatermark} pointerEvents="none">
                    <Route size={128} color="rgba(255,255,255,0.08)" />
                  </View>
                  <View style={styles.tdHeroInner}>
                    <Text style={styles.tdHeroKicker}>Route Logic History</Text>
                    <View style={styles.tdHeroRouteRow}>
                      <View style={styles.tdHeroRouteSide}>
                        <Text
                          style={styles.tdHeroCity}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.72}
                        >
                          {pickupParts.primary.toUpperCase()}
                        </Text>
                        <Text style={styles.tdHeroState} numberOfLines={1}>
                          {(pickupParts.secondary ?? "Origin").toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.tdHeroRouteConnector}>
                        <View style={[styles.tdHeroDot, { backgroundColor: Theme.driverEmerald }]} />
                        <View style={styles.tdHeroConnectorLine} />
                        <Text style={[styles.tdHeroToLabel, { color: Theme.driverPrimary }]}>TO</Text>
                        <View style={styles.tdHeroConnectorLine} />
                        <View style={[styles.tdHeroDot, { backgroundColor: Theme.driverPrimary }]} />
                      </View>

                      <View style={[styles.tdHeroRouteSide, styles.tdHeroRouteSideRight]}>
                        <Text
                          style={[styles.tdHeroCity, styles.tdHeroCityRight]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.72}
                        >
                          {dropParts.primary.toUpperCase()}
                        </Text>
                        <Text style={[styles.tdHeroState, styles.tdHeroStateRight]} numberOfLines={1}>
                          {(dropParts.secondary ?? "Destination").toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.tdHeroDivider} />
                    <View style={styles.tdHeroMetaRow}>
                      <View style={styles.tdHeroMetaItem}>
                        <View style={styles.tdHeroMetaIconWrap}>
                          <Navigation size={16} color={Theme.driverPrimary} />
                        </View>
                        <View>
                          <Text style={styles.tdHeroMetaKicker}>Distance</Text>
                          <Text style={styles.tdHeroMetaValue}>
                            {distanceDisplay}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.tdHeroMetaItem}>
                        <View style={styles.tdHeroMetaIconWrap}>
                          <Clock size={16} color={Theme.driverPrimary} />
                        </View>
                        <View>
                          <Text style={styles.tdHeroMetaKicker}>Duration</Text>
                          <Text style={styles.tdHeroMetaValue}>
                            {durationDisplay}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.tdHeroAssignerRow}>
                      <ShieldCheck size={14} color={Theme.driverPrimary} />
                      <Text style={styles.tdHeroAssignerLabel}>Assigned by</Text>
                      <Text style={styles.tdHeroAssignerValue} numberOfLines={1}>
                        {assignerDisplay}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.tdHeroAccentBar, { backgroundColor: colors.emerald }]} />
                </LinearGradient>
              </View>

              <View style={[styles.tdTabBar, { backgroundColor: `${colors.border}99` }]}>
                <TouchableOpacity
                  style={[
                    styles.tdTabBtn,
                    detailTab === "journey" && styles.tdTabBtnActive,
                  ]}
                  onPress={() => setDetailTab("journey")}
                  activeOpacity={0.88}
                >
                  <Text
                    style={[
                      styles.tdTabLabel,
                      {
                        color: detailTab === "journey" ? "#ffffff" : colors.textMuted,
                      },
                    ]}
                  >
                    Journey
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.tdTabBtn,
                    detailTab === "operations" && styles.tdTabBtnActive,
                  ]}
                  onPress={() => setDetailTab("operations")}
                  activeOpacity={0.88}
                >
                  <Text
                    style={[
                      styles.tdTabLabel,
                      {
                        color: detailTab === "operations" ? "#ffffff" : colors.textMuted,
                      },
                    ]}
                  >
                    Operations
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.tdTabBtn,
                    detailTab === "settlement" && styles.tdTabBtnActive,
                  ]}
                  onPress={() => setDetailTab("settlement")}
                  activeOpacity={0.88}
                >
                  <Text
                    style={[
                      styles.tdTabLabel,
                      {
                        color: detailTab === "settlement" ? "#ffffff" : colors.textMuted,
                      },
                    ]}
                  >
                    Settlement
                  </Text>
                </TouchableOpacity>
              </View>

              {detailTab === "journey" ? (
                <View style={{ marginBottom: 12 }}>
                  <View style={styles.tdTimelineHeader}>
                    <View style={styles.tdTimelineHeaderIcon}>
                      <Calendar size={13} color="#ffffff" />
                    </View>
                    <Text style={[styles.tdTimelineHeaderTitle, { color: colors.text }]}>
                      Trip Timeline
                    </Text>
                  </View>

                  {archiveMissionLog.length === 0 ? (
                    <View
                      style={[
                        styles.tdTimelineCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.tdEmptyTimeline, { color: colors.textMuted }]}>
                        No timeline events for this trip yet.
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.tdTimelineCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      {archiveMissionLog.map((log, i) => {
                        const isLast = i === archiveMissionLog.length - 1;
                        const expanded = expandedLogIndex === i;
                        return (
                          <View key={`${log.status}-${i}`} style={styles.tdLogRowWrap}>
                            {!isLast ? (
                              <View
                                style={[styles.tdLogConnector, { backgroundColor: colors.border }]}
                              />
                            ) : null}
                            <TouchableOpacity
                              activeOpacity={0.85}
                              style={[
                                styles.tdLogTouchable,
                                expanded && {
                                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#f8fafc",
                                  borderRadius: 10,
                                },
                              ]}
                              onPress={() =>
                                setExpandedLogIndex(expanded ? null : i)
                              }
                            >
                              <View style={styles.tdLogMarkerCol}>
                                <TimelinePulseIcon expanded={expanded}>
                                  <View
                                    style={[
                                      styles.tdLogCircle,
                                      {
                                        backgroundColor: colors.emerald,
                                        borderColor: colors.surface,
                                      },
                                    ]}
                                  >
                                    <CheckCircle2 size={11} color="#ffffff" />
                                  </View>
                                </TimelinePulseIcon>
                              </View>
                              <View style={styles.tdLogBody}>
                                <View style={styles.tdLogHead}>
                                  <Text style={[styles.tdLogStatus, { color: colors.text }]}>
                                    {log.status}
                                  </Text>
                                  <View style={styles.tdLogHeadRight}>
                                    <Text style={[styles.tdLogTime, { color: colors.textMuted }]}>
                                      {log.time}
                                    </Text>
                                    {expanded ? (
                                      <ChevronUp size={14} color={colors.textMuted} />
                                    ) : (
                                      <ChevronDown size={14} color={colors.textMuted} />
                                    )}
                                  </View>
                                </View>
                                <Text
                                  style={[styles.tdLogLoc, { color: colors.textMuted }]}
                                  numberOfLines={expanded ? undefined : 2}
                                >
                                  {log.driverLoc ?? log.loc}
                                </Text>
                                {expanded ? (
                                  <View style={styles.tdLogExpanded}>
                                    <View
                                      style={[
                                        styles.tdLogFactCard,
                                        {
                                          backgroundColor: colors.background,
                                          borderColor: colors.border,
                                        },
                                      ]}
                                    >
                                      <View style={styles.tdLogDriverLocRow}>
                                        <View
                                          style={[
                                            styles.tdLogDriverLocIcon,
                                            { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : Theme.surfaceGray },
                                          ]}
                                        >
                                          <Navigation size={12} color={colors.textMuted} />
                                        </View>
                                        <View style={styles.tdLogDriverLocCopy}>
                                          <Text style={[styles.tdLogFactLabel, { color: colors.textMuted }]}>
                                            {log.driverLocKind === "business"
                                              ? "Business location"
                                              : "Driver location"}
                                          </Text>
                                          <Text style={[styles.tdLogFactValue, { color: colors.text }]}>
                                            {log.driverLoc ?? "Not captured"}
                                          </Text>
                                        </View>
                                      </View>
                                      <View style={[styles.tdLogFactDivider, { backgroundColor: colors.border }]} />
                                      <View style={styles.tdLogFactGrid}>
                                        <View style={styles.tdLogFactCol}>
                                          <Text style={[styles.tdLogFactLabel, { color: colors.textMuted }]}>
                                            Scheduled stop
                                          </Text>
                                          <Text style={[styles.tdLogFactValue, { color: colors.text }]} numberOfLines={2}>
                                            {log.loc}
                                          </Text>
                                        </View>
                                        <View style={[styles.tdLogFactRule, { backgroundColor: colors.border }]} />
                                        <View style={styles.tdLogFactCol}>
                                          <Text style={[styles.tdLogFactLabel, { color: colors.textMuted }]}>
                                            Timestamp
                                          </Text>
                                          <Text style={[styles.tdLogFactValue, { color: colors.text }]}>
                                            {formatLedgerDateTime(log.atIso)}
                                          </Text>
                                        </View>
                                      </View>
                                    </View>
                                    {log.status.trim().toLowerCase() === "delivered" &&
                                    detailPodDocuments.length > 0 ? (
                                      <View style={styles.tdLogDocRow}>
                                        {detailPodDocuments.map((doc, docIndex) => {
                                          const previewUrl = detailPodViewUrls[doc.id];
                                          const isImage =
                                            (doc.mime_type ?? "").startsWith("image/") ||
                                            /\.(jpe?g|png|webp|gif)$/i.test(doc.file_name || doc.storage_path);
                                          return (
                                            <TouchableOpacity
                                              key={doc.id}
                                              style={[
                                                styles.tdLogDocThumb,
                                                { borderColor: colors.border, backgroundColor: colors.background },
                                              ]}
                                              onPress={() => setPodPreviewIndex(docIndex)}
                                              activeOpacity={0.85}
                                              accessibilityRole="button"
                                              accessibilityLabel={`Preview ${doc.file_name || "document"}`}
                                            >
                                              {isImage && previewUrl ? (
                                                <Image
                                                  source={{ uri: previewUrl }}
                                                  style={styles.tdLogDocImage}
                                                  resizeMode="cover"
                                                />
                                              ) : (
                                                <FileImage size={16} color={colors.textMuted} />
                                              )}
                                            </TouchableOpacity>
                                          );
                                        })}
                                      </View>
                                    ) : null}
                                    {isInTransitStatus(log.status) ? null : (
                                      <>
                                        <Text style={[styles.tdLogDetailsKicker, { color: colors.textMuted }]}>
                                          Details
                                        </Text>
                                        <View
                                          style={[
                                            styles.tdLogDetailsBox,
                                            {
                                              backgroundColor: colors.background,
                                              borderColor: colors.border,
                                            },
                                          ]}
                                        >
                                          <Text style={[styles.tdLogDetailsText, { color: colors.text }]}>
                                            {log.details}
                                          </Text>
                                        </View>
                                      </>
                                    )}
                                  </View>
                                ) : null}
                              </View>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  <View style={styles.tdTimelineHeader}>
                    <View style={styles.tdTimelineHeaderIcon}>
                      <FileImage size={13} color="#ffffff" />
                    </View>
                    <Text
                      style={[styles.tdTimelineHeaderTitle, { color: colors.text }]}
                    >
                      Proof of delivery
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.tdTimelineCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {detailPodLoading ? (
                      <LoadingIndicator
                        style={{ paddingVertical: 22 }}
                        color={colors.emerald}
                      />
                    ) : detailPodDocuments.length >= 1 ? (
                      detailPodDocuments.map((doc, index) => {
                        const name =
                          doc.file_name ||
                          doc.storage_path.split("/").pop() ||
                          "POD";
                        const previewUrl = detailPodViewUrls[doc.id];
                        const isImage =
                          (doc.mime_type ?? "").startsWith("image/") ||
                          /\.(jpe?g|png|webp|gif)$/i.test(doc.file_name || doc.storage_path);
                        return (
                          <TouchableOpacity
                            key={doc.id}
                            style={[
                              styles.tdPodRow,
                              index < detailPodDocuments.length - 1
                                ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }
                                : null,
                            ]}
                            onPress={() => setPodPreviewIndex(index)}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel={`Preview ${name}`}
                          >
                            <View
                              style={[
                                styles.tdLogDocThumb,
                                { borderColor: colors.border, backgroundColor: colors.background },
                              ]}
                            >
                              {isImage && previewUrl ? (
                                <Image
                                  source={{ uri: previewUrl }}
                                  style={styles.tdLogDocImage}
                                  resizeMode="cover"
                                />
                              ) : (
                                <FileImage size={16} color={colors.textMuted} />
                              )}
                            </View>
                            <Text
                              style={[styles.tdPodFileName, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {name}
                            </Text>
                            <Text style={[styles.tdPodPreview, { color: colors.textMuted }]}>
                              Preview
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      <Text
                        style={[
                          styles.tdEmptyTimeline,
                          { paddingVertical: 14, fontSize: 13 },
                        ]}
                      >
                        No proof of delivery uploaded for this trip.
                      </Text>
                    )}
                  </View>

                  {isCompleted(selectedTrip.status) ? (
                    <LinearGradient
                      colors={[Theme.driverEmeraldDark, Theme.driverEmerald]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.tdDeliveredBanner}
                    >
                      <View>
                        <Text style={styles.tdDeliveredKicker}>Status</Text>
                        <Text style={styles.tdDeliveredTitle}>DELIVERED SUCCESSFULLY</Text>
                      </View>
                      <View style={styles.tdDeliveredIconCircle}>
                        <CheckCircle2 size={24} color="#ffffff" />
                      </View>
                    </LinearGradient>
                  ) : (
                    <View
                      style={[
                        styles.tdProgressBanner,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View>
                        <Text style={[styles.tdProgressKicker, { color: colors.textMuted }]}>
                          Status
                        </Text>
                        <Text style={[styles.tdProgressTitle, { color: colors.text }]}>
                          {getTripProgressTitle(selectedTrip)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.tdDeliveredIconCircle,
                          { backgroundColor: `${colors.emerald}22` },
                        ]}
                      >
                        <Clock size={22} color={colors.emerald} />
                      </View>
                    </View>
                  )}
                </View>
              ) : null}

              {detailTab === "operations" && trip ? (
                <View style={{ marginBottom: 12 }}>
                  <DriverTripOperationsTab trip={trip} />
                </View>
              ) : null}

              {detailTab === "settlement" ? (
                <>
                  <TripDetailSettlementPanel
                    trip={selectedTrip}
                    isFleetLinked={isTripHistoryFleet}
                    initialSelectedExpenseId={initialSelectedExpenseId}
                  />
                </>
              ) : null}
            </ScrollView>

            {showHistoryAttributionBar ? (
              <View
                style={[
                  histAttrStyles.stickyWrap,
                  {
                    bottom: Layout.tabBarDockHeight + 8,
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <Text style={[histAttrStyles.label, { color: colors.textMuted }]}>
                  Fleet attribution
                </Text>
                {isTripHistoryAttributed ? (
                  <View style={histAttrStyles.doneBadge}>
                    <FontAwesome name="check-circle" size={14} color="#d97706" />
                    <Text style={histAttrStyles.doneBadgeText}>
                      Sent to {historyCurrentEmployer?.orgName} for review
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={histAttrStyles.btn}
                    onPress={() => void handleHistoryAttributeTrip()}
                    disabled={attributeLoading}
                    activeOpacity={0.8}
                  >
                    <FontAwesome name="building" size={13} color="#d97706" />
                    <Text style={histAttrStyles.btnText}>
                      {attributeLoading
                        ? "Attributing…"
                        : `Attribute to ${historyCurrentEmployer?.orgName}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            <DriverDocumentGalleryPreview
              visible={podPreviewIndex != null}
              documents={detailPodDocuments}
              viewUrls={detailPodViewUrls}
              initialIndex={podPreviewIndex ?? 0}
              onClose={() => setPodPreviewIndex(null)}
              onResolvePreview={resolveDetailPodPreview}
              onUnusableDocument={handleUnusablePodDocument}
              fallbackLabel="POD"
            />
    </View>
  );
}

const histAttrStyles = withWebSafeShadows(
  StyleSheet.create({
  stickyWrap: {
    position: "absolute",
    left: Layout.screenPaddingHorizontal,
    right: Layout.screenPaddingHorizontal,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d97706",
    backgroundColor: "#fffbeb",
    alignSelf: "flex-start",
  },
  btnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#d97706",
  },
  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fef3c7",
    alignSelf: "flex-start",
  },
  doneBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#b45309",
  },
  }),
);

