/**
 * Handles ledger transaction submit: duplicate/overpayment checks, create/update entry,
 * driver ledger and salary-request cleanup. Used by FinanceScreen.
 */
import {
  DRIVER_PAYMENT_TYPES,
  type AddTransactionData,
  type AddTransactionSubmitOptions,
} from "@/components/AddTransactionModal";
import { createDriverLedgerEntry } from "@/features/drivers/services/drivers.service";
import {
  createLedgerEntry,
  updateLedgerEntry,
  type CreateLedgerEntryResult,
  type LedgerRow,
} from "../services/finance.service";
import type { TripEntryContext } from "../components/EntityDetailOverlay";
import { updateSalaryRequestStatus } from "@/features/drivers/services/salaryRequests.service";
import { useLanguage } from "@/contexts/LanguageContext";
import { syncFinanceComplianceCaches } from "@/lib/queries/syncFinanceComplianceCaches";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Alert } from "react-native";
import type { QueryClient } from "@tanstack/react-query";

export interface UseFinanceTransactionSubmitArgs {
  orgId: string | null;
  profileUid: string | null | undefined;
  selectedEntity: {
    data: { id: string; name?: string | null };
    entityType: string;
  } | null;
  ledgerTransactions: LedgerRow[] | null;
  tripRows: Array<{ client_id?: string | null; client_price?: unknown; supplier_id?: string | null; supplier_rate?: unknown }>;
  editingEntry: LedgerRow | null;
  setLedgerTransactions: React.Dispatch<React.SetStateAction<LedgerRow[] | null>>;
  setLedgerRefreshKey: (fn: (k: number) => number) => void;
  setEditingEntry: (e: LedgerRow | null) => void;
  setAddEntryContext: (c: TripEntryContext | null) => void;
  setShowTransactionModal: (v: boolean) => void;
  setEntitiesRefreshKey: (fn: (k: number) => number) => void;
  setPendingDriverSalaryRequests: React.Dispatch<React.SetStateAction<import("@/features/drivers/services/salaryRequests.service").SalaryRequestWithDriverRow[]>>;
  salaryRequestIdToPayAfterSubmitRef: React.MutableRefObject<string | null>;
  /** When set, called after a new entry is created so the app can navigate to trip/entity detail to show the transaction. */
  onSuccessNavigate?: (data: AddTransactionData) => void;
}

