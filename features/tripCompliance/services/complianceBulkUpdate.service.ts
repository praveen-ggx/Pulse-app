import { interpretLedgerRowStructured } from "@/features/finance/ledger/ledgerEntryModel";
import { supabase } from "@/lib/supabase";
import { mapWithConcurrency } from "@/lib/pagination";
import { getTripOperationalDisplayCode } from "@/features/operations/display/operationalDisplay";
import { lrNumberFromStoredDocumentNumber, normalizeOrgLrNumber } from "@/features/trips/services/orgLrNumber.util";
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
  "id, trip_number, trip_code, trip_operational_code, display_trip_id, booking_ref, client_price";
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
  client_price?: number | string | null;
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
      .is("deleted_at", null)
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

type LrDoc = { trip_id: string | null; document_number: string | null };

/** LR numbers already stored on these trips, normalized the same way as a file cell. */
export async function lrNumbersByTrip(tripIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let index = 0; index < tripIds.length; index += CHUNK) {
    const chunk = tripIds.slice(index, index + CHUNK);
    const { data, error } = await supabase()
      .from("trip_documents")
      .select("trip_id, document_number")
      .eq("document_type", "lr")
      .in("trip_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as LrDoc[]) {
      const tripId = (row.trip_id ?? "").trim();
      const lr = lrNumberFromStoredDocumentNumber(row.document_number);
      if (!tripId || !lr) continue;
      const list = out.get(tripId) ?? [];
      if (!list.includes(lr)) list.push(lr);
      out.set(tripId, list);
    }
  }
  return out;
}

/**
 * Trips in this workspace whose LR document stores one of these numbers.
 * The match is the parsed LR, not a substring of the stored JSON.
 */
export async function tripIdsByLrNumber(organizationId: string, lrNumbers: string[]): Promise<Map<string, string[]>> {
  const wanted = [...new Set(lrNumbers.map((value) => normalizeOrgLrNumber(value)).filter(Boolean))];
  const out = new Map<string, string[]>();
  for (let index = 0; index < wanted.length; index += 20) {
    const chunk = wanted.slice(index, index + 20);
    const filter = chunk
      .map((lr) => `document_number.ilike.%${lr.replace(/[%_,.()]/g, "")}%`)
      .filter((clause) => clause !== "document_number.ilike.%%")
      .join(",");
    if (!filter) continue;
    const { data, error } = await supabase()
      .from("trip_documents")
      .select("trip_id, document_number")
      .eq("document_type", "lr")
      .or(filter);
    if (error) throw new Error(error.message);
    const candidateIds = [...new Set(((data ?? []) as LrDoc[]).map((row) => (row.trip_id ?? "").trim()).filter(Boolean))];
    const localIds = new Set<string>();
    for (let tripIndex = 0; tripIndex < candidateIds.length; tripIndex += CHUNK) {
      const tripChunk = candidateIds.slice(tripIndex, tripIndex + CHUNK);
      const { data: localTrips, error: tripError } = await supabase()
        .from("trips")
        .select("id")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .in("id", tripChunk);
      if (tripError) throw new Error(tripError.message);
      for (const trip of localTrips ?? []) localIds.add(String(trip.id));
    }
    for (const row of (data ?? []) as LrDoc[]) {
      const tripId = (row.trip_id ?? "").trim();
      const lr = lrNumberFromStoredDocumentNumber(row.document_number);
      if (!tripId || !localIds.has(tripId) || !lr || !chunk.includes(lr)) continue;
      const list = out.get(lr) ?? [];
      if (!list.includes(tripId)) list.push(tripId);
      out.set(lr, list);
    }
  }
  return out;
}

export async function previewComplianceBulkUpdate(params: {
  organizationId: string;
  category: ComplianceLedgerCategory;
  rows: BulkSheetRow[];
}): Promise<BulkUpdatePreviewRow[]> {
  const keys = [...new Set(params.rows.flatMap((row) => [row.tripKey.trim(), (row.lrKey ?? "").trim()]).filter(Boolean))];
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
        clientPrice: hit.client_price == null || hit.client_price === "" ? null : Number(hit.client_price),
      });
    }
  }

  const matchedCodes = new Set([...trips.values()].flatMap((trip) => trip.keys.map((key) => key.toUpperCase())));
  const unmatchedLr = [...new Set(params.rows.map((row) => normalizeOrgLrNumber(row.lrKey)).filter((lr) => lr && !matchedCodes.has(lr)))];
  if (unmatchedLr.length > 0) {
    const byLr = await tripIdsByLrNumber(params.organizationId, unmatchedLr);
    const missingIds = [...new Set([...byLr.values()].flat())].filter((id) => !trips.has(id));
    if (missingIds.length > 0) {
      for (const hit of await readTripChunks(params.organizationId, "id", missingIds)) {
        if (!trips.has(hit.id)) {
          trips.set(hit.id, {
            id: hit.id,
            label: getTripOperationalDisplayCode(hit),
            keys: tripKeys(hit),
            clientPrice: hit.client_price == null || hit.client_price === "" ? null : Number(hit.client_price),
          });
        }
      }
    }
    for (const [lr, ids] of byLr) {
      for (const id of ids) {
        const trip = trips.get(id);
        if (!trip) continue;
        if (!trip.keys.some((key) => key.toUpperCase() === lr)) trip.keys.push(lr);
      }
    }
  }
  const lrByTrip = await lrNumbersByTrip([...trips.keys()]);
  for (const [id, numbers] of lrByTrip) {
    const trip = trips.get(id);
    if (!trip) continue;
    trip.lrKeys = numbers;
    for (const lr of numbers) {
      if (!trip.keys.some((key) => key.toUpperCase() === lr)) trip.keys.push(lr);
    }
  }

  const tripIds = [...trips.keys()];
  const payments: BulkUpdatePaymentMatch[] = [];
  for (let index = 0; index < tripIds.length; index += CHUNK) {
    const chunk = tripIds.slice(index, index + CHUNK);
    const { data, error } = await supabase()
      .from("transactions")
      .select("id, trip_id, description, transaction_date, ledger_category, payment_reference, amount_out, amount_in")
      .eq("organization_id", params.organizationId)
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
        postedAmount:
          latest.amount_out != null
            ? Number(latest.amount_out)
            : latest.amount_in != null
              ? Number(latest.amount_in)
              : null,
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
