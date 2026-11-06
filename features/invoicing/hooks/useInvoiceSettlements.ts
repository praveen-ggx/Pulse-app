/**
 * Settled amount per issued invoice (confirmed receipts + issued credit notes),
 * from invoice_payment_summaries. Replaces the client-written
 * tax_snapshot.receipt_applied, which nothing reads for balances any more.
 * Not ready / unavailable means the caller must show amounts as unavailable.
 *
 * Settlement rows are a plain Record (not Map). PersistQueryClient JSON
 * rehydration turns Map into `{}`, which made `.map.get` crash IssuedInvoicesPanel.
 */
import { fetchInvoicePaymentSummaries } from "@/features/invoicing/services/invoicePayment.service";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

export type InvoiceSettlement = {
  received: number;
  credited: number;
  outstanding: number;
  status: string;
};

const CHUNK = 500;

/** Bump when the cached shape changes so stale persisted Map payloads are ignored. */
const SETTLEMENTS_CACHE_VERSION = "byId-v2";

type SettlementsPayload = {
  byId: Record<string, InvoiceSettlement>;
  error: string | null;
  unavailable: boolean;
};

function isSettlementRow(value: unknown): value is InvoiceSettlement {
  if (!value || typeof value !== "object") return false;
  const row = value as InvoiceSettlement;
  return (
    typeof row.received === "number" &&
    typeof row.credited === "number" &&
    typeof row.outstanding === "number"
  );
}

/** Normalize Record, live Map, or JSON-rehydrated plain object. Never call `.get` on a non-Map. */
export function normalizeSettlementsPayload(raw: unknown): SettlementsPayload {
  if (!raw || typeof raw !== "object") {
    return { byId: {}, error: null, unavailable: false };
  }
  const data = raw as {
    byId?: unknown;
    map?: unknown;
    error?: unknown;
    unavailable?: unknown;
  };
  const byId: Record<string, InvoiceSettlement> = {};

  const takeEntries = (source: unknown) => {
    if (!source) return;
    if (source instanceof Map) {
      for (const [key, value] of source.entries()) {
        if (typeof key === "string" && isSettlementRow(value)) byId[key] = value;
      }
      return;
    }
    if (typeof source === "object" && !Array.isArray(source)) {
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        if (isSettlementRow(value)) byId[key] = value;
      }
    }
  };

  takeEntries(data.byId);
  if (Object.keys(byId).length === 0) takeEntries(data.map);

  return {
    byId,
    error: typeof data.error === "string" ? data.error : data.error == null ? null : String(data.error),
    unavailable: Boolean(data.unavailable),
  };
}

export function useInvoiceSettlements(orgId: string | null, invoiceIds: readonly string[]) {
  const ids = useMemo(() => [...new Set(invoiceIds.filter(Boolean))].sort(), [invoiceIds]);
  const query = useQuery({
    queryKey: [
      "invoice-payment-summaries",
      SETTLEMENTS_CACHE_VERSION,
      orgId,
      "settlements",
      ids.join(","),
    ],
    queryFn: async (): Promise<SettlementsPayload> => {
      const byId: Record<string, InvoiceSettlement> = {};
      for (let i = 0; i < ids.length; i += CHUNK) {
        const result = await fetchInvoicePaymentSummaries(orgId!, ids.slice(i, i + CHUNK));
        if (result.error) {
          return { byId, error: result.error, unavailable: result.unavailable };
        }
        for (const row of result.summaries) {
          byId[row.invoiceId] = {
            received: row.amountReceived,
            credited: row.amountCredited,
            outstanding: row.amountOutstanding,
            status: row.paymentStatus,
          };
        }
      }
      return { byId, error: null, unavailable: false };
    },
    select: normalizeSettlementsPayload,
    enabled: Boolean(orgId) && ids.length > 0,
    staleTime: 15_000,
  });
  const ready = ids.length === 0 || (query.isSuccess && !query.data?.error);
  const settledOf = useCallback(
    (invoiceId: string): number | undefined => {
      const row = query.data?.byId[invoiceId];
      return row ? Math.round((row.received + row.credited) * 100) / 100 : undefined;
    },
    [query.data],
  );
  const get = useCallback(
    (invoiceId: string) => query.data?.byId[invoiceId],
    [query.data],
  );
  return {
    ready,
    loading: query.isLoading,
    error: query.data?.error ?? null,
    unavailable: query.data?.unavailable ?? false,
    /** Received + credited; undefined when not known (do not treat as zero). */
    settledOf,
    get,
  };
}
