import Theme from "@/constants/Theme";
import { useClientTdsRate } from "@/features/invoicing/hooks/useClientTdsRate";
import { invalidateFinanceBalances } from "@/features/invoicing/components/finance/PaymentReceiptSheet";
import { invalidateSharedCustomerLedger } from "@/features/invoicing/hooks/useInvoiceCustomerLedger";
import { useInvoiceSettlements } from "@/features/invoicing/hooks/useInvoiceSettlements";
import { captureCustomerReceipt } from "@/features/invoicing/services/customerReceipt.service";
import { newFinanceKey } from "@/features/invoicing/services/financeBooks.service";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import { expectedAfterTds, tdsForBankCredit } from "@/features/invoicing/utils/clientTds.util";
import {
  allocateCustomerReceipt,
  planTripReceive,
  receiveStatus,
  receiveStatusLabel,
  receiptTargetFromInvoice,
} from "@/features/invoicing/utils/customerReceipt.util";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** Same receipt as Accounts Receivable, locked to one invoice. */
export function InvoiceCaptureButton({
  orgId,
  clientId,
  clientName,
  invoice,
  trips,
  onRecorded,
}: {
  orgId: string | null;
  clientId: string | null;
  clientName: string | null;
  invoice: IssuedInvoiceListRow;
  trips: readonly InvoicingTripView[];
  onRecorded?: () => void;
}) {
  const clientTds = useClientTdsRate(orgId, clientId);
  const [open, setOpen] = useState(false);
  const [cashText, setCashText] = useState("");
  const [tdsOn, setTdsOn] = useState(false);
  const [percentText, setPercentText] = useState("");
  const [cashTouched, setCashTouched] = useState(false);
  const [percentTouched, setPercentTouched] = useState(false);
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tripEdits, setTripEdits] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const captureKey = useRef<string | null>(null);
  // Settled amount comes from the invoice payment ledger; unknown means no capture.
  const settlements = useInvoiceSettlements(orgId, [invoice.id]);
  const settled = settlements.settledOf(invoice.id);
  const target = useMemo(
    () =>
      settled === undefined
        ? null
        : receiptTargetFromInvoice({
            ...invoice,
            receiptApplied: settled,
          }),
    [invoice, settled],
  );
  const cash = Number(cashText.replace(/,/g, "")) || 0;
  const tdsPercent = tdsOn ? Number(percentText.replace(/,/g, "")) || 0 : 0;
  const expected = expectedAfterTds(target?.balance ?? 0, tdsPercent);
  const tds = cashTouched ? tdsForBankCredit(cash, tdsPercent) : expected.tds;
  const allocation = useMemo(
    () =>
      target
        ? allocateCustomerReceipt({
            targets: [target],
            cash,
            tds,
            mode: "invoice",
            invoiceIds: [invoice.id],
            bucket: null,
          })
        : null,
    [cash, invoice.id, target, tds],
  );
  const anchors = useMemo(() => {
    const wanted = new Set(invoice.trip_ids);
    return trips
      .filter((trip) => wanted.has(trip.id) || wanted.has(trip.internal_id))
      .map((trip) => ({
        id: trip.internal_id || trip.id,
        sales: trip.amount,
        tripNumber: trip.trip_number || trip.lr_number || trip.id,
        label: trip.lr_number?.trim() || trip.trip_number || trip.id,
      }));
  }, [invoice.trip_ids, trips]);

  useEffect(() => {
    captureKey.current = null;
  }, [cashText, reference, paidOn, tdsOn, percentText, tripEdits]);
  useEffect(() => {
    if (!open || !clientTds.ready || percentTouched) return;
    setPercentText(clientTds.percent > 0 ? String(clientTds.percent) : "");
    setTdsOn(clientTds.percent > 0);
  }, [clientTds.percent, clientTds.ready, open, percentTouched]);
  useEffect(() => {
    if (!open || cashTouched || !target) return;
    const split = expectedAfterTds(target.balance, tdsOn ? Number(percentText.replace(/,/g, "")) || 0 : 0);
    setCashText(split.bank > 0 ? String(split.bank) : String(target.balance));
  }, [cashTouched, open, percentText, target, tdsOn]);

  if (!target || !allocation) return null;

  const record = async () => {
    if (!orgId || busy || allocation.applied <= 0) return;
    if (allocation.unapplied > 0.009) {
      setNote("The receipt is larger than this invoice's outstanding balance.");
      return;
    }
    captureKey.current = captureKey.current ?? newFinanceKey("capture");
    setBusy(true);
    setNote(null);
    const preview = planTripReceive({
      invoiceId: invoice.id,
      applied: allocation.lines[0]?.applied ?? 0,
      percent: tdsPercent,
      trips: anchors,
      edits: tripEdits,
    });
    const touched = preview.some((row) => row.edited);
    const applied = Math.round(preview.reduce((sum, row) => sum + row.applied, 0) * 100) / 100;
    const postedCash = touched ? Math.round(preview.reduce((sum, row) => sum + row.receive, 0) * 100) / 100 : cash;
    const postedTds = touched ? Math.round(preview.reduce((sum, row) => sum + row.tds, 0) * 100) / 100 : tds;
    const lines = allocation.lines.map((row) => {
      if (!touched) return row;
      const status = receiveStatus(row.balance, applied);
      const remaining = Math.max(0, Math.round((row.balance - applied) * 100) / 100);
      return { ...row, applied, remaining, cleared: status === "paid" };
    });
    const result = await captureCustomerReceipt({
      orgId,
      clientId,
      clientName: clientName || invoice.client_name || "Customer",
      cash: postedCash,
      tds: postedTds,
      reference,
      date: paidOn,
      lines,
      idempotencyKey: captureKey.current,
      tripsByInvoice: { [invoice.id]: anchors },
      slicesByInvoice: touched
        ? {
            [invoice.id]: preview
              .filter((row) => row.applied > 0)
              .map((row) => ({ tripId: row.tripId, applied: row.applied, cash: row.receive, tds: row.tds })),
          }
        : undefined,
    });
    setBusy(false);
    if (result.error) {
      setNote(result.error.message);
      return;
    }
    captureKey.current = null;
    await invalidateFinanceBalances(queryClient, orgId);
    await invalidateSharedCustomerLedger(queryClient, orgId);
    setOpen(false);
    setCashText("");
    setPercentText("");
    setPercentTouched(false);
    setTdsOn(false);
    setCashTouched(false);
    setReference("");
    setTripEdits({});
    onRecorded?.();
  };

  const line = allocation.lines[0];
  const preview = line
    ? planTripReceive({
        invoiceId: invoice.id,
        applied: line.applied,
        percent: tdsPercent,
        trips: anchors,
        edits: tripEdits,
      })
    : [];
  const editedApplied = Math.round(preview.reduce((sum, row) => sum + row.applied, 0) * 100) / 100;
  const invoiceStatus = line ? receiveStatus(line.balance, editedApplied) : "unpaid";
  const tdsTotal = preview.reduce((sum, row) => sum + row.tds, 0);
  const receiveTotal = preview.reduce((sum, row) => sum + row.receive, 0);

  return (
    <>
      <Pressable
        style={styles.button}
        onPress={() => {
          setCashTouched(false);
          setPercentTouched(false);
          setNote(null);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Capture payment"
      >
        <Text style={styles.buttonText}>Capture payment</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.title}>Capture payment</Text>
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close capture payment">
                <Text style={styles.close}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>
              {invoice.invoice_number} · {inr(target.balance)} open
              {clientTds.percent > 0 ? ` · ${clientTds.percent}% TDS` : ""}
            </Text>
            <Text style={styles.label}>{tdsOn ? "Expected payment after TDS" : "Received in bank"}</Text>
            <TextInput
              value={cashText}
              onChangeText={(value) => {
                setCashTouched(true);
                setCashText(value);
              }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={Theme.textMuted}
              style={styles.input}
              accessibilityLabel="Amount received"
            />
            <Pressable
              style={[styles.chip, tdsOn && styles.chipOn]}
              onPress={() => {
                setCashTouched(false);
                setTdsOn((current) => !current);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: tdsOn }}
            >
              <Text style={styles.choice}>TDS deducted by client</Text>
            </Pressable>
            {tdsOn ? (
              <>
                <Text style={styles.label}>TDS %</Text>
                <TextInput
                  value={percentText}
                  onChangeText={(value) => {
                    setPercentTouched(true);
                    setCashTouched(false);
                    setPercentText(value.replace(/[^0-9.]/g, ""));
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Theme.textMuted}
                  style={styles.input}
                  accessibilityLabel="TDS percent"
                />
                <Text style={styles.choice}>TDS amount {inr(tds)}</Text>
                <Text style={styles.choice}>Expected payment after TDS {inr(cashTouched ? cash : expected.bank)}</Text>
              </>
            ) : null}
            <Text style={styles.label}>Reference</Text>
            <TextInput
              value={reference}
              onChangeText={setReference}
              placeholder="UTR or cheque"
              placeholderTextColor={Theme.textMuted}
              style={styles.input}
              accessibilityLabel="Payment reference"
            />
            <Text style={styles.label}>Date</Text>
            <TextInput
              value={paidOn}
              onChangeText={setPaidOn}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Theme.textMuted}
              style={styles.input}
              accessibilityLabel="Payment date"
            />
            {line && preview.length > 0 ? (
              <Text style={styles.choice}>
                {preview.length} trip{preview.length === 1 ? "" : "s"}
                {` · TDS ${inr(tdsTotal)} · To receive ${inr(receiveTotal)} · ${receiveStatusLabel(invoiceStatus)}`}
              </Text>
            ) : null}
            {preview.length > 0 ? (
              <View style={styles.tripRow}>
                <Text style={[styles.tripName, styles.headText]}>Trip</Text>
                <Text style={[styles.tripMeta, styles.headText]}>TDS</Text>
                <Text style={[styles.tripMeta, styles.headText]}>To receive</Text>
                <Text style={[styles.statusCol, styles.headText]}>Status</Text>
                <Text style={styles.fullCol} />
              </View>
            ) : null}
            {preview.map((slice) => (
              <View key={slice.tripId} style={styles.tripRow}>
                <Text style={styles.tripName} numberOfLines={1}>{slice.label}</Text>
                <Text style={styles.tripMeta}>{inr(slice.tds)}</Text>
                <TextInput
                  value={tripEdits[`${invoice.id}:${slice.tripId}`] ?? String(slice.receive)}
                  onChangeText={(value) =>
                    setTripEdits((current) => ({
                      ...current,
                      [`${invoice.id}:${slice.tripId}`]: value.replace(/[^0-9.]/g, ""),
                    }))
                  }
                  keyboardType="decimal-pad"
                  style={styles.tripInput}
                  accessibilityLabel={`Amount to receive for ${slice.label}`}
                />
                <Text style={styles.statusCol}>{receiveStatusLabel(slice.status)}</Text>
                <Pressable
                  style={styles.fullBtn}
                  onPress={() =>
                    setTripEdits((current) => ({
                      ...current,
                      [`${invoice.id}:${slice.tripId}`]: String(slice.fullReceive),
                    }))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${slice.label} paid in full`}
                >
                  <Text style={styles.fullText}>Full</Text>
                </Pressable>
              </View>
            ))}
            {note ? <Text style={styles.note}>{note}</Text> : null}
            <View style={styles.foot}>
              <Pressable
                style={[styles.button, (busy || allocation.applied <= 0 || !orgId) && styles.off]}
                disabled={busy || allocation.applied <= 0 || !orgId}
                onPress={() => {
                  void record();
                }}
                accessibilityRole="button"
                accessibilityLabel="Record receipt"
              >
                <Text style={styles.buttonText}>{busy ? "Recording…" : "Record receipt"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  buttonText: { fontSize: 12, fontWeight: "500", color: Theme.buttonDarkText },
  off: { opacity: 0.45 },
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 640,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 15, fontWeight: "500", color: Theme.textPrimaryDark },
  close: { fontSize: 12, fontWeight: "500", color: Theme.primary },
  hint: { fontSize: 12, fontWeight: "400", color: Theme.textMuted },
  tripRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  tripName: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  tripInput: {
    width: 88,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    paddingHorizontal: 8,
    fontSize: 12,
    color: Theme.textPrimaryDark,
  },
  tripMeta: { width: 88, fontSize: 11, fontWeight: "400", color: Theme.textSecondary },
  headText: { fontSize: 10, fontWeight: "500", color: Theme.textMuted },
  statusCol: { width: 92, fontSize: 11, fontWeight: "500", color: Theme.textPrimaryDark },
  fullCol: { width: 52 },
  fullBtn: {
    width: 52,
    minHeight: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  fullText: { fontSize: 11, fontWeight: "500", color: Theme.buttonDarkText },
  label: { fontSize: 11, fontWeight: "400", color: Theme.textMuted },
  input: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  chip: {
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  chipOn: { borderColor: Theme.primary, backgroundColor: Theme.surface },
  choice: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  note: { fontSize: 12, fontWeight: "400", color: Theme.textSecondary },
  foot: { flexDirection: "row", justifyContent: "flex-end" },
});