function doSubmit(
  orgId: string,
  options: AddTransactionSubmitOptions | undefined,
  payload: Parameters<typeof createLedgerEntry>[1],
  data: AddTransactionData,
  _transactionDate: string,
  driverPaymentLabel: string | null | undefined,
  vehicleNumberFromEntity: string | null,
  isVehicleExpense: boolean,
  profileUid: string | null | undefined,
  setLedgerTransactions: React.Dispatch<React.SetStateAction<LedgerRow[] | null>>,
  setLedgerRefreshKey: (fn: (k: number) => number) => void,
  setEditingEntry: (e: LedgerRow | null) => void,
  setAddEntryContext: (c: TripEntryContext | null) => void,
  setShowTransactionModal: (v: boolean) => void,
  setEntitiesRefreshKey: (fn: (k: number) => number) => void,
  setPendingDriverSalaryRequests: React.Dispatch<React.SetStateAction<import("@/features/drivers/services/salaryRequests.service").SalaryRequestWithDriverRow[]>>,
  salaryRequestIdToPayAfterSubmitRef: React.MutableRefObject<string | null>,
  onSuccessNavigate?: (data: AddTransactionData) => void,
  queryClient?: QueryClient,
) {
  const promise: Promise<CreateLedgerEntryResult> = options?.entryId
    ? updateLedgerEntry(orgId, options.entryId, payload)
    : createLedgerEntry(orgId, payload);
  promise.then(async ({ error, row: updatedRow, pendingExchangeConfirmation }) => {
    if (!error && pendingExchangeConfirmation) {
      Alert.alert(
        "Sent to Pulse Exchange",
        "This payment posts to Finance once the other side confirms it in Exchange.",
      );
    }
    if (!error) {
      if (options?.entryId && updatedRow) {
        setLedgerTransactions((prev) =>
          prev
            ? prev.map((r) => (r.id === options.entryId ? updatedRow : r))
            : prev,
        );
      }
      if (queryClient) {
        syncFinanceComplianceCaches({
          queryClient,
          organizationId: orgId,
          tripId: data.tripId ?? payload.trip_id ?? null,
          includeFinance: true,
          includeCompliance: true,
        });
      }
      if (
        !options?.entryId &&
        data.contactType === "driver" &&
        data.type === "out" &&
        data.driverPaymentType &&
        data.contactId
      ) {
        const shouldCreateFleetPending =
          data.driverPaymentType === "settlement" &&
          data.tripId !== undefined &&
          data.tripId !== null;

        const description = (() => {
          const baseDescription =
            typeof payload.description === "string" && payload.description.trim().length > 0
              ? payload.description
              : driverPaymentLabel != null && typeof driverPaymentLabel === "string"
                ? driverPaymentLabel
                : null;
          if (!shouldCreateFleetPending) return baseDescription;
          return baseDescription
            ? `${baseDescription} | Sync: FLEET_PAID_PENDING`
            : "Sync: FLEET_PAID_PENDING";
        })();
        const ledgerPayload = {
          tripId: data.tripId ?? null,
          createdBy: profileUid ?? null,
          description,
        };
        const baseDriverLedgerType =
          data.driverPaymentType === "bonus"
            ? "adjustment"
            : data.driverPaymentType;
        const driverLedgerType = shouldCreateFleetPending ? "adjustment" : baseDriverLedgerType;
        let { error: ledgerErr } = await createDriverLedgerEntry(
          orgId,
          data.contactId,
          data.amount,
          driverLedgerType,
          ledgerPayload,
        );
        if (ledgerErr?.message?.includes("driver_ledger_created_by_fkey")) {
          const retry = await createDriverLedgerEntry(
            orgId,
            data.contactId,
            data.amount,
            driverLedgerType,
            { ...ledgerPayload, createdBy: null },
          );
          ledgerErr = retry.error;
        }
        if (ledgerErr) {
          const msg = ledgerErr.message || "";
          const isSchemaError =
            /schema cache|table.*driver_ledger|relation.*driver_ledger|does not exist/i.test(
              msg,
            );
          Alert.alert(
            "Driver ledger",
            isSchemaError
              ? `Payment recorded in ledger. To show it in the driver's wallet, run the migration on the DB this app uses: npx supabase db push (remote) or npx supabase db push --local (local). If you already ran it, ensure .env EXPO_PUBLIC_SUPABASE_URL matches that project.\n\nError: ${msg}`
              : "Payment recorded but driver record could not be updated. " +
                  msg,
          );
        }
        if (salaryRequestIdToPayAfterSubmitRef.current) {
          await updateSalaryRequestStatus(
            salaryRequestIdToPayAfterSubmitRef.current,
            "paid",
          );
          setPendingDriverSalaryRequests((prev) =>
            prev.filter(
              (r) => r.id !== salaryRequestIdToPayAfterSubmitRef.current,
            ),
          );
          salaryRequestIdToPayAfterSubmitRef.current = null;
        }
      }
      setLedgerRefreshKey((k) => k + 1);
      setEntitiesRefreshKey((k) => k + 1);
      setEditingEntry(null);
      setAddEntryContext(null);
      setShowTransactionModal(false);
      if (!options?.entryId && onSuccessNavigate) {
        onSuccessNavigate(data);
      }
    } else {
      Alert.alert(
        options?.entryId ? "Update failed" : "Transaction failed",
        error.message,
      );
    }
  });
}

