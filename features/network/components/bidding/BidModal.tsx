/**
 * BidModal — full-screen bid amount entry (ledger / GPay-style keypad).
 * Uses IndentBidAmountEntry + BidConfirmModal celebration (same as story bids).
 */
import { IndentBidAmountEntry } from "@/features/indents/components/bidding/IndentBidAmountEntry";
import {
  getIndentDisplayNumber,
  type DirectQuoteRow,
  type IndentRow,
} from "@/features/indents";
import { formatMarketplaceTransactionError } from "@/features/marketplace/utils/marketplaceErrorFormat.util";
import { acceptDirectQuoteCounter } from "@/features/indents/services/direct-quotes.service";
import {
  applyAcceptedCounter,
  openCounterAmount,
  routeDirectQuoteSubmit,
} from "@/features/indents/utils/bidding/directQuoteCounter.util";
import { submitNetworkQuote } from "@/features/network/services/networkPools.service";
import { useInvalidateIndents } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";
import { type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

interface BidModalProps {
  visible: boolean;
  load: IndentRow | null;
  orgId: string | null;
  myQuoteByIndentId: Map<string, DirectQuoteRow>;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  localBidHistoryByIndentId: Record<
    string,
    { amount: number; updatedAt: string }[]
  >;
  onUpdateLocalBidHistory: (
    indentId: string,
    entry: { amount: number; updatedAt: string },
  ) => void;
  queryClient: QueryClient;
  invalidateIndents: ReturnType<typeof useInvalidateIndents>;
  refetchMyQuotes: () => void;
  refetchMarketIndents: () => void;
  insets: { top: number; bottom: number };
  /** Pool member: the sheet must not name the shipper. */
  anonymous?: boolean;
}

export function BidModal({
  visible,
  load,
  orgId,
  myQuoteByIndentId,
  onClose,
  onSuccess,
  onUpdateLocalBidHistory,
  queryClient,
  invalidateIndents,
  refetchMyQuotes,
  refetchMarketIndents,
  anonymous = false,
}: BidModalProps) {
  const [entryError, setEntryError] = useState<string | undefined>();
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const successMsgRef = useRef("Offer Published");

  const activeBidQuote = useMemo(() => {
    if (!load) return null;
    return myQuoteByIndentId.get(load.id) ?? null;
  }, [load, myQuoteByIndentId]);

  const hasExistingQuote = activeBidQuote != null;
  const isPendingQuote =
    (activeBidQuote?.status ?? "").toLowerCase() === "pending";

  const handleClose = useCallback(() => {
    setEntryError(undefined);
    onClose();
  }, [onClose]);

  const submitQuoteAmount = useCallback(
    async (amount: number): Promise<boolean> => {
      if (!orgId || !load || submittingQuote) return false;
      const hadExistingQuote = !!myQuoteByIndentId.get(load.id);
      const existingQuoteBeforeSave = myQuoteByIndentId.get(load.id);
      const route = routeDirectQuoteSubmit(existingQuoteBeforeSave, amount);
      if (route.kind === "blocked") {
        setEntryError(route.message);
        return false;
      }
      try {
        setSubmittingQuote(true);
        const { error } =
          route.kind === "accept_counter"
            ? await acceptDirectQuoteCounter(route.quoteId, route.counterAmount)
            : await submitNetworkQuote(load.id, orgId, amount);
        if (error) {
          setEntryError(formatMarketplaceTransactionError(error.message));
          refetchMarketIndents();
          if (route.kind === "accept_counter") refetchMyQuotes();
          return false;
        }
        if (route.kind === "accept_counter") {
          queryClient.setQueryData<DirectQuoteRow[]>(
            [...queryKeys.indents.finite(orgId), "my-direct-quotes"],
            (rows) => applyAcceptedCounter(rows, route.quoteId, route.counterAmount),
          );
        }
        successMsgRef.current =
          route.kind === "accept_counter"
            ? "Counter accepted"
            : hadExistingQuote
              ? "Quote updated"
              : "Offer Published";
        invalidateIndents(orgId);
        await Promise.allSettled([
          queryClient.invalidateQueries({
            queryKey: [...queryKeys.indents.finite(orgId), "my-direct-quotes"],
          }),
          queryClient.invalidateQueries({
            queryKey: ["indents", load.id, "direct-quotes"],
          }),
          queryClient.invalidateQueries({
            queryKey: ["indents", "quote-counts"],
          }),
          refetchMyQuotes(),
          refetchMarketIndents(),
        ]);
        if (existingQuoteBeforeSave) {
          onUpdateLocalBidHistory(load.id, {
            amount: Number(existingQuoteBeforeSave.amount ?? 0),
            updatedAt:
              existingQuoteBeforeSave.updated_at ?? new Date().toISOString(),
          });
        }
        // Keep entry open — IndentBidAmountEntry shows BidConfirmModal success.
        return true;
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Unknown error while publishing offer.";
        setEntryError(msg);
        refetchMarketIndents();
        Alert.alert("Could not publish offer", msg);
        return false;
      } finally {
        setSubmittingQuote(false);
      }
    },
    [
      orgId,
      load,
      myQuoteByIndentId,
      invalidateIndents,
      queryClient,
      refetchMyQuotes,
      refetchMarketIndents,
      onUpdateLocalBidHistory,
      submittingQuote,
    ],
  );

  if (!load) return null;

  const targetRate = Number(load.supplier_target ?? load.client_price ?? 0);
  const vehicleType = (load.vehicle_type ?? "").trim() || undefined;
  const weightLabel =
    load.weight != null && Number(load.weight) > 0
      ? `${Number(load.weight)} KG`
      : undefined;
  const material = (load.load_type ?? "").trim() || undefined;
  const ownerName = anonymous
    ? undefined
    : (load.client_name ?? "").trim() ||
      (load.creator_organization_name ?? "").trim() ||
      undefined;

  return (
    <IndentBidAmountEntry
      visible={visible}
      onClose={handleClose}
      onSubmitAmount={submitQuoteAmount}
      onSuccessDone={() => onSuccess(successMsgRef.current)}
      indentDisplayNumber={getIndentDisplayNumber(load)}
      origin={load.pickup_area}
      destination={load.drop_location}
      vehicleType={vehicleType}
      weightLabel={weightLabel}
      material={material}
      ownerName={ownerName}
      targetRateInr={targetRate > 0 ? targetRate : undefined}
      initialAmount={
        openCounterAmount(activeBidQuote) ??
        (activeBidQuote?.amount != null ? Number(activeBidQuote.amount) : null)
      }
      isUpdate={hasExistingQuote && isPendingQuote}
      validationError={entryError}
      onClearValidationError={() => setEntryError(undefined)}
      onInvalidAmount={() =>
        setEntryError("Enter an amount greater than 0.")
      }
    />
  );
}
