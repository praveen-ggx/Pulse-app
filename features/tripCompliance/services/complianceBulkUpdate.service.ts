import { interpretLedgerRowStructured } from "@/features/finance/ledger/ledgerEntryModel";
import { supabase } from "@/lib/supabase";
import { mapWithConcurrency } from "@/lib/pagination";
import { getTripOperationalDisplayCode } from "@/features/operations/display/operationalDisplay";
import { isCashPaymentMode, readLedgerRequestId } from "@/features/tripCompliance/utils/compliancePaymentReference.util";
import { toComplianceTransactionDateInput } from "@/features/tripCompliance/utils/compliancePaymentDate.util";
import {
  classifyBulkUpdateRows,
  type BulkSheetRow,
  type BulkUpdatePaymentMatch,
  type BulkUpdatePreviewRow,
  type BulkUpdateTripMatch,
} from "@/features/tripCompliance/utils/complianceBulkUpdate.util";
import {
  updateCompliancePaymentReference,
  updateCompliancePaymentTransactionDate,
  type ComplianceLedgerCategory,
} from "@/features/tripCompliance/services/tripComplianceWrite.service";

const TRIP_COLUMNS =
  "id, trip_number, trip_code, trip_operational_code, display_trip_id, booking_ref";
const CODE_COLUMNS = [
  "trip_number",
  "trip_code",
  "trip_operational_code",
  "display_trip_id",
  "booking_ref",
] as const;
const CHUNK = 80;

type TripHit = {
  id: string;
  trip_number?: string | null;
  trip_code?: string | null;
  trip_operational_code?: string | null;
  display_trip_id?: string | null;
  booking_ref?: string | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function readTripChunks(
  organizationId: string,
  column: "id" | (typeof CODE_COLUMNS)[number],
  values: string[],
): Promise<TripHit[]> {
  const hits: TripHit[] = [];
  for (let index = 0; index < values.length; index += CHUNK) {
    const chunk = values.slice(index, index + CHUNK);
    const { data, error } = await supabase()
      .from("trips")
      .select(TRIP_COLUMNS)
      .eq("organization_id", organizationId)
      .in(column, chunk);
    if (error) throw new Error(error.message);
    hits.push(...((data ?? []) as TripHit[]));
  }
  return hits;
}

function tripKeys(trip: TripHit): string[] {
  return [trip.id, trip.trip_operational_code, trip.trip_code, trip.display_trip_id, trip.trip_number, trip.booking_ref]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
}

export async function previewComplianceBulkUpdate(params: {
  organizationId: string;
  category: ComplianceLedgerCategory;
  rows: BulkSheetRow[];
}): Promise<BulkUpdatePreviewRow[]> {
  const keys = [...new Set(params.rows.map((row) => row.tripKey.trim()).filter(Boolean))];
  const uuids = keys.filter(isUuid);
  const codes = keys.filter((key) => !isUuid(key));
  const hits = (
    await Promise.all([
      uuids.length ? readTripChunks(params.organizationId, "id", uuids) : Promise.resolve([]),
      ...CODE_COLUMNS.map((column) => (codes.length ? readTripChunks(params.organizationId, column, codes) : Promise.resolve([]))),
    ])
  ).flat();

  const trips = new Map<string, BulkUpdateTripMatch>();
  for (const hit of hits) {
    if (!trips.has(hit.id)) {
      trips.set(hit.id, {
        id: hit.id,
        label: getTripOperationalDisplayCode(hit),
        keys: tripKeys(hit),
      });
    }
  }

  const tripIds = [...trips.keys()];
  const payments: BulkUpdatePaymentMatch[] = [];
  for (let index = 0; index < tripIds.length; index += CHUNK) {
    const chunk = tripIds.slice(index, index + CHUNK);
    const { data, error } = await supabase()
      .from("transactions")
      .select("id, trip_id, description, transaction_date, ledger_category, payment_reference, amount_out, amount_in")
      .in("trip_id", chunk)
      .eq("ledger_category", params.category);
    if (error) throw new Error(error.message);
    const byTrip = new Map<string, typeof data>();
    for (const row of data ?? []) {
      const tripId = row.trip_id as string | null;
      if (!tripId) continue;
      const list = byTrip.get(tripId) ?? [];
      list.push(row);
      byTrip.set(tripId, list);
    }
    for (const [tripId, list] of byTrip) {
      const latest = [...(list ?? [])].sort((a, b) =>
        String(b.transaction_date ?? "").localeCompare(String(a.transaction_date ?? "")),
      )[0];
      if (!latest) continue;
      const structured = interpretLedgerRowStructured({ description: latest.description });
      const mode = structured.payment_mode ?? "";
      payments.push({
        tripId,
        transactionId: latest.id as string,
        utr: String(latest.payment_reference ?? structured.reference_number ?? "").trim(),
        date: toComplianceTransactionDateInput(latest.transaction_date as string),
        mode,
        cash: isCashPaymentMode(mode),
        requestId: readLedgerRequestId(latest.description as string | null) ?? "",
      });
    }
  }

  return classifyBulkUpdateRows({
    rows: params.rows,
    trips: [...trips.values()],
    payments,
  });
}

export type BulkUpdateApplyResult = {
  rowIndex: number;
  tripId: string;
  transactionId: string;
  error: Error | null;
};

export async function applyComplianceBulkUpdate(params: {
  category: ComplianceLedgerCategory;
  rows: BulkUpdatePreviewRow[];
}): Promise<BulkUpdateApplyResult[]> {
  const ready = params.rows.filter((row) => row.tag === "ready" && row.included && row.tripId && row.transactionId);
  return mapWithConcurrency(ready, 4, async (row) => {
    const tripId = row.tripId as string;
    const transactionId = row.transactionId as string;
    const utrChanges = Boolean(row.nextUtr) && row.nextUtr !== row.currentUtr;
    const dateChanges = Boolean(row.nextDate) && row.nextDate !== row.currentDate;
    if (utrChanges) {
      const { error } = await updateCompliancePaymentReference({
        tripId,
        transactionId,
        category: params.category,
        utr: row.nextUtr,
      });
      if (error) return { rowIndex: row.rowIndex, tripId, transactionId, error };
    }
    if (dateChanges) {
      const { error } = await updateCompliancePaymentTransactionDate({
        tripId,
        transactionId,
        category: params.category,
        transactionDate: row.nextDate,
      });
      if (error) return { rowIndex: row.rowIndex, tripId, transactionId, error };
    }
    return { rowIndex: row.rowIndex, tripId, transactionId, error: null };
  });
}
