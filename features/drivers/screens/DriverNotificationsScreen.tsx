/**
 * Lists trips awaiting accept / OTP (same sources as dashboard incoming list).
 * Tapping a row returns to the dashboard with that trip selected.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import {
    DRIVER_DETAIL_HORIZONTAL_PAD,
    DriverSubScreenHeader,
    driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { getPendingOtpTrips } from '@/features/trips/services/tripOtp.service';
import { getLatestAssignmentAuditByTripIds } from '@/features/trips/services/trip-assignment-audit.service';
import { TripListAssignerRow } from '@/components/driver/TripListAssignerRow';
import {
    assignerPrimarySecondaryForDriver,
    buildAssignerDisplayForTrip,
    buildJobCardAssignerPayload,
    findDriverInviteForTripOrgs,
    resolveAssignerUserId,
    type JobCardAssignerPayload,
} from '@/features/trips/utils/driverAssignerDisplay.util';
import {
    DRIVER_NOTIFY_ONLY_AFTER_MISSION_KEY,
    DRIVER_POST_MISSION_PENDING_SNAPSHOT_KEY,
} from '@/features/driver/utils/driverDashboardFlags.util';
import {
    buildDriverTripNumberMap,
    getDriverTripDisplayNumber,
} from '@/features/driver/utils/driverTripSequence.util';
import {
  computeDriverTripPayInr,
    canShowDriverTripEstEarnings,
    DRIVER_PAY_NA_LABEL,
    isActiveMission,
    isAggregateTrip,
    isAssignedNotStarted,
    isCompletedStatus,
    isRosterTrip,
} from '@/features/drivers/utils/driverUtils.util';
import { formatINR } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { fetchOrgBrandingByIds } from '@/lib/orgBrandingFetch';
import * as driversService from '@/features/drivers/services/drivers.service';
import * as tripsService from '@/features/trips/services/trips.service';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickDriverRowForTrip, resolveAgreedPayTerms } from '@/features/drivers/utils/driverPayTerms.util';

const DRIVER_ACCEPTED_TRIP_ID_KEY = 'driver_accepted_trip_id';
const DRIVER_NOTIFICATION_FOCUS_TRIP_KEY = 'driver_notification_focus_trip_id';

export default function DriverNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useDriverTheme();
  const isDark = theme === 'dark';
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { profile } = useAuth();

  const [allTrips, setAllTrips] = useState<tripsService.TripRow[]>([]);
  const [pendingOtpTrips, setPendingOtpTrips] = useState<tripsService.TripRow[]>([]);
  const [invites, setInvites] = useState<
    Awaited<ReturnType<typeof driversService.getDriverInvitesReceived>>['invites']
  >([]);
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptedTripId, setAcceptedTripId] = useState<string | null>(null);
  const [assignmentActorByTripId, setAssignmentActorByTripId] = useState<
    Record<string, string>
  >({});
  const [rpcAssignerUserIdByTripId, setRpcAssignerUserIdByTripId] = useState<
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
  const [assignerNamesByUserId, setAssignerNamesByUserId] = useState<
    Record<string, string>
  >({});
  const [assignerOrgNameByUserId, setAssignerOrgNameByUserId] = useState<
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
  const [notifyOnlyAfterMission, setNotifyOnlyAfterMission] = useState(false);
  type DriverNotificationRow = {
    trip: tripsService.TripRow;
    assignerPersonDisplay: string;
    assignedByOrgName: string;
    assignerLinePrimary: string;
    assignerLineSecondary: string;
    assignerPayload: JobCardAssignerPayload | null;
    requiresOtp: boolean;
    commissionForTrip: number;
  };

  const [postMissionSnapshotRows, setPostMissionSnapshotRows] = useState<
    DriverNotificationRow[]
  >([]);

  const hasCompletedInitialFetch = useRef(false);

  const fetch = useCallback(async (opts?: { pull?: boolean }) => {
    if (!profile?.uid) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (opts?.pull) setRefreshing(true);
    else if (!hasCompletedInitialFetch.current) setLoading(true);
    const acceptedRaw = await AsyncStorage.getItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
    setAcceptedTripId(acceptedRaw && acceptedRaw !== '' ? acceptedRaw : null);
    const notifyRaw = await AsyncStorage.getItem(
      DRIVER_NOTIFY_ONLY_AFTER_MISSION_KEY,
    );
    setNotifyOnlyAfterMission(notifyRaw === '1');
    if (notifyRaw === '1') {
      const snapshotRaw = await AsyncStorage.getItem(
        DRIVER_POST_MISSION_PENDING_SNAPSHOT_KEY,
      );
      if (snapshotRaw && snapshotRaw.trim() !== '') {
        try {
          const parsed = JSON.parse(snapshotRaw) as DriverNotificationRow[];
          setPostMissionSnapshotRows(Array.isArray(parsed) ? parsed : []);
        } catch {
          setPostMissionSnapshotRows([]);
        }
      } else {
        setPostMissionSnapshotRows([]);
      }
    } else {
      setPostMissionSnapshotRows([]);
    }

    try {
      const [driversRes, invitesRes, pendingTripsRes] = await Promise.all([
        driversService.getLinkedDriversForCurrentUser(profile.uid),
        driversService.getDriverInvitesReceived(),
        getPendingOtpTrips(),
      ]);
      setInvites(invitesRes.invites ?? []);
      setPendingOtpTrips(
        pendingTripsRes?.error ? [] : (pendingTripsRes?.trips ?? []),
      );
      const drivers = (driversRes.drivers ?? []).filter((d) => !d.left_at);
      if (drivers.length > 0) {
        const primaryDriver = drivers[0];
        setDriver(primaryDriver);
        const driverIds = drivers.map((d) => d.id);
        const tRes = await tripsService.getDriverUiTripsByDriverIds(driverIds);
        setAllTrips(tRes.trips ?? []);
      } else {
        setDriver(null);
        setAllTrips([]);
        setPendingOtpTrips([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasCompletedInitialFetch.current = true;
    }
  }, [profile?.uid]);

  useFocusEffect(
    useCallback(() => {
      void fetch();
    }, [fetch]),
  );

  const incomingTrips = useMemo(
    () => allTrips.filter((t) => isAssignedNotStarted(t.status)),
    [allTrips],
  );

  const mergedIncomingTrips = useMemo(() => {
    const byId = new Map<string, tripsService.TripRow>();
    for (const trip of [...incomingTrips, ...pendingOtpTrips]) {
      if (!trip?.id) continue;
      if (!byId.has(trip.id)) byId.set(trip.id, trip);
    }
    return Array.from(byId.values()).sort((a, b) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    );
  }, [incomingTrips, pendingOtpTrips]);

  const driverTripNumberById = useMemo(
    () => buildDriverTripNumberMap([...allTrips, ...pendingOtpTrips]),
    [allTrips, pendingOtpTrips],
  );

  useEffect(() => {
    let cancelled = false;
    const loadAssignmentActors = async () => {
      const tripIds = mergedIncomingTrips.map((trip) => trip.id).filter(Boolean);
      if (tripIds.length === 0) {
        if (!cancelled) setAssignmentActorByTripId({});
        return;
      }
      const { byTripId } = await getLatestAssignmentAuditByTripIds(tripIds);
      if (cancelled) return;
      const next: Record<string, string> = {};
      byTripId.forEach((value, key) => {
        const actorId = (value.changed_by ?? '').trim();
        if (actorId) next[key] = actorId;
      });
      setAssignmentActorByTripId(next);
    };
    void loadAssignmentActors();
    return () => {
      cancelled = true;
    };
  }, [mergedIncomingTrips]);

  useEffect(() => {
    let cancelled = false;
    const loadAssignmentSources = async () => {
      const trips = mergedIncomingTrips;
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
        }
        return;
      }

      const tripIdsForRpc = trips
        .map((t) => t.id)
        .filter((id): id is string => Boolean(id && String(id).length > 0));
      const { data: assignerRpcRows, error: assignerRpcError } = await supabase().rpc(
        'get_trip_assigner_displays_for_driver',
        { p_trip_ids: tripIdsForRpc },
      );
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
          const tid = row.trip_id != null ? String(row.trip_id) : '';
          const dn = String(row.display_name ?? '').trim();
          const uid = String(row.assigner_user_id ?? '').trim();
          const orgName = String(row.assigning_organization_name ?? '').trim();
          const orgId = String(row.assigning_organization_id ?? '').trim();
          const logo = String(row.assigning_organization_logo_url ?? '').trim();
          const seed = String(row.assigning_organization_avatar_seed ?? '').trim();
          const avatarUrl = String(row.assigning_organization_avatar_url ?? '').trim();
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
          setOrganizationAvatarUrlById((prev) => ({ ...prev, ...avatarUrlsById }));
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
      const organizationIds = Array.from(
        new Set(
          [
            ...trips.flatMap((trip) => {
              const tripMeta = trip as tripsService.TripRow &
                Record<string, string | number | boolean | null | undefined>;
              return [
                (trip.organization_id ?? '').trim(),
                (trip.supplier_id ?? '').trim(),
                (
                  (tripMeta.from_organization_id as string | null | undefined) ??
                  ''
                ).trim(),
                ((tripMeta.from_org_id as string | null | undefined) ?? '').trim(),
              ];
            }),
            ...Object.values(rpcOrgIdByTrip),
          ]
            .map((id) => String(id ?? '').trim())
            .filter((id) => id.length > 0),
        ),
      );

      if (userIds.length > 0) {
        const { data, error } = await supabase()
          .from('profiles')
          .select('id, full_name, email, company_name')
          .in('id', userIds);
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
              (row.email ?? '').trim().split('@')[0]?.trim() || 'Dispatcher';
            byId[row.id] = (row.full_name ?? '').trim() || fallbackEmailName;
            const company = (row.company_name ?? '').trim();
            if (company) orgById[row.id] = company;
          }
          const { data: ownedOrgs, error: ownedOrgsError } = await supabase()
            .from('organizations')
            .select('owner_id, name')
            .in('owner_id', userIds);
          if (!ownedOrgsError && Array.isArray(ownedOrgs)) {
            for (const row of ownedOrgs as Array<{
              owner_id?: string | null;
              name?: string | null;
            }>) {
              const uid = String(row.owner_id ?? '').trim();
              if (!uid || orgById[uid]) continue;
              const oname = String(row.name ?? '').trim();
              if (oname) orgById[uid] = oname;
            }
          }
          const { data: memberRows, error: memberError } = await supabase()
            .from('organization_members')
            .select('user_id, organization_id')
            .in('user_id', userIds)
            .eq('status', 'active');
          if (!memberError && Array.isArray(memberRows) && memberRows.length > 0) {
            const memberOrgIds = Array.from(
              new Set(
                memberRows
                  .map((m) => String(m.organization_id ?? '').trim())
                  .filter((id) => id.length > 0),
              ),
            );
            if (memberOrgIds.length > 0) {
              const { data: memberOrgs, error: memberOrgsError } = await supabase()
                .from('organizations')
                .select('id, name')
                .in('id', memberOrgIds);
              if (!memberOrgsError && Array.isArray(memberOrgs)) {
                const memberOrgNameById: Record<string, string> = {};
                for (const row of memberOrgs as Array<{ id: string; name?: string | null }>) {
                  const name = String(row.name ?? '').trim();
                  if (name) memberOrgNameById[row.id] = name;
                }
                for (const row of memberRows as Array<{
                  user_id?: string | null;
                  organization_id?: string | null;
                }>) {
                  const uid = String(row.user_id ?? '').trim();
                  if (!uid || orgById[uid]) continue;
                  const oid = String(row.organization_id ?? '').trim();
                  const oname = memberOrgNameById[oid] ?? '';
                  if (oname) orgById[uid] = oname;
                }
              }
            }
          }
          setAssignerNamesByUserId(byId);
          setAssignerOrgNameByUserId(orgById);
        }
      } else if (!cancelled) {
        setAssignerNamesByUserId({});
        setAssignerOrgNameByUserId({});
      }

      if (organizationIds.length > 0) {
        const { data, error } = await supabase()
          .from('organizations')
          .select('id, name')
          .in('id', organizationIds);
        if (!cancelled && !error) {
          const byId: Record<string, string> = {};
          for (const row of
            (data ?? []) as Array<{ id: string; name?: string | null }>) {
            const name = (row.name ?? '').trim();
            if (name) byId[row.id] = name;
          }
          setOrganizationNamesById((prev) => ({ ...prev, ...byId }));
        }
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
      } else if (!cancelled) {
        setOrganizationNamesById({});
      }
    };
    void loadAssignmentSources();
    return () => {
      cancelled = true;
    };
  }, [mergedIncomingTrips, assignmentActorByTripId]);

  const organizationNamesFromInvites = useMemo(() => {
    const byId: Record<string, string> = {};
    for (const inv of invites) {
      const oid = String(inv.from_organization_id ?? '').trim();
      const oname = String(inv.from_org_name ?? '').trim();
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

  const pendingOtpTripsRequiringOtp = useMemo(
    () => pendingOtpTrips.filter((t) => !isRosterTrip(t)),
    [pendingOtpTrips],
  );

  const rowsWithMeta = useMemo((): DriverNotificationRow[] =>
      mergedIncomingTrips.map((trip) => {
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
        const {
          assignedByOrgName,
          assignerPersonDisplay,
          assignerLinePrimary,
          assignerLineSecondary,
        } = assignerDisplay;

        const requiresOtp =
          !isRosterTrip(trip) &&
          (pendingOtpTripsRequiringOtp.some((t) => t.id === trip.id) ||
            (isAggregateTrip(trip) && isAssignedNotStarted(trip.status)));

        const inviteForTrip = findDriverInviteForTripOrgs(invites, [
          assignerDisplay.effectiveAssignerOrgId,
          trip.supplier_id,
          trip.organization_id,
        ]);
        const acceptedInviteForTrip =
          inviteForTrip &&
          String(inviteForTrip.status ?? '').toLowerCase() === 'accepted'
            ? inviteForTrip
            : null;
        const payoutOffer = resolveAgreedPayTerms(
          pickDriverRowForTrip(trip, [driver]),
          acceptedInviteForTrip,
        );
        const commissionForTrip = canShowDriverTripEstEarnings(trip, payoutOffer, {
          trackingOnly: driver?.tracking_only,
        })
          ? computeDriverTripPayInr(trip, payoutOffer)
          : 0;

        const orgId = (assignerDisplay.effectiveAssignerOrgId ?? '').trim();
        const assignerPayload = buildJobCardAssignerPayload(
          trip,
          assignerDisplay,
          driver?.organization_id ?? null,
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

        return {
          trip,
          assignerPersonDisplay,
          assignedByOrgName,
          assignerLinePrimary,
          assignerLineSecondary,
          assignerPayload,
          requiresOtp,
          commissionForTrip,
        };
      }),
    [
      mergedIncomingTrips,
      invites,
      driver?.organization_id,
      driver?.payable_amount,
      driver?.commission_percent,
      driver?.commission_per_km,
      pendingOtpTripsRequiringOtp,
      assignerNamesByUserId,
      assignerOrgNameByUserId,
      assignerDisplayByTripId,
      assignerTripOrgNameByTripId,
      assignerTripOrgIdByTripId,
      mergedOrganizationNamesById,
      organizationLogoById,
      organizationAvatarSeedById,
      organizationAvatarUrlById,
      effectiveAssignmentActorByTripId,
    ],
  );

  const driverHome: Href = '/(driver)';

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(driverHome);
  };

  const openTripOnDashboard = async (tripId: string) => {
    await AsyncStorage.setItem(DRIVER_NOTIFICATION_FOCUS_TRIP_KEY, tripId);
    if (router.canGoBack()) router.back();
    else router.replace(driverHome);
  };

  const acceptTripFromNotification = async (
    trip: tripsService.TripRow,
    requiresOtp: boolean,
  ) => {
    await AsyncStorage.removeItem(DRIVER_NOTIFY_ONLY_AFTER_MISSION_KEY);
    await AsyncStorage.removeItem(DRIVER_POST_MISSION_PENDING_SNAPSHOT_KEY);
    setNotifyOnlyAfterMission(false);
    setPostMissionSnapshotRows([]);
    await AsyncStorage.setItem(DRIVER_NOTIFICATION_FOCUS_TRIP_KEY, trip.id);
    if (!requiresOtp) {
      await AsyncStorage.setItem(DRIVER_ACCEPTED_TRIP_ID_KEY, trip.id);
    }
    router.replace(driverHome);
  };

  const onRefresh = () => {
    void fetch({ pull: true });
  };

  /** True while any trip is live on the road (matches dashboard active mission). */
  const hasInProgressMission = useMemo(
    () =>
      allTrips.some((t) => {
        if (isCompletedStatus(String(t.status ?? ''))) return false;
        return (
          isActiveMission(String(t.status ?? '')) || !!t.started_at
        );
      }),
    [allTrips],
  );

  const hasActiveAcceptedTrip = Boolean(
    acceptedTripId && String(acceptedTripId).trim() !== '',
  );

  /** During an active trip, or post-trip notify-only: list is read-only (no Accept). */
  const passiveAssignmentRows =
    hasActiveAcceptedTrip ||
    notifyOnlyAfterMission ||
    hasInProgressMission;
  const rowsForDisplay =
    rowsWithMeta.length > 0
      ? rowsWithMeta
      : notifyOnlyAfterMission
        ? postMissionSnapshotRows.map((row) => {
            const lines =
              row.assignerLinePrimary && row.assignerLineSecondary
                ? {
                    assignerLinePrimary: row.assignerLinePrimary,
                    assignerLineSecondary: row.assignerLineSecondary,
                  }
                : assignerPrimarySecondaryForDriver(
                    row.assignedByOrgName,
                    row.assignerPersonDisplay,
                  );
            return {
              ...row,
              ...lines,
              assignerPayload: row.assignerPayload ?? null,
            };
          })
        : [];

  const listIntroSubtitle =
    notifyOnlyAfterMission && !hasActiveAcceptedTrip && !hasInProgressMission
      ? 'Reference only while other trips are pending'
      : hasInProgressMission || hasActiveAcceptedTrip
        ? 'Focus on your active trip first'
        : 'Accept or verify with OTP';

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader
        title="Notifications"
        subtitle={listIntroSubtitle}
        onBack={goBack}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <LoadingIndicator size="large" color={colors.emerald} />
        </View>
      ) : (
        <ScrollView
          style={{ backgroundColor: pageBg }}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
              paddingBottom: insets.bottom + 88,
            },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: colors.textMuted }]}>
            {hasInProgressMission || hasActiveAcceptedTrip
              ? 'You already have an active trip. Remaining assignments stay here as notifications only.'
              : notifyOnlyAfterMission
                ? 'Unaccepted assignments are shown for reference only. Your accepted trip uses the main trip flow.'
                : 'Trips waiting for you to accept or verify with OTP. Open one to continue on the dashboard.'}
          </Text>
          {rowsForDisplay.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <FontAwesome name="bell-slash" size={28} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No pending trips
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                New assignments will appear here and on your dashboard.
              </Text>
            </View>
          ) : (
            rowsForDisplay.map((item) => (
              <View
                key={item.trip.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  passiveAssignmentRows && styles.cardStatic,
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.tripId, { color: colors.text }]}>
                    {getDriverTripDisplayNumber(item.trip, driverTripNumberById)}
                  </Text>
                  {item.requiresOtp ? (
                    <View
                      style={[
                        styles.otpBadge,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.otpBadgeText, { color: colors.textMuted }]}
                      >
                        OTP
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[styles.route, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {item.trip.pickup_area?.trim() || 'Pickup'} →{' '}
                  {item.trip.drop_location?.trim() || 'Drop-off'}
                </Text>
                <TripListAssignerRow
                  assigner={item.assignerPayload}
                  mutedColor={colors.textMuted}
                  textColor={colors.text}
                  compact={false}
                />
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {item.commissionForTrip > 0
                    ? `Est. earning ${formatINR(item.commissionForTrip)}`
                    : DRIVER_PAY_NA_LABEL}
                </Text>
                {passiveAssignmentRows ? (
                  <View style={styles.cardFooter}>
                    <Text style={[styles.openHint, { color: colors.textMuted }]}>
                      {notifyOnlyAfterMission &&
                      !hasActiveAcceptedTrip &&
                      !hasInProgressMission
                        ? 'Notification only'
                        : 'Pending notification'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[
                        styles.openDashboardBtn,
                        { borderColor: colors.border, backgroundColor: colors.background },
                      ]}
                      onPress={() => void openTripOnDashboard(item.trip.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.openDashboardBtnText, { color: colors.textMuted }]}>
                        View details
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => void acceptTripFromNotification(item.trip, item.requiresOtp)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.acceptBtnText}>
                        {item.requiresOtp ? 'Accept & OTP' : 'Accept'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingTop: 16, gap: 12 },
  intro: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  emptyCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  cardStatic: {
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tripId: { fontSize: 15, fontWeight: '800' },
  otpBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  otpBadgeText: { fontSize: 11, fontWeight: '700' },
  route: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  assignedLine: { marginBottom: 6 },
  assignedPrefix: { fontSize: 12 },
  assignedName: { fontSize: 12, fontWeight: '700' },
  assignedOrg: { fontSize: 12 },
  meta: { fontSize: 12, marginTop: 2 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 10,
  },
  openHint: { fontSize: 12, fontWeight: '600' },
  cardActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  openDashboardBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  openDashboardBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  acceptBtn: {
    flex: 1,
    borderRadius: 10,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: Theme.textPrimaryDark,
  },
  acceptBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: Theme.buttonDarkText,
  },
});
