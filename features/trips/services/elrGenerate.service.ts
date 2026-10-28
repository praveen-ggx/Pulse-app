import { supabase } from "@/lib/supabase";
import { buildCompletedElrSnapshot, isCompleteElrSnapshot, type ElrCompletionDraft } from "@/features/trips/services/elrCompletion.util";
import { generateElrPdfBytes } from "@/features/trips/services/elrPdf.util";
import {
  isElrAfterLoadingStage,
  readStoredElrSnapshot,
  serializeElrDocumentNumber,
  type ElrSnapshot,
  type ElrTripSource,
  type StoredElrDocument,
} from "@/features/trips/services/elrSnapshot.util";
import { checkOrgDuplicateLrNumbersForTrip } from "@/features/trips/services/orgLrDuplicate.service";
import { ORG_LR_DUPLICATE_MESSAGE } from "@/features/trips/services/orgLrNumber.util";
import { uploadTripDocument } from "@/features/trips/services/tripDocuments.service";

export type ElrGenerateResult =
  | {
      ok: true;
      alreadyExisted: boolean;
      viewUrl: string;
      snapshot: ElrSnapshot;
    }
  | { ok: false; reason: "missing"; missing: string[] }
  | { ok: false; reason: "unassigned" }
  | { ok: false; reason: "too_early" }
  | { ok: false; reason: "pdf" }
  | { ok: false; reason: "save"; message: string };

export async function findStoredElr(
  tripId: string,
): Promise<StoredElrDocument | null> {
  const id = tripId.trim();
  if (!id) return null;
  let data: Array<{
    id: string | null;
    storage_path: string | null;
    document_number: string | null;
  }> | null = null;
  try {
    const result = await supabase()
      .from("trip_documents")
      .select("id, storage_path, document_number, uploaded_at")
      .eq("trip_id", id)
      .eq("document_type", "lr")
      .order("uploaded_at", { ascending: false })
      .limit(8);
    if (result.error || !result.data?.length) return null;
    data = result.data;
  } catch {
    return null;
  }
  if (!data) return null;
  for (const row of data) {
    const snapshot = readStoredElrSnapshot(row.document_number);
    const storagePath = (row.storage_path ?? "").trim();
    if (!snapshot || !storagePath || !row.id) continue;
    return { id: row.id, storagePath, snapshot };
  }
  return null;
}

/** Reads the trip row. A client flag is not enough to prove a vehicle is assigned. */
async function readAssignedVehicle(tripId: string): Promise<
  | { ok: true; vehicleId: string; registration: string; status: string }
  | { ok: false; unassigned: true; status: string }
  | { ok: false; unassigned: false; status: string }
> {
  try {
    const { data, error } = await supabase()
      .from("trips")
      .select("vehicle_id, vehicle_display_number, status")
      .eq("id", tripId)
      .maybeSingle();
    if (error || !data) return { ok: false, unassigned: false, status: "" };
    const status = String(data.status ?? "").trim();
    const vehicleId = String(data.vehicle_id ?? "").trim();
    const registration = String(data.vehicle_display_number ?? "").trim();
    if (!vehicleId && !registration) return { ok: false, unassigned: true, status };
    return {
      ok: true,
      vehicleId,
      registration,
      status,
    };
  } catch {
    return { ok: false, unassigned: false, status: "" };
  }
}

/**
 * One E-LR per trip. An existing document is opened. A new one is stored
 * only after the PDF bytes exist, using the trip document vault.
 */
export async function generateOrOpenElr(input: {
  source: ElrTripSource;
  uploadedBy: string;
  completion?: ElrCompletionDraft;
  existing?: StoredElrDocument | null;
  pdfBytes?: ArrayBuffer | null;
}): Promise<ElrGenerateResult> {
  try {
  const tripId = input.source.tripId.trim();
  const [existing, assigned] = await Promise.all([
    input.existing !== undefined
      ? Promise.resolve(input.existing)
      : tripId
        ? findStoredElr(tripId)
        : Promise.resolve(null),
    readAssignedVehicle(tripId),
  ]);
  if (existing && isCompleteElrSnapshot(existing.snapshot) && !input.completion) {
    return {
      ok: true,
      alreadyExisted: true,
      viewUrl: existing.storagePath,
      snapshot: existing.snapshot,
    };
  }

  if (
    input.completion &&
    assigned.status &&
    !isElrAfterLoadingStage(assigned.status) &&
    !(existing && isCompleteElrSnapshot(existing.snapshot))
  ) {
    return { ok: false, reason: "too_early" };
  }

  const historicalRegistration = (existing?.snapshot.vehicle.registrationNumber ?? "").trim();
  const finishingUnassignedReceipt = Boolean(existing && historicalRegistration);
  if (!assigned.ok && !finishingUnassignedReceipt) {
    return assigned.unassigned
      ? { ok: false, reason: "unassigned" }
      : {
          ok: false,
          reason: "save",
          message: "E-LR could not be saved. Please try again.",
        };
  }

  if (!input.completion) {
    return { ok: false, reason: "missing", missing: ["E-LR details"] };
  }

  const built = buildCompletedElrSnapshot({
    source: {
      ...input.source,
      vehicleId: assigned.ok ? assigned.vehicleId : existing?.snapshot.vehicle.id,
      vehicleRegistration: assigned.ok
        ? assigned.registration || historicalRegistration || input.source.vehicleRegistration
        : historicalRegistration,
      allowRegistrationWithoutAssignment:
        (assigned.ok && !assigned.vehicleId) ||
        (!assigned.ok && finishingUnassignedReceipt),
    },
    draft: input.completion,
    generatedBy: input.uploadedBy,
  });
  if (!built.ok) return { ok: false, reason: "missing", missing: built.missing };

  let duplicate: Awaited<ReturnType<typeof checkOrgDuplicateLrNumbersForTrip>>;
  try {
    duplicate = await checkOrgDuplicateLrNumbersForTrip({ tripId, lrNumbers: [built.snapshot.lrNumber] });
  } catch (e) {
    return { ok: false, reason: "save", message: e instanceof Error ? e.message : String(e) };
  }
  if (duplicate) {
    return { ok: false, reason: "save", message: ORG_LR_DUPLICATE_MESSAGE };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = input.pdfBytes?.byteLength ? input.pdfBytes : generateElrPdfBytes(built.snapshot);
  } catch {
    return { ok: false, reason: "pdf" };
  }
  if (!bytes.byteLength) return { ok: false, reason: "pdf" };

  const uploaded = await uploadTripDocument(
    tripId,
    input.uploadedBy,
    {
      arrayBuffer: bytes,
      fileName: `${built.snapshot.lrNumber}.pdf`,
      mimeType: "application/pdf",
    },
    "lr",
    serializeElrDocumentNumber(built.snapshot),
    existing ? { replaceExistingOfType: true } : undefined,
  );
  if (uploaded.error || !uploaded.doc?.storage_path) {
    return {
      ok: false,
      reason: "save",
      message:
        uploaded.error?.message === ORG_LR_DUPLICATE_MESSAGE
          ? ORG_LR_DUPLICATE_MESSAGE
          : "E-LR could not be saved. Please try again.",
    };
  }
  return {
    ok: true,
    alreadyExisted: false,
    viewUrl: uploaded.doc.storage_path,
    snapshot: built.snapshot,
  };
  } catch {
    return {
      ok: false,
      reason: "save",
      message: "E-LR could not be saved. Please try again.",
    };
  }
}
