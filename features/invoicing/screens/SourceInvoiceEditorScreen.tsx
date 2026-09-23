import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import {
  buildCommerceOrderInvoiceDraft,
  fetchCommerceOrderInvoiceBundle,
  cancelCommerceOrderInvoiceDraft,
  issueCommerceOrderInvoice,
  saveCommerceOrderInvoiceDraft,
} from "@/features/invoicing/services/commerceOrderInvoice.service";
import { invoiceHsnIssueBlock } from "@/features/invoicing/utils/invoiceLineHsn.util";
import { isSalesOrderInvoiceable } from "@/features/invoicing/utils/commerceOrderInvoiceStatus.util";
import { buildInvoiceIssuerSnapshot } from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import {
  invoiceDraftTaxDisplay,
  mapInvoiceDraftModelToPdfData,
} from "@/features/invoicing/services/invoicePreviewModel.service";
import InvoicePdf from "@/components/InvoicePdf";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function SourceInvoiceEditorScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { activeWorkspace } = useActiveWorkspace();
  const orgId = currentOrganization?.id ?? null;
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"draft" | "issue" | null>(null);
  const issueKey = useRef(`${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const bundleQ = useQuery({
    queryKey:
      orgId && orderId
        ? queryKeys.invoicing.commerceOrder(orgId, String(orderId))
        : ["q", "invoicing", "commerce-order", "none"],
    queryFn: async () => {
      const { data, error } = await fetchCommerceOrderInvoiceBundle({
        orgId: orgId!,
        salesOrderId: String(orderId),
      });
      if (error) throw error;
      return data;
    },
    enabled: Boolean(orgId && orderId),
    staleTime: 60_000,
  });

  const bundle = bundleQ.data ?? null;
  const model = useMemo(() => {
    if (!bundle || !activeWorkspace) return null;
    try {
      return buildCommerceOrderInvoiceDraft({
        bundle,
        issuerWorkspace: activeWorkspace,
      });
    } catch {
      return null;
    }
  }, [bundle, activeWorkspace]);

  if (bundleQ.isLoading || !orgId) return <CenteredLoadingView />;
  if (!bundle || !model) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Invoice unavailable</Text>
        <Text style={styles.body}>This order could not be loaded for invoicing.</Text>
      </View>
    );
  }

  const taxRows = invoiceDraftTaxDisplay(model.tax);
  const status = bundle.invoiceStatus;
  const leftoverDraft = status.action === "view_draft";
  const orderBillable = isSalesOrderInvoiceable(bundle.order);
  const canWrite = status.action === "create" || (leftoverDraft && orderBillable);
  const issued = status.action === "view_invoice";
  const hsnBlock = invoiceHsnIssueBlock(model.lines);

  const persist = async (mode: "draft" | "issue") => {
    if (!canWrite || busy) return;
    if (mode === "issue" && hsnBlock) {
      Alert.alert("Invoice", hsnBlock);
      return;
    }
    setBusy(mode);
    try {
      const issuerSnapshot = buildInvoiceIssuerSnapshot(activeWorkspace!);
      const payload = {
        orgId: orgId!,
        salesOrderId: bundle.order.id,
        clientId: bundle.customer.id,
        clientName: bundle.customer.display_name,
        subtotal: model.tax.taxable_base,
        gstRate: model.tax.gst_rate,
        sgstAmount: model.tax.sgst_amount,
        cgstAmount: model.tax.cgst_amount,
        igstAmount: model.tax.igst_amount,
        totalAmount: model.tax.total_amount,
        notes: model.notes,
        paymentTerms: model.payment_terms,
        draftId: status.action === "view_draft" ? status.invoiceId : null,
        createdBy: user?.id ?? null,
        issuerSnapshot,
        clientSnapshot: {
          client_id: bundle.customer.id,
          legal_name: bundle.customer.legal_name || bundle.customer.display_name,
          gstin: bundle.customer.gstin,
          pan: bundle.customer.pan,
          billing_address: bundle.customer.billing_address,
          state: bundle.customer.state,
          email: bundle.customer.email,
        },
        lineItems: model.lines,
        taxSnapshot: model.tax.snapshot,
      };
      if (mode === "draft") {
        const res = await saveCommerceOrderInvoiceDraft({
          ...payload,
          bundle,
        });
        if (res.error) throw res.error;
      } else {
        const res = await issueCommerceOrderInvoice({
          ...payload,
          idempotencyKey: issueKey.current,
        });
        if (res.error) throw res.error;
        issueKey.current = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
      await qc.invalidateQueries({
        queryKey: queryKeys.invoicing.commerceOrder(orgId!, bundle.order.id),
      });
      await qc.invalidateQueries({ queryKey: queryKeys.invoicing.issued(orgId!) });
      await qc.invalidateQueries({ queryKey: queryKeys.invoicing.drafts(orgId!) });
      if (mode === "issue") router.replace(ROUTES.INVOICING_EXECUTE as never);
    } catch (e) {
      Alert.alert("Invoice", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.kicker}>Create Invoice</Text>
      <Text style={styles.title}>Order #{bundle.order.order_number}</Text>
      <Text style={styles.body}>
        {bundle.customer.display_name} · {bundle.order.status}
        {status.reason ? ` · ${status.reason}` : ""}
      </Text>
      <View style={[styles.split, !desktop && styles.splitStack]}>
        <ScrollView style={styles.col} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <Text style={styles.section}>Invoice details</Text>
          <Text style={styles.meta}>Customer {bundle.customer.display_name}</Text>
          <Text style={styles.meta}>GSTIN {bundle.customer.gstin || "—"}</Text>
          <Text style={styles.meta}>Invoice date {model.preview_date}</Text>
          <Text style={styles.meta}>Due date {model.indicative_due_date || "—"}</Text>
          <Text style={styles.meta}>PO / reference {bundle.order.notes?.trim() || bundle.order.order_number}</Text>
          <Text style={styles.meta}>Place of supply {bundle.customer.state || "—"}</Text>
          <Text style={styles.meta}>Invoice number assigned on issue</Text>
          {hsnBlock ? <Text style={styles.warn}>{hsnBlock}</Text> : null}
          {canWrite ? (
            <View style={styles.row}>
              <Pressable style={styles.secondary} onPress={() => void persist("draft")} disabled={busy != null}>
                <Text style={styles.secondaryText}>{busy === "draft" ? "Saving…" : "Save Draft"}</Text>
              </Pressable>
              <Pressable
                style={styles.primary}
                onPress={() => void persist("issue")}
                disabled={busy != null || Boolean(hsnBlock)}
              >
                <Text style={styles.primaryText}>{busy === "issue" ? "Issuing…" : "Issue"}</Text>
              </Pressable>
            </View>
          ) : leftoverDraft && !orderBillable ? (
            <Text style={styles.meta}>
              Existing draft — order is not Fulfilled, so a new invoice cannot be created or issued.
            </Text>
          ) : issued ? (
            <Text style={styles.meta}>Issued {status.invoiceNumber}</Text>
          ) : null}
          {status.action === "view_draft" && status.invoiceId ? (
            <Pressable
              style={[styles.secondary, { marginTop: 8 }]}
              onPress={() => {
                void (async () => {
                  const res = await cancelCommerceOrderInvoiceDraft({
                    orgId: orgId!,
                    draftId: status.invoiceId!,
                  });
                  if (res.error) {
                    Alert.alert("Invoice", res.error.message);
                    return;
                  }
                  await qc.invalidateQueries({
                    queryKey: queryKeys.invoicing.commerceOrder(orgId!, bundle.order.id),
                  });
                })();
              }}
            >
              <Text style={styles.secondaryText}>Cancel Draft</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        <ScrollView style={styles.col} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <Text style={styles.section}>Invoice Preview</Text>
          <Text style={styles.meta}>Bill To {model.client.display_name}</Text>
          <Text style={styles.meta}>Order #{bundle.order.order_number}</Text>
          {model.lines.map((line, i) => (
            <View key={`${line.trip_ref}-${i}`} style={styles.line}>
              <Text style={styles.lineTitle}>
                {line.trip_ref ? `${line.trip_ref}  ` : ""}
                {line.hsn_sac ? `HSN ${line.hsn_sac}  ` : "HSN incomplete  "}
                {line.description}
              </Text>
              <Text style={styles.meta}>
                Qty {line.qty} · ₹{line.rate.toLocaleString("en-IN")} · ₹
                {line.taxable_value.toLocaleString("en-IN")}
              </Text>
            </View>
          ))}
          {taxRows.rows.map((row) => (
            <Text key={row.key} style={styles.meta}>
              {row.label} {row.value}
            </Text>
          ))}
          <Text style={styles.total}>
            Grand total ₹{model.tax.total_amount.toLocaleString("en-IN")}
          </Text>
          <Text style={styles.draftLabel}>{model.invoice_number_label}</Text>
          <View style={styles.pdfWrap}>
            <InvoicePdf invoiceData={mapInvoiceDraftModelToPdfData(model)} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.screenBackground, paddingHorizontal: 16 },
  kicker: { fontSize: 11, color: Theme.textMuted, letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 22, fontWeight: "700", color: Theme.textPrimary, marginTop: 4 },
  body: { marginTop: 6, color: Theme.textSecondary, fontSize: 13 },
  split: { flex: 1, flexDirection: "row", gap: 16, marginTop: 16 },
  splitStack: { flexDirection: "column" },
  col: { flex: 1 },
  section: { fontSize: 14, fontWeight: "600", color: Theme.textPrimary, marginBottom: 8 },
  meta: { fontSize: 12, color: Theme.textSecondary, marginBottom: 4 },
  row: { flexDirection: "row", gap: 8, marginTop: 16 },
  primary: {
    backgroundColor: Theme.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  primaryText: { color: Theme.textOnPrimary, fontWeight: "600" },
  secondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  secondaryText: { color: Theme.textPrimary, fontWeight: "600" },
  line: { marginBottom: 10 },
  lineTitle: { fontSize: 13, color: Theme.textPrimary },
  total: { marginTop: 12, fontSize: 16, fontWeight: "700", color: Theme.textPrimary },
  draftLabel: { marginTop: 6, fontSize: 11, color: Theme.textMuted },
  warn: { marginTop: 8, fontSize: 12, color: Theme.destructive, lineHeight: 16 },
  pdfWrap: { marginTop: 16, minHeight: 320 },
});
