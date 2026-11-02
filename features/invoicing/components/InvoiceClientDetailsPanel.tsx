import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { ContentErrorState } from "@/components/ContentErrorState";
import Theme from "@/constants/Theme";
import { ClientProfileHub } from "@/features/clients/components/desktop/ClientProfileHub";
import { useClientManagementBundleQuery } from "@/features/clients/hooks/useClientManagementBundle";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { useClientTdsRate } from "@/features/invoicing/hooks/useClientTdsRate";
import { expectedAfterTds } from "@/features/invoicing/utils/clientTds.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  orgId: string | null;
  clientId: string | null;
  clientName?: string | null;
};

export function InvoiceClientDetailsPanel({ orgId, clientId, clientName }: Props) {
  const bundleQ = useClientManagementBundleQuery(orgId, clientId);
  const client = useMemo(
    () => (bundleQ.data?.client as ClientRow | null | undefined) ?? null,
    [bundleQ.data],
  );
  const tds = useClientTdsRate(orgId, clientId);

  if (!clientId) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{clientName || "Client"}</Text>
        <Text style={styles.emptyBody}>
          This customer is not linked to a client profile, so GSTIN, billing
          address, and contacts cannot be loaded.
        </Text>
      </View>
    );
  }

  if (!orgId || bundleQ.isLoading) {
    return <CenteredLoadingView message="Loading client profile" />;
  }

  if (bundleQ.error || !bundleQ.data || !client) {
    return (
      <ContentErrorState
        variant="generic"
        message={bundleQ.error?.message ?? "Client profile could not be loaded"}
        onRetry={() => {
          void bundleQ.refetch();
        }}
      />
    );
  }

  return (
    <View style={styles.fill}>
      <ClientTdsCard
        percent={tds.percent}
        ready={tds.ready}
        saving={tds.saving}
        onSave={tds.save}
      />
      <ClientProfileHub
        client={client}
        bundle={bundleQ.data}
        onRefresh={() => {
          void bundleQ.refetch();
        }}
      />
    </View>
  );
}

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function percentLabel(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function ClientTdsCard({
  percent,
  ready,
  saving,
  onSave,
}: {
  percent: number;
  ready: boolean;
  saving: boolean;
  onSave: (next: number) => Promise<{ error: Error | null }>;
}) {
  const [text, setText] = useState(percent > 0 ? percentLabel(percent) : "");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    setText(percent > 0 ? percentLabel(percent) : "");
    setEditing(false);
    setNote(null);
  }, [percent]);
  const rate = Number(text) || 0;
  const preview = expectedAfterTds(100000, editing ? rate : percent);
  if (!ready) return null;
  return (
    <View style={styles.tdsCard}>
      <View style={styles.tdsHead}>
        <View style={styles.tdsCopy}>
          <Text style={styles.tdsTitle}>TDS deducted by this client</Text>
          <Text style={styles.tdsBody}>
            {percent > 0
              ? "Every receipt keeps this share with the client and looks for the rest in the bank."
              : "Save the percent once. Receipts then keep that share with the client."}
          </Text>
        </View>
        {editing ? null : (
          <Pressable
            style={styles.tdsEdit}
            onPress={() => {
              setText(percent > 0 ? percentLabel(percent) : "");
              setNote(null);
              setEditing(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Edit client TDS percent"
            hitSlop={8}
          >
            <FontAwesome name="pencil" size={14} color={Theme.textPrimaryDark} />
          </Pressable>
        )}
      </View>
      {editing ? (
        <>
          <View style={styles.tdsEditRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={Theme.textMuted}
              style={styles.tdsInput}
              accessibilityLabel="Client TDS percent"
              autoFocus
            />
            <Text style={styles.tdsUnit}>%</Text>
            <Pressable
              style={[styles.tdsSave, saving && styles.tdsSaveOff]}
              disabled={saving}
              onPress={() => {
                void onSave(rate).then((result) => {
                  if (result.error) {
                    setNote(result.error.message);
                    return;
                  }
                  setEditing(false);
                  setNote(null);
                });
              }}
              accessibilityRole="button"
              accessibilityLabel="Save client TDS percent"
            >
              <Text style={styles.tdsSaveText}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
            <Pressable
              style={styles.tdsCancel}
              onPress={() => {
                setText(percent > 0 ? percentLabel(percent) : "");
                setNote(null);
                setEditing(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel TDS edit"
            >
              <Text style={styles.tdsCancelText}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.tdsSample}>
            On {inr(100000)}, bank {inr(preview.bank)} · TDS {inr(preview.tds)}
          </Text>
          {note ? <Text style={styles.tdsNote}>{note}</Text> : null}
        </>
      ) : (
        <View style={styles.tdsPreview}>
          <View style={styles.tdsRate}>
            <Text style={styles.tdsRateValue}>{percentLabel(percent)}</Text>
            <Text style={styles.tdsRateUnit}>%</Text>
          </View>
          <View style={styles.tdsStat}>
            <Text style={styles.tdsStatLabel}>Bank</Text>
            <Text style={styles.tdsStatValue}>{inr(preview.bank)}</Text>
          </View>
          <View style={styles.tdsStat}>
            <Text style={styles.tdsStatLabel}>TDS</Text>
            <Text style={styles.tdsStatValue}>{inr(preview.tds)}</Text>
          </View>
          <Text style={styles.tdsBasis}>on {inr(100000)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tdsCard: {
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
    gap: 10,
  },
  tdsHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tdsCopy: { flex: 1, minWidth: 0, gap: 2 },
  tdsTitle: { fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark },
  tdsBody: { fontSize: 12, fontWeight: "400", color: Theme.textSecondary },
  tdsEdit: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  tdsPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 10,
    backgroundColor: Theme.accentBrownWash,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tdsRate: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 1,
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.primary,
  },
  tdsRateValue: { fontSize: 18, fontWeight: "500", color: Theme.buttonDarkText },
  tdsRateUnit: { marginBottom: 2, fontSize: 11, fontWeight: "500", color: Theme.buttonDarkText },
  tdsStat: { gap: 1 },
  tdsStatLabel: { fontSize: 10, fontWeight: "400", color: Theme.textMuted },
  tdsStatValue: { fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark },
  tdsBasis: { marginLeft: "auto", fontSize: 11, fontWeight: "400", color: Theme.textSecondary },
  tdsEditRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tdsInput: {
    minHeight: 36,
    width: 72,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  tdsUnit: { fontSize: 13, fontWeight: "500", color: Theme.textSecondary },
  tdsSample: { fontSize: 12, fontWeight: "400", color: Theme.textPrimaryDark },
  tdsSave: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  tdsCancel: {
    minHeight: 36,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tdsCancelText: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary },
  tdsSaveOff: { opacity: 0.45 },
  tdsSaveText: { fontSize: 12, fontWeight: "500", color: Theme.buttonDarkText },
  tdsNote: { fontSize: 12, fontWeight: "400", color: Theme.textSecondary },
  fill: { flex: 1, minHeight: 0 },
  empty: { padding: 16, gap: 8 },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    color: Theme.textSecondary,
  },
});
