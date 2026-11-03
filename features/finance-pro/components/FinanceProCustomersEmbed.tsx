/**
 * CustomersTab embed for Finance Pro Overview / Receivables / Analytics.
 * Uses the same adjustment-aware get_customer_ledger_inputs path as Core Finance Customers.
 */
import { CustomersTab, type CustomersViewTab } from "@/features/clients/components/CustomersTab";
import type { EntityListFilter } from "@/features/finance/components/TreasurySummaryCard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useCompleteTripsQuery } from "@/lib/queries";
import { useTripFinanceAdjustmentsMap } from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function FinanceProCustomersEmbed({
  entityFilter = "all",
  viewTab = "list",
  caption,
  showOverviewKpis = false,
}: {
  entityFilter?: EntityListFilter;
  viewTab?: CustomersViewTab;
  caption?: string;
  /** Presentation of CustomersTab onTotals only — not a new AR path. */
  showOverviewKpis?: boolean;
}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const { data: tripRows = [] } = useCompleteTripsQuery(orgId);
  const tripIds = useMemo(
    () => tripRows.map((t) => t.id).filter(Boolean),
    [tripRows],
  );
  const { record, isLoading } = useTripFinanceAdjustmentsMap(orgId, tripIds);
  const tripFinanceAdjustmentsByTripId = isLoading ? undefined : record;
  const [kpi, setKpi] = useState<{ sales: number; pending: number; received: number } | null>(
    null,
  );
  const onTotals = useCallback(
    (totals: { totalIn: number; totalOut: number }) => {
      if (!showOverviewKpis) return;
      const sales = totals.totalIn ?? 0;
      const pending = totals.totalOut ?? 0;
      setKpi((prev) => {
        const next = {
          sales,
          pending,
          received: Math.max(0, sales - pending),
        };
        if (
          prev &&
          prev.sales === next.sales &&
          prev.pending === next.pending &&
          prev.received === next.received
        ) {
          return prev;
        }
        return next;
      });
    },
    [showOverviewKpis],
  );

  return (
    <View style={styles.root}>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      {showOverviewKpis && kpi ? (
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Sales / billed</Text>
            <Text style={styles.kpiValue}>{formatInr(kpi.sales)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Received</Text>
            <Text style={styles.kpiValue}>{formatInr(kpi.received)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Pending</Text>
            <Text style={styles.kpiValue}>{formatInr(kpi.pending)}</Text>
          </View>
        </View>
      ) : null}
      <CustomersTab
        organizationId={orgId}
        entityFilter={entityFilter}
        viewTab={viewTab}
        tripFinanceAdjustmentsByTripId={tripFinanceAdjustmentsByTripId}
        hideSummaryRow={showOverviewKpis}
        onTotals={showOverviewKpis ? onTotals : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
  },
  caption: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 4,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
  },
  kpiCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
});
