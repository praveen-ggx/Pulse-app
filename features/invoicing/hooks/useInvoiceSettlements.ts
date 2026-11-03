/**
 * Settled amount per issued invoice (confirmed receipts + issued credit notes),
 * from invoice_payment_summaries. Replaces the client-written
 * tax_snapshot.receipt_applied, which nothing reads for balances any more.
 * Not ready / unavailable means the caller must show amounts as unavailable.
 */
import { fetchInvoicePaymentSummaries } from "@/features/invoicing/services/invoicePayment.service";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type InvoiceSettlement = {
  received: number;
  credited: number;
  outstanding: number;
  status: string;
};

const CHUNK = 500;

export function useInvoiceSettlements(orgId: string | null, invoiceIds: readonly string[]) {
  const ids = useMemo(() => [...new Set(invoiceIds.filter(Boolean))].sort(), [invoiceIds]);
  const query = useQuery({
    queryKey: ["invoice-payment-summaries", orgId, "settlements", ids.join(",")],
    queryFn: async () => {
      const map = new Map<string, InvoiceSettlement>();
      for (let i = 0; i < ids.length; i += CHUNK) {
        const result = await fetchInvoicePaymentSummaries(orgId!, ids.slice(i, i + CHUNK));
        if (result.error) return { map, error: result.error, unavailable: result.unavailable };
        for (const row of result.summaries) {
          map.set(row.invoiceId, {
            received: row.amountReceived,
            credited: row.amountCredited,
            outstanding: row.amountOutstanding,
            status: row.paymentStatus,
          });
        }
      }
      return { map, error: null as string | null, unavailable: false };
    },
    enabled: Boolean(orgId) && ids.length > 0,
    staleTime: 15_000,
  });
  const ready = ids.length === 0 || (query.isSuccess && !query.data?.error);
  return {
    ready,
    loading: query.isLoading,
    error: query.data?.error ?? null,
    unavailable: query.data?.unavailable ?? false,
    /** Received + credited; undefined when not known (do not treat as zero). */
    settledOf: (invoiceId: string): number | undefined => {
      const row = query.data?.map.get(invoiceId);
      return row ? Math.round((row.received + row.credited) * 100) / 100 : undefined;
    },
    get: (invoiceId: string) => query.data?.map.get(invoiceId),
  };
}
