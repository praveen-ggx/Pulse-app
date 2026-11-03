/**
 * Finance overview from one server aggregate (invoice_finance_dashboard): headline
 * receivables, aging by bucket, money in by month, credit notes and refunds, and
 * bank reconciliation status. Nothing is summed on the client from raw rows.
 * Single-series bar lists in one brand hue; every value is also in the table.
 */
import Theme from "@/constants/Theme";
import {
  Chip,
  DataTable,
  Metric,
  MetricRow,
  QueryState,
  Row,
  SectionTitle,
  ui,
} from "@/features/invoicing/components/finance/FinanceUi";
import { fetchFinanceDashboard, financeBooksKeys, type FinanceDashboardMonth } from "@/features/invoicing/services/financeBooks.service";
import { formatInr } from "@/features/invoicing/utils/financeDocuments.util";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

function istToday(): string {
  const now = new Date();
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000).toISOString().slice(0, 10);
}

function monthsBack(today: string, months: number): string {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 - (months - 1), 1));
  return d.toISOString().slice(0, 10);
}

function monthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/** One labelled horizontal bar per row, scaled to the largest value. */
function BarList({ rows, label }: { rows: { key: string; label: string; value: number }[]; label: string }) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <View accessibilityLabel={label}>
      {rows.map((row) => (
        <View
          key={row.key}
          style={styles.barRow}
          accessible
          accessibilityLabel={`${row.label}: ${formatInr(row.value)}`}
        >
          <Text style={[ui.td, styles.barLabel]} numberOfLines={1}>
            {row.label}
          </Text>
          <View style={styles.track}>
            {row.value > 0 && max > 0 ? <View style={[styles.bar, { width: `${Math.max(1, (row.value / max) * 100)}%` }]} /> : null}
          </View>
          <Text style={[ui.td, ui.num, styles.barValue]}>{formatInr(row.value)}</Text>
        </View>
      ))}
    </View>
  );
}

export function FinanceDashboardPanel({ orgId }: { orgId: string }) {
  const [months, setMonths] = useState<6 | 12>(6);
  const today = istToday();
  const from = monthsBack(today, months);
  const dashboard = useQuery({
    queryKey: financeBooksKeys.dashboard(orgId, from, today),
    queryFn: () => fetchFinanceDashboard(orgId, from, today),
    staleTime: 60_000,
  });
  const d = dashboard.data?.data ?? null;
  const failed = Boolean(dashboard.data?.error);
  const value = (n: number | undefined) => (failed || n === undefined ? "Unavailable" : formatInr(n));

  const monthColumns = [
    { key: "m", label: "Month", width: 90, render: (row: FinanceDashboardMonth) => monthLabel(row.month) },
    { key: "inv", label: "Invoiced", align: "right" as const, render: (row: FinanceDashboardMonth) => formatInr(row.invoiced) },
    { key: "bank", label: "Collected (bank)", align: "right" as const, render: (row: FinanceDashboardMonth) => formatInr(row.collectedBank) },
    { key: "tds", label: "TDS", width: 100, align: "right" as const, render: (row: FinanceDashboardMonth) => formatInr(row.collectedTds) },
    { key: "cn", label: "Credit notes", width: 120, align: "right" as const, render: (row: FinanceDashboardMonth) => formatInr(row.creditNotes) },
    { key: "rf", label: "Refunds", width: 110, align: "right" as const, render: (row: FinanceDashboardMonth) => formatInr(row.refunds) },
  ];

  return (
    <>
      <SectionTitle
        title="Overview"
        hint={d ? `Receivables as of ${d.asOf}. Money in by month for the period below.` : "Receivables today and money in by month."}
      />
      <Row>
        <Chip label="Last 6 months" active={months === 6} onPress={() => setMonths(6)} />
        <Chip label="Last 12 months" active={months === 12} onPress={() => setMonths(12)} />
      </Row>
      <QueryState loading={dashboard.isLoading} error={dashboard.data?.error} unavailable={dashboard.data?.unavailable} empty={false} emptyText="" onRetry={() => void dashboard.refetch()} />
      <MetricRow>
        <Metric label="Outstanding" value={value(d?.receivables.outstanding)} />
        <Metric
          label="Overdue"
          value={value(d ? d.receivables.days1To30 + d.receivables.days31To60 + d.receivables.days61To90 + d.receivables.daysOver90 : undefined)}
          tone={d && d.receivables.daysOver90 > 0 ? "danger" : undefined}
        />
        <Metric label="Customer credit held" value={value(d ? d.unappliedReceipts + d.receivables.creditNoteCredit : undefined)} />
        <Metric label="Unmatched bank credits" value={failed || !d ? "Unavailable" : `${d.bank.unmatchedCredits} · ${formatInr(d.bank.unmatchedAmount)}`} />
      </MetricRow>
      {d ? (
        <>
          <Text style={ui.fieldLabel}>Outstanding by age past due</Text>
          <BarList
            label="Outstanding by age past due"
            rows={[
              { key: "c", label: "Not yet due", value: d.receivables.current },
              { key: "1", label: "1–30 days", value: d.receivables.days1To30 },
              { key: "2", label: "31–60 days", value: d.receivables.days31To60 },
              { key: "3", label: "61–90 days", value: d.receivables.days61To90 },
              { key: "4", label: "Over 90 days", value: d.receivables.daysOver90 },
            ]}
          />
          <Text style={ui.hint}>
            {`${d.receivables.openInvoices} open invoices across ${d.receivables.customersOwing} customers.${
              d.bank.matchedToReversed > 0 ? ` ${d.bank.matchedToReversed} bank lines are matched to reversed receipts — review them in Reconciliation.` : ""
            }`}
          </Text>
          <Text style={ui.fieldLabel}>Collected in bank by month</Text>
          <BarList
            label="Collected in bank by month"
            rows={d.months.map((row) => ({ key: row.month, label: monthLabel(row.month), value: row.collectedBank }))}
          />
          <Text style={ui.fieldLabel}>By month</Text>
          <DataTable columns={monthColumns} rows={d.months} rowKey={(row) => row.month} />
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  barRow: { flexDirection: "row", alignItems: "center", minHeight: 28, gap: 8 },
  barLabel: { width: 96 },
  track: { flex: 1, height: 10, borderRadius: 4, backgroundColor: Theme.surfaceGray, overflow: "hidden" },
  bar: { height: 10, borderRadius: 4, backgroundColor: Theme.primary },
  barValue: { width: 120 },
});
