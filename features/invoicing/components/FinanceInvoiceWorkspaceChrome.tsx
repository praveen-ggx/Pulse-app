import Theme from "@/constants/Theme";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { FinanceClientPictureSummary } from "@/features/invoicing/utils/financeWorkflowState.util";
import { financeInvoiceWorkspaceStyles as s } from "@/features/invoicing/components/financeInvoiceWorkspace.styles";
import type { FinanceBookSection } from "@/features/invoicing/components/FinanceBooksPanel";

export type FinanceWorkspaceTab = "pending" | "drafts" | "issued" | "ar" | "receipts" | "details";

function Metric({
  value,
  label,
  last = false,
}: {
  value: number;
  label: string;
  last?: boolean;
}) {
  return (
    <View style={[s.metric, last && s.metricLast]}>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

export function FinanceInvoiceAppBar({
  showChrome,
}: {
  showChrome: boolean;
}) {
  if (!showChrome) return null;
  return (
    <View style={s.appBar}>
      <View>
        <Text style={s.appBarBrand}>PULSE FINANCE.</Text>
        <Text style={s.appBarMeta}>Invoice · GST</Text>
      </View>
    </View>
  );
}

export function FinanceInvoiceClientHeader({
  clientName,
  policyLabel,
  picture,
  showHardCopyToggle,
  hardCopyOn,
  onSetHardCopyRequired,
  onManualInvoice,
}: {
  clientName: string | null;
  policyLabel: string;
  picture: FinanceClientPictureSummary | null;
  showHardCopyToggle?: boolean;
  hardCopyOn?: boolean;
  onSetHardCopyRequired?: (next: boolean) => void;
  onManualInvoice?: () => void;
}) {
  if (!clientName) {
    return (
      <View>
        <View style={s.clientHeadRow}>
          <Text style={s.breadcrumbInline}>Invoice ›</Text>
          <Text style={s.clientTitleInline} numberOfLines={1}>
            Select a client
          </Text>
        </View>
        <Text style={s.countLine}>
          Choose a client to review trips and preview the invoice.
        </Text>
      </View>
    );
  }
  return (
    <View>
      <View style={s.clientHeadRow}>
        <Text style={s.breadcrumbInline}>Invoice ›</Text>
        <Text style={s.clientTitleInline} numberOfLines={1}>
          {clientName}
        </Text>
        <View style={s.podToggleRow}>
          <Text style={[s.policyLine, s.policyLineInline]} numberOfLines={1}>
            {policyLabel}
          </Text>
          {showHardCopyToggle && onSetHardCopyRequired ? (
            <>
              <Pressable
                style={[s.podToggle, !hardCopyOn && s.podToggleOn]}
                onPress={() => onSetHardCopyRequired(false)}
                accessibilityRole="button"
                accessibilityLabel="POD Required off"
              >
                <Text style={[s.podToggleText, !hardCopyOn && s.podToggleTextOn]}>
                  OFF
                </Text>
              </Pressable>
              <Pressable
                style={[s.podToggle, hardCopyOn && s.podToggleOn]}
                onPress={() => onSetHardCopyRequired(true)}
                accessibilityRole="button"
                accessibilityLabel="POD Required on"
              >
                <Text style={[s.podToggleText, hardCopyOn && s.podToggleTextOn]}>
                  ON
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
        {onManualInvoice ? (
          <Pressable
            style={s.manualInvoiceBtn}
            onPress={onManualInvoice}
            accessibilityRole="button"
            accessibilityLabel="Create Manual Invoice"
          >
            <Text style={s.manualInvoiceBtnText}>Create Manual Invoice</Text>
          </Pressable>
        ) : null}
      </View>
      {picture ? (
        <View style={s.metricsSlot}>
          <View style={s.metrics}>
            <Metric value={picture.completedTripCount} label="Completed" />
            <Metric value={picture.unbilledTripCount} label="Unbilled" />
            <Metric value={picture.podPendingTripCount} label="Pending POD" />
            <Metric value={picture.eligibleTripCount} label="Eligible" />
            <Metric value={picture.invoicedTripCount} label="Invoiced" />
            <Metric value={picture.draftTripCount} label="Draft" last />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const BOOKS: { key: FinanceBookSection; label: string }[] = [
  { key: "book", label: "Invoice Book" },
  { key: "receivables", label: "Receivables" },
  { key: "ledger", label: "Customer Ledger" },
  { key: "credits", label: "Credit Notes" },
  { key: "reconcile", label: "Reconciliation" },
  { key: "reports", label: "Reports" },
  { key: "details", label: "Client Details" },
];

export function FinanceBookNav({
  value,
  onChange,
}: {
  value: FinanceBookSection;
  onChange: (next: FinanceBookSection) => void;
}) {
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      <View style={s.tabGroup}>
        {BOOKS.map((tab) => {
          const active = value === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={s.tab}
              onPress={() => onChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
            >
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text>
              {active ? <View style={s.tabUnderline} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function FinanceInvoiceWorkspaceTabs({
  value,
  onChange,
  actions,
}: {
  value: FinanceWorkspaceTab;
  onChange: (next: FinanceWorkspaceTab) => void;
  actions?: ReactNode;
}) {
  const tabs: { key: FinanceWorkspaceTab; label: string }[] = [
    { key: "pending", label: "Trips" },
    { key: "drafts", label: "Drafts" },
    { key: "issued", label: "Issued" },
  ];
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      <View style={s.tabGroup}>
      {tabs.map((tab) => {
        const active = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={s.tab}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
          >
            <Text style={[s.tabLabel, active && s.tabLabelActive]}>
              {tab.label}
            </Text>
            {active ? <View style={s.tabUnderline} /> : null}
        </Pressable>
      );
      })}
      </View>
      {actions ? <View style={s.tabActions}>{actions}</View> : null}
    </View>
  );
}

export function FinanceInvoicePreviewEmpty({
  selectedCount = 0,
  invoiceableCount = 0,
  exclusionNote,
  title,
  body,
}: {
  selectedCount?: number;
  invoiceableCount?: number;
  exclusionNote?: string | null;
  title?: string;
  body?: string;
}) {
  return (
    <View style={s.previewEmpty}>
      <Text style={s.previewEmptyKicker}>Invoice Preview</Text>
      <Text style={s.previewEmptyTitle}>
        {title
          ? title
          : invoiceableCount > 0
            ? `${invoiceableCount} eligible trip${invoiceableCount === 1 ? "" : "s"}`
            : "No trips selected"}
      </Text>
      <Text style={s.previewEmptyBody}>
        {body
          ? body
          : exclusionNote
            ? exclusionNote
            : selectedCount > 0
              ? "Selected trips are not invoiceable."
              : "Select one or more eligible trips or choose Create Manual Invoice."}
      </Text>
    </View>
  );
}

export function FinanceInvoiceStatusPill({ label }: { label: string }) {
  const ready = label === "Ready" || label === "Eligible";
  const issued = label === "Invoiced";
  const pending = label === "POD pending" || label === "Draft";
  return (
    <View
      style={[
        s.pill,
        ready && s.pillReady,
        issued && s.pillIssued,
        pending && s.pillPending,
        label === "Not completed" && s.pillBlocked,
      ]}
    >
      <Text
        style={[
          s.pillText,
          ready && s.pillReadyText,
          { color: Theme.textSecondary },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
