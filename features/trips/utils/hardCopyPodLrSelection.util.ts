import { readStoredElrSnapshot } from "@/features/trips/services/elrSnapshot.util";
import { parseLrFieldValues } from "@/features/trips/services/lrDocumentOcr.util";
import { expandLR } from "@/lib/utils/lr";

/** One LR on the trip the document was uploaded to. Trip ID is never typed or looked up from the LR number. */
export type HardCopyPodLrOption = {
  lrNumber: string;
  tripId: string;
  tripDisplayId: string;
  /** Already logged as hard-copy received on this trip. */
  alreadyReceived?: boolean;
};

export type HardCopyPodLrDocument = {
  /** `trip_documents.trip_id` for this upload. */
  tripId: string;
  documentNumber: string | null | undefined;
  /** `{tripId}/lr/...` written at upload. Used when it names a different known trip than `tripId`. */
  storagePath?: string | null;
};

export function hardCopyPodLrKey(
  option: Pick<HardCopyPodLrOption, "tripId" | "lrNumber">,
): string {
  return `${option.tripId.trim()}::${option.lrNumber.trim()}`;
}

export function lrNumbersFromDocumentNumber(raw: string | null | undefined): string[] {
  const snapshotNumber = readStoredElrSnapshot(raw)?.lrNumber.trim() ?? "";
  const parsed = (snapshotNumber || parseLrFieldValues(raw).lrNumber).trim();
  if (!parsed) return [];
  const expanded = expandLR(parsed)
    .map((value) => value.trim())
    .filter(Boolean);
  return expanded.length > 0 ? Array.from(new Set(expanded)) : [parsed];
}

/**
 * Trip the file was uploaded to.
 * The storage path is fixed at upload (`{tripId}/lr/...`). When that id is a
 * known trip and the row's `trip_id` points somewhere else, keep the upload trip.
 * Never resolves a trip by searching for the LR number.
 */
export function lrDocumentTripId(input: {
  tripId: string;
  storagePath?: string | null;
  knownTripIds?: ReadonlySet<string>;
}): string {
  const column = input.tripId.trim();
  const pathTrip = (input.storagePath ?? "").replace(/^\/+/, "").split("/")[0]?.trim() ?? "";
  if (!pathTrip || pathTrip === column) return column;
  if (input.knownTripIds && !input.knownTripIds.has(pathTrip)) return column;
  return pathTrip;
}

export function hardCopyPodTripDisplayId(
  tripId: string,
  tripDisplayById: ReadonlyMap<string, string>,
): string {
  const exact = tripDisplayById.get(tripId)?.trim();
  if (exact) return exact;
  const wanted = tripId.trim().toLowerCase();
  if (!wanted) return tripId;
  for (const [id, label] of tripDisplayById) {
    if (id.trim().toLowerCase() === wanted && label.trim()) return label.trim();
  }
  return tripId;
}

export function hardCopyPodLrOptionsFromDocuments(
  documents: readonly HardCopyPodLrDocument[],
  tripDisplayById: ReadonlyMap<string, string>,
): HardCopyPodLrOption[] {
  const knownTripIds = new Set(tripDisplayById.keys());
  const byKey = new Map<string, HardCopyPodLrOption>();
  for (const doc of documents) {
    const tripId = lrDocumentTripId({
      tripId: doc.tripId,
      storagePath: doc.storagePath,
      knownTripIds,
    });
    if (!tripId) continue;
    const tripDisplayId = hardCopyPodTripDisplayId(tripId, tripDisplayById);
    for (const lrNumber of lrNumbersFromDocumentNumber(doc.documentNumber)) {
      const option = { lrNumber, tripId, tripDisplayId };
      byKey.set(hardCopyPodLrKey(option), option);
    }
  }
  return Array.from(byKey.values());
}

export function hardCopyPodLrOptionsFromTrips(
  trips: Array<{
    tripId: string;
    tripDisplayId: string;
    lrDocumentNumbers: Array<string | null | undefined>;
  }>,
): HardCopyPodLrOption[] {
  const tripDisplayById = new Map(
    trips.map((trip) => [trip.tripId.trim(), trip.tripDisplayId.trim() || trip.tripId.trim()]),
  );
  return hardCopyPodLrOptionsFromDocuments(
    trips.flatMap((trip) =>
      trip.lrDocumentNumbers.map((documentNumber) => ({
        tripId: trip.tripId,
        documentNumber,
      })),
    ),
    tripDisplayById,
  );
}

/** Unique trip ids for the checked LRs, in option order. */
export function selectedHardCopyPodTripIds(
  options: HardCopyPodLrOption[],
  selectedKeys: ReadonlySet<string>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    if (!selectedKeys.has(hardCopyPodLrKey(option))) continue;
    if (seen.has(option.tripId)) continue;
    seen.add(option.tripId);
    ids.push(option.tripId);
  }
  return ids;
}
