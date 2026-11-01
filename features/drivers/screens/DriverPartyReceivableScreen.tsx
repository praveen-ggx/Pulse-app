/**
 * Full-page party receivable (Marketplace / shipper) — Finance client layout,
 * light app chrome, compact type. Not a modal and not driver dark mode.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { DetailPageLayout } from "@/components/DetailPageLayout";
import { EntityAvatar } from "@/components/EntityAvatar";
import { DriverCapturePaymentButton } from "@/features/drivers/components/DriverCapturePaymentButton";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import {
  listDcoSelfCollections,
  listDcoSelfParties,
  listDcoSelfReceivableBook,
  listDcoSelfReceivableVersions,
  type DcoSelfCollection,
  type DcoSelfReceivableListRow,
  type DcoSelfReceivableVersion,
} from "@/features/dco-self/services/dcoSelfReceivable.service";
import {
  listDriverIndieCollections,
  listDriverIndieParties,
  listDriverIndieReceivableBook,
  listDriverIndieReceivableVersions,
} from "@/features/driver-indie/services/driverIndieReceivable.service";
import { DriverPartyBookActions } from "@/features/drivers/components/DriverPartyBookActions";
import { buildDriverPartyReceivablesFromBook } from "@/features/drivers/utils/driverPartyReceivables.util";
import { useDriverOperatingModeQuery } from "@/lib/queries/useDriverOperatingModeQuery";
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
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Tag } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const {
    canManageDcoSelfBook,
    canManageIndieBook,
    modeLoading,
  } = useDriverOperatingModeQuery();
  const bookKind =
    canManageDcoSelfBook ? "dco_self" : canManageIndieBook ? "driver_indie" : null;

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [receivedByTripId, setReceivedByTripId] = useState<Record<string, number>>({});
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [bookRows, setBookRows] = useState<DcoSelfReceivableListRow[]>([]);
  const [bookName, setBookName] = useState<string | null>(null);
  const [bookPhone, setBookPhone] = useState<string | null>(null);
  const [bookVersions, setBookVersions] = useState<DcoSelfReceivableVersion[]>([]);
  const [bookCollections, setBookCollections] = useState<DcoSelfCollection[]>([]);

  const load = useCallback(async () => {
    // Do not load (or clear) book rows until operating mode has settled —
    // otherwise indie/DCO briefly look empty and navigation races home.
    if (modeLoading) return;
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    if (!partyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const driversRes = await driversService.getLinkedDriversForCurrentUser(profile.uid);
      const drivers = driversRes.drivers ?? [];
      setLinkedDrivers(drivers);
      if (drivers.length === 0) {
        setTrips([]);
        setReceivedByTripId({});
      } else {
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
      }
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(partyId);
      if (uuid && bookKind === "dco_self") {
        const [book, parties] = await Promise.all([listDcoSelfReceivableBook(), listDcoSelfParties()]);
        const lines = (book.rows ?? []).filter((row) => row.receivable.party_b_id === partyId);
        setBookRows(lines);
        const party = parties.parties.find((row) => row.id === partyId) ?? null;
        setBookName(party?.name ?? null);
        setBookPhone(party?.phone ?? null);
        const versions: DcoSelfReceivableVersion[] = [];
        const collections: DcoSelfCollection[] = [];
        for (const line of lines) {
          const [v, c] = await Promise.all([
            listDcoSelfReceivableVersions(line.receivable.id),
            listDcoSelfCollections(line.receivable.id),
          ]);
          versions.push(...v.versions);
          collections.push(...c.rows);
        }
        setBookVersions(versions);
        setBookCollections(collections);
      } else if (uuid && bookKind === "driver_indie") {
        const [book, parties] = await Promise.all([
          listDriverIndieReceivableBook(),
          listDriverIndieParties(),
        ]);
        const lines = (book.rows ?? [])
          .filter((row) => row.receivable.party_id === partyId)
          .map((row) => ({
            receivable: {
              id: row.receivable.id,
              workspace_id: row.receivable.owner_user_id,
              party_b_id: row.receivable.party_id,
              billed_amount: row.receivable.billed_amount,
              billed_version: row.receivable.billed_version,
              status: row.receivable.status,
              operational_trip_id: row.receivable.operational_trip_id,
              party_a_label: row.receivable.party_label,
              issued_at: row.receivable.issued_at,
            },
            collected: row.collected,
            outstanding: row.outstanding,
          }));
        setBookRows(lines);
        const party = parties.parties.find((row) => row.id === partyId) ?? null;
        setBookName(party?.name ?? null);
        setBookPhone(party?.phone ?? null);
        const versions: DcoSelfReceivableVersion[] = [];
        const collections: DcoSelfCollection[] = [];
        for (const line of lines) {
          const [v, c] = await Promise.all([
            listDriverIndieReceivableVersions(line.receivable.id),
            listDriverIndieCollections(line.receivable.id),
          ]);
          versions.push(
            ...v.versions.map((row) => ({
              id: row.id,
              receivable_id: row.receivable_id,
              version: row.version,
              billed_amount: row.billed_amount,
              reason: row.reason,
              created_at: row.created_at,
            })),
          );
          collections.push(...c.rows);
        }
        setBookVersions(versions);
        setBookCollections(collections);
      } else {
        setBookRows([]);
        setBookName(null);
        setBookPhone(null);
        setBookVersions([]);
        setBookCollections([]);
      }
    } finally {
      setLoading(false);
    }
  }, [bookKind, modeLoading, partyId, profile?.uid]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const bookParty = useMemo(
    () => buildDriverPartyReceivablesFromBook(bookRows, [{ id: partyId, name: bookName || "Party" }])[0] ?? null,
    [bookName, bookRows, partyId],
  );
  const party = useMemo(
    () =>
      bookParty ??
      buildDriverPartyReceivables(trips, receivedByTripId, isFleetDispatched).find(
        (row) => row.id === partyId,
      ) ??
      null,
    [bookParty, trips, receivedByTripId, isFleetDispatched, partyId],
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

  if (modeLoading || loading) {
    return <CenteredLoadingView message="Loading…" color={Theme.primary} />;
  }

  if (!partyId) {
    return (
      <DetailPageLayout title="Receivable" onBack={onBack} titleAlign="left">
        <Text style={styles.empty}>Choose a customer from Wallet to open their receivable.</Text>
      </DetailPageLayout>
    );
  }

  // Stay on this route for unknown / unauthorized party ids — never bounce to home.
  if (!party) {
    const bookHint =
      bookKind === "driver_indie"
        ? "independent-driver book"
        : bookKind === "dco_self"
          ? "DCO Self book"
          : "wallet";
    return (
      <DetailPageLayout title="Receivable" onBack={onBack} titleAlign="left" onRefresh={load} refreshing={loading}>
        <Text style={styles.empty}>
          This receivable is not available in your {bookHint}.
        </Text>
      </DetailPageLayout>
    );
  }

  const isMarketplace = party.kind === "marketplace";
  const kicker = isMarketplace
    ? "Pulse Exchange"
    : bookKind === "driver_indie"
      ? "Independent · Customer"
      : bookKind === "dco_self"
        ? "Self · Party B"
        : "Shipper · Client";
  const entityType = isMarketplace ? "supplier" : "client";
  const captureLane = isMarketplace ? "marketplace" : "shipper";

  return (
    <DetailPageLayout
      title={party.name}
      titleAlign="left"
      titleSubline={
        <Text style={styles.kicker}>{kicker}</Text>
      }
      onBack={onBack}
      onRefresh={load}
      refreshing={loading}
      rightAction={
        <View style={styles.headerAvatar} accessibilityLabel={`${party.name} avatar`}>
          <EntityAvatar
            name={party.name}
            initialsColorSeed={party.id}
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

      {bookKind && partyId ? (
        <DriverPartyBookActions
          book={bookKind}
          partyId={partyId}
          partyName={bookName || party?.name || "Party"}
          partyPhone={bookPhone}
          receivableId={bookRows[0]?.receivable.id ?? null}
          currentBilled={
            bookRows[0]?.receivable.billed_amount != null
              ? Number(bookRows[0].receivable.billed_amount)
              : 0
          }
          onChanged={() => void load()}
        />
      ) : null}

      {bookRows.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Receivable lines</Text>
          <View style={styles.table}>
            {bookRows.map((row, idx) => (
              <View
                key={row.receivable.id}
                style={[styles.row, idx < bookRows.length - 1 && styles.rowBorder]}
              >
                <Text style={styles.missionId}>
                  {inr(row.receivable.billed_amount)} billed · {inr(row.collected)} received ·{" "}
                  {inr(row.outstanding)} due
                  {row.receivable.operational_trip_id
                    ? ` · trip ${row.receivable.operational_trip_id.slice(0, 8)}`
                    : ""}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.sectionTitle}>Billed versions</Text>
          <View style={styles.table}>
            {bookVersions.length === 0 ? (
              <Text style={styles.empty}>No billed versions.</Text>
            ) : (
              bookVersions.map((row, idx) => (
                <View key={row.id} style={[styles.row, idx < bookVersions.length - 1 && styles.rowBorder]}>
                  <Text style={styles.missionId}>
                    v{row.version} · {inr(row.billed_amount)}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </Text>
                </View>
              ))
            )}
          </View>
          <Text style={styles.sectionTitle}>Collections</Text>
          <View style={styles.table}>
            {bookCollections.length === 0 ? (
              <Text style={styles.empty}>No collections yet.</Text>
            ) : (
              bookCollections.map((row, idx) => (
                <View key={row.id} style={[styles.row, idx < bookCollections.length - 1 && styles.rowBorder]}>
                  <Text style={styles.missionId}>
                    {inr(row.amount)} · {row.payment_mode}
                    {row.paid_on ? ` · ${row.paid_on}` : ""}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}

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
            const needsTag = tripNeedsPartyTag(line.trip, isFleetDispatched(line.trip));
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
                      onPress={() =>
                        router.push({
                          pathname: "/(driver)/add-client",
                          params: { tripId: line.trip.id },
                        } as Href)
                      }
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
