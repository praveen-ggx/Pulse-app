import Theme from "@/constants/Theme";
import { useClientTdsRate } from "@/features/invoicing/hooks/useClientTdsRate";
import { useInvoiceCustomerLedger, invalidateSharedCustomerLedger } from "@/features/invoicing/hooks/useInvoiceCustomerLedger";
import { useWorkspaceFinance } from "@/features/invoicing/hooks/useWorkspaceFinance";
import { InvoiceCaptureButton } from "@/features/invoicing/components/InvoiceCaptureButton";
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
  tallyArLines,
  type ArAgingScope,
  type ArBucket,
  type ArFilter,
  type ArKpi,
  type ArPod,
  type ArSheetFilters,
  type ArSheetSort,
} from "@/features/invoicing/utils/invoiceAr.util";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

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
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [freightText, setFreightText] = useState("");
  const [freightBusy, setFreightBusy] = useState(false);
  const [freightNote, setFreightNote] = useState<string | null>(null);
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
  const party = customerLedger.party;
  const alignedBook = useMemo(() => {
    if (!party) return book;
    const lines = book.lines.map((line) => {
      const sales = party.salesByTripId[line.internalId] ?? party.salesByTripId[line.id] ?? line.sales;
      const received = party.paidByTripId[line.internalId] ?? party.paidByTripId[line.id] ?? 0;
      return {
        ...line,
        sales,
        received,
        pending: Math.max(0, Math.round((sales - received) * 100) / 100),
      };
    });
    const tallied = tallyArLines(lines);
    return { ...tallied, sales: party.billed, received: party.received, pending: party.pending };
  }, [book, party]);
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
    if (pickedIds.length === 0 || pickedIds.includes(invoice.id)) return sum + invoice.balance;
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
  const narrowed = useMemo(() => applyArFilter(alignedBook.lines, filter), [alignedBook.lines, filter]);
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

  const maxOpen = Math.max(1, ...AR_BUCKETS.map((bucket) => alignedBook.openAging[bucket.key]));
  const maxUnbilled = Math.max(
    1,
    ...AR_BUCKETS.map((bucket) => alignedBook.uninvoicedAging[bucket.key]),
  );

  const recordReceipt = async () => {
    if (!orgId || captureBusy || allocation.applied <= 0 || !canSettle) return;
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
            {inr(alignedBook.pending)} open across {openInvoices.length} invoice{openInvoices.length === 1 ? "" : "s"}
            {clientTds.percent > 0
              ? ` · expect ${inr(alignedBook.lines.reduce((sum, line) => sum + line.expectedBank, 0))} in bank after ${clientTds.percent}% TDS`
              : ""}
          </Text>
        </View>
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
                    ["invoice", "By invoice", "One invoice, or every open invoice"],
                    ["aging", "By aging", "One age bucket, oldest due first"],
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
                        <Text style={styles.cardHint}>{inr(alignedBook.openAging[bucket.key])} open</Text>
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
                          accessibilityState={{ checked: on }}
                        >
                          <Text style={styles.choiceName}>{invoice.number}</Text>
                          <Text style={styles.figure}>{inr(invoice.balance)}</Text>
                        </Pressable>
                      );
                    })
                  )}
                  <Text style={styles.cardHint}>
                    {pickedIds.length === 0
                      ? "None selected, so the receipt spreads across every open invoice, oldest due first."
                      : `${pickedIds.length} selected. Oldest due is cleared first.`}
                  </Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.choiceName}>Clears {inr(allocation.applied)}</Text>
                <Text style={styles.cardHint}>
                  {tds > 0 ? `Bank ${inr(cash)} · TDS ${inr(tds)}` : `Bank ${inr(cash)}`}
                  {allocation.unapplied > 0 ? ` · ${inr(allocation.unapplied)} above the open balance` : ""}
                </Text>
              </View>
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
                            const row = alignedBook.lines.find(
                              (item) => item.internalId === slice.tripId || item.id === slice.tripId,
                            );
                            if (!row) return;
                            setPreviewId(row.id);
                            setFreightText(String(row.sales || ""));
                            setFreightNote(null);
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
                style={[styles.captureBtn, (captureBusy || allocation.applied <= 0 || !orgId || !canSettle) && styles.captureOff]}
                onPress={() => {
                  void recordReceipt();
                }}
                disabled={captureBusy || allocation.applied <= 0 || !orgId || !canSettle}
                accessibilityRole="button"
                accessibilityLabel="Record receipt"
              >
                <Text style={styles.captureBtnText}>{captureBusy ? "Recording…" : "Record receipt"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <TripPreview
        invoice={invoices.find((invoice) =>
          invoice.trip_ids.some((id) => {
            const line = alignedBook.lines.find((row) => row.id === previewId);
            return line != null && (id === line.internalId || id === line.id);
          }),
        ) ?? null}
        orgId={orgId}
        clientId={clientId}
        clientName={clientName}
        trips={trips}
        onRecorded={onRecorded}
        line={alignedBook.lines.find((line) => line.id === previewId) ?? null}
        percent={clientTds.percent}
        freightText={freightText}
        busy={freightBusy}
        note={freightNote}
        onFreight={setFreightText}
        onClose={() => setPreviewId(null)}
        onSave={() => {
          const line = alignedBook.lines.find((row) => row.id === previewId);
          const amount = Number(freightText.replace(/,/g, ""));
          if (!line || !orgId || !Number.isFinite(amount) || amount < 0) return;
          setFreightBusy(true);
          setFreightNote(null);
          void supabase()
            .from("trips")
            .update({ client_price: amount, updated_at: new Date().toISOString() })
            .eq("id", line.internalId)
            .eq("organization_id", orgId)
            .then(({ error }) => {
              setFreightBusy(false);
              if (error) {
                setFreightNote(error.message);
                return;
              }
              setFreightNote("Trip freight saved.");
              onTripsChanged?.();
            });
        }}
      />
      {captureOnly ? null : (
      <>
      <View style={styles.kpiRow}>
        {(
          [
            ["sales", "Sales", alignedBook.sales],
            ["invoiced", "Invoiced", alignedBook.invoiced],
            ["received", "Received", alignedBook.received],
            ["pending", "Pending", alignedBook.pending],
            ["uninvoiced", "Uninvoiced", alignedBook.uninvoiced],
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
                amount={alignedBook.openAging[bucket.key]}
                width={alignedBook.openAging[bucket.key] / maxOpen}
                tone="open"
                selected={filter.bucket === bucket.key && filter.agingScope === "open"}
                onPress={() => toggleBucket(bucket.key, "open")}
              />
              <AgingBar
                label="Uninvoiced"
                amount={alignedBook.uninvoicedAging[bucket.key]}
                width={alignedBook.uninvoicedAging[bucket.key] / maxUnbilled}
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
            const cell = alignedBook.uninvoicedPod[pod];
            const on = filter.pod === pod;
            const share = alignedBook.uninvoiced > 0 ? cell.amount / alignedBook.uninvoiced : 0;
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
          {filtering ? ` of ${alignedBook.lines.length}` : ""}
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
                setPreviewId(row.id);
                setFreightText(String(row.sales || ""));
                setFreightNote(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Preview trip ${row.lr}`}
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

function TripPreview({
  line,
  invoice,
  orgId,
  clientId,
  clientName,
  trips,
  onRecorded,
  percent,
  freightText,
  busy,
  note,
  onFreight,
  onClose,
  onSave,
}: {
  line: ReturnType<typeof buildArBook>["lines"][number] | null;
  invoice: IssuedInvoiceListRow | null;
  orgId: string | null;
  clientId: string | null;
  clientName: string | null;
  trips: readonly InvoicingTripView[];
  onRecorded?: () => void;
  percent: number;
  freightText: string;
  busy: boolean;
  note: string | null;
  onFreight: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const freight = Number(freightText.replace(/,/g, "")) || 0;
  const base = line == null ? 0 : line.uninvoiced ? freight : line.pending;
  const expected = expectedAfterTds(base, percent);
  return (
    <Modal visible={line != null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.popupBackdrop}>
        <View style={styles.popupCard}>
          <View style={styles.popupHead}>
            <Text style={styles.cardTitle}>{line?.lr ?? "Trip"}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close trip preview">
              <Text style={styles.clear}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.cardHint}>{line?.route}</Text>
          <Text style={styles.fieldLabel}>Trip freight</Text>
          <TextInput
            value={freightText}
            onChangeText={onFreight}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={Theme.textMuted}
            style={styles.fieldInput}
            accessibilityLabel="Trip freight"
          />
          <View style={styles.previewFacts}>
            <Text style={styles.cardHint}>Invoiced {line ? inr(line.invoiced) : inr(0)}</Text>
            <Text style={styles.cardHint}>Received {line ? inr(line.received) : inr(0)}</Text>
            <Text style={styles.cardHint}>Pending {line ? inr(line.pending) : inr(0)}</Text>
          </View>
          <View style={styles.allocBlock}>
            <Text style={styles.choiceName}>
              {percent > 0
                ? `Expected in bank ${inr(expected.bank)} after ${percent}% TDS`
                : `Expected in bank ${inr(expected.bank)}`}
            </Text>
            <Text style={styles.cardHint}>
              {percent > 0
                ? `TDS ${inr(expected.tds)} stays with the client. Set the percent once on Client Details.`
                : "No TDS percent is saved for this client."}
            </Text>
          </View>
          {note ? <Text style={styles.captureNote}>{note}</Text> : null}
          <View style={styles.popupFoot}>
            <Pressable
              style={[styles.captureBtn, busy && styles.captureOff]}
              onPress={onSave}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Save trip freight"
            >
              <Text style={styles.captureBtnText}>{busy ? "Saving…" : "Save freight"}</Text>
            </Pressable>
            {invoice ? (
              <InvoiceCaptureButton
                orgId={orgId}
                clientId={clientId}
                clientName={clientName}
                invoice={invoice}
                trips={trips}
                onRecorded={onRecorded}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
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
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
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
