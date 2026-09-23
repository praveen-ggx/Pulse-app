/**
 * Pending Billing right rail: partner summary, interpretation, issued invoice cards.
 * Create Invoice stays in the trip-list header — not duplicated here.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { IssuedInvoiceCard } from "@/features/invoicing/components/IssuedInvoiceCard";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import { issuedInvoicesForPodToggle } from "@/features/invoicing/utils/invoicePodRequired.util";
import { issuedInvoicesForClient } from "@/features/invoicing/utils/issuedInvoiceMatch.util";
import { ScrollView, StyleSheet, Text, View } from "react-native";

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function PendingBillingInsightPanel({
  partnerLabel,
  partnerClientId,
  tripCount,
  unbilledTripCount,
  eligibleCount,
  selectedCount,
  selectedFreight,
  pendingFreight,
  completedTripCount,
  notCompletedTripCount,
  invoicedTripCount,
  podPendingTripCount = 0,
  draftTripCount = 0,
  podRequired,
  blockedReason,
  invoices,
}: {
  partnerLabel?: string | null;
  partnerClientId?: string | null;
  tripCount: number;
  unbilledTripCount: number;
  eligibleCount: number;
  selectedCount: number;
  selectedFreight: number;
  pendingFreight: number;
  completedTripCount: number;
  notCompletedTripCount: number;
  invoicedTripCount: number;
  podPendingTripCount?: number;
  draftTripCount?: number;
  podRequired: boolean;
  blockedReason?: string | null;
  invoices: IssuedInvoiceListRow[];
}) {
  const visible = issuedInvoicesForPodToggle(invoices, podRequired);
  const partnerInvoices = partnerLabel || partnerClientId
    ? issuedInvoicesForClient(visible, {
        clientId: partnerClientId,
        clientName: partnerLabel,
      })
    : visible;
  const issuedTotal = partnerInvoices.reduce(
    (sum, row) => sum + (Number.isFinite(row.total_amount) ? row.total_amount : 0),
    0,
  );

  const interpretation = buildInterpretation({
    partnerLabel,
    tripCount,
    unbilledTripCount,
    eligibleCount,
    selectedCount,
    completedTripCount,
    notCompletedTripCount,
    invoicedTripCount,
    podRequired,
    blockedReason,
    issuedCount: partnerInvoices.length,
  });

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>Summary</Text>
        <Text style={styles.sectionTitle} numberOfLines={1}>
          {partnerLabel ? partnerLabel : "Select a partner"}
        </Text>
        {!partnerLabel ? (
          <Text style={styles.body}>
            Choose a strategic partner to see ready-to-invoice volume, selection,
            and issued billing for that client.
          </Text>
        ) : (
          <>
            <View style={styles.metricGrid}>
              <Metric label="Completed" value={String(completedTripCount)} />
              <Metric label="Blocked — POD pending" value={String(podPendingTripCount)} />
              <Metric label="Eligible" value={String(eligibleCount)} />
              <Metric label="In draft" value={String(draftTripCount)} />
              <Metric label="Already invoiced" value={String(invoicedTripCount)} />
              <Metric label="Selected" value={String(selectedCount)} />
              <Metric
                label="Selected freight"
                value={formatInr(selectedFreight)}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Pending freight (listed)</Text>
              <Text style={styles.statValue}>{formatInr(pendingFreight)}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Issued to this partner</Text>
              <Text style={styles.statValue}>
                {partnerInvoices.length} · {formatInr(issuedTotal)}
              </Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>Interpretation</Text>
        <Text style={styles.interpretation}>{interpretation}</Text>
        {blockedReason ? (
          <Text style={styles.blocked}>{blockedReason}</Text>
        ) : null}
      </View>

      <View style={styles.issuedBlock}>
        <View style={styles.issuedHeader}>
          <Text style={styles.sectionEyebrow}>
            {partnerLabel ? "Issued invoices" : "Recent issued invoices"}
          </Text>
          <Text style={styles.issuedCount}>
            {partnerInvoices.length}
          </Text>
        </View>
        {partnerInvoices.length === 0 ? (
          <View style={styles.emptyIssued}>
            <Text style={styles.emptyTitle}>
              {partnerLabel
                ? "No issued invoices for this partner"
                : "No issued invoices yet"}
            </Text>
            <Text style={styles.emptySub}>
              Use Create Invoice above once eligible trips are selected. Issued
              documents stay visible here regardless of POD Required.
            </Text>
          </View>
        ) : (
          partnerInvoices.map((item) => (
            <IssuedInvoiceCard key={item.id} item={item} compact />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function buildInterpretation({
  partnerLabel,
  tripCount,
  unbilledTripCount,
  eligibleCount,
  selectedCount,
  completedTripCount,
  notCompletedTripCount,
  invoicedTripCount,
  podRequired,
  blockedReason,
  issuedCount,
}: {
  partnerLabel?: string | null;
  tripCount: number;
  unbilledTripCount: number;
  eligibleCount: number;
  selectedCount: number;
  completedTripCount: number;
  notCompletedTripCount: number;
  invoicedTripCount: number;
  podRequired: boolean;
  blockedReason?: string | null;
  issuedCount: number;
}): string {
  if (!partnerLabel) {
    return "Pending Billing lists partners with unbilled trip exposure. Select a client to review eligibility against their invoicing POD policy, then create an invoice from the trip list header.";
  }
  if (blockedReason) {
    return `Invoice creation is currently gated. ${blockedReason} Keep using the trip list to prepare selection; Create Invoice stays in the header above when the gate clears.`;
  }
  const podLine = podRequired
    ? "POD Required is ON — issue stays blocked for trips missing the client's required proof of delivery."
    : "POD Required is OFF — eligibility still follows each client's invoicing POD policy.";
  if (selectedCount === 0) {
    return `${partnerLabel} has ${unbilledTripCount} unbilled trip${unbilledTripCount === 1 ? "" : "s"} of ${tripCount} completed/open (${completedTripCount} completed, ${notCompletedTripCount} not completed). ${eligibleCount} are eligible to invoice. ${invoicedTripCount} trip${invoicedTripCount === 1 ? "" : "s"} already allocated to issued invoices. ${podLine} Select eligible rows, then Create Invoice above. ${issuedCount} issued invoice${issuedCount === 1 ? "" : "s"} already on file for this partner.`;
  }
  return `${selectedCount} trip${selectedCount === 1 ? "" : "s"} selected for ${partnerLabel} (${eligibleCount} eligible of ${unbilledTripCount} unbilled). ${podLine} Review the draft on the Create Invoice page before issuing. ${issuedCount} prior invoice${issuedCount === 1 ? "" : "s"} shown below.`;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.analyticsCanvas,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  sectionCard: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 19,
  },
  metricGrid: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricCell: {
    width: "47%",
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: Theme.analyticsCanvas,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  metricLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginVertical: 4,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  statValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  interpretation: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimary,
    lineHeight: 19,
  },
  blocked: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.warning,
    lineHeight: 17,
  },
  issuedBlock: {
    gap: 8,
  },
  issuedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  issuedCount: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    minWidth: 20,
    textAlign: "right",
  },
  emptyIssued: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptySub: {
    marginTop: Layout.spacingSmall,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },
});
