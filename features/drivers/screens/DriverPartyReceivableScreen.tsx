/**
 * Full-page party receivable (Marketplace / shipper) — Finance client layout,
 * light app chrome, compact type. Not a modal and not driver dark mode.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { DetailPageLayout } from "@/components/DetailPageLayout";
import { EntityAvatar } from "@/components/EntityAvatar";
import { DriverCapturePaymentButton } from "@/features/drivers/components/DriverCapturePaymentButton";
import { DriverCollectFromSheet } from "@/features/drivers/components/DriverCollectFromSheet";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildDriverTripNumberMap,
  getDriverTripDisplayNumber,
} from "@/features/driver/utils/driverTripSequence.util";
import * as driversService from "@/features/drivers/services/drivers.service";
import {
  EMPTY_DRIVER_PARTY_AVATAR,
  resolveDriverPartyAvatar,
  resolveDriverTripCounterpartyAvatarMap,
  type DriverPartyAvatarFields,
} from "@/features/drivers/utils/driverPartyAvatar.util";
import {
  buildDriverPartyReceivables,
  isTripTaggedToParty,
  tripNeedsPartyTag,
  tripReceivablePartyName,
  tripsForDriverParty,
} from "@/features/drivers/utils/driverPartyReceivables.util";
import * as tripsService from "@/features/trips/services/trips.service";
import { ROUTES } from "@/lib/routes";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Tag } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function decodePartyId(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function DriverPartyReceivableScreen() {
  const router = useRouter();
  const onBack = useSafeBack(ROUTES.driverWalletSelf());
  const { partyId: partyIdParam } = useLocalSearchParams<{ partyId?: string }>();
  const partyId = decodePartyId(partyIdParam);
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [receivedByTripId, setReceivedByTripId] = useState<Record<string, number>>({});
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [tagTrip, setTagTrip] = useState<tripsService.TripRow | null>(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const driversRes = await driversService.getLinkedDriversForCurrentUser(profile.uid);
      const drivers = driversRes.drivers ?? [];
      setLinkedDrivers(drivers);
      if (drivers.length === 0) {
        setTrips([]);
        setReceivedByTripId({});
        return;
      }
      const driverIds = drivers.map((d) => d.id);
      const [tRes, ledgerRes] = await Promise.all([
        tripsService.getDriverUiTripsByDriverIds(driverIds),
        driversService.getDriverLedgerByDriverIds(driverIds),
      ]);
      setTrips(tRes.trips ?? []);
      const byTrip: Record<string, number> = {};
      for (const entry of ledgerRes.entries ?? []) {
        const tid = entry.trip_id?.trim() || null;
        if (!tid || entry.type !== "settlement") continue;
        byTrip[tid] = (byTrip[tid] ?? 0) + (Number(entry.amount) || 0);
      }
      setReceivedByTripId(byTrip);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [profile?.uid]);

  useFocusEffect(
    useCallback(() => {
      if (tagTrip) return;
      void load();
    }, [load, tagTrip]),
  );

  const isFleetDispatched = useCallback(
    (trip: tripsService.TripRow) => {
      const tripOrgId = String(trip.organization_id ?? "").trim();
      if (!tripOrgId) return false;
      return linkedDrivers.some((row) => {
        if (String(row.organization_id ?? "").trim() !== tripOrgId) return false;
        if (row.tracking_only === true) return false;
        return driversService.isActiveFleetRelationshipDriver(row);
      });
    },
    [linkedDrivers],
  );

  const party = useMemo(
    () =>
      buildDriverPartyReceivables(trips, receivedByTripId, isFleetDispatched).find(
        (row) => row.id === partyId,
      ) ?? null,
    [trips, receivedByTripId, isFleetDispatched, partyId],
  );

  const partyTrips = useMemo(
    () =>
      partyId
        ? tripsForDriverParty(trips, receivedByTripId, isFleetDispatched, partyId)
        : [],
    [trips, receivedByTripId, isFleetDispatched, partyId],
  );

  const tripNumbers = useMemo(() => buildDriverTripNumberMap(trips), [trips]);
  const [avatar, setAvatar] = useState<DriverPartyAvatarFields>(EMPTY_DRIVER_PARTY_AVATAR);
  const [tripAvatarById, setTripAvatarById] = useState<
    Record<string, DriverPartyAvatarFields>
  >({});

  useEffect(() => {
    let cancelled = false;
    setAvatar(EMPTY_DRIVER_PARTY_AVATAR);
    void resolveDriverPartyAvatar(
      partyId,
      partyTrips.map((line) => line.trip),
    ).then((fields) => {
      if (!cancelled) setAvatar(fields);
    });
    return () => {
      cancelled = true;
    };
  }, [partyId, partyTrips]);

  useEffect(() => {
    let cancelled = false;
    const tripRows = partyTrips.map((line) => line.trip);
    if (tripRows.length === 0) {
      setTripAvatarById({});
      return;
    }
    void resolveDriverTripCounterpartyAvatarMap(tripRows).then((map) => {
      if (!cancelled) setTripAvatarById(map);
    });
    return () => {
      cancelled = true;
    };
  }, [partyTrips]);

  if (loading) {
    return <CenteredLoadingView message="Loading…" color={Theme.primary} />;
  }

  const isMarketplace = party?.kind === "marketplace";
  const kicker = isMarketplace ? "Pulse Exchange" : "Shipper · Client";
  const entityType = isMarketplace ? "supplier" : "client";
  const captureLane = isMarketplace ? "marketplace" : "shipper";

  return (
    <DetailPageLayout
      title={party?.name ?? "Receivable"}
      titleAlign="left"
      titleSubline={
        <Text style={styles.kicker}>{kicker}</Text>
      }
      onBack={onBack}
      onRefresh={load}
      refreshing={loading}
      rightAction={
        <View style={styles.headerAvatar} accessibilityLabel={`${party?.name ?? "Party"} avatar`}>
          <EntityAvatar
            name={party?.name ?? "Party"}
            initialsColorSeed={party?.id ?? partyId}
            avatarUrl={avatar.avatarUrl}
            avatarSeed={avatar.avatarSeed}
            organizationImageUrl={avatar.organizationImageUrl}
            organizationAvatarSeed={avatar.organizationAvatarSeed}
            entityType={entityType}
            isIntegrated={avatar.isIntegrated}
            showIntegrationBadge={false}
            size={40}
          />
        </View>
      }
    >
      <View style={styles.scorecard}>
        <Text style={styles.scoreLabel}>Financial overview</Text>
        <Text style={styles.scoreBilled}>{inr(party?.billed ?? 0)}</Text>
        <View style={styles.scoreGrid}>
          <View style={styles.scoreCell}>
            <Text style={styles.scoreGridLabel}>Received</Text>
            <Text style={[styles.scoreAmt, { color: Theme.positive }]}>
              {inr(party?.received ?? 0)}
            </Text>
          </View>
          <View style={styles.scoreCell}>
            <Text style={styles.scoreGridLabel}>Due</Text>
            <Text
              style={[
                styles.scoreAmt,
                { color: (party?.due ?? 0) > 0 ? Theme.negative : Theme.positive },
              ]}
            >
              {inr(party?.due ?? 0)}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Receivables</Text>
      <View style={styles.table}>
        <View style={styles.head}>
          <Text style={[styles.headCell, styles.missionCol]}>Mission</Text>
          <Text style={[styles.headCell, styles.amtCol]}>Received</Text>
          <Text style={[styles.headCell, styles.amtCol]}>Due</Text>
          <View style={styles.actionCol} />
        </View>
        {partyTrips.length === 0 ? (
          <Text style={styles.empty}>No trips for this party.</Text>
        ) : (
          partyTrips.map((line, idx) => {
            const last = idx === partyTrips.length - 1;
            const tripNo = getDriverTripDisplayNumber(line.trip, tripNumbers);
            const partyName = tripReceivablePartyName(line.trip);
            const showParty =
              isMarketplace &&
              partyName &&
              partyName !== "Shipper" &&
              partyName !== "Untagged";
            const needsTag = tripNeedsPartyTag(line.trip, false);
            const rowAvatar =
              tripAvatarById[line.trip.id] ?? (isMarketplace ? EMPTY_DRIVER_PARTY_AVATAR : avatar);
            const route =
              `${line.trip.pickup_area ?? ""} → ${line.trip.drop_location ?? ""}`.trim() ||
              "—";
            return (
              <View
                key={line.trip.id}
                style={[styles.row, !last && styles.rowBorder]}
              >
                <Pressable
                  style={styles.rowMain}
                  onPress={() => router.push(`/driver-trip/${line.trip.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open trip ${tripNo}${showParty ? `, ${partyName}` : ""}`}
                >
                  <View style={styles.rowAvatar}>
                    <EntityAvatar
                      name={showParty ? partyName : party?.name ?? "Party"}
                      initialsColorSeed={line.trip.client_id ?? line.trip.organization_id ?? line.trip.id}
                      avatarUrl={rowAvatar.avatarUrl}
                      avatarSeed={rowAvatar.avatarSeed}
                      organizationImageUrl={rowAvatar.organizationImageUrl}
                      organizationAvatarSeed={rowAvatar.organizationAvatarSeed}
                      entityType="client"
                      isIntegrated={rowAvatar.isIntegrated}
                      showIntegrationBadge={false}
                      size={32}
                    />
                  </View>
                  <View style={styles.missionCol}>
                    {showParty ? (
                      <Text style={styles.partyName} numberOfLines={1}>
                        {partyName}
                      </Text>
                    ) : null}
                    <Text style={styles.missionId} numberOfLines={1}>
                      {tripNo}
                    </Text>
                    <Text style={styles.missionRoute} numberOfLines={1}>
                      {route}
                    </Text>
                  </View>
                  <Text style={[styles.amt, { color: Theme.positive }]}>{inr(line.received)}</Text>
                  <Text
                    style={[
                      styles.amt,
                      { color: line.due > 0 ? Theme.negative : Theme.positive },
                    ]}
                  >
                    {inr(line.due)}
                  </Text>
                </Pressable>
                <View style={styles.actionCol}>
                  {needsTag ? (
                    <Pressable
                      onPress={() => setTagTrip(line.trip)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Tag party for ${tripNo}`}
                      style={({ pressed }) => [
                        styles.tagBtn,
                        { opacity: pressed ? 0.82 : 1 },
                      ]}
                    >
                      <Tag size={13} color={Theme.driverEmerald} strokeWidth={2.4} />
                    </Pressable>
                  ) : line.due > 0 &&
                    (isMarketplace || isTripTaggedToParty(line.trip)) ? (
                    <DriverCapturePaymentButton
                      tripId={line.trip.id}
                      due={line.due}
                      lane={captureLane}
                      partyName={showParty ? partyName : party?.name}
                      compact
                    />
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>
      {tagTrip ? (
        <DriverCollectFromSheet
          visible
          trip={tagTrip}
          due={Math.max(0, partyTrips.find((line) => line.trip.id === tagTrip.id)?.due ?? 0)}
          lane={captureLane === "marketplace" ? "marketplace" : "shipper"}
          onClose={() => setTagTrip(null)}
          onTagged={() => {
            setTagTrip(null);
            void load();
          }}
        />
      ) : null}
    </DetailPageLayout>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  scorecard: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  scoreBilled: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: Theme.textPrimaryDark,
  },
  scoreGrid: {
    flexDirection: "row",
    marginTop: 10,
    gap: 16,
  },
  scoreCell: {
    flex: 1,
    minWidth: 0,
  },
  scoreGridLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 3,
  },
  scoreAmt: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 8,
  },
  table: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  headCell: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  missionCol: {
    flex: 1,
    minWidth: 0,
  },
  amtCol: {
    width: 72,
    textAlign: "right",
  },
  actionCol: {
    width: 44,
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 0,
  },
  tagBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverEmeraldMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.driverEmeraldBorder,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 52,
    gap: 4,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },
  rowAvatar: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  partyName: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 1,
  },
  missionId: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  missionRoute: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  amt: {
    width: 72,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
    paddingTop: 1,
  },
  empty: {
    padding: 14,
    fontSize: 12,
    color: Theme.textMuted,
  },
});
