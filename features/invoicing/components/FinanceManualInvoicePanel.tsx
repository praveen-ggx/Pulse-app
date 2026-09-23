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

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Manual Invoice</Text>
      <Text style={styles.title}>{clientName}</Text>
      <Text style={styles.hint}>
        Client name, GSTIN, and billing address come from the client record.
      </Text>
      <Field label="Invoice date" value={invoiceDate} onChange={onInvoiceDate} />
      <Field label="Due date" value={dueDate} onChange={onDueDate} />
      <Field label="PO / Reference" value={poReference} onChange={onPoReference} />
      <Field label="Payment terms" value={paymentTerms} onChange={onPaymentTerms} />
      <Text style={styles.meta}>Place of supply {placeOfSupply || "—"}</Text>
      <Text style={styles.section}>Line items</Text>
      {lines.map((line, index) => (
        <View key={line.id} style={styles.card}>
          <Text style={styles.lineNo}>Line {index + 1}</Text>
          <Field label="SKU" value={line.sku} onChange={(sku) => patch(line.id, { sku })} />
          <Field
            label="HSN/SAC"
            value={line.hsnSac}
            onChange={(hsnSac) => patch(line.id, { hsnSac })}
            keyboard="number-pad"
          />
          <Field
            label="Description"
            value={line.description}
            onChange={(description) => patch(line.id, { description })}
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label="Qty" value={line.qty} onChange={(qty) => patch(line.id, { qty })} keyboard="decimal-pad" />
            </View>
            <View style={styles.flex}>
              <Field label="Rate" value={line.rate} onChange={(rate) => patch(line.id, { rate })} keyboard="decimal-pad" />
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
                label="Tax rate"
                value={line.taxRate}
                onChange={(taxRate) => patch(line.id, { taxRate })}
                keyboard="decimal-pad"
              />
            </View>
          </View>
          {lines.length > 1 ? (
            <Pressable
              onPress={() => onLines(lines.filter((row) => row.id !== line.id))}
              accessibilityRole="button"
              accessibilityLabel="Remove line"
            >
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <Pressable
        style={styles.add}
        onPress={() => onLines([...lines, emptyManualInvoiceLine()])}
        accessibilityRole="button"
        accessibilityLabel="Add line"
      >
        <Text style={styles.addText}>+ Add Line</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: "number-pad" | "decimal-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={Theme.textMuted}
        keyboardType={keyboard}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 12, paddingBottom: 24 },
  kicker: { fontSize: 10, color: Theme.textMuted, letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 16, fontWeight: "700", color: Theme.textPrimary, marginTop: 2 },
  hint: { marginTop: 4, fontSize: 11, color: Theme.textSecondary, lineHeight: 15 },
  section: { marginTop: 14, marginBottom: 6, fontSize: 12, fontWeight: "700", color: Theme.textPrimary },
  meta: { marginTop: 8, fontSize: 11, color: Theme.textSecondary },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  lineNo: { fontSize: 10, fontWeight: "700", color: Theme.textMuted, marginBottom: 6 },
  field: { marginBottom: 8 },
  label: { fontSize: 10, color: Theme.textMuted, marginBottom: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    minHeight: 36,
    color: Theme.textPrimary,
    fontSize: 13,
  },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  add: { minHeight: 36, justifyContent: "center" },
  addText: { color: Theme.primary, fontWeight: "700", fontSize: 13 },
  remove: { marginTop: 4, color: Theme.destructive, fontSize: 12, fontWeight: "600" },
});
