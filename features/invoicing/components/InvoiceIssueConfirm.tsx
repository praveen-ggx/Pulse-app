import Theme from "@/constants/Theme";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

export function InvoiceIssueConfirm({
  visible,
  clientName,
  tripCount,
  amountLabel,
  policyMissing,
  openTrips,
  busy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  clientName: string;
  tripCount: number;
  amountLabel: string;
  policyMissing: boolean;
  openTrips: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const canPost = openTrips.length === 0 && tripCount > 0 && !busy;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Issue tax invoice</Text>
          <Text style={styles.title}>{clientName || "Client"}</Text>
          <Text style={styles.amount}>{amountLabel}</Text>
          {openTrips.length === 0 ? (
            <Text style={styles.body}>
              {tripCount} trip{tripCount === 1 ? "" : "s"} will be posted on one invoice. The number is assigned when it is issued, and those trips leave the unbilled list.
            </Text>
          ) : null}
          {policyMissing ? (
            <Text style={styles.note}>
              This client has no billing rule yet. Issuing records No POD required, so a proof of delivery is not required on future invoices unless you turn it on.
            </Text>
          ) : null}
          {openTrips.length > 0 ? (
            <Text style={styles.warn}>
              Still open, so they cannot be invoiced yet: {openTrips.join(", ")}. Remove them from this invoice or complete the trips first.
            </Text>
          ) : null}
          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={onCancel} disabled={busy} accessibilityRole="button">
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, !canPost && styles.off]}
              onPress={onConfirm}
              disabled={!canPost}
              accessibilityRole="button"
              accessibilityLabel="Confirm issue invoice"
            >
              <Text style={styles.primaryText}>{busy ? "Issuing…" : "Issue invoice"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    padding: 18,
    gap: 8,
  },
  kicker: { fontSize: 11, fontWeight: "500", color: Theme.textMuted },
  title: { fontSize: 16, fontWeight: "500", color: Theme.textPrimaryDark },
  amount: { fontSize: 22, fontWeight: "500", color: Theme.textPrimaryDark },
  body: { fontSize: 13, lineHeight: 18, fontWeight: "400", color: Theme.textSecondary },
  note: { fontSize: 13, lineHeight: 18, fontWeight: "400", color: Theme.textSecondary },
  warn: { fontSize: 13, lineHeight: 18, fontWeight: "400", color: Theme.warning },
  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  secondary: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark },
  primary: {
    flex: 1.4,
    minHeight: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  primaryText: { fontSize: 13, fontWeight: "500", color: Theme.buttonDarkText },
  off: { opacity: 0.45 },
});
