import Theme from "@/constants/Theme";
import { useClientTdsRate } from "@/features/invoicing/hooks/useClientTdsRate";
import { useInvoiceCustomerLedger, invalidateSharedCustomerLedger } from "@/features/invoicing/hooks/useInvoiceCustomerLedger";
import { useWorkspaceFinance } from "@/features/invoicing/hooks/useWorkspaceFinance";
import { TripExcelColumnHeader } from "@/features/invoicing/components/TripExcelColumnHeader";
import { useInvoiceSettlements } from "@/features/invoicing/hooks/useInvoiceSettlements";
import { fetchCustomerReceipts } from "@/features/invoicing/services/customerReceiptList.service";
import { captureCustomerReceipt } from "@/features/invoicing/services/customerReceipt.service";
import { invalidateFinanceBalances } from "@/features/invoicing/components/finance/PaymentReceiptSheet";
import { PAYMENT_MODE_LABELS, newFinanceKey, type PaymentMode } from "@/features/invoicing/services/financeBooks.service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { expectedAfterTds, tdsForBankCredit } from "@/features/invoicing/utils/clientTds.util";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import {
  allocateCustomerReceipt,
  planTripReceive,
  receiptTargetFromInvoice,
  receiveStatus,
  receiveStatusLabel,
} from "@/features/invoicing/utils/customerReceipt.util";
import { noteIdsOnInvoices, openNoteDeltaByTrip } from "@/features/invoicing/utils/workspaceFinance.util";
import {
  AR_BUCKETS,
  AR_SHEET_COLUMNS,
  applyArFilter,
  applyNoteDeltas,
  applyArSheetFilters,
  arSheetChoices,
  buildArBook,
  sortArSheet,
    type ArAgingScope,
  type ArBucket,
  type ArFilter,
  type ArKpi,
  type ArPod,
  type ArSheetFilters,
  type ArSheetSort,
} from "@/features/invoicing/utils/invoiceAr.util";
import { invoiceTripAdjustedAmount } from "@/features/invoicing/services/invoiceCnDn.service";
import { ProvisionAdjustmentModal } from "@/features/trips/components/trip-detail/adjustment/ProvisionAdjustmentModal";
import {
  addTripAdjustment,
  updateTripAdjustment,
  type TripAdjustment,
} from "@/features/trips/services/tripAdjustments";
import {
  adjustmentsForTripId,
  useInvalidateTripFinanceAdjustments,
  useTripFinanceAdjustmentsMap,
} from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const EMPTY_FILTER: ArFilter = {
  kpi: null,
  bucket: null,
  pod: null,
  agingScope: null,
};

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function podLabel(pod: ArPod): string {
  if (pod === "received") return "POD received";
  if (pod === "digital") return "Digital POD";
  return "POD pending";
}

