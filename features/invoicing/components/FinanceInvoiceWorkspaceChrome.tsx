import Theme from "@/constants/Theme";
import { Pressable, Text, View } from "react-native";
import type { FinanceClientPictureSummary } from "@/features/invoicing/utils/financeWorkflowState.util";
import { financeInvoiceWorkspaceStyles as s } from "@/features/invoicing/components/financeInvoiceWorkspace.styles";

export type FinanceWorkspaceTab = "pending" | "drafts" | "issued" | "details";

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <View style={s.metric}>
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
        <Text style={s.breadcrumb}>Invoice</Text>
        <Text style={s.clientTitle}>Select a client</Text>
        <Text style={s.countLine}>
          Choose a client to review trips and preview the invoice.
        </Text>
      </View>
    );
  }
  return (
    <View>
      <Text style={s.breadcrumb}>Invoice › {clientName}</Text>
      <Text style={s.clientTitle}>{clientName}</Text>
      <Text style={s.policyLine}>{policyLabel}</Text>
      {policyLabel === "POD policy not configured" ? (
        <Text style={s.countLine}>completed trips are not invoiceable</Text>
      ) : null}
      {showHardCopyToggle && onSetHardCopyRequired ? (
        <View style={s.podToggleRow}>
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
        </View>
      ) : null}
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
      {picture ? (
        <>
          <Text style={s.countLine}>
            {picture.completedTripCount} completed · {picture.podPendingTripCount}{" "}
            pending POD · {picture.eligibleTripCount} eligible ·{" "}
            {picture.invoicedTripCount} invoiced
          </Text>
          <View style={s.metrics}>
            <Metric value={picture.completedTripCount} label="Completed" />
            <Metric value={picture.unbilledTripCount} label="Unbilled" />
            <Metric value={picture.podPendingTripCount} label="Pending POD" />
            <Metric value={picture.eligibleTripCount} label="Eligible" />
            <Metric value={picture.invoicedTripCount} label="Invoiced" />
            <Metric value={picture.draftTripCount} label="Draft" />
          </View>
        </>
      ) : null}
    </View>
  );
}

export function FinanceInvoiceWorkspaceTabs({
  value,
  onChange,
}: {
  value: FinanceWorkspaceTab;
  onChange: (next: FinanceWorkspaceTab) => void;
}) {
  const tabs: { key: FinanceWorkspaceTab; label: string }[] = [
    { key: "pending", label: "Trips" },
    { key: "drafts", label: "Drafts" },
    { key: "issued", label: "Issued" },
    { key: "details", label: "Client Details" },
  ];
  return (
    <View style={s.tabs} accessibilityRole="tablist">
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
  );
}

export function FinanceInvoicePreviewEmpty({
  selectedCount = 0,
  invoiceableCount = 0,
  exclusionNote,
}: {
  selectedCount?: number;
  invoiceableCount?: number;
  exclusionNote?: string | null;
}) {
  return (
    <View style={s.previewEmpty}>
      <Text style={s.previewEmptyKicker}>Invoice Preview</Text>
      <Text style={s.previewEmptyTitle}>
        {invoiceableCount > 0
          ? `${invoiceableCount} eligible trip${invoiceableCount === 1 ? "" : "s"}`
          : "No trips selected"}
      </Text>
      <Text style={s.previewEmptyBody}>
        {exclusionNote
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