export function useFinanceTransactionSubmit(
  args: UseFinanceTransactionSubmitArgs,
): (data: AddTransactionData, options?: { entryId: string }) => void {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const {
    orgId,
    profileUid,
    selectedEntity,
    ledgerTransactions,
    tripRows,
    editingEntry,
    setLedgerTransactions,
    setLedgerRefreshKey,
    setEditingEntry,
    setAddEntryContext,
    setShowTransactionModal,
    setEntitiesRefreshKey,
    setPendingDriverSalaryRequests,
    salaryRequestIdToPayAfterSubmitRef,
    onSuccessNavigate,
  } = args;

  return useCallback(
    (data: AddTransactionData, options?: { entryId: string }) => {
      if (!orgId) return;
      const today = new Date().toISOString().slice(0, 10);
      const transactionDate =
        data.transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(data.transactionDate)
          ? data.transactionDate.slice(0, 10)
          : options?.entryId && editingEntry?.transaction_date
            ? editingEntry.transaction_date.slice(0, 10)
            : today;
      const vehicleNumberFromEntity =
        selectedEntity?.entityType === "VEHICLE"
          ? (selectedEntity.data.name ?? null)
          : null;
      const isVehicleExpense =
        data.type === "out" && selectedEntity?.entityType === "VEHICLE";
      const driverPaymentLabelRaw =
        data.type === "out" &&
        data.driverPaymentType &&
        (() => {
          const found = DRIVER_PAYMENT_TYPES.find(
            (t) => t.type === data.driverPaymentType,
          );
          return found?.label ?? data.driverPaymentType;
        })();
      const driverPaymentLabel =
        typeof driverPaymentLabelRaw === "string"
          ? driverPaymentLabelRaw
          : undefined;
      let baseDescription = (data.type === "in"
        ? (data.category ?? "ENTRY")
        : data.type === "out"
          ? (driverPaymentLabel ?? data.category ?? "ENTRY")
          : "ENTRY") as string;
          
      const descParts = [baseDescription];
      if (data.paymentMode) {
        const modeName =
          data.paymentMode === "UPI"
            ? "UPI"
            : data.paymentMode === "BANK"
              ? "Bank Transfer"
              : data.paymentMode === "CHEQUE"
                ? "Cheque"
                : data.paymentMode === "CASH"
                  ? "Cash"
                  : data.paymentMode;
        descParts.push(`Mode: ${modeName}`);
      }
      if (data.paymentReference) {
        descParts.push(`UTR: ${data.paymentReference}`);
      }
      
      const payload = {
        trip_id: data.tripId ?? null,
        trip_number: data.tripNumber ?? null,
        party_name: data.partyName || "—",
        description: descParts.join(' | '),
        amount_in: data.type === "in" ? data.amount : 0,
        amount_out: data.type === "out" ? data.amount : 0,
        transaction_date: transactionDate,
        contact_id: data.contactId ?? null,
        contact_type: data.contactType ?? null,
        indent_id: data.indentId ?? null,
        vehicle_number: data.vehicleNumber ?? vehicleNumberFromEntity ?? null,
        driver_name: isVehicleExpense ? null : (data.driverName ?? null),
      };

      const runSubmit = () =>
        doSubmit(
          orgId,
          options,
          payload,
          data,
          transactionDate,
          driverPaymentLabel,
          vehicleNumberFromEntity,
          isVehicleExpense,
          profileUid,
          setLedgerTransactions,
          setLedgerRefreshKey,
          setEditingEntry,
          setAddEntryContext,
          setShowTransactionModal,
          setEntitiesRefreshKey,
          setPendingDriverSalaryRequests,
          salaryRequestIdToPayAfterSubmitRef,
          onSuccessNavigate,
          queryClient,
        );

      if (!options?.entryId && (ledgerTransactions ?? []).length > 0) {
        const amountIn = payload.amount_in;
        const amountOut = payload.amount_out;
        const sameEntry = (ledgerTransactions ?? []).some((r) => {
          const sameTrip = (r.trip_id ?? null) === (payload.trip_id ?? null);
          const sameContact =
            (r.contact_id ?? null) === (payload.contact_id ?? null);
          const sameDate =
            (r.transaction_date ?? "").slice(0, 10) ===
            (payload.transaction_date ?? "").slice(0, 10);
          const sameAmount =
            (Number(r.amount_in ?? 0) === amountIn &&
              Number(r.amount_out ?? 0) === amountOut) ||
            (amountIn > 0 && Number(r.amount_in ?? 0) === amountIn) ||
            (amountOut > 0 && Number(r.amount_out ?? 0) === amountOut);
          return sameTrip && sameContact && sameDate && sameAmount;
        });
        if (sameEntry) {
          Alert.alert(
            "Similar entry exists",
            "An entry with the same trip, party, amount and date already exists. Add anyway?",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Add anyway", onPress: runSubmit },
            ],
          );
          return;
        }
      }

      // Overpayment check: client received must not exceed billed; supplier paid must not exceed payables.
      // Applies to both new entries and edits (when editing, exclude current entry from received/paid).
      const isClientIn =
        data.type === "in" &&
        data.contactType === "client" &&
        data.contactId != null;
      const isSupplierOut =
        data.type === "out" &&
        data.contactType === "supplier" &&
        data.contactId != null;
      const editingId = options?.entryId ?? null;
      const entryBeingEdited =
        editingId && editingEntry?.id === editingId ? editingEntry : null;

      if (isClientIn) {
        let billed = 0;
        for (let i = 0; i < tripRows.length; i++) {
          const row = tripRows[i];
          if (row.client_id === data.contactId)
            billed += Number(row.client_price ?? 0);
        }
        let received = 0;
        const txs = ledgerTransactions ?? [];
        for (let i = 0; i < txs.length; i++) {
          const r = txs[i];
          if (r.contact_type === "client" && r.contact_id === data.contactId)
            received += Number(r.amount_in ?? 0);
        }
        if (entryBeingEdited?.contact_type === "client" && entryBeingEdited.contact_id === data.contactId)
          received -= Number(entryBeingEdited.amount_in ?? 0);
        const receivedAfter = received + data.amount;
        if (receivedAfter > billed && billed > 0) {
          Alert.alert(
            t("overpaymentTitle"),
            t("overpaymentClientMessage"),
            [
              { text: "Cancel", style: "cancel" },
              { text: "Continue", onPress: runSubmit },
            ],
          );
          return;
        }
      }
      if (isSupplierOut) {
        let payables = 0;
        for (let i = 0; i < tripRows.length; i++) {
          const row = tripRows[i];
          if (row.supplier_id === data.contactId)
            payables += Number(row.supplier_rate ?? 0);
        }
        let paid = 0;
        const txs = ledgerTransactions ?? [];
        for (let i = 0; i < txs.length; i++) {
          const r = txs[i];
          if (r.contact_type === "supplier" && r.contact_id === data.contactId)
            paid += Number(r.amount_out ?? 0);
        }
        if (entryBeingEdited?.contact_type === "supplier" && entryBeingEdited.contact_id === data.contactId)
          paid -= Number(entryBeingEdited.amount_out ?? 0);
        const paidAfter = paid + data.amount;
        if (paidAfter > payables && payables > 0) {
          Alert.alert(
            t("overpaymentTitle"),
            t("overpaymentSupplierMessage"),
            [
              { text: "Cancel", style: "cancel" },
              { text: "Continue", onPress: runSubmit },
            ],
          );
          return;
        }
      }

      runSubmit();
    },
    [
      orgId,
      profileUid,
      selectedEntity,
      ledgerTransactions,
      tripRows,
      editingEntry,
      t,
      setLedgerTransactions,
      setLedgerRefreshKey,
      setEditingEntry,
      setAddEntryContext,
      setShowTransactionModal,
      setEntitiesRefreshKey,
      setPendingDriverSalaryRequests,
      salaryRequestIdToPayAfterSubmitRef,
      onSuccessNavigate,
      queryClient,
    ],
  );
}
