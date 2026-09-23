import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import { FinanceProWorkspaceFrame } from "./FinanceProWorkspaceFrame";
import { formatFinanceInr } from "./financeProFormat";
import { pipelineStageById } from "../model/buildFinanceProModel";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function FinanceProInvoiceLaunchScreen() {
  const router = useRouter();
  return (
    <FinanceProWorkspaceFrame
      title="Invoice workspace"
      subtitle="Finance Pro launches Pulse Invoice. Issued rows below are billing documents, not AR."
    >
      {(model) => {
        const ready = pipelineStageById(model.pipeline, "ready_to_invoice");
        return (
          <View>
            <Text style={styles.kicker}>Ready to invoice</Text>
            <Text style={styles.value}>{formatFinanceInr(ready.value)}</Text>
            <Text style={styles.note}>
              {ready.count} completed trips with physical POD received and no
              issued invoice document.
            </Text>
            <Pressable
              style={styles.cta}
              onPress={() => router.push(ROUTES.INVOICING_EXECUTE)}
              accessibilityRole="button"
              accessibilityLabel="Create invoices"
            >
              <Text style={styles.ctaText}>Create invoices</Text>
            </Pressable>

            <Text style={styles.section}>Issued invoice documents</Text>
            {model.issuedInvoiceDocuments.length === 0 ? (
              <Text style={styles.note}>No issued invoices in this workspace.</Text>
            ) : (
              model.issuedInvoiceDocuments.slice(0, 40).map((inv) => (
                <View key={inv.id} style={styles.doc}>
                  <Text style={styles.docNo}>{inv.invoiceNumber}</Text>
                  <Text style={styles.docMeta}>
                    {inv.sourceLabel ?? "Trip"}
                    {inv.sourceReference ? ` · ${inv.sourceReference}` : ""}
                    {inv.clientName ? ` · ${inv.clientName}` : ""}
                    {` · ${inv.invoiceDate}`}
                  </Text>
                  <Text style={styles.docAmt}>
                    Document {formatFinanceInr(inv.documentAmount)}
                  </Text>
                </View>
              ))
            )}
          </View>
        );
      }}
    </FinanceProWorkspaceFrame>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  value: {
    fontSize: 32,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimary,
    marginTop: 4,
  },
  note: {
    marginTop: 8,
    fontSize: 13,
    color: Theme.textSecondary,
  },
  cta: {
    marginTop: 16,
    alignSelf: "flex-start",
    backgroundColor: Theme.primary,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 8,
  },
  ctaText: {
    color: Theme.screenBackground,
    fontWeight: "800",
    fontSize: 14,
  },
  section: {
    marginTop: 32,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  doc: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
  },
  docNo: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  docMeta: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  docAmt: {
    fontSize: 12,
    color: Theme.textMuted,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
});
