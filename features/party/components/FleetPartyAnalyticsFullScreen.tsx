import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { Suspense, lazy, useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { LazySuspenseNullFallback } from "@/components/LazySuspenseFallback";
import { isPulseDesktop } from "@/components/analytics/pulse/pulseStyles";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { MissionRow } from "@/features/vehicles/components/analytics/analyticsUtils";
import { useTripsQuery, useTransactionsQuery } from "@/lib/queries";

const ClientAnalyticsTab = lazy(() =>
  import("@/features/clients/components/analytics/ClientAnalyticsTab").then((m) => ({
    default: m.default,
  })),
);
const SupplierAnalyticsTab = lazy(() =>
  import("@/features/suppliers/components/analytics/SupplierAnalyticsTab").then((m) => ({
    default: m.default,
  })),
);
const DriverAnalyticsTab = lazy(() =>
  import("@/features/drivers/components/analytics/DriverAnalyticsTab").then((m) => ({
    default: m.default,
  })),
);
const VehicleAnalyticsTab = lazy(() =>
  import("@/features/vehicles/components/analytics/VehicleAnalyticsTab").then((m) => ({
    default: m.default,
  })),
);

export type FleetPartyKind = "customers" | "suppliers" | "drivers" | "vehicles";

const COPY: Record<FleetPartyKind, { eyebrow: string; title: string }> = {
  customers: { eyebrow: "CUSTOMER INTELLIGENCE", title: "All customers" },
  suppliers: { eyebrow: "SUPPLIER INTELLIGENCE", title: "All suppliers" },
  drivers: { eyebrow: "DRIVER INTELLIGENCE", title: "All drivers" },
  vehicles: { eyebrow: "VEHICLE INTELLIGENCE", title: "All vehicles" },
};

export function FleetPartyAnalyticsFullScreen({ kind }: { kind: FleetPartyKind }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = isPulseDesktop(width);
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const copy = COPY[kind];

  const tripsQ = useTripsQuery(orgId);
  const txQ = useTransactionsQuery(orgId);
  const trips = tripsQ.data ?? [];
  const transactions = txQ.data ?? [];
  const loading = tripsQ.isPending || txQ.isPending;

  const missionRows: MissionRow[] = useMemo(
    () =>
      trips.map((trip) => {
        const sales = Number(trip.client_price ?? 0);
        const expense = Number(trip.supplier_rate ?? 0);
        return {
          trip,
          sales,
          expense,
          profit: sales - expense,
          margin: sales > 0 ? ((sales - expense) / sales) * 100 : 0,
          expenseLines: [],
        };
      }),
    [trips],
  );

  if (loading) {
    return <CenteredLoadingView message="Loading analytics" />;
  }

  return (
    <View
      style={[
        styles.wrap,
        desktop && styles.wrapDesktop,
        { paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          style={styles.headerIconBtn}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <FontAwesome name="chevron-left" size={18} color={Theme.textPrimaryDark} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>{copy.eyebrow}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {copy.title}
          </Text>
        </View>
        <View style={[styles.headerIconBtn, styles.headerIconBtnActive]}>
          <FontAwesome name="line-chart" size={16} color={Theme.primary} />
        </View>
      </View>

      <ScrollView
        style={[styles.scroll, desktop && styles.scrollDesktop]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (desktop ? 24 : Layout.screenPaddingHorizontal) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Suspense fallback={<LazySuspenseNullFallback />}>
          {kind === "customers" ? (
            <ClientAnalyticsTab
              client={null}
              trips={trips}
              transactions={transactions}
              orgId={orgId}
              embedded
            />
          ) : null}
          {kind === "suppliers" ? (
            <SupplierAnalyticsTab
              supplier={null}
              trips={trips}
              transactions={transactions}
              orgId={orgId}
              embedded
            />
          ) : null}
          {kind === "drivers" ? (
            <DriverAnalyticsTab
              driver={null}
              trips={trips}
              driverTransactions={transactions}
              driverRequests={[]}
              driverOffer={null}
              driverRatings={[]}
              orgId={orgId}
            />
          ) : null}
          {kind === "vehicles" ? (
            <VehicleAnalyticsTab
              vehicle={null}
              missionRows={missionRows}
              vehicleTrips={trips}
              vehicleTransactions={transactions}
              orgId={orgId}
            />
          ) : null}
        </Suspense>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  wrapDesktop: {
    backgroundColor: METRONIC.bodyBg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  headerEyebrow: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconBtnActive: {
    backgroundColor: Theme.brandBlueWashSubtle,
    borderWidth: 1,
    borderColor: Theme.brandBlue,
  },
  scroll: { flex: 1 },
  scrollDesktop: {
    backgroundColor: METRONIC.bodyBg,
  },
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    flexGrow: 1,
  },
});
