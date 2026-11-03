import { fetchCustomerReceipts } from "@/features/invoicing/services/customerReceiptList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import {
  listWorkspaceNotes,
  workspaceTripIds,
  type WorkspaceNote,
} from "@/features/invoicing/utils/workspaceFinance.util";
import { fetchTripFinanceAdjustmentsByTripIds, type TripAdjustment } from "@/features/trips/services/tripAdjustments";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export function useWorkspaceFinance({
  orgId,
  clientId,
  clientName,
  trips,
}: {
  orgId: string | null;
  clientId: string | null;
  clientName: string | null;
  trips: readonly InvoicingTripView[];
}) {
  const tripIds = useMemo(() => workspaceTripIds(trips), [trips]);
  const notesQuery = useQuery({
    queryKey: ["workspace-cn-dn", "list", orgId, tripIds],
    queryFn: async () => adjustmentRows(await fetchTripFinanceAdjustmentsByTripIds(tripIds)),
    enabled: Boolean(orgId) && tripIds.length > 0,
    staleTime: 15_000,
  });
  const receiptsQuery = useQuery({
    queryKey: ["customer-receipts", orgId, clientId, clientName],
    queryFn: () => fetchCustomerReceipts({ orgId: orgId!, clientId, clientName }),
    enabled: Boolean(orgId && clientName),
    staleTime: 15_000,
  });
  const notes = useMemo(
    () => listWorkspaceNotes(adjustmentRows(notesQuery.data), trips),
    [notesQuery.data, trips],
  );
  return { tripIds, notes, notesQuery, receiptsQuery, notesLoading: notesQuery.isLoading };
}

export type { WorkspaceNote };

/** The fetch returns a Map. A persisted query can also come back as a plain object. Both become a list. */
function adjustmentRows(data: unknown): TripAdjustment[] {
  if (Array.isArray(data)) return data.filter(isAdjustment);
  const lists: unknown[] = [];
  if (data instanceof Map) data.forEach((list) => lists.push(list));
  else if (data && typeof data === "object") lists.push(...Object.values(data));
  return lists.flatMap((list) => (Array.isArray(list) ? list.filter(isAdjustment) : []));
}

function isAdjustment(value: unknown): value is TripAdjustment {
  if (!value || typeof value !== "object") return false;
  const row = value as TripAdjustment;
  return typeof row.id === "string" && typeof row.trip_id === "string";
}
