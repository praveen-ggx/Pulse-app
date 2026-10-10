import Theme from "@/constants/Theme";
import { getSupplierBankAccount } from "@/features/suppliers/services/supplierVendorOnboarding.service";
import { resolveBankBranch } from "@/features/suppliers/utils/ifscDirectory.util";
import { subscribeSupplierBankChanged } from "@/features/suppliers/utils/supplierBankEvents.util";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { getTripExecutionModel } from "@/features/trips/domain/tripExecutionModel";
import { Landmark } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type Payee = {
  beneficiary: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch: string;
};

/** `key` = the supplier the result belongs to, so a trip switch never shows the previous payee. */
type LoadState =
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; payee: Payee | null }
  | { status: "error"; key: string; message: string };

function PayeeRow({ label, value, mono, first }: { label: string; value: string; mono?: boolean; first?: boolean }) {
  const empty = !value.trim();
  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.value, mono && styles.valueMono, empty && styles.valueMuted]}
        numberOfLines={2}
        selectable={!empty}
      >
        {empty ? "—" : value}
      </Text>
    </View>
  );
}

/**
 * Who the advance was paid to: supplier plus the payout account from supplier
 * Banking (beneficiary, account, IFSC, bank, branch). Refreshes when the
 * supplier's bank details are saved anywhere in the app.
 */
export function ComplianceAdvancePayeeDetails({
  trip,
  supplierName,
  embedded = false,
}: {
  trip: ComplianceTripSummary["trip"];
  /** Resolved supplier display name (falls back to `trip.supplier_name`). */
  supplierName: string | null;
  /** Rows only — parent receipt supplies the card chrome. */
  embedded?: boolean;
}) {
  const supplierId = (trip.supplier_id ?? "").trim();
  const orgId = (trip.organization_id ?? "").trim();
  const ownFleet = !supplierId && getTripExecutionModel(trip) === "asset";
  const supplierLabel = ownFleet ? "Own fleet" : (supplierName ?? trip.supplier_name ?? "").trim();
  const loadKey = `${orgId}:${supplierId}`;
  const [loaded, setState] = useState<LoadState>({ status: "loading", key: loadKey });
  const state: LoadState = loaded.key === loadKey ? loaded : { status: "loading", key: loadKey };
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!supplierId) return;
    return subscribeSupplierBankChanged((changedId) => {
      if (changedId === supplierId) setRevision((n) => n + 1);
    });
  }, [supplierId]);

  useEffect(() => {
    let cancelled = false;
    if (!supplierId || !orgId) {
      setState({ status: "ready", key: loadKey, payee: null });
      return;
    }
    // Same supplier refreshing (bank saved elsewhere): keep current rows until new data lands.
    void getSupplierBankAccount(orgId, supplierId).then(async ({ account, error }) => {
      if (cancelled) return;
      if (error) {
        setState({ status: "error", key: loadKey, message: "Couldn't load the payout account." });
        return;
      }
      if (!account?.account_number?.trim()) {
        setState({ status: "ready", key: loadKey, payee: null });
        return;
      }
      const ifsc = (account.ifsc_code ?? "").trim().toUpperCase();
      const branch = await resolveBankBranch(account.branch_name, ifsc);
      if (cancelled) return;
      setState({
        status: "ready",
        key: loadKey,
        payee: {
          beneficiary: account.beneficiary_name?.trim() || supplierLabel,
          accountNumber: account.account_number.trim(),
          ifsc,
          bankName: account.bank_name?.trim() ?? "",
          branch,
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, supplierId, supplierLabel, revision, loadKey]);

  let body: React.ReactNode;
  if (ownFleet) {
    body = <Text style={styles.note}>Own fleet trip — no supplier payout account.</Text>;
  } else if (state.status === "loading") {
    body = (
      <View style={styles.stateRow}>
        <ActivityIndicator size="small" color={Theme.textMuted} />
        <Text style={styles.note}>Loading payout account…</Text>
      </View>
    );
  } else if (state.status === "error") {
    body = <Text style={[styles.note, styles.noteError]}>{state.message}</Text>;
  } else if (!state.payee) {
    const emptyCopy = supplierId
      ? "No payout account on file. Add bank details on the supplier's Banking card."
      : "No supplier linked to this trip.";
    body = <Text style={styles.note}>{emptyCopy}</Text>;
  } else {
    const p = state.payee;
    body = (
      <>
        <PayeeRow label="Beneficiary name" value={p.beneficiary} first />
        <PayeeRow label="Account number" value={p.accountNumber} mono />
        <PayeeRow label="IFSC no" value={p.ifsc} mono />
        <PayeeRow label="Bank name" value={p.bankName} />
        <PayeeRow label="Branch name" value={p.branch} />
      </>
    );
  }

  const header = (
    <View style={[styles.sectionHead, embedded && styles.sectionHeadEmbedded]}>
      {embedded ? <Landmark size={12} color={Theme.textMuted} strokeWidth={2.2} /> : null}
      <Text style={styles.sectionTitle}>Paid to</Text>
    </View>
  );
  const rows = (
    <>
      <PayeeRow label="Supplier" value={supplierLabel} first />
      <View style={styles.rowBorder}>{body}</View>
    </>
  );

  if (embedded) {
    return (
      <View style={styles.embed}>
        {header}
        <View style={styles.embedCard}>{rows}</View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {header}
      <View style={styles.card}>{rows}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 6 },
  embed: {
    flexGrow: 1,
    minHeight: 0,
    backgroundColor: Theme.compliancePageBg,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  sectionHeadEmbedded: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  embedCard: {
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
  },
  label: {
    width: 128,
    flexShrink: 0,
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
    paddingTop: 1,
  },
  value: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 15,
  },
  valueMono: { fontVariant: ["tabular-nums"], letterSpacing: 0.3 },
  valueMuted: { color: Theme.textMuted, fontWeight: "500" },
  stateRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  note: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "right",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  noteError: { color: Theme.complianceStageDocsFg, fontWeight: "600" },
});
