/**
 * Batches load of `trip_finance_adjustments` for finance aggregation and entity trip rows.
 */
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import {
  fetchTripFinanceAdjustmentsByTripIds,
  normTripFinanceAdjustmentKey,
} from "@/features/trips/services/tripAdjustments";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

function sortedTripIdsKey(ids: string[]): string {
  const u = [...new Set(ids.filter(Boolean).map((id) => String(id)))];
  u.sort();
  return u.join("|");
}

export function tripFinanceAdjustmentsQueryOptions(
  organizationId: string | null | undefined,
  tripIds: string[],
) {
  const filteredIds = [...new Set(tripIds.filter(Boolean).map((id) => String(id)))];
  const sortedKey = sortedTripIdsKey(filteredIds);
  return {
    queryKey: [...queryKeys.tripFinanceAdjustmentsRoot, organizationId ?? "", sortedKey] as const,
    queryFn: () => fetchTripFinanceAdjustmentsByTripIds(filteredIds),
    enabled: !!organizationId && filteredIds.length > 0,
    staleTime: STALE.moderate,
  };
}

export function useTripFinanceAdjustmentsMap(
  organizationId: string | null | undefined,
  tripIds: string[],
) {
  const filteredIds = useMemo(
    () => [...new Set(tripIds.filter(Boolean).map((id) => String(id)))],
    [tripIds],
  );

  const q = useQuery({
    ...tripFinanceAdjustmentsQueryOptions(organizationId, filteredIds),
  });

  const record = useMemo<Record<string, TripAdjustment[]>>(() => {
    const m = q.data;
    if (!m) return {};
    const rec: Record<string, TripAdjustment[]> = {};
    if (m instanceof Map) {
      // Normal path: fresh fetch returns a Map
      m.forEach((v, k) => { if (v.length) rec[k] = v; });
    } else {
      // Persisted cache path: JSON serialization converts Map → plain object
      for (const k of Object.keys(m as Record<string, TripAdjustment[]>)) {
        const v = (m as Record<string, TripAdjustment[]>)[k];
        if (Array.isArray(v) && v.length) rec[k] = v;
      }
    }
    return rec;
  }, [q.data]);

  // Normalise to Map so callers always get a Map (re-wrap if deserialised as plain object)
  const map = useMemo<Map<string, TripAdjustment[]> | null>(() => {
    const m = q.data;
    if (!m) return null;
    if (m instanceof Map) return m;
    const restored = new Map<string, TripAdjustment[]>();
    for (const k of Object.keys(m as Record<string, TripAdjustment[]>)) {
      restored.set(k, (m as Record<string, TripAdjustment[]>)[k]);
    }
    return restored;
  }, [q.data]);

  return {
    map,
    record,
    isLoading: q.isPending,
    refetch: q.refetch,
  };
}

/** One note is visible on the invoice, trip finance, the finance ledger, and debit control. */
export function invalidateTripFinanceNoteQueries(
  qc: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => Promise<unknown> },
) {
  void qc.invalidateQueries({ queryKey: [...queryKeys.tripFinanceAdjustmentsRoot] });
  void qc.invalidateQueries({ queryKey: ["q", "finance-aggregation"] });
  void qc.invalidateQueries({ queryKey: ["q", "debit-control"] });
  void qc.invalidateQueries({ queryKey: ["q", "invoicing"] });
  void qc.invalidateQueries({ queryKey: ["q", "trips", "detail"] });
}

export function useInvalidateTripFinanceAdjustments() {
  const qc = useQueryClient();
  return useCallback(() => {
    invalidateTripFinanceNoteQueries(qc);
  }, [qc]);
}

/** Lookup adjustments for a trip id using the record from {@link useTripFinanceAdjustmentsMap}. */
export function adjustmentsForTripId(
  record: Record<string, TripAdjustment[]> | undefined,
  tripId: string | null | undefined,
): TripAdjustment[] {
  if (!record || !tripId) return [];
  return record[normTripFinanceAdjustmentKey(tripId)] ?? [];
}
