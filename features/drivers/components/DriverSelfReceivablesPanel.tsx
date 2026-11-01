/**
 * DCO Self — party-level receivables, same shape as Finance → Clients:
 * Marketplace (Exchange) + each shipper as a client receivable.
 */
import { EntityAvatar } from "@/components/EntityAvatar";
import {
  driverBodySecondary,
  driverUIBold,
  driverUISemiBold,
} from "@/constants/DriverTypography";
import Theme from "@/constants/Theme";
import {
  EMPTY_DRIVER_PARTY_AVATAR,
  resolveDriverPartyAvatarMap,
  type DriverPartyAvatarFields,
} from "@/features/drivers/utils/driverPartyAvatar.util";
import {
  listDcoSelfParties,
  listDcoSelfReceivableBook,
} from "@/features/dco-self/services/dcoSelfReceivable.service";
import {
  type DriverPartyReceivable,
  buildDriverPartyReceivablesFromBook,
  summarizeDriverPartyReceivables,
} from "@/features/drivers/utils/driverPartyReceivables.util";
import { useAuth } from "@/contexts/AuthContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { useQuery } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

type Colors = {
  text: string;
  textMuted: string;
  surface: string;
  border: string;
  emerald: string;
  borderSubtle?: string;
};

type Props = {
  rows: DriverPartyReceivable[];
  trips: TripRow[];
  receivedByTripId: Record<string, number>;
  isFleetDispatched: (trip: TripRow) => boolean;
  colors: Colors;
  isDark: boolean;
  audience?: "dco" | "offline";
};

