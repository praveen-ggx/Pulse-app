import { DriverBrandMark } from "@/components/driver/DriverBrandMark";
import { TripListAssignerRow } from "@/components/driver/TripListAssignerRow";
import {
    driverBodyPrimary,
    driverBodySecondary,
} from "@/constants/DriverTypography";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useAuth } from "@/contexts/AuthContext";
import {
    useDriverTheme,
    useDriverThemeColors,
} from "@/contexts/DriverThemeContext";
import {
    buildDriverTripNumberMap,
    getDriverTripDisplayNumber,
} from "@/features/driver/utils/driverTripSequence.util";
import * as driversService from "@/features/drivers/services/drivers.service";
import * as salaryRequestsService from "@/features/drivers/services/salaryRequests.service";
import { isAggregateTrip, isRosterTrip, resolveDriverTripPayoutTerms } from "@/features/drivers/utils/driverUtils.util";
import { getLatestAssignmentAuditByTripIds } from "@/features/trips/services/trip-assignment-audit.service";
import * as tripsService from "@/features/trips/services/trips.service";
import {
    buildAssignerDisplayForTrip,
    buildJobCardAssignerPayload,
    findDriverInviteForTripOrgs,
    humanizeAssignerDisplayName,
    resolveAssignerUserId,
    type JobCardAssignerPayload,
} from "@/features/trips/utils/driverAssignerDisplay.util";
import { DriverSelfAvatar } from "@/components/driver/DriverSelfAvatar";
import { useDriverAvatarUri } from "@/lib/avatarUpload";
import { fetchOrgBrandingByIds } from "@/lib/orgBrandingFetch";
import { supabase } from "@/lib/supabase";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useRouter, useLocalSearchParams, type Href } from "expo-router";
import {
    MapPinned,
    Search as SearchIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AppState,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Reference layout: Royal Emerald trip card (app/driver/referenced TripHistoryView)
const TRIP_CARD_REF = {
  listBg: "rgba(250,250,250,0.4)",
  cardBg: "#ffffff",
  border: "#f4f4f5",
  divider: "#fafafa",
  label: "#a1a1aa",
  title: "#18181b",
  body: "#27272a",
  emerald: Theme.driverEmerald,
  emeraldYield: Theme.driverPrimary,
  muted: "#a1a1aa",
  badgeCompletedBg: "#18181b",
  accentBar: Theme.driverEmerald,
};

// Reference: trip detail / archive view (app/driver/referenced selectedHistoryItem)
const DETAIL_REF = {
  pageBg: "#ffffff",
  headerBorder: "#f4f4f5",
  headerTitle: "#18181b",
  routeCardBg: "#18181b",
  routeCardBorder: Theme.driverEmerald,
  routeCardLabel: "#71717a",
  routeCardBorderTop: "rgba(255,255,255,0.05)",
  yieldSectionLabel: "#a1a1aa",
  yieldCardBg: "#fafafa",
  yieldCardBorder: "#f4f4f5",
  yieldRowBorder: "rgba(0,0,0,0.06)",
  yieldRowLabel: "#71717a",
  yieldNetLabel: "#18181b",
  emerald: Theme.driverEmerald,
};

function isCompleted(status: string) {
  const s = (status || "").toLowerCase();
  return s === "completed" || s === "delivered" || s === "done";
}

function isAssignedNotStarted(status: string) {
  const s = (status || "").toLowerCase();
  return s === "assigned" || s === "pending" || s === "scheduled";
}

function isTransitStatus(status: string) {
  const s = (status || "").toLowerCase();
  return s === "in_transit" || s === "transit";
}

function isAtDropStatus(status: string) {
  const s = (status || "").toLowerCase();
  return s === "at_drop";
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
void UUID_V4_RE;

function normalizeAssignerName(raw: unknown): string | null {
  return humanizeAssignerDisplayName(String(raw ?? ""));
}

function getTripStageBadgeLabel(trip: tripsService.TripRow): string {
  if (isCompleted(trip.status)) return "COMPLETED";
  if (isAssignedNotStarted(trip.status) && !trip.started_at) return "ASSIGNED";
  if (isAtDropStatus(trip.status)) return "AT DROP";
  if (isTransitStatus(trip.status) || (String(trip.status || "").toLowerCase() === "in_progress" && !!trip.started_at)) {
    return "IN TRANSIT";
  }
  return "PICKUP";
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d
    .toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    .toUpperCase();
}

function formatDistance(distance: string | number | null | undefined): string {
  if (distance == null || distance === "") return "—";
  const n =
    typeof distance === "string"
      ? parseFloat(distance.replace(/[^0-9.]/g, ""))
      : Number(distance);
  if (Number.isNaN(n) || n < 0) return "—";
  const formatted = Math.round(n).toLocaleString("en-IN");
  return `${formatted} KM`;
}

function splitLocationPrimarySecondary(location: string | null | undefined): {
  primary: string;
  secondary: string | null;
} {
  const raw = (location ?? "").trim();
  if (!raw) return { primary: "—", secondary: null };
  const commaIndex = raw.indexOf(",");
  if (commaIndex === -1) return { primary: raw, secondary: null };
  const primary = raw.slice(0, commaIndex).trim() || raw;
  const secondary = raw.slice(commaIndex + 1).trim() || null;
  return { primary, secondary };
}

interface TripSettlementBreakdown {
  fareEarnings: number;
  partnerBonus: number;
  taxDeductions: number;
  netPayout: number;
  isSalary: boolean;
}

function _getTripSettlementBreakdown(
  trip: tripsService.TripRow,
): TripSettlementBreakdown {
  const isSalary = isAggregateTrip(trip);
  if (isSalary) {
    return {
      fareEarnings: 0,
      partnerBonus: 0,
      taxDeductions: 0,
      netPayout: 0,
      isSalary: true,
    };
  }

  const explicitCommission = Math.max(0, Number(trip.driver_commission ?? 0));
  const fallbackBaseFromSupplier = Math.max(
    0,
    Math.round((Number(trip.supplier_rate ?? 0) || 0) * 0.1),
  );
  const fallbackBaseFromClient = Math.max(
    0,
    Math.round((Number(trip.client_price ?? 0) || 0) * 0.1),
  );
  const fallbackBase = fallbackBaseFromSupplier || fallbackBaseFromClient;
  const fareEarnings = explicitCommission > 0 ? explicitCommission : fallbackBase;
  const partnerBonus = Math.max(0, explicitCommission - fallbackBase);
  const taxDeductions = 0;
  const netPayout = Math.max(0, fareEarnings + partnerBonus - taxDeductions);

  return { fareEarnings, partnerBonus, taxDeductions, netPayout, isSalary };
}
void _getTripSettlementBreakdown;

/** Arrow with translate-x animation on press (reference: group-hover:translate-x-2) */
function AnimatedCardArrow({
  pressed,
  color,
}: {
  pressed: boolean;
  color: string;
}) {
  const translateX = useSharedValue(0);
  useEffect(() => {
    translateX.value = withTiming(pressed ? 8 : 0, { duration: 180 });
  }, [pressed]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  return (
    <Animated.View style={animatedStyle}>
      <FontAwesome name="arrow-right" size={12} color={color} />
    </Animated.View>
  );
}

/** Side green bar: opacity 0 by default, 100% on touch (reference: opacity-0 group-hover:opacity-100 transition-opacity) */
function AnimatedAccentBar({
  pressed,
  backgroundColor,
}: {
  pressed: boolean;
  backgroundColor: string;
}) {
  const opacity = useSharedValue(pressed ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(pressed ? 1 : 0, { duration: 180 });
  }, [pressed]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
  return (
    <Animated.View
      style={[styles.cardRefAccentLeft, { backgroundColor }, animatedStyle, { pointerEvents: 'none' }]}
    />
  );
}

/** Card scale on touch (reference: active:scale-[0.98] transition-all) */
function AnimatedCardScale({
  pressed,
  children,
}: {
  pressed: boolean;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withTiming(pressed ? 0.98 : 1, { duration: 150 });
  }, [pressed]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

export default function DriverTripsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === "dark";
  const router = useRouter();
  const { profile } = useAuth();
  const { avatarUri } = useDriverAvatarUri();
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [linkedDriverRows, setLinkedDriverRows] = useState<driversService.DriverRow[]>([]);
  const [invites, setInvites] = useState<
    Awaited<ReturnType<typeof driversService.getDriverInvitesReceived>>["invites"]
  >([]);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [assignmentActorByTripId, setAssignmentActorByTripId] = useState<
    Record<string, string>
  >({});
  const [rpcAssignerUserIdByTripId, setRpcAssignerUserIdByTripId] = useState<
    Record<string, string>
  >({});
  const [assignerNamesByUserId, setAssignerNamesByUserId] = useState<
    Record<string, string>
  >({});
  const [assignerOrgNameByUserId, setAssignerOrgNameByUserId] = useState<
    Record<string, string>
  >({});
  const [assignerDisplayByTripId, setAssignerDisplayByTripId] = useState<
    Record<string, string>
  >({});
  const [assignerTripOrgNameByTripId, setAssignerTripOrgNameByTripId] = useState<
    Record<string, string>
  >({});
  const [assignerTripOrgIdByTripId, setAssignerTripOrgIdByTripId] = useState<
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
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const [_routeMetricsByTripId, _setRouteMetricsByTripId] = useState<
    Record<string, { distance: number; estimated_duration: string }>
  >({});
  const [pressedCardId, setPressedCardId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tripView, setTripView] = useState<"active" | "history">("active");
  const [tripsSubTab, setTripsSubTab] = useState<"all" | "fleet" | "open" | "attributed" | "market">("all");
  const [salaryRequests, setSalaryRequests] = useState<salaryRequestsService.SalaryRequestRow[]>([]);
  const historyParams = useLocalSearchParams<{ type?: string }>();

  useEffect(() => {
    const type =
      typeof historyParams.type === "string"
        ? historyParams.type
        : historyParams.type?.[0];
    if (type === "all" || type === "fleet" || type === "open" || type === "attributed") {
      setTripsSubTab(type);
      if (type !== "all") setTripView("history");
    }
  }, [historyParams.type]);

  const historyFocusedRef = useRef(false);
  const historyLoadGen = useRef(0);
  const historyAbortRef = useRef<AbortController | null>(null);

  const stopHistoryLoad = useCallback(() => {
    historyLoadGen.current += 1;
    historyAbortRef.current?.abort();
    historyAbortRef.current = null;
  }, []);

  const fetch = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);
    const gen = ++historyLoadGen.current;
    historyAbortRef.current?.abort();
    const ac = new AbortController();
    historyAbortRef.current = ac;
    const stale = () => historyLoadGen.current !== gen;
    driversService.getLinkedDriversForCurrentUser(profile.uid).then((res) => {
      if (stale()) return;
      if (res.error && __DEV__) {
        console.warn("[trip-history] getLinkedDriversForCurrentUser:", res.error.message);
      }
      // Include all rows (including left fleets) so history shows all trips ever driven.
      const drivers = res.drivers ?? [];
      setLinkedDriverRows(drivers);
      const activeDriver = drivers.find((d) => !d.left_at) ?? drivers[0] ?? null;
      if (drivers.length > 0) {
        setDriver(activeDriver);
        const driverIds = drivers.map((d) => d.id);
        Promise.all([
          tripsService.getDriverUiTripsByDriverIds(driverIds, { signal: ac.signal }),
          driversService.getDriverInvitesReceived(),
          salaryRequestsService.getSalaryRequestsByDriverIds(driverIds),
        ])
          .then(([tRes, invitesRes, salaryRes]) => {
            if (stale()) return;
            if (tRes.error && __DEV__) {
              console.warn("[trip-history] getDriverUiTripsByDriverIds:", tRes.error.message);
            }
            if (invitesRes.error && __DEV__) {
              console.warn("[trip-history] getDriverInvitesReceived:", invitesRes.error.message);
            }
            setTrips(tRes.error ? [] : (tRes.trips ?? []));
            setInvites(invitesRes.error ? [] : (invitesRes.invites ?? []));
            setSalaryRequests(salaryRes.error ? [] : (salaryRes.requests ?? []));
            setLoading(false);
            initialLoadDoneRef.current = true;
            isRefreshingRef.current = false;
            setRefreshing(false);
          })
          .catch((e) => {
            if (stale()) return;
            if (__DEV__) console.warn("[trip-history] trips/invites fetch failed:", e);
            setTrips([]);
            setInvites([]);
            setSalaryRequests([]);
            setLoading(false);
            initialLoadDoneRef.current = true;
            isRefreshingRef.current = false;
            setRefreshing(false);
          });
      } else {
        setTrips([]);
        setInvites([]);
        setSalaryRequests([]);
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      }
    });
  }, [profile?.uid]);

  useFocusEffect(
    useCallback(() => {
      historyFocusedRef.current = true;
      if (profile?.uid) fetch();
      return () => {
        historyFocusedRef.current = false;
        stopHistoryLoad();
      };
    }, [fetch, profile?.uid, stopHistoryLoad]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && historyFocusedRef.current && profile?.uid) fetch();
    });
    return () => sub.remove();
  }, [profile?.uid, fetch]);

  useEffect(() => {
    let cancelled = false;
    const loadAssignmentActors = async () => {
      const tripIds = trips
        .map((trip) => String(trip.id ?? "").trim())
        .filter((id) => id.length > 0);
      if (tripIds.length === 0) {
        if (!cancelled) setAssignmentActorByTripId({});
        return;
      }
      const { byTripId } = await getLatestAssignmentAuditByTripIds(tripIds);
      if (cancelled) return;
      const next: Record<string, string> = {};
      byTripId.forEach((value, key) => {
        const actorId = String(value.changed_by ?? "").trim();
        if (actorId) next[key] = actorId;
      });
      setAssignmentActorByTripId(next);
    };
    void loadAssignmentActors();
    return () => {
      cancelled = true;
    };
  }, [trips]);

  useEffect(() => {
    let cancelled = false;
    const loadAssignerSources = async () => {
      const tripIds = trips
        .map((trip) => String(trip.id ?? "").trim())
        .filter((id) => id.length > 0);
      if (tripIds.length === 0) {
        if (!cancelled) {
          setAssignerNamesByUserId({});
          setAssignerOrgNameByUserId({});
          setAssignerDisplayByTripId({});
          setAssignerTripOrgNameByTripId({});
          setAssignerTripOrgIdByTripId({});
          setOrganizationLogoById({});
          setOrganizationAvatarSeedById({});
          setOrganizationAvatarUrlById({});
        }
        return;
      }

      const { data: assignerRpcRows, error: assignerRpcError } = await supabase().rpc(
        "get_trip_assigner_displays_for_driver",
        { p_trip_ids: tripIds },
      );
      const rpcAssignerUserIdByTrip: Record<string, string> = {};
      let rpcOrgIdByTrip: Record<string, string> = {};
      if (!cancelled && !assignerRpcError && Array.isArray(assignerRpcRows)) {
        const byTrip: Record<string, string> = {};
        const orgByTrip: Record<string, string> = {};
        const orgIdByTrip: Record<string, string> = {};
        const logosFromRpc: Record<string, string> = {};
        const seedsFromRpc: Record<string, string> = {};
        const avatarUrlsFromRpc: Record<string, string> = {};
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
          const dn = normalizeAssignerName(row.display_name ?? "");
          const uid = String(row.assigner_user_id ?? "").trim();
          const orgName = String(row.assigning_organization_name ?? "").trim();
          const orgId = String(row.assigning_organization_id ?? "").trim();
          const logo = String(row.assigning_organization_logo_url ?? "").trim();
          const seed = String(row.assigning_organization_avatar_seed ?? "").trim();
          const avatarUrl = String(row.assigning_organization_avatar_url ?? "").trim();
          if (tid && dn) byTrip[tid] = dn;
          if (tid && uid) rpcAssignerUserIdByTrip[tid] = uid;
          if (tid && orgName) orgByTrip[tid] = orgName;
          if (tid && orgId) orgIdByTrip[tid] = orgId;
          if (orgId && logo) logosFromRpc[orgId] = logo;
          if (orgId && seed) seedsFromRpc[orgId] = seed;
          if (orgId && avatarUrl) avatarUrlsFromRpc[orgId] = avatarUrl;
        }
        rpcOrgIdByTrip = orgIdByTrip;
        setAssignerDisplayByTripId(byTrip);
        setRpcAssignerUserIdByTripId(rpcAssignerUserIdByTrip);
        setAssignerTripOrgNameByTripId(orgByTrip);
        setAssignerTripOrgIdByTripId(orgIdByTrip);
        if (Object.keys(logosFromRpc).length > 0) {
          setOrganizationLogoById((prev) => ({ ...prev, ...logosFromRpc }));
        }
        if (Object.keys(seedsFromRpc).length > 0) {
          setOrganizationAvatarSeedById((prev) => ({ ...prev, ...seedsFromRpc }));
        }
        if (Object.keys(avatarUrlsFromRpc).length > 0) {
          setOrganizationAvatarUrlById((prev) => ({ ...prev, ...avatarUrlsFromRpc }));
        }
      }

      const userIds = Array.from(
        new Set(
          trips
            .map((trip) =>
              resolveAssignerUserId(trip, {
                ...rpcAssignerUserIdByTrip,
                ...assignmentActorByTripId,
              }),
            )
            .filter((id) => id.length > 0),
        ),
      );
      if (userIds.length === 0) {
        if (!cancelled) {
          setAssignerNamesByUserId({});
          setAssignerOrgNameByUserId({});
        }
      } else {
      const { data, error } = await supabase()
        .from("profiles")
        .select("id, full_name, email, company_name")
        .in("id", userIds);
      if (!cancelled && !error) {
        const byId: Record<string, string> = {};
        const orgById: Record<string, string> = {};
        for (const row of
          (data ?? []) as Array<{
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
        const { data: ownedOrgs, error: ownedOrgsError } = await supabase()
          .from("organizations")
          .select("owner_id, name")
          .in("owner_id", userIds);
        if (!ownedOrgsError && Array.isArray(ownedOrgs)) {
          for (const row of ownedOrgs as Array<{
            owner_id?: string | null;
            name?: string | null;
          }>) {
            const uid = String(row.owner_id ?? "").trim();
            if (!uid || orgById[uid]) continue;
            const oname = String(row.name ?? "").trim();
            if (oname) orgById[uid] = oname;
          }
        }
        const { data: memberRows, error: memberError } = await supabase()
          .from("organization_members")
          .select("user_id, organization_id")
          .in("user_id", userIds)
          .eq("status", "active");
        if (!memberError && Array.isArray(memberRows) && memberRows.length > 0) {
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
            if (!memberOrgsError && Array.isArray(memberOrgs)) {
              const memberOrgNameById: Record<string, string> = {};
              for (const row of memberOrgs as Array<{ id: string; name?: string | null }>) {
                const name = String(row.name ?? "").trim();
                if (name) memberOrgNameById[row.id] = name;
              }
              for (const row of memberRows as Array<{
                user_id?: string | null;
                organization_id?: string | null;
              }>) {
                const uid = String(row.user_id ?? "").trim();
                if (!uid || orgById[uid]) continue;
                const oid = String(row.organization_id ?? "").trim();
                const oname = memberOrgNameById[oid] ?? "";
                if (oname) orgById[uid] = oname;
              }
            }
          }
        }
        setAssignerNamesByUserId(byId);
        setAssignerOrgNameByUserId(orgById);
      }
      }

      const organizationIds = Array.from(
        new Set(
          [
            ...trips.flatMap((trip) => [
              String(trip.organization_id ?? "").trim(),
              String(trip.supplier_id ?? "").trim(),
            ]),
            ...Object.values(rpcOrgIdByTrip),
          ].filter((id) => id.length > 0),
        ),
      );
      if (organizationIds.length > 0) {
        const branding = await fetchOrgBrandingByIds(organizationIds);
        if (!cancelled && Object.keys(branding).length > 0) {
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
    void loadAssignerSources();
    return () => {
      cancelled = true;
    };
  }, [trips, assignmentActorByTripId]);

  const organizationNamesById = useMemo(() => {
    const byId: Record<string, string> = {};
    for (const inv of invites) {
      const orgId = String(inv.from_organization_id ?? "").trim();
      const orgName = String(inv.from_org_name ?? "").trim();
      if (!orgId || !orgName) continue;
      byId[orgId] = orgName;
    }
    return byId;
  }, [invites]);
  const effectiveAssignmentActorByTripId = useMemo(
    () => ({ ...rpcAssignerUserIdByTripId, ...assignmentActorByTripId }),
    [rpcAssignerUserIdByTripId, assignmentActorByTripId],
  );

  const acceptedInviteOrgIds = useMemo(() => {
    return new Set(
      invites
        .filter((i) => String(i.status ?? "").toLowerCase() === "accepted")
        .map((i) => String(i.from_organization_id ?? "").trim())
        .filter((orgId) => orgId.length > 0),
    );
  }, [invites]);

  /** Real agreed payout terms for this trip's driver+org (invite takes precedence over the roster row). */
  const payoutTermsForTrip = useCallback(
    (trip: tripsService.TripRow) => {
      const orgId = String(trip.organization_id ?? "").trim();
      const driverRow = linkedDriverRows.find(
        (row) =>
          String(row.organization_id ?? "").trim() === orgId &&
          String(row.id ?? "") === String(trip.driver_id ?? ""),
      );
      const invite = invites.find(
        (i) =>
          String(i.status ?? "").toLowerCase() === "accepted" &&
          String(i.from_organization_id ?? "").trim() === orgId,
      );
      return {
        commissionPercent: invite?.commission_percent ?? driverRow?.commission_percent ?? null,
        commissionPerKm: invite?.commission_per_km ?? driverRow?.commission_per_km ?? null,
        payableAmount: invite?.payable_amount ?? driverRow?.payable_amount ?? null,
      };
    },
    [linkedDriverRows, invites],
  );

  const salaryRelationshipOrgIds = useMemo(() => {
    const set = new Set<string>();
    linkedDriverRows.forEach((row) => {
      const orgId = String(row.organization_id ?? "").trim();
      if (!orgId) return;
      const hasPayTerms =
        (row.payable_amount != null && Number(row.payable_amount) > 0) ||
        (row.commission_percent != null && Number(row.commission_percent) > 0) ||
        (row.commission_per_km != null && Number(row.commission_per_km) > 0);
      if (hasPayTerms) set.add(orgId);
    });
    return set;
  }, [linkedDriverRows]);

  const isFleetDispatchedTrip = useCallback(
    (trip: tripsService.TripRow): boolean => {
      const tripOrgId = String(trip.organization_id ?? "").trim();
      if (!tripOrgId) return false;
      const hasSalaryRelationship = salaryRelationshipOrgIds.has(tripOrgId);
      if (!hasSalaryRelationship) return false;
      if (acceptedInviteOrgIds.has(tripOrgId)) return true;
      return linkedDriverRows.some((row) => {
        if (String(row.organization_id ?? "").trim() !== tripOrgId) return false;
        return driversService.isActiveFleetRelationshipDriver(row);
      });
    },
    [acceptedInviteOrgIds, salaryRelationshipOrgIds, linkedDriverRows],
  );

  const assignerPayloadByTripId = useMemo(() => {
    const byTrip: Record<string, JobCardAssignerPayload> = {};
    for (const trip of trips) {
      const tid = String(trip.id ?? "").trim();
      if (!tid) continue;
      const assignerDisplay = buildAssignerDisplayForTrip(
        trip,
        invites,
        driver?.organization_id ?? null,
        {
          assignmentActorByTripId: effectiveAssignmentActorByTripId,
          assignerNamesByUserId,
          assignerOrgNameByUserId,
          assignerDisplayByTripId,
          assignerTripOrgNameByTripId,
          assignerTripOrgIdByTripId,
          organizationNamesById,
        },
      );
      const inviteForTrip = findDriverInviteForTripOrgs(invites, [
        assignerDisplay.effectiveAssignerOrgId,
        trip.supplier_id,
        trip.organization_id,
      ]);
      const orgId = (assignerDisplay.effectiveAssignerOrgId ?? "").trim();
      byTrip[tid] = buildJobCardAssignerPayload(
        trip,
        assignerDisplay,
        driver?.organization_id ?? null,
        inviteForTrip,
        {
          requiresOtp: false,
          isAggregate: isAggregateTrip(trip),
          isRoster: isRosterTrip(trip),
        },
        organizationLogoById[orgId] ?? null,
        {
          seed: organizationAvatarSeedById[orgId] ?? null,
          url: organizationAvatarUrlById[orgId] ?? null,
        },
      );
    }
    return byTrip;
  }, [
    trips,
    driver?.organization_id,
    effectiveAssignmentActorByTripId,
    assignerNamesByUserId,
    assignerOrgNameByUserId,
    assignerDisplayByTripId,
    assignerTripOrgNameByTripId,
    assignerTripOrgIdByTripId,
    invites,
    organizationNamesById,
    organizationLogoById,
    organizationAvatarSeedById,
    organizationAvatarUrlById,
  ]);

  const getEarning = (trip: tripsService.TripRow) => {
    // Aggregate/direct-shipper trips with no agreed payout terms are worth
    // ₹0 — never the legacy 10%-of-price guess.
    const { hasAgreedPayoutTerms, commissionDetail } = resolveDriverTripPayoutTerms(
      trip,
      payoutTermsForTrip(trip),
    );
    if (!hasAgreedPayoutTerms || commissionDetail.amount <= 0) {
      return isAggregateTrip(trip) ? "SALARY" : "—";
    }
    return `₹${Math.round(commissionDetail.amount).toLocaleString()}`;
  };

  const driverTripNumberById = useMemo(
    () => buildDriverTripNumberMap(trips),
    [trips],
  );
  const fleetAttributedApprovedTripIds = useMemo(() => {
    const set = new Set<string>();
    salaryRequests.forEach((r) => {
      const status = String(r.status ?? "").toLowerCase();
      if (
        r.request_type === "trip_based" &&
        (status === "approved" || status === "paid")
      ) {
        (r.trip_ids ?? []).forEach((id) => set.add(id));
      }
    });
    return set;
  }, [salaryRequests]);

  const filteredTrips = useMemo(() => {
    let list = [...trips];

    list = list.filter((trip) =>
      tripView === "history" ? isCompleted(trip.status) : !isCompleted(trip.status),
    );

    // Type filters (fleet / open / attributed) apply to History only —
    // Active shows every in-progress trip.
    if (tripView === "history" && tripsSubTab !== "all") {
      list = list.filter((trip) => {
        const isFleet = isFleetDispatchedTrip(trip);
        if (tripsSubTab === "fleet") return isFleet;
        if (tripsSubTab === "open") return !isFleet;
        if (tripsSubTab === "market") return trip.source === "market_bid";
        return fleetAttributedApprovedTripIds.has(trip.id);
      });
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((trip) => {
        const ref = getDriverTripDisplayNumber(trip, driverTripNumberById).toLowerCase();
        const pickup = (trip.pickup_area ?? "").toLowerCase();
        const drop = (trip.drop_location ?? "").toLowerCase();
        const status = (trip.status ?? "").toLowerCase();
        return (
          ref.includes(q) ||
          pickup.includes(q) ||
          drop.includes(q) ||
          status.includes(q)
        );
      });
    }

    list.sort((a, b) => {
      const dateA = new Date(a.pickup_date ?? a.created_at ?? "").getTime();
      const dateB = new Date(b.pickup_date ?? b.created_at ?? "").getTime();
      const safeA = Number.isFinite(dateA) ? dateA : 0;
      const safeB = Number.isFinite(dateB) ? dateB : 0;
      return safeB - safeA;
    });

    return list;
  }, [
    trips,
    tripView,
    tripsSubTab,
    searchQuery,
    driverTripNumberById,
    isFleetDispatchedTrip,
    fleetAttributedApprovedTripIds,
  ]);
  const historyTripsCount = useMemo(
    () => trips.filter((trip) => isCompleted(trip.status)).length,
    [trips],
  );
  const activeTripsCount = useMemo(
    () => trips.filter((trip) => !isCompleted(trip.status)).length,
    [trips],
  );
  const tripsInHistoryView = useMemo(
    () => trips.filter((trip) => isCompleted(trip.status)),
    [trips],
  );
  const fleetTripsCount = useMemo(
    () => tripsInHistoryView.filter((trip) => isFleetDispatchedTrip(trip)).length,
    [tripsInHistoryView, isFleetDispatchedTrip],
  );
  const openTripsCount = useMemo(
    () => tripsInHistoryView.filter((trip) => !isFleetDispatchedTrip(trip)).length,
    [tripsInHistoryView, isFleetDispatchedTrip],
  );
  const attributedTripsCount = useMemo(
    () =>
      tripsInHistoryView.filter((trip) => fleetAttributedApprovedTripIds.has(trip.id))
        .length,
    [tripsInHistoryView, fleetAttributedApprovedTripIds],
  );
  const marketTripsCount = useMemo(
    () => tripsInHistoryView.filter((trip) => trip.source === "market_bid").length,
    [tripsInHistoryView],
  );
  const poolCountForTab =
    tripView === "active"
      ? activeTripsCount
      : tripsSubTab === "all"
        ? historyTripsCount
        : tripsSubTab === "fleet"
          ? fleetTripsCount
          : tripsSubTab === "open"
            ? openTripsCount
            : tripsSubTab === "market"
              ? marketTripsCount
              : attributedTripsCount;

  const renderItem = ({ item }: { item: tripsService.TripRow }) => {
    const completed = isCompleted(item.status);
    const badgeLabel = getTripStageBadgeLabel(item);
    const isFleetTrip = isFleetDispatchedTrip(item);
    const pickupParts = splitLocationPrimarySecondary(item.pickup_area);
    const dropParts = splitLocationPrimarySecondary(item.drop_location);
    const corridorHint = [pickupParts.secondary, dropParts.secondary].filter(Boolean).join(" · ");
    const assignerPayload = assignerPayloadByTripId[String(item.id)] ?? null;
    return (
      <TouchableOpacity
        style={[
          styles.cardRef,
          {
            backgroundColor: colors.surface,
            borderColor: isDark ? colors.borderSubtle : "rgba(16, 185, 129, 0.12)",
          },
        ]}
        onPress={() => {
          router.push(`/driver-trip/${item.id}` as Href);
        }}
        onPressIn={() => setPressedCardId(item.id)}
        onPressOut={() => setPressedCardId(null)}
        activeOpacity={1}
      >
        {/* Emerald accent strip — left edge, fades in on press */}
        <AnimatedAccentBar
          pressed={pressedCardId === item.id}
          backgroundColor={colors.emerald}
        />
        <AnimatedCardScale pressed={pressedCardId === item.id}>
          <View style={styles.cardWatermark} pointerEvents="none">
            <MapPinned size={80} color={colors.emerald} strokeWidth={1.2} />
          </View>
          <View style={styles.cardRefTop}>
            <View style={styles.cardRefTopLeft}>
              <Text
                style={[
                  styles.cardRefId,
                  isDark
                    ? { color: colors.text, opacity: 0.85 }
                    : { color: colors.textMuted },
                ]}
              >
                {getDriverTripDisplayNumber(item, driverTripNumberById)}{" "}
                <Text style={{ color: isDark ? colors.borderSubtle : "#e2e8f0" }}> • </Text>{" "}
                {formatDate(item.pickup_date ?? item.created_at)}
              </Text>
              <View style={styles.routeRowRef}>
                <Text
                  style={[styles.routeRefPickup, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {pickupParts.primary}
                </Text>
                <View style={styles.routeArrowWrap}>
                  <AnimatedCardArrow
                    pressed={pressedCardId === item.id}
                    color={colors.emerald}
                  />
                </View>
                <Text
                  style={[styles.routeRefDrop, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {dropParts.primary}
                </Text>
              </View>
              {corridorHint.length > 0 ? (
                <Text
                  style={[styles.routeCorridorHint, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {corridorHint}
                </Text>
              ) : null}
              <TripListAssignerRow
                assigner={assignerPayload}
                mutedColor={colors.textMuted}
                textColor={colors.text}
              />
            </View>
            <View
              style={[
                styles.badgeRef,
                completed
                  ? { backgroundColor: isDark ? "#0f172a" : "#0f172a" }
                  : { backgroundColor: colors.emerald },
              ]}
            >
              <Text
                style={[styles.badgeRefText, { color: colors.textOnPrimary }]}
              >
                {badgeLabel}
              </Text>
            </View>
          </View>
          <View
            style={[styles.cardRefBottom, { borderTopColor: isDark ? colors.borderSubtle : "#f8fafc" }]}
          >
            <View style={styles.cardRefBottomLeft}>
              <Text
                style={[
                  styles.manifestLabel,
                  isDark
                    ? { color: colors.text, opacity: 0.85 }
                    : { color: colors.textMuted },
                ]}
              >
                Distance
              </Text>
              <View style={styles.cardRefDistanceRow}>
                <Text style={[styles.manifestValue, { color: colors.text }]}>
                  {formatDistance(item.distance)}
                </Text>
                <Text
                  style={[
                    styles.tripTypeBadge,
                    isFleetTrip
                      ? styles.tripTypeBadgeFleet
                      : styles.tripTypeBadgeOpen,
                  ]}
                >
                  {isFleetTrip ? "FLEET TRIP" : "OPEN TRIP"}
                </Text>
              </View>
            </View>
            <View style={styles.yieldWrapRef}>
              <Text
                style={[
                  styles.yieldLabelRef,
                  isDark
                    ? { color: colors.text, opacity: 0.85 }
                    : { color: colors.textMuted },
                ]}
              >
                Yield
              </Text>
              <Text
                style={[
                  styles.yieldValueRef,
                  styles.yieldValueRefLarge,
                  { color: completed ? colors.emerald : colors.textMuted },
                ]}
              >
                {getEarning(item)}
              </Text>
            </View>
          </View>
        </AnimatedCardScale>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { paddingTop: insets.top, backgroundColor: colors.background },
        ]}
      >
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Loading trip history…
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      <FlashList
        data={filteredTrips}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View
              style={[
                styles.header,
                {
                  paddingTop: insets.top + Layout.driverHeaderTopOffset,
                  paddingHorizontal: Layout.driverHeaderHorizontalPadding,
                  paddingBottom: Layout.driverHeaderBottomPadding,
                  backgroundColor: colors.surface,
                  borderBottomColor: colors.border,
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
                    Trips
                  </Text>
                </View>
              </View>
            </View>
            <View
              style={[styles.creditsSection, { backgroundColor: colors.background }]}
            >
              <Text style={[styles.creditsTitle, { color: Theme.driverEmeraldDark }]}>
                TRIPS.
              </Text>
              <Text style={[styles.creditsSubtitle, { color: colors.textMuted }]}>
                {tripView === "active"
                  ? "In-progress trips"
                  : "Completed trips · fleet / open / attributed"}
              </Text>
            </View>
            <View
              style={[
                styles.toolbarWrap,
                { backgroundColor: colors.background },
              ]}
            >
              <View style={styles.toolbarTopRow}>
                <View
                  style={[
                    styles.searchWrap,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isDark ? colors.borderSubtle : "rgba(16, 185, 129, 0.15)",
                    },
                  ]}
                >
                  <SearchIcon size={16} color={colors.textMuted} strokeWidth={2} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Search trips..."
                    placeholderTextColor={colors.placeholder}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    returnKeyType="search"
                  />
                </View>
                <View
                  style={[
                    styles.segmentOuter,
                    {
                      backgroundColor: isDark ? colors.surfaceElevated : "rgba(241, 245, 249, 0.65)",
                      borderColor: isDark ? colors.borderSubtle : "#ffffff",
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.segmentBtn,
                      tripView === "active" && [
                        styles.segmentBtnActive,
                        {
                          backgroundColor: colors.surface,
                          borderColor: isDark ? colors.borderSubtle : colors.border,
                        },
                      ],
                    ]}
                    onPress={() => setTripView("active")}
                    activeOpacity={0.8}
                  >
                    <View style={styles.segmentLabelRow}>
                      <Text
                        style={[
                          styles.segmentLabel,
                          {
                            color:
                              tripView === "active" ? colors.emerald : colors.textMuted,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        Active
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentBtn,
                      tripView === "history" && [
                        styles.segmentBtnActive,
                        {
                          backgroundColor: colors.surface,
                          borderColor: isDark ? colors.borderSubtle : colors.border,
                        },
                      ],
                    ]}
                    onPress={() => setTripView("history")}
                    activeOpacity={0.8}
                  >
                    <View style={styles.segmentLabelRow}>
                      <Text
                        style={[
                          styles.segmentLabel,
                          {
                            color:
                              tripView === "history" ? colors.emerald : colors.textMuted,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        History
                      </Text>
                      <View
                        style={[
                          styles.segmentCountBadge,
                          {
                            backgroundColor:
                              tripView === "history" ? colors.emerald : colors.surface,
                            borderColor: tripView === "history" ? colors.emerald : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentCountBadgeText,
                            {
                              color:
                                tripView === "history" ? colors.textOnPrimary : colors.textMuted,
                            },
                          ]}
                        >
                          {historyTripsCount}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {tripView === "history" ? (
                <View
                  style={[
                    styles.tripsSubTabRow,
                    {
                      backgroundColor: isDark ? colors.surfaceElevated : "rgba(248,250,252,0.9)",
                      borderColor: isDark ? colors.borderSubtle : "rgba(226,232,240,0.9)",
                    },
                  ]}
                >
                  {(
                    [
                      {
                        id: "all" as const,
                        label: "All",
                        icon: "list" as const,
                        count: historyTripsCount,
                      },
                      {
                        id: "fleet" as const,
                        label: "Fleet",
                        icon: "building" as const,
                        count: fleetTripsCount,
                      },
                      {
                        id: "open" as const,
                        label: "Open",
                        icon: "road" as const,
                        count: openTripsCount,
                      },
                      {
                        id: "attributed" as const,
                        label: "Attributed",
                        icon: "check-circle" as const,
                        count: attributedTripsCount,
                      },
                      {
                        id: "market" as const,
                        label: "Market",
                        icon: "shopping-bag" as const,
                        count: marketTripsCount,
                      },
                    ] as const
                  ).map((tab) => {
                    const active = tripsSubTab === tab.id;
                    const accent =
                      tab.id === "fleet"
                        ? colors.emerald
                        : tab.id === "open"
                          ? Theme.textPrimaryDark
                          : tab.id === "attributed"
                            ? Theme.warning
                            : colors.emerald;
                    return (
                      <TouchableOpacity
                        key={tab.id}
                        style={[
                          styles.tripsSubTabBtn,
                          active && [
                            styles.tripsSubTabBtnActive,
                            {
                              backgroundColor:
                                tab.id === "fleet"
                                  ? isDark
                                    ? "rgba(4,120,87,0.18)"
                                    : Theme.driverEmeraldMuted
                                  : tab.id === "open"
                                    ? isDark
                                      ? "rgba(15,23,42,0.16)"
                                      : "rgba(15,23,42,0.06)"
                                    : tab.id === "attributed"
                                      ? isDark
                                        ? "rgba(245,158,11,0.18)"
                                        : "rgba(245,158,11,0.10)"
                                      : isDark
                                        ? "rgba(4,120,87,0.14)"
                                        : Theme.driverEmeraldMuted,
                              borderColor:
                                tab.id === "fleet"
                                  ? isDark
                                    ? "rgba(4,120,87,0.35)"
                                    : Theme.driverEmeraldBorderSoft
                                  : tab.id === "open"
                                    ? isDark
                                      ? "rgba(148,163,184,0.35)"
                                      : "rgba(148,163,184,0.45)"
                                    : tab.id === "attributed"
                                      ? isDark
                                        ? "rgba(245,158,11,0.35)"
                                        : "rgba(245,158,11,0.24)"
                                      : isDark
                                        ? "rgba(4,120,87,0.28)"
                                        : Theme.driverEmeraldBorderSoft,
                            },
                          ],
                        ]}
                        onPress={() => setTripsSubTab(tab.id)}
                        activeOpacity={0.85}
                      >
                        <FontAwesome
                          name={tab.icon}
                          size={10}
                          color={active ? accent : colors.textMuted}
                        />
                        <Text
                          style={[
                            styles.tripsSubTabText,
                            { color: active ? accent : colors.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.toolbarFooter}>
                <Text style={[styles.resultMeta, { color: colors.textMuted }]}>
                  Showing {filteredTrips.length} of {poolCountForTab}
                  {" · "}
                  {tripView === "active" ? "Active" : "History"}
                </Text>
                {searchQuery.trim().length > 0 ? (
                  <TouchableOpacity
                    style={[
                      styles.clearBtn,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    onPress={() => setSearchQuery("")}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.clearBtnText, { color: colors.text }]}>Clear</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.clearBtnPlaceholder} />
                )}
              </View>
            </View>
          </>
        }
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{
          ...styles.listContent,
          backgroundColor: colors.background,
          paddingBottom: insets.bottom + 80,
        }}
        ListEmptyComponent={
          filteredTrips.length === 0 ? (
            tripView === "active" && searchQuery.trim().length === 0 ? (
              <View style={styles.emptyActiveWrap}>
                <View
                  style={[
                    styles.emptyActiveIconCircle,
                    {
                      backgroundColor: colors.whiteMuted,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <FontAwesome name="send-o" size={26} color={colors.emerald} />
                </View>
                <Text style={[styles.emptyActiveTitle, { color: colors.text }]}>
                  No active trips right now
                </Text>
                <Text
                  style={[styles.emptyActiveSubtitle, { color: colors.textMuted }]}
                >
                  Fresh assignments appear here instantly once dispatched.
                </Text>
                {historyTripsCount > 0 ? (
                  <TouchableOpacity
                    style={[
                      styles.emptyActiveButton,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    onPress={() => setTripView("history")}
                    activeOpacity={0.85}
                  >
                    <FontAwesome
                      name="history"
                      size={12}
                      color={colors.text}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[styles.emptyActiveButtonText, { color: colors.text }]}
                    >
                      View history
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View style={styles.empty}>
                <FontAwesome name="search" size={36} color={colors.tabInactive} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {trips.length === 0
                    ? "No trips yet"
                    : tripsSubTab === "fleet"
                      ? "No fleet trips found"
                      : tripsSubTab === "open"
                        ? "No open trips found"
                        : tripsSubTab === "attributed"
                          ? "No attributed trips found"
                          : tripsSubTab === "market"
                            ? "No Market trips found"
                            : "No trips found"}
                </Text>
              </View>
            )
          ) : null
        }
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.driverBackground,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Layout.driverHeaderGap,
    flex: 1,
    minWidth: 0,
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
    ...Typography.headerSubtitle,
    marginBottom: 1,
  },
  welcomeTitle: {
    ...Typography.headerTitle,
    textTransform: "none",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  creditsSection: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 6,
  },
  creditsTitle: {
    fontSize: 42,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -2,
    lineHeight: 44,
    textTransform: "uppercase",
  },
  creditsSubtitle: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 3,
    marginTop: 4,
    textTransform: "uppercase",
    opacity: 0.82,
  },
  toolbarWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 6,
  },
  toolbarTopRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  tripsSubTabRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
  },
  tripsSubTabBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  tripsSubTabBtnActive: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  tripsSubTabText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  searchWrap: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderWidth: 0,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    paddingVertical: 0,
    height: "100%",
  },
  segmentOuter: {
    height: 44,
    width: 188,
    flexShrink: 0,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 4,
    overflow: "hidden",
  },
  segmentBtn: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    zIndex: 0,
  },
  segmentBtnActive: {
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  segmentLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  segmentLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 0,
    maxWidth: "100%",
  },
  segmentCountBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  segmentCountBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.2,
    lineHeight: 10,
  },
  toolbarFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    minHeight: 18,
  },
  resultMeta: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    opacity: 0.75,
    lineHeight: 12,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  clearBtnPlaceholder: {
    width: 50,
  },
  listContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 24,
  },
  cardRef: {
    backgroundColor: TRIP_CARD_REF.cardBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TRIP_CARD_REF.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardWatermark: {
    position: "absolute",
    right: -8,
    top: "22%",
    opacity: 0.04,
    zIndex: 0,
  },
  cardRefAccentLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: 5,
    zIndex: 1,
  },
  cardRefTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 8,
  },
  cardRefTopLeft: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  cardRefId: {
    fontSize: 9,
    fontWeight: "700",
    color: TRIP_CARD_REF.label,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 5,
    lineHeight: 12,
  },
  routeRowRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  routeRefPickup: {
    fontSize: 13,
    fontWeight: "700",
    color: TRIP_CARD_REF.title,
    letterSpacing: -0.25,
    textTransform: "uppercase",
    lineHeight: 16,
    flexShrink: 1,
    minWidth: 0,
  },
  routeRefDrop: {
    fontSize: 13,
    fontWeight: "700",
    color: TRIP_CARD_REF.title,
    letterSpacing: -0.25,
    textTransform: "uppercase",
    lineHeight: 16,
    flexShrink: 1,
    minWidth: 0,
  },
  routeArrowWrap: {
    marginHorizontal: 0,
    paddingTop: 1,
  },
  routeCorridorHint: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    opacity: 0.72,
    lineHeight: 12,
  },
  cardAssignedByLine: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.25,
    opacity: 0.9,
    lineHeight: 13,
  },
  badgeRef: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    flexShrink: 0,
    marginLeft: 0,
    alignSelf: "flex-start",
    maxWidth: "36%",
  },
  badgeRefCompleted: {
    backgroundColor: TRIP_CARD_REF.badgeCompletedBg,
  },
  badgeRefTransit: {
    backgroundColor: TRIP_CARD_REF.emerald,
  },
  badgeRefText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    lineHeight: 11,
  },
  cardRefBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 12,
    marginTop: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: TRIP_CARD_REF.divider,
  },
  cardRefBottomLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  cardRefDistanceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 6,
  },
  manifestLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: TRIP_CARD_REF.label,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 3,
    lineHeight: 11,
  },
  manifestValue: {
    fontSize: 11,
    fontWeight: "700",
    color: TRIP_CARD_REF.body,
    textTransform: "uppercase",
    lineHeight: 14,
  },
  tripTypeBadge: {
    alignSelf: "flex-start",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  tripTypeBadgeFleet: {
    color: Theme.driverEmeraldDark,
    backgroundColor: "rgba(16,185,129,0.10)",
    borderColor: "rgba(16,185,129,0.30)",
  },
  tripTypeBadgeOpen: {
    color: "#4D3636",
    backgroundColor: "rgba(99,102,241,0.10)",
    borderColor: "rgba(99,102,241,0.30)",
  },
  yieldWrapRef: {
    alignItems: "flex-end",
    justifyContent: "flex-end",
    minWidth: 0,
    flexShrink: 0,
    minHeight: 42,
  },
  yieldLabelRef: {
    fontSize: 8,
    fontWeight: "700",
    color: TRIP_CARD_REF.label,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 3,
    lineHeight: 11,
    textAlign: "right",
  },
  yieldValueRef: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
  },
  yieldValueRefLarge: {
    fontSize: 16,
    letterSpacing: -0.35,
  },
  yieldValueCompleted: { color: TRIP_CARD_REF.emeraldYield },
  yieldValueMuted: { color: TRIP_CARD_REF.muted },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyActiveWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 68,
    paddingHorizontal: 30,
  },
  emptyActiveIconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyActiveTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  emptyActiveSubtitle: {
    ...driverBodyPrimary,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 320,
  },
  emptyActiveButton: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  emptyActiveButtonText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyText: {
    ...driverBodySecondary,
    fontSize: 14,
    color: Theme.textMuted,
  },
  detailWrap: {
    flex: 1,
    backgroundColor: DETAIL_REF.pageBg,
  },
  detailHeaderRef: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    gap: 10,
  },
  detailHeaderStyled: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  detailBack: {
    minWidth: 36,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  detailBackStyled: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
  },
  detailHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  detailTitleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start",
    minWidth: 0,
    marginLeft: 12,
  },
  tdHeaderCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 0,
  },
  tdStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      },
      default: { elevation: 2 },
    }),
  },
  tdHeroOuter: {
    marginBottom: 20,
    borderRadius: 40,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      default: { elevation: 10 },
    }),
  },
  tdHeroCard: {
    borderRadius: 40,
    padding: 32,
    paddingBottom: 28,
    overflow: "hidden",
  },
  tdHeroGlow: {
    position: "absolute",
    bottom: -48,
    left: -48,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(16,185,129,0.22)",
    opacity: 1,
  },
  tdHeroWatermark: {
    position: "absolute",
    top: 28,
    right: 28,
    opacity: 1,
    transform: [{ rotate: "12deg" }],
  },
  tdHeroInner: {
    position: "relative",
    zIndex: 2,
  },
  tdHeroKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 4,
    color: "rgba(148,163,184,0.95)",
    textTransform: "uppercase",
    marginBottom: 24,
  },
  tdHeroRouteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 22,
  },
  tdHeroRouteSide: {
    flex: 1,
    minWidth: 0,
  },
  tdHeroRouteSideRight: {
    alignItems: "flex-end",
  },
  tdHeroCity: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -1,
    textTransform: "uppercase",
    lineHeight: 27,
  },
  tdHeroCityRight: {
    textAlign: "right",
  },
  tdHeroState: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.8,
    color: "rgba(148,163,184,0.95)",
    textTransform: "uppercase",
    marginTop: 7,
    maxWidth: "100%",
  },
  tdHeroStateRight: {
    textAlign: "right",
  },
  tdHeroRouteConnector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    width: 48,
    paddingTop: 12,
  },
  tdHeroToRail: {
    alignItems: "center",
    width: 14,
  },
  tdHeroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tdHeroRailGrad: {
    width: 2,
    height: 18,
    marginTop: 2,
    borderRadius: 1,
  },
  tdHeroConnectorLine: {
    flex: 1,
    height: 1,
    minWidth: 6,
    backgroundColor: "rgba(148,163,184,0.3)",
  },
  tdHeroToLabel: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  tdHeroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginBottom: 18,
  },
  tdHeroMetaRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 28,
  },
  tdHeroMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  tdHeroMetaIconWrap: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  tdHeroMetaKicker: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(148,163,184,0.95)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  tdHeroMetaValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  tdHeroAssignerRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tdHeroAssignerLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(148,163,184,0.95)",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  tdHeroAssignerValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
  },
  tdHeroAccentBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  tdTabBar: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    gap: 4,
    marginBottom: 12,
  },
  tdTabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    minHeight: 40,
  },
  tdTabBtnActive: {
    backgroundColor: "#0f172a",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      default: { elevation: 4 },
    }),
  },
  tdTabLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    lineHeight: 13,
  },
  tdTimelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  tdTimelineHeaderIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tdTimelineHeaderTitle: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    lineHeight: 12,
    flex: 1,
    minWidth: 0,
  },
  tdTimelineCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
    overflow: "visible",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      default: { elevation: 2 },
    }),
  },
  tdEmptyTimeline: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 14,
    lineHeight: 15,
  },
  tdPodRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    minHeight: 44,
  },
  tdPodFileName: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  podPreviewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  podPreviewInner: {
    borderRadius: 16,
    overflow: "hidden",
    maxHeight: "88%",
  },
  podPreviewClose: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  podPreviewImageBox: {
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 32,
  },
  podPreviewImage: {
    width: "100%",
    minHeight: 280,
    maxHeight: 480,
  },
  podPreviewFallback: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  tdLogRowWrap: {
    position: "relative",
    paddingBottom: 12,
  },
  tdLogConnector: {
    position: "absolute",
    left: 22,
    top: 30,
    bottom: 0,
    width: 2,
    zIndex: 0,
  },
  tdLogTouchable: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 6,
    zIndex: 1,
  },
  tdLogMarkerCol: {
    width: 32,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 1,
    flexShrink: 0,
  },
  tdLogCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: Theme.driverEmerald,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      default: { elevation: 2 },
    }),
  },
  tdLogBody: {
    flex: 1,
    minWidth: 0,
  },
  tdLogHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 2,
    minHeight: 22,
  },
  tdLogHeadRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  tdLogStatus: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.1,
    flexShrink: 1,
    lineHeight: 16,
  },
  tdLogTime: {
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 12,
  },
  tdLogLoc: {
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
  },
  tdLogExpanded: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148,163,184,0.35)",
  },
  tdLogDetailsKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  tdLogDetailsBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  tdLogDetailsText: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 17,
  },
  tdLogMetaGrid: {
    flexDirection: "row",
    gap: 24,
    flexWrap: "wrap",
  },
  tdLogMetaK: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  tdLogMetaV: {
    fontSize: 11,
    fontWeight: "600",
  },
  tdLogInTransitGrid: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  tdLogInTransitCol: {
    flex: 1,
    minWidth: 0,
  },
  tdDeliveredBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  tdDeliveredKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 3,
    color: "rgba(236,253,245,0.95)",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  tdDeliveredTitle: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: "#ffffff",
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  tdDeliveredIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  tdProgressBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 4,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      default: { elevation: 2 },
    }),
  },
  tdProgressKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  tdProgressTitle: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
    fontStyle: "italic",
    lineHeight: 18,
  },
  tdSettlementGlow: {
    marginBottom: 12,
    borderRadius: 16,
    padding: 2,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  tdNetCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      default: { elevation: 2 },
    }),
  },
  tdNetBlur: {
    position: "absolute",
    top: -32,
    right: -32,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(16,185,129,0.14)",
    opacity: 1,
  },
  tdNetHeader: {
    alignItems: "center",
  },
  tdNetWalletIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    backgroundColor: "rgba(16,185,129,0.12)",
  },
  tdNetKicker: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 6,
    textTransform: "uppercase",
    lineHeight: 11,
  },
  tdNetAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    marginBottom: 8,
    maxWidth: "100%",
  },
  tdNetRupee: {
    fontSize: 16,
    fontWeight: "700",
    marginRight: 1,
    lineHeight: 22,
  },
  tdNetAmount: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -1,
    flexShrink: 1,
    lineHeight: 30,
  },
  tdNetSuccessPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  tdNetSuccessText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    lineHeight: 12,
  },
  tdNetMiniGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  tdNetMiniCard: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 0,
  },
  tdNetMiniK: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 4,
    textTransform: "uppercase",
    lineHeight: 10,
  },
  tdNetMiniV: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
  },
  tdEarningsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 8,
    marginTop: 4,
  },
  tdEarningsHeaderTitle: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    lineHeight: 12,
  },
  tdBreakdownCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 2,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      default: { elevation: 2 },
    }),
  },
  tdBreakRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 8,
    borderRadius: 10,
    minHeight: 52,
  },
  tdBreakRowHighlight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 8,
    borderRadius: 10,
    marginVertical: 1,
    minHeight: 52,
  },
  tdBreakLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  tdBreakIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tdBreakTitle: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  tdBreakTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 1,
  },
  tdBreakSub: {
    fontSize: 9,
    fontWeight: "500",
    marginTop: 1,
    lineHeight: 12,
  },
  tdBreakValue: {
    fontSize: 12,
    fontWeight: "800",
    flexShrink: 0,
    textAlign: "right",
    lineHeight: 16,
  },
  tdActiveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tdActiveBadgeText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#ffffff",
    textTransform: "uppercase",
    lineHeight: 10,
  },
  tdSettledBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: "#0f172a",
    minHeight: 56,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      default: { elevation: 3 },
    }),
  },
  tdSettledLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  tdSettledCalWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    flexShrink: 0,
  },
  tdSettledK: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "rgba(148,163,184,0.95)",
    textTransform: "uppercase",
    marginBottom: 2,
    lineHeight: 11,
  },
  tdSettledV: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.1,
    lineHeight: 16,
  },
  tdSettledExport: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  tdQueryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 44,
  },
  tdQueryBtnText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    lineHeight: 12,
  },
  detailHeaderLabelRef: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 2,
    lineHeight: 11,
    textTransform: "uppercase",
  },
  detailHeaderIdRowRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailHeaderDotRef: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  detailTitleRef: {
    fontSize: 14,
    fontWeight: "700",
    color: DETAIL_REF.headerTitle,
    letterSpacing: 0.1,
    lineHeight: 18,
  },
  detailTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailArchiveIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  detailSubtitleRef: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 1,
  },
  detailBackSpacer: {
    width: 40,
  },
  detailScrollRef: {
    flex: 1,
    backgroundColor: DETAIL_REF.pageBg,
  },
  detailContentRef: {
    paddingTop: 12,
    paddingBottom: 72,
  },
  routeCardRef: {
    padding: 32,
    borderRadius: 8,
    borderBottomWidth: 4,
    borderBottomColor: DETAIL_REF.routeCardBorder,
    backgroundColor: DETAIL_REF.routeCardBg,
    marginBottom: 40,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  routeCardWatermark: {
    position: "absolute",
    top: 24,
    right: 24,
    opacity: 0.18,
    transform: [{ rotate: "45deg" }],
  },
  routeCardWatermarkIcon: {
    ...Platform.select({
      web: { textShadow: "0px 0px 3px rgba(255,255,255,0.6)" } as object,
      default: {
        textShadowColor: "rgba(255,255,255,0.6)",
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 3,
      },
    }),
  },
  routeCardLabelRef: {
    fontSize: 9,
    fontWeight: "900",
    color: DETAIL_REF.routeCardLabel,
    letterSpacing: 4.5,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  routeCardOriginRef: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -0.6,
    textTransform: "uppercase",
    lineHeight: 26.4,
    marginBottom: 2,
  },
  routeCardToRef: {
    fontSize: 24,
    fontWeight: "500",
    color: DETAIL_REF.emerald,
    opacity: 0.5,
    marginVertical: 0,
    letterSpacing: -0.6,
  },
  routeCardDestRef: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -0.6,
    textTransform: "uppercase",
    lineHeight: 26.4,
    marginTop: 2,
    marginBottom: 4,
  },
  routeCardStateRef: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 4.5,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  routeCardMetaRef: {
    flexDirection: "row",
    gap: 40,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: DETAIL_REF.routeCardBorderTop,
  },
  routeCardMetaItemRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  routeCardMetaTextRef: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 2.2,
    textTransform: "uppercase",
  },
  detailSectionRef: {
    marginBottom: Layout.sectionSpacing,
  },
  detailSectionHeaderRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  detailSectionIconWrapRef: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  detailSectionTitleRef: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  detailTabSegmentedRef: {
    flexDirection: "row",
    padding: 6,
    borderRadius: 24,
    marginBottom: 24,
  },
  detailTabSegmentedBtnRef: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  detailTabSegmentedBtnActiveRef: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  detailTabSegmentedLabelRef: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  logCardActivityRef: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  logCardActivityLineRef: {
    position: "absolute",
    left: 12,
    top: 32,
    bottom: 32,
    width: 1,
  },
  logItemActivityRef: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 26,
  },
  logItemActivityLastRef: {
    marginBottom: 0,
  },
  logCircleWrapRef: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  logMarkerColRef: {
    width: 20,
    marginRight: 12,
    alignItems: "center",
    position: "relative",
  },
  logConnectorRef: {
    position: "absolute",
    top: 20,
    bottom: -26,
    width: 1,
    alignSelf: "center",
  },
  logContentActivityRef: {
    flex: 1,
    minWidth: 0,
  },
  logStatusChipRef: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  logStatusChipTextRef: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  logTimeMetaRef: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  yieldCardSettlementRef: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 2,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  yieldRowLabelSettlementRef: {
    fontSize: 17,
    fontWeight: "700",
    color: DETAIL_REF.yieldRowLabel,
  },
  yieldRowTextBlockRef: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  yieldRowSubtextRef: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
  },
  yieldRowValueBlockRef: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 94,
  },
  yieldRowValueMetaRef: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  yieldRowValueDeductionRef: {
    fontSize: 20,
    fontWeight: "800",
  },
  yieldPayoutHeroDarkRef: {
    marginTop: 24,
    marginBottom: 8,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  yieldPayoutHeroLabelDarkRef: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  yieldPayoutHeroRupeeRef: {
    fontSize: 24,
    fontWeight: "600",
    color: Theme.driverPrimary,
    marginRight: 4,
  },
  yieldPayoutHeroAmountDarkRef: {
    fontSize: 40,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.8,
  },
  yieldPayoutHeroBadgeDarkRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  yieldPayoutHeroDotRef: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  yieldPayoutHeroBadgeTextDarkRef: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  yieldTierBadgeRef: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  yieldTierBadgeTextRef: {
    fontSize: 8,
    fontWeight: "800",
  },
  yieldPayoutHeroRef: {
    marginTop: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#064E3B",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  yieldPayoutHeroLabelRef: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  yieldPayoutHeroAmountRowRef: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  yieldPayoutHeroAmountRef: {
    fontSize: 40,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -1,
  },
  yieldPayoutHeroBadgeRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  yieldPayoutHeroBadgeTextRef: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  yieldMetaGridRef: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  yieldMetaCardRef: {
    flex: 1,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  yieldMetaIconRef: {
    marginBottom: 12,
  },
  yieldMetaLabelRef: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  yieldMetaValueRef: {
    fontSize: 12,
    fontWeight: "800",
  },
  logSectionRef: {
    marginBottom: Layout.sectionSpacing,
  },
  logSectionHeaderRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  logSectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logSectionTitleRef: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  logCardRef: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  logItemRef: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
  },
  logItemBorderRef: {
    borderBottomWidth: 1,
  },
  logLeftRef: {
    width: 28,
    alignItems: "center",
    marginRight: 14,
  },
  logDotRef: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  logLineRef: {
    width: 2,
    height: 32,
    marginTop: 6,
  },
  logContentRef: {
    flex: 1,
    minWidth: 0,
  },
  logHeadRef: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  logStatusRef: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  logTimeRef: {
    fontSize: 12,
    fontWeight: "500",
  },
  logLocRowRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logLocIconRef: {
    marginRight: 0,
  },
  logLocTextRef: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  yieldSectionRef: {
    marginBottom: Layout.sectionSpacing,
  },
  yieldSectionHeaderRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  yieldSectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  yieldSectionTitleRef: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  yieldCardRef: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DETAIL_REF.yieldCardBorder,
    backgroundColor: DETAIL_REF.yieldCardBg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  yieldRowRef: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  yieldRowBorderRef: {
    borderBottomWidth: 1,
    borderBottomColor: DETAIL_REF.yieldRowBorder,
  },
  yieldRowLastRef: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginHorizontal: -4,
    marginBottom: -4,
    borderRadius: 8,
  },
  yieldRowLabelRef: {
    fontSize: 12,
    fontWeight: "600",
    color: DETAIL_REF.yieldRowLabel,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  yieldRowValueRef: {
    fontSize: 20,
    fontWeight: "800",
    color: DETAIL_REF.headerTitle,
  },
  yieldRowValueEmeraldRef: {
    fontSize: 20,
    fontWeight: "800",
    color: DETAIL_REF.emerald,
  },
  yieldRowLabelNetRef: {
    fontSize: 12,
    fontWeight: "700",
    color: DETAIL_REF.yieldNetLabel,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  yieldNetRef: {
    fontSize: 20,
    fontWeight: "800",
    color: DETAIL_REF.emerald,
  },
});
