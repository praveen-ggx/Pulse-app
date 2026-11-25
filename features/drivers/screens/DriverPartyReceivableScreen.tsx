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
import { receivedByTripFromDriverBooks } from "@/features/drivers/services/driverCapturePayment.service";
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
import { showAppAlert } from "@/lib/appAlert";
import { ROUTES } from "@/lib/routes";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowDownLeft, ArrowUpRight, Tag } from "lucide-react-native";
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
      // A failed load used to show every trip as fully unpaid (no ledger →
      // nothing received), inviting the driver to collect again. Keep the
      // last good numbers and say so instead.
      if (tRes.error || ledgerRes.error) {
        showAppAlert(
          "Couldn't refresh",
          hasLoadedRef.current
            ? "Showing the last loaded amounts. Pull back in when you have signal."
            : "Could not load payments for this party. Check your connection and try again.",
        );
        return;
      }
      setTrips(tRes.trips ?? []);
      const byTrip: Record<string, number> = {};
      for (const entry of ledgerRes.entries ?? []) {
        const tid = entry.trip_id?.trim() || null;
        if (!tid || entry.type !== "settlement") continue;
        byTrip[tid] = (byTrip[tid] ?? 0) + (Number(entry.amount) || 0);
      }
      const bookReceived = await receivedByTripFromDriverBooks();
      for (const [tripId, amount] of Object.entries(bookReceived)) {
        byTrip[tripId] = (byTrip[tripId] ?? 0) + amount;
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
  const billed = party?.billed ?? 0;
  const received = party?.received ?? 0;
  const due = party?.due ?? 0;
  const collectPct = billed > 0 ? Math.min(100, Math.round((received / billed) * 100)) : 0;

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
        <LinearGradient
          colors={[Theme.actionBtnInk, Theme.driverEmeraldDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.scoreHero}
        >
          <View style={styles.scoreHeroTop}>
            <Text style={styles.scoreLabel}>Financial overview</Text>
            <Text style={styles.scorePct}>{collectPct}% collected</Text>
          </View>
          <Text style={styles.scoreBilledLabel}>Billed</Text>
          <Text style={styles.scoreBilled}>{inr(billed)}</Text>
          <View style={styles.scoreTrack}>
            <View style={[styles.scoreFill, { width: `${collectPct}%` }]} />
          </View>
        </LinearGradient>
        <View style={styles.scoreGrid}>
          <View style={[styles.scoreCell, styles.scoreCellReceived]}>
            <View style={styles.scoreCellIcon}>
              <ArrowDownLeft size={14} color={Theme.positive} strokeWidth={2.5} />
            </View>
            <View style={styles.scoreCellCopy}>
              <Text style={styles.scoreGridLabel}>Received</Text>
              <Text style={[styles.scoreAmt, { color: Theme.positive }]}>
                {inr(received)}
              </Text>
            </View>
          </View>
          <View style={[styles.scoreCell, styles.scoreCellDue]}>
            <View style={[styles.scoreCellIcon, styles.scoreCellIconDue]}>
              <ArrowUpRight
                size={14}
                color={due > 0 ? Theme.negative : Theme.positive}
                strokeWidth={2.5}
              />
            </View>
            <View style={styles.scoreCellCopy}>
              <Text style={styles.scoreGridLabel}>Due</Text>
              <Text
                style={[
                  styles.scoreAmt,
                  { color: due > 0 ? Theme.negative : Theme.positive },
                ]}
              >
                {inr(due)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Receivables</Text>
      <View style={styles.table}>
        <View style={styles.head}>
          <View style={styles.missionHead}>
            <Text style={styles.headCell}>Mission</Text>
          </View>
          <Text style={[styles.headCell, styles.amtCol]}>Received</Text>
          <Text style={[styles.headCell, styles.amtCol]}>Due</Text>
          <View style={styles.actionCol}>
            <Text style={[styles.headCell, styles.actionHead]}>Action</Text>
          </View>
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
            const canCapture =
              !needsTag &&
              line.due > 0 &&
              (isMarketplace || isTripTaggedToParty(line.trip));
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
                  style={styles.missionCell}
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
                      size={34}
                    />
                  </View>
                  <View style={styles.missionCopy}>
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
                </Pressable>
                <Text style={[styles.amt, { color: Theme.positive }]} numberOfLines={1}>
                  {inr(line.received)}
                </Text>
                <Text
                  style={[
                    styles.amt,
                    { color: line.due > 0 ? Theme.negative : Theme.positive },
                  ]}
                  numberOfLines={1}
                >
                  {inr(line.due)}
                </Text>
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
                      <Text style={styles.tagBtnText}>Tag</Text>
                    </Pressable>
                  ) : canCapture ? (
                    <DriverCapturePaymentButton
                      tripId={line.trip.id}
                      due={line.due}
                      lane={captureLane}
                      partyName={showParty ? partyName : party?.name}
                      compact
                    />
                  ) : (
                    <Text style={styles.actionIdle}>—</Text>
                  )}
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
    borderRadius: 16,
    borderWidth: 0,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: Theme.surfaceLight,
  },
  scoreHero: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  scoreHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textOnDarkMuted,
  },
  scorePct: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
  scoreBilledLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
    marginBottom: 2,
  },
  scoreBilled: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: Theme.textOnDark,
    fontVariant: ["tabular-nums"],
  },
  scoreTrack: {
    marginTop: 14,
    height: 5,
    borderRadius: 999,
    backgroundColor: Theme.tripSelectionInsetBorder,
    overflow: "hidden",
  },
  scoreFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: Theme.driverPrimary,
  },
  scoreGrid: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
  },
  scoreCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  scoreCellReceived: {
    backgroundColor: Theme.positiveMuted,
  },
  scoreCellDue: {
    backgroundColor: Theme.negativeMuted,
  },
  scoreCellIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  scoreCellIconDue: {
    backgroundColor: Theme.screenBackground,
  },
  scoreCellCopy: {
    flex: 1,
    minWidth: 0,
  },
  scoreGridLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 2,
  },
  scoreAmt: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
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
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    borderWidth: 0,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: Theme.surfaceLight,
  },
  headCell: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  missionHead: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 42,
  },
  amtCol: {
    width: 70,
    textAlign: "right",
  },
  actionCol: {
    width: 76,
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 0,
  },
  actionHead: {
    textAlign: "right",
    width: "100%",
  },
  tagBtn: {
    minHeight: 32,
    minWidth: 68,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Theme.driverEmeraldMuted,
  },
  tagBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.driverEmeraldDark,
  },
  actionIdle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    paddingRight: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 64,
    gap: 8,
    backgroundColor: Theme.screenBackground,
  },
  missionCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  rowAvatar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  missionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  partyName: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  missionId: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: Theme.textPrimaryDark,
  },
  missionRoute: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 13,
  },
  amt: {
    width: 70,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.15,
  },
  empty: {
    padding: 16,
    fontSize: 12,
    color: Theme.textMuted,
  },
});