export function DriverSelfReceivablesPanel({
  rows,
  trips,
  receivedByTripId,
  isFleetDispatched,
  colors,
  isDark,
  audience = "dco",
}: Props) {
  const router = useRouter();
  const { profile } = useAuth();
  const useBook = audience === "dco";
  const bookQuery = useQuery({
    queryKey: queryKeys.driverApp.dcoSelfReceivables(profile?.uid ?? ""),
    enabled: useBook && !!profile?.uid,
    queryFn: async () => {
      const [book, parties] = await Promise.all([listDcoSelfReceivableBook(), listDcoSelfParties()]);
      if (book.error) throw book.error;
      if (parties.error) throw parties.error;
      return { rows: book.rows, parties: parties.parties };
    },
  });
  const partyRows = useMemo(
    () =>
      useBook
        ? buildDriverPartyReceivablesFromBook(bookQuery.data?.rows ?? [], bookQuery.data?.parties ?? [])
        : rows,
    [bookQuery.data, rows, useBook],
  );
  const summary = useMemo(() => summarizeDriverPartyReceivables(partyRows), [partyRows]);
  const hairline = isDark ? colors.borderSubtle ?? colors.border : Theme.borderLight;
  const [avatarByPartyId, setAvatarByPartyId] = useState<
    Record<string, DriverPartyAvatarFields>
  >({});

  useEffect(() => {
    let cancelled = false;
    if (rows.length === 0) {
      setAvatarByPartyId({});
      return;
    }
    void resolveDriverPartyAvatarMap(rows, trips, receivedByTripId, isFleetDispatched).then(
      (map) => {
        if (!cancelled) setAvatarByPartyId(map);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [rows, trips, receivedByTripId, isFleetDispatched]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.text }]}>Receivables</Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>
        {audience === "offline"
          ? "Tag a party on an offline trip, then collect — same receivables view as DCO Self."
          : "Outstanding = current billed \u2212 collections. Organisation payable is not shown here."}
      </Text>

      <View style={styles.summaryRow}>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.surface, borderColor: hairline },
          ]}
        >
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
            Total outstanding
          </Text>
          <Text
            style={[
              styles.summaryOutstanding,
              { color: summary.due > 0 ? Theme.negative : colors.emerald },
            ]}
          >
            {inr(summary.due)}
          </Text>
        </View>
        <View
          style={[
            styles.collectionCard,
            { backgroundColor: colors.surface, borderColor: hairline },
          ]}
        >
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
            Collection
          </Text>
          <Text style={[styles.collectionValue, { color: colors.emerald }]}>
            {summary.collectionPercent}%
          </Text>
          <Text style={[styles.collectionHint, { color: colors.textMuted }]}>
            {inr(summary.received)} of {inr(summary.billed)}
          </Text>
        </View>
      </View>

      <View style={[styles.headerRow, { borderBottomColor: hairline }]}>
        <Text style={[styles.headerCell, styles.headerParty, { color: colors.textMuted }]}>
          Party
        </Text>
        <Text style={[styles.headerCell, styles.headerTrips, { color: colors.textMuted }]}>
          Trips
        </Text>
        <Text style={[styles.headerCell, styles.headerAmt, { color: colors.textMuted }]}>
          Outstanding
        </Text>
      </View>

      {partyRows.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: colors.surface, borderColor: hairline },
          ]}
        >
          <FontAwesome name="inbox" size={20} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No receivables yet
          </Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            {audience === "offline"
              ? "Offline trips tagged to a party appear here with billed, received, and due."
              : "Issued DCO Self receivables appear here with billed, collected, and outstanding."}
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.table,
            { backgroundColor: colors.surface, borderColor: hairline },
          ]}
        >
          {partyRows.map((row, idx) => {
            const unpaid = row.due > 0;
            const isLast = idx === rows.length - 1;
            const avatar = avatarByPartyId[row.id] ?? EMPTY_DRIVER_PARTY_AVATAR;
            return (
              <TouchableOpacity
                key={row.id}
                style={[
                  styles.row,
                  !isLast && { borderBottomColor: hairline, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
                onPress={() => router.push(ROUTES.driverPartyReceivable(row.id))}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={`${row.name}, ${row.trips} trips, ${inr(row.due)} outstanding`}
              >
                <EntityAvatar
                  name={row.name}
                  initialsColorSeed={row.id}
                  avatarUrl={avatar.avatarUrl}
                  avatarSeed={avatar.avatarSeed}
                  organizationImageUrl={avatar.organizationImageUrl}
                  organizationAvatarSeed={avatar.organizationAvatarSeed}
                  entityType={row.kind === "marketplace" ? "supplier" : "client"}
                  isIntegrated={row.kind === "marketplace" ? true : avatar.isIntegrated}
                  size={36}
                  showIntegrationBadge={false}
                />
                <View style={styles.partyMid}>
                  <Text style={[styles.partyName, { color: colors.text }]} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={[styles.partySub, { color: colors.textMuted }]} numberOfLines={1}>
                    {row.subtitle}
                    {" · "}
                    Sales {inr(row.billed)}
                  </Text>
                </View>
                <View style={styles.tripsPill}>
                  <Text style={[styles.tripsPillText, { color: colors.text }]}>{row.trips}</Text>
                </View>
                <View style={styles.amtCol}>
                  <Text
                    style={[
                      styles.dueValue,
                      { color: unpaid ? Theme.negative : colors.emerald },
                    ]}
                    numberOfLines={1}
                  >
                    {inr(row.due)}
                  </Text>
                  <Text style={[styles.receivedLine, { color: colors.textMuted }]} numberOfLines={1}>
                    Received {inr(row.received)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

    </View>
  );
}

export { MARKETPLACE_PARTY_ID } from "@/features/drivers/utils/driverPartyReceivables.util";

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 22 },
  title: {
    ...driverUIBold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sub: {
    ...driverBodySecondary,
    fontSize: 11,
    lineHeight: 15,
    marginTop: -4,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryCard: {
    flex: 1.2,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 72,
    justifyContent: "center",
  },
  collectionCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 72,
    justifyContent: "center",
  },
  summaryLabel: {
    ...driverUISemiBold,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryOutstanding: {
    ...driverUIBold,
    fontSize: 20,
    letterSpacing: -0.4,
  },
  collectionValue: {
    ...driverUIBold,
    fontSize: 20,
    letterSpacing: -0.4,
  },
  collectionHint: {
    ...driverBodySecondary,
    fontSize: 10,
    marginTop: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCell: {
    ...driverUISemiBold,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  headerParty: { flex: 1, minWidth: 0 },
  headerTrips: { width: 44, textAlign: "center" },
  headerAmt: { width: 92, textAlign: "right" },
  table: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 64,
  },
  partyMid: { flex: 1, minWidth: 0, gap: 2 },
  partyName: {
    ...driverUIBold,
    fontSize: 13,
  },
  partySub: {
    ...driverBodySecondary,
    fontSize: 10,
    lineHeight: 13,
  },
  tripsPill: {
    width: 36,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  tripsPillText: {
    ...driverUIBold,
    fontSize: 11,
  },
  amtCol: {
    width: 92,
    alignItems: "flex-end",
    gap: 2,
  },
  dueValue: {
    ...driverUIBold,
    fontSize: 13,
    letterSpacing: -0.2,
  },
  receivedLine: {
    ...driverBodySecondary,
    fontSize: 10,
  },
  emptyCard: {
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    ...driverUIBold,
    fontSize: 13,
  },
  emptyBody: {
    ...driverBodySecondary,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
  },
});
