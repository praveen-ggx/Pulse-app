import Theme from "@/constants/Theme";
import type { InvoiceLineSnapshot } from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import {
  buildManualInvoiceLines,
  emptyManualInvoiceLine,
  type ManualInvoiceLineDraft,
} from "@/features/invoicing/utils/manualInvoice.util";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

export function FinanceManualInvoicePanel({
  clientName,
  invoiceDate,
  dueDate,
  poReference,
  paymentTerms,
  placeOfSupply,
  lines,
  onBack,
  onInvoiceDate,
  onDueDate,
  onPoReference,
  onPaymentTerms,
  onLines,
  onLinesBuilt,
}: {
  clientName: string;
  invoiceDate: string;
  dueDate: string;
  poReference: string;
  paymentTerms: string;
  placeOfSupply: string;
  lines: ManualInvoiceLineDraft[];
  onBack?: () => void;
  onInvoiceDate: (v: string) => void;
  onDueDate: (v: string) => void;
  onPoReference: (v: string) => void;
  onPaymentTerms: (v: string) => void;
  onLines: (next: ManualInvoiceLineDraft[]) => void;
  onLinesBuilt: (lines: InvoiceLineSnapshot[]) => void;
}) {
  useEffect(() => {
    onLinesBuilt(buildManualInvoiceLines(lines));
  }, [lines, onLinesBuilt]);

  const patch = (id: string, part: Partial<ManualInvoiceLineDraft>) => {
    onLines(lines.map((row) => (row.id === id ? { ...row, ...part } : row)));
  };

  const subtotal = lines.reduce((sum, line) => sum + lineAmount(line), 0);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        {onBack ? (
          <Pressable
            style={styles.back}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back to trips"
            hitSlop={8}
          >
            <Text style={styles.backText}>← Trips</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Text style={styles.topTitle}>Manual invoice</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.sheet}>
          <Text style={styles.kicker}>Bill to</Text>
          <Text style={styles.client}>{clientName}</Text>
          <Text style={styles.hint}>
            Name, GSTIN, and billing address come from the client record.
          </Text>

          <View style={styles.grid}>
            <View style={styles.gridCell}>
              <Field label="Invoice date" value={invoiceDate} onChange={onInvoiceDate} />
            </View>
            <View style={styles.gridCell}>
              <Field label="Due date" value={dueDate} onChange={onDueDate} placeholder="Due date" />
            </View>
            <View style={styles.gridCell}>
              <Field label="PO / Reference" value={poReference} onChange={onPoReference} placeholder="PO / Reference" />
            </View>
            <View style={styles.gridCell}>
              <Field label="Payment terms" value={paymentTerms} onChange={onPaymentTerms} />
            </View>
          </View>

          <View style={styles.supply}>
            <Text style={styles.supplyLabel}>Place of supply</Text>
            <Text style={styles.supplyValue}>{placeOfSupply || "Not set"}</Text>
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.section}>Line items</Text>
            <Text style={styles.sectionMeta}>{lines.length}</Text>
          </View>

          {lines.map((line, index) => {
            const amount = lineAmount(line);
            return (
              <View key={line.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.lineNo}>Line {index + 1}</Text>
                  <Text style={styles.lineAmount}>{formatInr(amount)}</Text>
                </View>
                <Field label="Description" value={line.description} onChange={(description) => patch(line.id, { description })} placeholder="What was supplied" />
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Field label="SKU" value={line.sku} onChange={(sku) => patch(line.id, { sku })} placeholder="SKU" />
                  </View>
                  <View style={styles.flex}>
                    <Field
                      label="HSN/SAC"
                      value={line.hsnSac}
                      onChange={(hsnSac) => patch(line.id, { hsnSac })}
                      keyboard="number-pad"
                      placeholder="HSN/SAC"
                    />
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Field label="Qty" value={line.qty} onChange={(qty) => patch(line.id, { qty })} keyboard="decimal-pad" />
                  </View>
                  <View style={styles.flex}>
                    <Field label="Rate" value={line.rate} onChange={(rate) => patch(line.id, { rate })} keyboard="decimal-pad" placeholder="0.00" />
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Field
                      label="Discount"
                      value={line.discount}
                      onChange={(discount) => patch(line.id, { discount })}
                      keyboard="decimal-pad"
                    />
                  </View>
                  <View style={styles.flex}>
                    <Field
                      label="Tax rate %"
                      value={line.taxRate}
                      onChange={(taxRate) => patch(line.id, { taxRate })}
                      keyboard="decimal-pad"
                    />
                  </View>
                </View>
                {lines.length > 1 ? (
                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => onLines(lines.filter((row) => row.id !== line.id))}
                    accessibilityRole="button"
                    accessibilityLabel="Remove line"
                  >
                    <Text style={styles.remove}>Remove line</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          <Pressable
            style={styles.add}
            onPress={() => onLines([...lines, emptyManualInvoiceLine()])}
            accessibilityRole="button"
            accessibilityLabel="Add line"
          >
            <Text style={styles.addText}>+ Add line</Text>
          </Pressable>

          <View style={styles.totalBar}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatInr(subtotal)}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function lineAmount(line: ManualInvoiceLineDraft): number {
  const qty = Number(line.qty);
  const rate = Number(line.rate);
  const discount = Number(line.discount || 0);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate < 0) return 0;
  return Math.max(0, qty * rate - (Number.isFinite(discount) ? discount : 0));
}

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function Field({
  label,
  value,
  onChange,
  keyboard,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: "number-pad" | "decimal-pad";
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? label}
        placeholderTextColor={Theme.textMuted}
        keyboardType={keyboard}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.screenBackground },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  back: {
    minHeight: 44,
    justifyContent: "center",
    paddingRight: 8,
  },
  backText: { fontSize: 13, fontWeight: "500", color: Theme.primary },
  topTitle: { fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark },
  scroll: { flex: 1 },
  content: { padding: 12, paddingBottom: 28 },
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    padding: 14,
  },
  kicker: { fontSize: 11, fontWeight: "400", color: Theme.textMuted },
  client: { marginTop: 2, fontSize: 18, fontWeight: "500", color: Theme.textPrimaryDark },
  hint: { marginTop: 4, fontSize: 12, fontWeight: "400", color: Theme.textSecondary, lineHeight: 16 },
  grid: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridCell: { flexGrow: 1, flexBasis: 180, minWidth: 140 },
  supply: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Theme.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  supplyLabel: { fontSize: 12, fontWeight: "400", color: Theme.textMuted },
  supplyValue: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  sectionRow: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  section: { fontSize: 13, fontWeight: "500", color: Theme.primary },
  sectionMeta: { fontSize: 12, fontWeight: "400", color: Theme.textMuted },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: Theme.surface,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  lineNo: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  lineAmount: { fontSize: 13, fontWeight: "500", color: Theme.primary },
  field: { marginBottom: 8 },
  label: { fontSize: 11, fontWeight: "400", color: Theme.textMuted, marginBottom: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 40,
    color: Theme.textPrimaryDark,
    fontSize: 13,
    fontWeight: "400",
    backgroundColor: Theme.cardWhite,
  },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  add: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  addText: { color: Theme.primary, fontWeight: "500", fontSize: 13 },
  removeBtn: { alignSelf: "flex-start", minHeight: 36, justifyContent: "center" },
  remove: { color: Theme.destructive, fontSize: 12, fontWeight: "500" },
  totalBar: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Theme.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  totalLabel: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary },
  totalValue: { fontSize: 15, fontWeight: "500", color: Theme.primary },
});