export function InvoiceArPanel({
  orgId,
  clientId,
  clientName,
  trips,
  invoices,
  onRecorded,
  onTripsChanged,
  captureOnly = false,
}: {
  orgId: string | null;
  clientId: string | null;
  clientName: string | null;
  trips: readonly InvoicingTripView[];
  invoices: readonly IssuedInvoiceListRow[];
  onRecorded?: () => void;
  onTripsChanged?: () => void;
  /** Button and capture sheet only, for the customer ledger. */
  captureOnly?: boolean;
}) {
  const clientTds = useClientTdsRate(orgId, clientId);
  const customerLedger = useInvoiceCustomerLedger(orgId, clientId);
  const workspace = useWorkspaceFinance({ orgId, clientId, clientName, trips });
  const [filter, setFilter] = useState<ArFilter>(EMPTY_FILTER);
  const [sheetFilters, setSheetFilters] = useState<ArSheetFilters>({});
  const [sheetSort, setSheetSort] = useState<ArSheetSort>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<"invoice" | "aging">("invoice");
  const [cashText, setCashText] = useState("");
  const [tdsOn, setTdsOn] = useState(false);
  const [percentText, setPercentText] = useState("");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [agingBucket, setAgingBucket] = useState<ArBucket | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureNote, setCaptureNote] = useState<string | null>(null);
  const [cashTouched, setCashTouched] = useState(false);
  const [percentTouched, setPercentTouched] = useState(false);
  const [cnDnTripId, setCnDnTripId] = useState<string | null>(null);
  const [cnDnEdit, setCnDnEdit] = useState<TripAdjustment | null>(null);
  const [tripEdits, setTripEdits] = useState<Record<string, string>>({});
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("neft");
  const captureKey = useRef<string | null>(null);
  const queryClient = useQueryClient();
  // Settled = confirmed receipts + credit notes from the invoice payment ledger.
  const settlements = useInvoiceSettlements(
    orgId,
    invoices.filter((invoice) => invoice.status === "sent" || invoice.status === "paid").map((invoice) => invoice.id),
  );
  const ledgerReceipts = useQuery({
    queryKey: ["customer-receipts", orgId, clientId, clientName],
    queryFn: () => fetchCustomerReceipts({ orgId: orgId!, clientId, clientName }),
    enabled: Boolean(orgId && clientName) && settlements.unavailable,
    staleTime: 15_000,
  });
  const usingLedgerReceipts = settlements.unavailable && ledgerReceipts.isSuccess && !ledgerReceipts.data?.error;
  const receivedByInvoice = useMemo(() => {
    const map = new Map<string, number>();
    if (!usingLedgerReceipts) return map;
    for (const receipt of ledgerReceipts.data?.receipts ?? []) {
      if (!receipt.invoiceNumber) continue;
      map.set(receipt.invoiceNumber, Math.round(((map.get(receipt.invoiceNumber) ?? 0) + receipt.total) * 100) / 100);
    }
    return map;
  }, [ledgerReceipts.data, usingLedgerReceipts]);
  const canSettle = settlements.ready || usingLedgerReceipts;
  const receivedOf = (invoice: IssuedInvoiceListRow): number | undefined => {
    if (settlements.ready) return settlements.settledOf(invoice.id);
    if (usingLedgerReceipts) return receivedByInvoice.get(invoice.invoice_number) ?? 0;
    return undefined;
  };
  const rawBook = useMemo(
    () =>
      buildArBook(
        trips.map((trip) => ({
          id: trip.id,
          internalId: trip.internal_id || trip.id,
          lr: trip.lr_number,
          route: trip.route,
          date: trip.date,
          sales: trip.amount,
          invoicedFlag: trip.invoiced,
          physicalPod: trip.physicalPodReceived === true,
          digitalPod: trip.digitalPodPresent === true,
        })),
        invoices.map((invoice) => ({
          invoiceNumber: invoice.invoice_number,
          invoiceDate: invoice.invoice_date,
          dueDate: invoice.due_date,
          status: invoice.status,
          totalAmount: invoice.total_amount,
          tripIds: invoice.trip_ids,
          amountReceived: receivedOf(invoice) ?? 0,
        })),
        new Date(),
        clientTds.percent,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- receivedOf reads the settlements query
    [invoices, trips, clientTds.percent, settlements.ready, settlements.settledOf, usingLedgerReceipts, receivedByInvoice],
  );
  const book = useMemo(
    () =>
      applyNoteDeltas(
        rawBook,
        openNoteDeltaByTrip(
          workspace.notes,
          new Set(invoices.flatMap((invoice) => invoice.trip_ids)),
          noteIdsOnInvoices(invoices),
        ),
      ),
    [invoices, rawBook, workspace.notes],
  );
  const openInvoices = useMemo(
    () => invoices.flatMap((invoice) => {
      const settled = receivedOf(invoice);
      if (settled === undefined) return [];
      const target = receiptTargetFromInvoice({
        ...invoice,
        receiptApplied: settled,
      });
      return target ? [target] : [];
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- receivedOf reads the settlements query
    [invoices, settlements.ready, settlements.settledOf, usingLedgerReceipts, receivedByInvoice],
  );
  const cash = Number(cashText.replace(/,/g, "")) || 0;
  const tdsPercent = tdsOn ? Number(percentText.replace(/,/g, "")) || 0 : 0;
  const captureGross = openInvoices.reduce((sum, invoice) => {
    if (captureMode === "aging") {
      return agingBucket && invoice.bucket === agingBucket ? sum + invoice.balance : sum;
    }
    if (pickedIds.includes(invoice.id)) return sum + invoice.balance;
    return sum;
  }, 0);
  const expected = expectedAfterTds(captureGross, tdsPercent);
  const tds = cashTouched ? tdsForBankCredit(cash, tdsPercent) : expected.tds;
  const tripsFor = (invoiceId: string) => {
    const invoice = invoices.find((row) => row.id === invoiceId);
    const wanted = new Set(invoice?.trip_ids ?? []);
    return trips
      .filter((trip) => wanted.has(trip.id) || wanted.has(trip.internal_id))
      .map((trip) => ({
        id: trip.internal_id || trip.id,
        sales: trip.amount,
        tripNumber: trip.trip_number || trip.lr_number || trip.id,
        label: trip.lr_number?.trim() || trip.trip_number || trip.id,
      }));
  };
  const allocation = useMemo(
    () =>
      allocateCustomerReceipt({
        targets: openInvoices,
        cash,
        tds,
        mode: captureMode,
        invoiceIds: pickedIds,
        bucket: agingBucket,
      }),
    [agingBucket, captureMode, cash, openInvoices, pickedIds, tds],
  );
  const narrowed = useMemo(() => applyArFilter(book.lines, filter), [book.lines, filter]);
  const rows = useMemo(
    () => sortArSheet(applyArSheetFilters(narrowed, sheetFilters), sheetSort),
    [narrowed, sheetFilters, sheetSort],
  );
  const filtering =
    filter.kpi != null ||
    filter.bucket != null ||
    filter.pod != null ||
    filter.agingScope != null ||
    AR_SHEET_COLUMNS.some((column) => sheetFilters[column] != null) ||
    sheetSort != null;

  const toggleKpi = (kpi: ArKpi) => {
    setFilter((current) => ({
      ...current,
      kpi: current.kpi === kpi || kpi === "sales" ? null : kpi,
    }));
  };
  const toggleBucket = (bucket: ArBucket, agingScope: ArAgingScope) => {
    setFilter((current) => {
      const same = current.bucket === bucket && current.agingScope === agingScope;
      return {
        ...current,
        bucket: same ? null : bucket,
        agingScope: same ? null : agingScope,
      };
    });
  };
  const togglePod = (pod: ArPod) => {
    setFilter((current) => {
      const same = current.pod === pod;
      return {
        ...current,
        pod: same ? null : pod,
        kpi: same ? (current.kpi === "uninvoiced" ? null : current.kpi) : "uninvoiced",
      };
    });
  };

  useEffect(() => {
    // Any change to the receipt is a new intent; an unchanged retry reuses the key.
    captureKey.current = null;
  }, [cashText, reference, paidOn, pickedIds, tdsOn, percentText, paymentMode, tripEdits, captureMode, agingBucket]);
  useEffect(() => {
    if (!captureOpen || !clientTds.ready) return;
    if (!percentTouched) {
      setPercentText(clientTds.percent > 0 ? String(clientTds.percent) : "");
      setTdsOn(clientTds.percent > 0);
    }
  }, [captureOpen, clientTds.percent, clientTds.ready, percentTouched]);
  useEffect(() => {
    if (!captureOpen || cashTouched) return;
    const split = expectedAfterTds(captureGross, tdsOn ? Number(percentText.replace(/,/g, "")) || 0 : 0);
    setCashText(split.bank > 0 ? String(split.bank) : captureGross > 0 ? String(captureGross) : "");
  }, [captureGross, captureOpen, cashTouched, percentText, tdsOn]);

  if (!clientName) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Select a client</Text>
        <Text style={styles.emptyBody}>
          Accounts receivable, aging, and POD status follow the client on the left.
        </Text>
      </View>
    );
  }

  const maxOpen = Math.max(1, ...AR_BUCKETS.map((bucket) => book.openAging[bucket.key]));
  const maxUnbilled = Math.max(
    1,
    ...AR_BUCKETS.map((bucket) => book.uninvoicedAging[bucket.key]),
  );

  const selectionMissing = captureMode === "invoice" && pickedIds.length === 0;
  const agingMissing = captureMode === "aging" && agingBucket == null;
  const overAllocated = allocation.unapplied > 0.009;
  const recordReceipt = async () => {
    if (!orgId || captureBusy || !canSettle) return;
    if (selectionMissing) {
      setCaptureNote("Select at least one invoice. A receipt is not applied until you do.");
      return;
    }
    if (agingMissing) {
      setCaptureNote("Choose an age bucket. Aging allocation stays inside that bucket.");
      return;
    }
    if (overAllocated) {
      setCaptureNote("The receipt is larger than the outstanding balance of the selected invoices.");
      return;
    }
    if (allocation.applied <= 0) return;
    captureKey.current = captureKey.current ?? newFinanceKey("capture");
    setCaptureBusy(true);
    setCaptureNote(null);
    const tripsByInvoice: Record<string, ReturnType<typeof tripsFor>> = {};
    const slicesByInvoice: Record<string, { tripId: string; applied: number; cash: number; tds: number }[]> = {};
    const lines = allocation.lines.map((line) => {
      const anchors = tripsFor(line.id);
      tripsByInvoice[line.id] = anchors;
      const preview = planTripReceive({
        invoiceId: line.id,
        applied: line.applied,
        percent: tdsPercent,
        trips: anchors,
        edits: tripEdits,
      });
      if (!preview.some((row) => row.edited)) return line;
      const applied = Math.round(preview.reduce((sum, row) => sum + row.applied, 0) * 100) / 100;
      slicesByInvoice[line.id] = preview
        .filter((row) => row.applied > 0)
        .map((row) => ({ tripId: row.tripId, applied: row.applied, cash: row.receive, tds: row.tds }));
      const remaining = Math.max(0, Math.round((line.balance - applied) * 100) / 100);
      return { ...line, applied, remaining, cleared: receiveStatus(line.balance, applied) === "paid" };
    });
    const result = await captureCustomerReceipt({
      orgId,
      clientId,
      clientName: clientName || "Customer",
      cash,
      tds,
      reference,
      date: paidOn,
      lines,
      tripsByInvoice,
      slicesByInvoice,
      idempotencyKey: captureKey.current,
      paymentMode,
    });
    setCaptureBusy(false);
    if (result.error) {
      setCaptureNote(result.error.message);
      return;
    }
    captureKey.current = null;
    setCashText("");
    setPercentText("");
    setPercentTouched(false);
    setTdsOn(false);
    setReference("");
    setPickedIds([]);
    setTripEdits({});
    setCaptureOpen(false);
    setCaptureNote(
      `${result.receiptNumber ? `Receipt ${result.receiptNumber} recorded. ` : "Receipt recorded. "}${
        result.cleared > 0
          ? `${result.cleared} invoice${result.cleared === 1 ? " is" : "s are"} now settled.`
          : "Invoices that are only partly covered stay open."
      } It is listed with this customer's receipts.`,
    );
    if (orgId) {
      await invalidateFinanceBalances(queryClient, orgId);
      await invalidateSharedCustomerLedger(queryClient, orgId);
    }
    onRecorded?.();
  };

  return (
    <ScrollView
      style={captureOnly ? styles.captureLaunch : styles.page}
      contentContainerStyle={captureOnly ? undefined : styles.pageContent}
      scrollEnabled={!captureOnly}
    >
      {captureOnly ? (
        <Pressable
          style={styles.captureBtn}
          onPress={() => setCaptureOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Capture payment"
        >
          <Text style={styles.captureBtnText}>Capture payment</Text>
        </Pressable>
      ) : (
      <View style={styles.captureBar}>
        <View style={styles.captureCopy}>
          <Text style={styles.cardTitle}>Receivable</Text>
          <Text style={styles.cardHint}>
            {inr(book.pending)} open across {openInvoices.length} invoice{openInvoices.length === 1 ? "" : "s"}
            {clientTds.percent > 0
              ? ` · expect ${inr(book.lines.reduce((sum, line) => sum + line.expectedBank, 0))} in bank after ${clientTds.percent}% TDS`
              : ""}
          </Text>
        </View>
        <Pressable
          style={styles.captureBtn}
          onPress={() => setCaptureOpen(true)}
          disabled={!canSettle}
          accessibilityRole="button"
          accessibilityLabel="Capture payment"
          accessibilityState={{ disabled: !canSettle }}
        >
          <Text style={styles.captureBtnText}>Capture payment</Text>
        </Pressable>
      </View>
      )}
      {captureNote ? <Text style={styles.captureNote}>{captureNote}</Text> : null}
      {!captureOnly && !canSettle ? (
        <Text style={styles.captureNote}>
          {settlements.loading || ledgerReceipts.isLoading
            ? "Loading receipts recorded for this customer…"
            : "Received amounts are still loading, so payments cannot be captured right now."}
        </Text>
      ) : null}
      <Modal visible={captureOpen} transparent animationType="fade" onRequestClose={() => setCaptureOpen(false)}>
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            <View style={styles.popupHead}>
              <Text style={styles.cardTitle}>Capture payment</Text>
              <Pressable onPress={() => setCaptureOpen(false)} accessibilityRole="button" accessibilityLabel="Close capture payment">
                <Text style={styles.clear}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.popupScroll} contentContainerStyle={styles.popupBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.cardHint}>
                Bank receipt and TDS both reduce what {clientName} owes. The amount is applied invoice by invoice, then shared across the trips on each invoice.
              </Text>
              <View style={styles.modeRow}>
                {(
                  [
                    ["invoice", "By invoice", "Only the invoices you select"],
                    ["aging", "By aging", "Explicit bucket only. Oldest due in that bucket is cleared first."],
                  ] as const
                ).map(([key, label, hint]) => {
                  const on = captureMode === key;
                  return (
                    <Pressable
                      key={key}
                      style={[styles.modeCard, on && styles.modeCardOn]}
                      onPress={() => setCaptureMode(key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={styles.choiceName}>{label}</Text>
                      <Text style={styles.cardHint}>{hint}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.fieldRow}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{tdsOn ? "Expected payment after TDS" : "Received in bank"}</Text>
                  <TextInput
                    value={cashText}
                    onChangeText={(value) => {
                      setCashTouched(true);
                      setCashText(value);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={Theme.textMuted}
                    style={styles.fieldInput}
                    accessibilityLabel="Amount received"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Reference</Text>
                  <TextInput
                    value={reference}
                    onChangeText={setReference}
                    placeholder="UTR or cheque"
                    placeholderTextColor={Theme.textMuted}
                    style={styles.fieldInput}
                    accessibilityLabel="Payment reference"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Date</Text>
                  <TextInput
                    value={paidOn}
                    onChangeText={setPaidOn}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Theme.textMuted}
                    style={styles.fieldInput}
                    accessibilityLabel="Payment date"
                  />
                </View>
              </View>
              <View style={styles.modeRow} accessibilityRole="radiogroup" accessibilityLabel="Payment mode">
                {(["neft", "rtgs", "imps", "upi", "cheque", "cash", "other"] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    style={[styles.tdsChip, paymentMode === mode && styles.modeCardOn]}
                    onPress={() => setPaymentMode(mode)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: paymentMode === mode }}
                    accessibilityLabel={PAYMENT_MODE_LABELS[mode]}
                  >
                    <Text style={styles.choiceName}>{PAYMENT_MODE_LABELS[mode]}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={[styles.tdsChip, tdsOn && styles.modeCardOn]}
                onPress={() => {
                  setCashTouched(false);
                  setTdsOn((current) => !current);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: tdsOn }}
                accessibilityLabel="TDS deducted by client"
              >
                <Text style={styles.choiceName}>TDS deducted by client</Text>
                <Text style={styles.cardHint}>
                  Enter the percent. The TDS amount and the expected bank payment follow it.
                </Text>
              </Pressable>
              {tdsOn ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>TDS %</Text>
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
                    style={styles.fieldInput}
                    accessibilityLabel="TDS percent"
                  />
                </View>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={styles.choiceName}>TDS amount {inr(tds)}</Text>
                <Text style={styles.choiceName}>Expected after TDS {inr(cashTouched ? cash : expected.bank)}</Text>
              </View>
              {captureMode === "aging" ? (
                <View style={styles.modeRow}>
                  {AR_BUCKETS.map((bucket) => {
                    const on = agingBucket === bucket.key;
                    return (
                      <Pressable
                        key={bucket.key}
                        style={[styles.modeCard, on && styles.modeCardOn]}
                        onPress={() => setAgingBucket(bucket.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={styles.choiceName}>{bucket.label}</Text>
                        <Text style={styles.cardHint}>{inr(book.openAging[bucket.key])} open</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.invoiceList}>
                  {openInvoices.length === 0 ? (
                    <Text style={styles.cardHint}>No open invoices for this customer.</Text>
                  ) : (
                    openInvoices.map((invoice) => {
                      const on = pickedIds.includes(invoice.id);
                      return (
                        <Pressable
                          key={invoice.id}
                          style={[styles.invoiceRow, on && styles.modeCardOn]}
                          onPress={() =>
                            setPickedIds((current) =>
                              current.includes(invoice.id)
                                ? current.filter((id) => id !== invoice.id)
                                : [...current, invoice.id],
                            )
                          }
                          accessibilityRole="checkbox"
                          accessibilityLabel={`${on ? "Selected" : "Select"} ${invoice.number}, outstanding ${inr(invoice.balance)}`}
                          accessibilityState={{ checked: on }}
                        >
                          <View style={[styles.invoiceCheck, on && styles.invoiceCheckOn]}>
                            {on ? <Text style={styles.invoiceCheckMark}>✓</Text> : null}
                          </View>
                          <Text style={styles.choiceName}>{invoice.number}</Text>
                          <Text style={styles.figure}>{on ? "Selected" : "Not selected"} · {inr(invoice.balance)}</Text>
                        </Pressable>
                      );
                    })
                  )}
                  <Text style={styles.cardHint}>
                    {pickedIds.length === 0
                      ? "Select at least one invoice. Nothing is allocated until you do."
                      : `${pickedIds.length} selected for ${clientName}. Oldest due is cleared first.`}
                  </Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.choiceName}>Allocated {inr(allocation.applied)}</Text>
                <Text style={styles.cardHint}>
                  {clientName} · {tds > 0 ? `Bank ${inr(cash)} · TDS ${inr(tds)}` : `Bank ${inr(cash)}`}
                  {` · Unallocated ${inr(allocation.unapplied)}`}
                </Text>
              </View>
              {allocation.lines.map((line) => (
                <View key={`breakdown-${line.id}`} style={styles.summaryRow}>
                  <Text style={styles.allocLine}>{line.number}</Text>
                  <Text style={styles.cardHint}>
                    {`Outstanding ${inr(line.balance)} · Allocated ${inr(line.applied)} · Remaining ${inr(line.remaining)}`}
                  </Text>
                </View>
              ))}
              {allocation.lines.filter((line) => line.applied > 0).map((line) => {
                const anchors = tripsFor(line.id);
                const preview = planTripReceive({
                  invoiceId: line.id,
                  applied: line.applied,
                  percent: tdsPercent,
                  trips: anchors,
                  edits: tripEdits,
                });
                const editedApplied = Math.round(preview.reduce((sum, row) => sum + row.applied, 0) * 100) / 100;
                const invoiceStatus = receiveStatus(line.balance, editedApplied);
                const tdsTotal = preview.reduce((sum, row) => sum + row.tds, 0);
                const receiveTotal = preview.reduce((sum, row) => sum + row.receive, 0);
                return (
                  <View key={line.id} style={styles.allocBlock}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.allocLine}>
                        {line.number} · {preview.length} trip{preview.length === 1 ? "" : "s"} · {receiveStatusLabel(invoiceStatus)}
                      </Text>
                      <Text style={styles.cardHint}>
                        TDS {inr(tdsTotal)} · To receive {inr(receiveTotal)}
                      </Text>
                    </View>
                    {preview.length > 0 ? (
                      <View style={styles.tripHead}>
                        <Text style={[styles.tripHeadText, styles.tripName]}>Trip</Text>
                        <Text style={[styles.tripHeadText, styles.tripMeta]}>TDS</Text>
                        <Text style={[styles.tripHeadText, styles.tripAmountCol]}>To receive</Text>
                        <Text style={[styles.tripHeadText, styles.statusCol]}>Status</Text>
                        <Text style={styles.fullCol} />
                      </View>
                    ) : null}
                    {preview.map((slice) => (
                      <View key={slice.tripId} style={styles.tripEditRow}>
                        <Pressable
                          style={styles.tripName}
                          onPress={() => {
                            const row = book.lines.find(
                              (item) => item.internalId === slice.tripId || item.id === slice.tripId,
                            );
                            if (!row) return;
                            setCnDnEdit(null);
                            setCnDnTripId(row.internalId);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Preview trip ${slice.label}`}
                        >
                          <Text style={styles.tripLink} numberOfLines={1}>{slice.label}</Text>
                        </Pressable>
                        <Text style={styles.tripMeta}>{inr(slice.tds)}</Text>
                        <TextInput
                          value={tripEdits[`${line.id}:${slice.tripId}`] ?? String(slice.receive)}
                          onChangeText={(value) =>
                            setTripEdits((current) => ({
                              ...current,
                              [`${line.id}:${slice.tripId}`]: value.replace(/[^0-9.]/g, ""),
                            }))
                          }
                          keyboardType="decimal-pad"
                          style={[styles.tripAmountCol, styles.tripAmount]}
                          accessibilityLabel={`Amount to receive for ${slice.label}`}
                        />
                        <Text style={styles.statusCol}>{receiveStatusLabel(slice.status)}</Text>
                        <Pressable
                          style={styles.fullBtn}
                          onPress={() =>
                            setTripEdits((current) => ({
                              ...current,
                              [`${line.id}:${slice.tripId}`]: String(slice.fullReceive),
                            }))
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Mark ${slice.label} paid in full`}
                        >
                          <Text style={styles.fullText}>Full</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.popupFoot}>
              <Pressable
                style={[styles.captureBtn, (captureBusy || allocation.applied <= 0 || overAllocated || selectionMissing || agingMissing || !orgId || !canSettle) && styles.captureOff]}
                onPress={() => {
                  void recordReceipt();
                }}
                disabled={captureBusy || allocation.applied <= 0 || overAllocated || selectionMissing || agingMissing || !orgId || !canSettle}
                accessibilityRole="button"
                accessibilityLabel="Record receipt"
              >
                <Text style={styles.captureBtnText}>{captureBusy ? "Recording…" : "Record receipt"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <TripRevenueNote
        orgId={orgId}
        clientName={clientName}
        trips={trips}
        line={book.lines.find((line) => line.internalId === cnDnTripId) ?? null}
        edit={cnDnEdit}
        onEdit={setCnDnEdit}
        onClose={() => {
          setCnDnTripId(null);
          setCnDnEdit(null);
        }}
        onRecorded={() => {
          onTripsChanged?.();
          onRecorded?.();
        }}
      />
      {captureOnly ? null : (
      <>
      <View style={styles.kpiRow}>
        {(
          [
            ["sales", "Sales", book.sales],
            ["invoiced", "Invoiced", book.invoiced],
            ["received", "Received", book.received],
            ["pending", "Pending", book.pending],
            ["uninvoiced", "Uninvoiced", book.uninvoiced],
          ] as const
        ).map(([key, label, value]) => {
          const on = filter.kpi === key || (key === "sales" && filter.kpi == null && !filtering);
          return (
            <Pressable
              key={key}
              style={[styles.kpi, on && styles.kpiOn]}
              onPress={() => toggleKpi(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter.kpi === key }}
            >
              <Text style={styles.kpiValue}>
                {!customerLedger.ready && !canSettle && (key === "received" || key === "pending") ? "Unavailable" : inr(value)}
              </Text>
              <Text style={styles.kpiLabel}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.reportRow}>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadCopy}>
              <Text style={styles.cardTitle}>Aging</Text>
              <Text style={styles.cardHint}>Open invoices beside sales not yet invoiced</Text>
            </View>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Theme.primary }]} />
                <Text style={styles.legendText}>Open</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Theme.warning }]} />
                <Text style={styles.legendText}>Uninvoiced</Text>
              </View>
            </View>
          </View>
          {AR_BUCKETS.map((bucket, index) => (
            <View key={bucket.key} style={[styles.bucketBlock, index > 0 && styles.bucketRule]}>
              <Text style={styles.bucketLabel}>{bucket.label}</Text>
              <AgingBar
                label="Open"
                amount={book.openAging[bucket.key]}
                width={book.openAging[bucket.key] / maxOpen}
                tone="open"
                selected={filter.bucket === bucket.key && filter.agingScope === "open"}
                onPress={() => toggleBucket(bucket.key, "open")}
              />
              <AgingBar
                label="Uninvoiced"
                amount={book.uninvoicedAging[bucket.key]}
                width={book.uninvoicedAging[bucket.key] / maxUnbilled}
                tone="uninvoiced"
                selected={
                  filter.bucket === bucket.key && filter.agingScope === "uninvoiced"
                }
                onPress={() => toggleBucket(bucket.key, "uninvoiced")}
              />
            </View>
          ))}
        </View>
        <View style={[styles.card, styles.cardFill]}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadCopy}>
              <Text style={styles.cardTitle}>Uninvoiced POD</Text>
              <Text style={styles.cardHint}>Proof of delivery on sales still to invoice</Text>
            </View>
          </View>
          <View style={styles.podList}>
          {(["received", "digital", "pending"] as const).map((pod) => {
            const cell = book.uninvoicedPod[pod];
            const on = filter.pod === pod;
            const share = book.uninvoiced > 0 ? cell.amount / book.uninvoiced : 0;
            const tone = pod === "received" ? Theme.success : pod === "digital" ? Theme.primary : Theme.warning;
            return (
              <Pressable
                key={pod}
                style={[styles.podRow, on && styles.podRowOn]}
                onPress={() => togglePod(pod)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <View style={[styles.podMark, { backgroundColor: tone }]} />
                <View style={styles.podCopy}>
                  <View style={styles.podTitleRow}>
                    <Text style={styles.podLabel}>{podLabel(pod)}</Text>
                    <Text style={styles.podMeta}>
                      {cell.count} trip{cell.count === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <View style={styles.podTrack}>
                    <View style={[styles.podFill, { width: `${Math.max(cell.amount > 0 ? 3 : 0, share * 100)}%`, backgroundColor: tone }]} />
                  </View>
                </View>
                <Text style={[styles.figure, cell.amount === 0 && styles.figureQuiet]}>{inr(cell.amount)}</Text>
              </Pressable>
            );
          })}
          </View>
        </View>
      </View>

      <View style={styles.tableHead}>
        <Text style={styles.tableTitle}>
          {rows.length} trip{rows.length === 1 ? "" : "s"}
          {filtering ? ` of ${book.lines.length}` : ""}
          {` · TDS ${inr(rows.reduce((sum, row) => sum + row.expectedTds, 0))} · To receive ${inr(rows.reduce((sum, row) => sum + row.expectedBank, 0))}`}
        </Text>
        {filtering ? (
          <Pressable
            onPress={() => {
              setFilter(EMPTY_FILTER);
              setSheetFilters({});
              setSheetSort(null);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.clear}>Clear filters</Text>
          </Pressable>
        ) : (
          <Text style={styles.cardHint}>Select a figure above, or a column, to filter this list</Text>
        )}
      </View>
      <View style={styles.table}>
        <View style={styles.trHead}>
          {(
            [
              ["lr", "LR", "left", styles.colLr],
              ["date", "Date", "left", styles.colDate],
              ["age", "Age", "right", styles.colAge],
              ["route", "Route", "left", styles.colRoute],
              ["sales", "Sales", "right", styles.colMoney],
              ["invoiced", "Invoiced", "right", styles.colMoney],
              ["received", "Received", "right", styles.colMoney],
              ["pending", "Pending", "right", styles.colMoney],
              ["pod", "POD", "left", styles.colPod],
            ] as const
          ).map(([column, label, align, style]) => (
            <TripExcelColumnHeader
              key={column}
              label={label}
              align={align}
              style={style}
              tone="dark"
              active={sheetFilters[column] != null}
              sortDirection={sheetSort?.column === column ? sheetSort.direction : null}
              choices={arSheetChoices(narrowed, column, sheetFilters)}
              selected={sheetFilters[column] ?? null}
              onChange={(selected) =>
                setSheetFilters((current) => {
                  const next = { ...current };
                  if (selected == null) delete next[column];
                  else next[column] = selected;
                  return next;
                })
              }
              onSort={(direction) => setSheetSort({ column, direction })}
            />
          ))}
        </View>
        {rows.length === 0 ? (
          <Text style={styles.tableEmpty}>No trips match these filters.</Text>
        ) : (
          rows.map((row, index) => (
            <Pressable
              key={row.id}
              style={[styles.tr, index % 2 === 1 && styles.trAlt]}
              onPress={() => {
                setCnDnEdit(null);
                setCnDnTripId(row.internalId);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Adjust revenue for ${row.lr}`}
            >
              <View style={styles.colLr}><Text style={styles.tdStrong} numberOfLines={1}>{row.lr}</Text></View>
              <View style={styles.colDate}><Text style={styles.td} numberOfLines={1}>{row.dateLabel}</Text></View>
              <View style={styles.colAge}><Text style={[styles.td, styles.right]}>{row.ageDays}d</Text></View>
              <View style={styles.colRoute}><Text style={styles.td} numberOfLines={1}>{row.route}</Text></View>
              <View style={styles.colMoney}><Text style={[styles.tdNum, row.sales === 0 && styles.tdQuiet]}>{inr(row.sales)}</Text></View>
              <View style={styles.colMoney}><Text style={[styles.tdNum, row.invoiced === 0 && styles.tdQuiet]}>{inr(row.invoiced)}</Text></View>
              <View style={styles.colMoney}><Text style={[styles.tdNum, row.received === 0 && styles.tdQuiet]}>{inr(row.received)}</Text></View>
              <View style={styles.colMoney}>
                <Text style={[styles.tdNum, row.pending === 0 && styles.tdQuiet]}>{inr(row.pending)}</Text>
                <Text style={styles.expectHint}>TDS {inr(row.expectedTds)}</Text>
                <Text style={styles.expectHint}>To receive {inr(row.expectedBank)}</Text>
                <Text style={styles.expectHint}>
                  {receiveStatusLabel(receiveStatus(row.invoiced > 0 ? row.invoiced : row.sales, row.received))}
                </Text>
              </View>
              <View style={styles.colPod}>
                <Text style={[styles.podCell, row.pod === "received" && styles.podReceived, row.pod === "digital" && styles.podDigital]} numberOfLines={1}>
                  {podLabel(row.pod)}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </View>
      </>
      )}
    </ScrollView>
  );
}

function TripRevenueNote({
  line,
  orgId,
  clientName,
  trips,
  edit,
  onEdit,
  onClose,
  onRecorded,
}: {
  line: ReturnType<typeof buildArBook>["lines"][number] | null;
  orgId: string | null;
  clientName: string | null;
  trips: readonly InvoicingTripView[];
  edit: TripAdjustment | null;
  onEdit: (next: TripAdjustment | null) => void;
  onClose: () => void;
  onRecorded?: () => void;
}) {
  const trip = line
    ? trips.find((item) => item.internal_id === line.internalId || item.id === line.id) ?? null
    : null;
  const tripIds = useMemo(
    () => (line ? [line.internalId] : []),
    [line],
  );
  const adjustments = useTripFinanceAdjustmentsMap(orgId, tripIds);
  const invalidate = useInvalidateTripFinanceAdjustments();
  const notes = adjustmentsForTripId(adjustments.record, line?.internalId);
  const sales = line?.sales ?? 0;
  const adjusted = invoiceTripAdjustedAmount(sales, notes);
  const save = useCallback(
    async (params: {
      type: "revenue" | "cost";
      impact: "plus" | "minus";
      amount: number;
      reason: string;
    }) => {
      const tripId = line?.internalId?.trim();
      if (!tripId || !orgId || params.type !== "revenue") {
        Alert.alert(
          "Credit / debit note",
          "Revenue on this trip changes only through a credit note or a debit note.",
        );
        return;
      }
      await addTripAdjustment(
        tripId,
        params,
        { organizationId: orgId, missionKey: trip?.id ?? null },
      );
      await invalidate();
      onRecorded?.();
    },
    [invalidate, line?.internalId, onRecorded, orgId, trip?.id],
  );
  const update = useCallback(
    async (
      adjustmentId: string,
      params: {
        type: "revenue" | "cost";
        impact: "plus" | "minus";
        amount: number;
        reason: string;
      },
    ) => {
      const tripId = line?.internalId?.trim();
      if (!tripId || params.type !== "revenue") return;
      await updateTripAdjustment(tripId, adjustmentId, params);
      await invalidate();
      onEdit(null);
      onRecorded?.();
    },
    [invalidate, line?.internalId, onEdit, onRecorded],
  );
  return (
    <ProvisionAdjustmentModal
      visible={line != null}
      side="client"
      onClose={onClose}
      onSave={save}
      onUpdate={update}
      editTarget={edit}
      tripCode={trip?.id ?? line?.lr}
      partyLabel={clientName}
      clientName={clientName || trip?.client || "Client"}
      supplierName={trip?.supplier_name || "Supplier"}
      sales={sales}
      adjSales={adjusted}
      cost={0}
      adjCost={0}
      revenueSideDelta={adjusted - sales}
      costSideDelta={0}
      adjustments={notes}
      lineMetaLabel={(adj) =>
        (adj.reason ?? "").trim() || (adj.impact === "minus" ? "Credit note" : "Debit note")
      }
    />
  );
}

function AgingBar({
  label,
  amount,
  width,
  tone,
  selected,
  onPress,
}: {
  label: string;
  amount: number;
  width: number;
  tone: "open" | "uninvoiced";
  selected: boolean;
  onPress: () => void;
}) {
  const fill = tone === "open" ? Theme.primary : Theme.warning;
  return (
    <Pressable
      style={[styles.barRow, selected && styles.barRowOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={styles.barName}>{label}</Text>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${Math.max(amount > 0 ? 3 : 0, Math.min(100, width * 100))}%`, backgroundColor: fill },
          ]}
        />
      </View>
      <Text style={[styles.figure, amount === 0 && styles.figureQuiet]}>{inr(amount)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Theme.surface },
  captureLaunch: { flexGrow: 0, alignSelf: "flex-end" },
  pageContent: { padding: 16, paddingBottom: 28, gap: 12 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: "500", color: Theme.textPrimaryDark },
  emptyBody: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textMuted,
    textAlign: "center",
    maxWidth: 360,
  },
  captureBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  captureCopy: { flex: 1, minWidth: 0 },
  captureBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  captureBtnText: { fontSize: 12, fontWeight: "500", color: Theme.buttonDarkText },
  captureOff: { opacity: 0.45 },
  popupBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  popupCard: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "88%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  popupHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  popupScroll: { flexGrow: 0 },
  popupBody: { gap: 10, paddingBottom: 4 },
  popupFoot: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  tdsChip: {
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  allocBlock: { gap: 6 },
  tripHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  tripHeadText: { fontSize: 10, fontWeight: "500", color: Theme.textMuted },
  tripEditRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
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
  tripName: { flex: 1, minWidth: 0 },
  tripLink: { fontSize: 12, fontWeight: "500", color: Theme.primary },
  tripAmountCol: { width: 96 },
  tripAmount: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  tripMeta: { width: 88, fontSize: 12, fontWeight: "400", color: Theme.textPrimaryDark },
  captureCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
    gap: 10,
  },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeCard: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 140,
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  modeCardOn: { borderColor: Theme.primary, backgroundColor: Theme.surface },
  choiceName: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  fieldRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { flexGrow: 1, flexBasis: "22%", minWidth: 120 },
  fieldLabel: { fontSize: 11, fontWeight: "400", color: Theme.textMuted },
  fieldInput: {
    marginTop: 4,
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
  invoiceList: { gap: 6 },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  invoiceCheck: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  invoiceCheckOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  invoiceCheckMark: {
    color: Theme.buttonDarkText,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 14,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  allocLine: { fontSize: 12, fontWeight: "400", color: Theme.textPrimaryDark },
  captureNote: { fontSize: 12, fontWeight: "400", color: Theme.textSecondary },
  kpiRow: { flexDirection: "row", gap: 8 },
  kpi: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  kpiOn: { borderColor: Theme.primary, backgroundColor: Theme.surface },
  kpiValue: { fontSize: 15, fontWeight: "500", color: Theme.textPrimaryDark },
  kpiLabel: { marginTop: 6, fontSize: 11, fontWeight: "400", color: Theme.textMuted },
  reportRow: { flexDirection: "row", alignItems: "stretch", gap: 12 },
  card: {
    flex: 1,
    minWidth: 0,
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  cardFill: { alignSelf: "stretch" },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardHeadCopy: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark },
  cardHint: { marginTop: 2, fontSize: 11, fontWeight: "400", color: Theme.textMuted },
  legend: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 99 },
  legendText: { fontSize: 11, fontWeight: "400", color: Theme.textSecondary },
  bucketBlock: { marginTop: 8, paddingTop: 8 },
  bucketRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
  },
  bucketLabel: { fontSize: 11, fontWeight: "500", color: Theme.textPrimaryDark },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 26,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  barRowOn: { backgroundColor: Theme.brandBlueWashSubtle },
  barName: { width: 84, fontSize: 11, fontWeight: "400", color: Theme.textSecondary },
  barTrack: {
    flex: 1,
    minWidth: 0,
    height: 6,
    borderRadius: 99,
    backgroundColor: Theme.surface,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 99 },
  figure: {
    width: 118,
    flexShrink: 0,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  figureQuiet: { fontWeight: "400", color: Theme.textMuted },
  podList: { flex: 1, marginTop: 12, gap: 8 },
  podRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.surface,
  },
  podRowOn: { borderColor: Theme.primary, backgroundColor: Theme.cardWhite },
  podMark: { width: 3, alignSelf: "stretch", borderRadius: 99 },
  podCopy: { minWidth: 0, flex: 1, gap: 8 },
  podTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  podLabel: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  podMeta: { fontSize: 11, fontWeight: "400", color: Theme.textMuted },
  podTrack: {
    height: 4,
    borderRadius: 99,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  podFill: { height: 4, borderRadius: 99 },
  tableHead: {
    marginTop: 4,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tableTitle: { fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark },
  clear: { fontSize: 12, fontWeight: "500", color: Theme.primary },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  trHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Theme.primary,
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
  },
  trAlt: { backgroundColor: Theme.surface },
  th: { fontSize: 10, fontWeight: "500", letterSpacing: 0.4, color: Theme.buttonDarkText },
  td: { fontSize: 12, fontWeight: "400", color: Theme.textPrimaryDark },
  tdStrong: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  tdNum: {
    width: "100%",
    textAlign: "right",
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  tdQuiet: { fontWeight: "400", color: Theme.textMuted },
  expectHint: {
    width: "100%",
    textAlign: "right",
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  previewFacts: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  right: { width: "100%", textAlign: "right" },
  podCell: { fontSize: 11, fontWeight: "500", color: Theme.warning },
  podReceived: { color: Theme.success },
  podDigital: { color: Theme.primary },
  colLr: { width: 108 },
  colDate: { width: 108 },
  colAge: { width: 44, alignItems: "flex-end" },
  colRoute: { flex: 1, minWidth: 120 },
  colMoney: { width: 104, alignItems: "flex-end" },
  colPod: { width: 108 },
  tableEmpty: { padding: 16, fontSize: 12, fontWeight: "400", color: Theme.textMuted },
});
