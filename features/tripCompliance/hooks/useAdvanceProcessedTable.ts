import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { subscribeSupplierBankChanged } from "@/features/suppliers/utils/supplierBankEvents.util";
import { fetchAdvanceProcessedEnrichment } from "@/features/tripCompliance/services/complianceAdvanceProcessed.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { useEffect, useMemo } from "react";

/**
 * Enrichment for the Advance Processed table. Keyed on each trip's advance
 * transaction + UTR + supplier, so a trip arriving from Verified (or a UTR saved
 * elsewhere) refetches automatically while the previous rows stay on screen.
 * Supplier Banking edits refetch through the in-app bank-changed signal.
 */
export function useAdvanceProcessedTable(orgId: string | null | undefined, summaries: ComplianceTripSummary[]) {
  const queryClient = useQueryClient();
  const signature = useMemo(
    () =>
      summaries
        .filter((s) => s.advance)
        .map((s) =>
          [s.trip.id, s.advance?.transactionId, s.advance?.utr ?? "", s.trip.supplier_id ?? "", s.complianceVerifiedBy ?? ""].join(":"),
        )
        .sort()
        .join("|"),
    [summaries],
  );
  const supplierIds = useMemo(
    () => new Set(summaries.map((s) => s.trip.supplier_id?.trim()).filter(Boolean) as string[]),
    [summaries],
  );

  useEffect(
    () =>
      subscribeSupplierBankChanged((supplierId) => {
        if (!supplierIds.has(supplierId)) return;
        void queryClient.invalidateQueries({ queryKey: ["q", "tripCompliance", "advanceProcessed"] });
      }),
    [queryClient, supplierIds],
  );

  return useQuery({
    queryKey: queryKeys.tripCompliance.advanceProcessed(orgId ?? "", signature),
    queryFn: () => fetchAdvanceProcessedEnrichment(orgId!, summaries),
    enabled: Boolean(orgId) && signature.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}
