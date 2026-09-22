import { supabase } from "@/lib/supabase";
import type { DocumentRow } from "@/features/compliance/services/documents.service";
import { getDocumentsForEntities } from "@/features/compliance/services/documents.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { interpretLedgerRowStructured } from "@/features/finance/ledger/ledgerEntryModel";
import { buildComplianceChecklist } from "@/features/tripCompliance/utils/complianceChecklist.util";
import {
  mergeComplianceEntityDocs,
  normalizeTripDocumentType,
  normalizeVaultVehicleNumber,
  vehicleVaultDocumentsToEntityDocs,
} from "@/features/tripCompliance/utils/complianceVaultDocuments.util";
import { runWithConcurrencyLimit, tripPodIsReceived } from "@/features/trips/services/tripDocumentLrPod.service";
import { getVehicleForTripViewer } from "@/features/vehicles/services/vehicles.service";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";
import {
  REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
  type ComplianceDecision,
  type ComplianceDocumentRow,
  type ComplianceEntityDocument,
  type ComplianceOutstandingSummary,
  type ComplianceStage,
  type CompliancePaymentSummary,
  type ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";

/**
 * `trip_documents.status`/`verified_by`/`verified_at`/`rejection_reason` and
 * `trips.compliance_verified_*`/`pod_hard_copy_*` ship in migration
 * 20260915162440 — not yet applied while the production schema freeze holds.
 * Every read below degrades gracefully (missing-column / missing-relation
 * errors) so the rest of the app, and this feature's read-only surfaces,
 * keep working before that migration lands.
 */
function isMissingColumnOrRelation(error: { code?: string; message?: string }): boolean {
  const message = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42703" || // undefined_column
    error.code === "42P01" || // undefined_table
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("does not exist")
  );
}

type RawTripDocRow = {
  id: string;
  trip_id: string;
  document_type: string | null;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
  uploaded_by?: string | null;
  status?: ComplianceDocumentRow["status"];
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  mime_type?: string | null;
  document_number?: string | null;
  source_entity_document_id?: string | null;
};

async function fetchTripDocumentsForTrips(
  tripIds: string[],
): Promise<Map<string, ComplianceDocumentRow[]>> {
  const byTrip = new Map<string, ComplianceDocumentRow[]>();
  if (tripIds.length === 0) return byTrip;

  const SELECT_WITH_STATUS =
    "id, trip_id, document_type, file_name, storage_path, uploaded_at, uploaded_by, status, verified_by, verified_at, rejection_reason, mime_type, document_number";
  const SELECT_WITH_STATUS_AND_SOURCE = `${SELECT_WITH_STATUS}, source_entity_document_id`;

  let rows: RawTripDocRow[] = [];
  let withStatus = await supabase()
    .from("trip_documents")
    .select(SELECT_WITH_STATUS_AND_SOURCE)
    .in("trip_id", tripIds);

  if (withStatus.error && isMissingColumnOrRelation(withStatus.error)) {
    withStatus = await supabase()
      .from("trip_documents")
      .select(SELECT_WITH_STATUS)
      .in("trip_id", tripIds);
  }

  if (withStatus.error && isMissingColumnOrRelation(withStatus.error)) {
    // Pre-migration fallback: no verification columns yet, treat every
    // uploaded document as 'pending' so the UI still renders sensibly.
    const fallback = await supabase()
      .from("trip_documents")
      .select("id, trip_id, document_type, file_name, storage_path, uploaded_at, uploaded_by")
      .in("trip_id", tripIds);
    if (fallback.error) throw new Error(fallback.error.message);
    rows = (fallback.data ?? []).map((r) => ({ ...r, status: "pending" as const }));
  } else if (withStatus.error) {
    throw new Error(withStatus.error.message);
  } else {
    rows = (withStatus.data ?? []) as RawTripDocRow[];
  }

  for (const r of rows) {
    const doc: ComplianceDocumentRow = {
      id: r.id,
      trip_id: r.trip_id,
      document_type: normalizeTripDocumentType(r.document_type),
      file_name: r.file_name,
      storage_path: r.storage_path,
      uploaded_at: r.uploaded_at,
      uploaded_by: r.uploaded_by ?? null,
      status: r.status ?? "pending",
      verified_by: r.verified_by ?? null,
      verified_at: r.verified_at ?? null,
      rejection_reason: r.rejection_reason ?? null,
      mime_type: r.mime_type ?? null,
      document_number: r.document_number ?? null,
      source_entity_document_id: r.source_entity_document_id ?? null,
    };
    const list = byTrip.get(doc.trip_id) ?? [];
    list.push(doc);
    byTrip.set(doc.trip_id, list);
  }
  return byTrip;
}

type ComplianceTripFlags = {
  compliance_verified_at: string | null;
  compliance_verified_by: string | null;
  compliance_decision: ComplianceDecision | null;
  compliance_exception_reason: string | null;
  compliance_outstanding_summary: ComplianceOutstandingSummary | null;
  pod_hard_copy_courier: string | null;
  pod_hard_copy_awb_number: string | null;
  pod_hard_copy_received_by: string | null;
  /**
   * Phase 4: the actual hard-copy-POD-received signal. `pod_received_at` is
   * the pre-existing, pervasively-used field (POD reconciliation, Invoicing's
   * POD-required gate, Log Incoming PODs' own pending-trips filter) — the
   * courier/AWB/received-by columns above are supplementary metadata only,
   * not the gate. See tripDocumentLrPod.service.ts's markTripHardCopyPodReceived().
   */
  pod_received_at: string | null;
};

async function fetchComplianceTripFlags(
  tripIds: string[],
): Promise<Map<string, ComplianceTripFlags>> {
  const byTrip = new Map<string, ComplianceTripFlags>();
  if (tripIds.length === 0) return byTrip;

  const { data, error } = await supabase()
    .from("trips")
    .select(
      "id, compliance_verified_at, compliance_verified_by, compliance_decision, compliance_exception_reason, compliance_outstanding_summary, pod_hard_copy_courier, pod_hard_copy_awb_number, pod_hard_copy_received_by, pod_received_at",
    )
    .in("id", tripIds);

  if (error) {
    if (isMissingColumnOrRelation(error)) return byTrip; // pre-migration: all flags absent
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    byTrip.set(row.id as string, {
      compliance_verified_at: r.compliance_verified_at as string | null,
      compliance_verified_by: r.compliance_verified_by as string | null,
      compliance_decision: (r.compliance_decision as ComplianceDecision | null) ?? null,
      compliance_exception_reason: (r.compliance_exception_reason as string | null) ?? null,
      compliance_outstanding_summary: (r.compliance_outstanding_summary as ComplianceOutstandingSummary | null) ?? null,
      pod_hard_copy_courier: r.pod_hard_copy_courier as string | null,
      pod_hard_copy_awb_number: r.pod_hard_copy_awb_number as string | null,
      pod_hard_copy_received_by: r.pod_hard_copy_received_by as string | null,
      pod_received_at: r.pod_received_at as string | null,
    });
  }
  return byTrip;
}

type RawTxnRow = {
  id: string;
  trip_id: string | null;
  amount_in: number;
  amount_out: number;
  description: string | null;
  transaction_date: string;
  created_by: string | null;
  ledger_category: string | null;
};

export async function fetchComplianceTransactions(
  tripIds: string[],
): Promise<Map<string, { advance: RawTxnRow[]; balance: RawTxnRow[] }>> {
  const byTrip = new Map<string, { advance: RawTxnRow[]; balance: RawTxnRow[] }>();
  if (tripIds.length === 0) return byTrip;

  const { data, error } = await supabase()
    .from("transactions")
    .select("id, trip_id, amount_in, amount_out, description, transaction_date, created_by, ledger_category")
    .in("trip_id", tripIds)
    .in("ledger_category", ["compliance_advance", "compliance_balance"]);

  if (error) {
    if (isMissingColumnOrRelation(error)) return byTrip; // ledger_category not queryable — no payments yet
    throw new Error(error.message);
  }
  for (const row of (data ?? []) as RawTxnRow[]) {
    if (!row.trip_id) continue;
    const bucket = byTrip.get(row.trip_id) ?? { advance: [], balance: [] };
    if (row.ledger_category === "compliance_advance") bucket.advance.push(row);
    else if (row.ledger_category === "compliance_balance") bucket.balance.push(row);
    byTrip.set(row.trip_id, bucket);
  }
  return byTrip;
}

function toEntityDocument(doc: DocumentRow): ComplianceEntityDocument {
  return {
    id: doc.id,
    entity_type: doc.entity_type === "driver" ? "driver" : "vehicle",
    entity_id: doc.entity_id,
    doc_type: doc.doc_type,
    status: doc.status,
    storage_path: doc.storage_path,
    expiry_date: doc.expiry_date,
    verified_at: doc.verified_at,
    verified_by: doc.verified_by,
    notes: doc.notes,
    created_at: doc.created_at,
    created_by: doc.created_by,
    source: "entity",
  };
}

export function toPaymentSummary(rows: RawTxnRow[]): CompliancePaymentSummary | null {
  if (rows.length === 0) return null;
  // Most recent posting represents the payment's current display state —
  // matches "derive, don't duplicate" (Phase 7/9): we don't track a separate
  // paid/pending flag, presence of the row is the state.
  const latest = [...rows].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))[0];
  const structured = interpretLedgerRowStructured(latest);
  return {
    amount: Number(latest.amount_in || latest.amount_out || 0),
    paymentMode: structured.payment_mode,
    utr: structured.reference_number,
    paidAt: latest.transaction_date,
    actorId: latest.created_by,
    transactionId: latest.id,
  };
}

/**
 * Finance-posted client receipts (trips.amount_paid) count as advance for the
 * queue even when they were not tagged `ledger_category = compliance_advance`.
 * Ops often collects advance from the ledger before marking Compliance Verified.
 */
export function advanceFromTripReceipts(
  trip: Pick<TripRow, "id" | "amount_paid" | "updated_at" | "created_at">,
): CompliancePaymentSummary | null {
  const amount = Number(trip.amount_paid ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount,
    paymentMode: null,
    utr: null,
    paidAt: trip.updated_at ?? trip.created_at ?? new Date().toISOString(),
    actorId: null,
    transactionId: `amount-paid:${trip.id}`,
  };
}

/**
 * Derives the single displayed compliance stage for a trip from independent
 * signals — never a persisted status column (Phase 4's explicit instruction).
 *
 * Payment progress wins over missing documents: a trip with client receipts
 * must not disappear from Advance Processed just because trip_documents is
 * empty or Compliance Verified was never stamped.
 *
 * Documented interpretation of a genuine spec ambiguity: "HARD_COPY_POD_RECEIVED"
 * and "BALANCE_PENDING" describe what is, functionally, the same instant (Phase 11:
 * "once hard copy POD received, show BALANCE PENDING"). Since a trip can only sit
 * in one filter bucket at a time, HARD_COPY_POD_RECEIVED is used here for "trip
 * delivered, physical POD not yet marked received" (the actionable, awaiting-Ops
 * bucket) and BALANCE_PENDING begins the moment Ops marks it received — i.e. the
 * "Mark Hard Copy Received" action is the transition point, not two separate
 * milestones with two separate durations.
 */
export function deriveComplianceStage(input: {
  documentCount: number;
  complianceVerifiedAt: string | null;
  advance: CompliancePaymentSummary | null;
  tripStatus: string;
  hardCopyReceived: boolean;
  balance: CompliancePaymentSummary | null;
}): ComplianceStage {
  if (input.balance) return "payment_settled";
  if (input.advance && input.tripStatus === "delivered") {
    return input.hardCopyReceived ? "balance_pending" : "hard_copy_pod_received";
  }
  if (input.advance) return "advance_payment_processed";
  if (input.complianceVerifiedAt) return "compliance_verified";
  if (input.documentCount === 0) return "pending_for_docs";
  return "compliance_pending";
}

async function fetchEntityDocumentsForTrips(
  trips: TripRow[],
): Promise<Map<string, DocumentRow[]>> {
  const byEntity = new Map<string, DocumentRow[]>();
  const orgId = trips.find((trip) => trip.organization_id)?.organization_id;
  const entityIds = Array.from(
    new Set(
      trips.flatMap((trip) => [trip.vehicle_id, trip.driver_id].filter((id): id is string => Boolean(id))),
    ),
  );
  if (!orgId || entityIds.length === 0) return byEntity;

  const { error, documents } = await getDocumentsForEntities(orgId, entityIds, ["vehicle", "driver"]);
  if (error) {
    if (isMissingColumnOrRelation(error)) return byEntity;
    throw error;
  }
  for (const doc of documents) {
    const list = byEntity.get(doc.entity_id) ?? [];
    list.push(doc);
    byEntity.set(doc.entity_id, list);
  }
  return byEntity;
}

function indexVehicleVaultDocs(
  byKey: Map<string, ComplianceEntityDocument[]>,
  docs: ComplianceEntityDocument[],
  ...keys: Array<string | null | undefined>
) {
  if (docs.length === 0) return;
  for (const key of keys) {
    if (key) byKey.set(key, docs);
  }
}

/**
 * Partner-vehicle vault fallback uses `get_vehicle_for_trip_viewer` (trip-scoped
 * RLS). Many compliance trips can share one truck — one RPC per vehicle id is
 * enough; any referencing trip id satisfies the viewer contract.
 */
export function uniqueTripsNeedingVehicleViewer(
  trips: TripRow[],
  knownVehicleKeys: ReadonlySet<string>,
  orgId: string | null,
): TripRow[] {
  if (!orgId) return [];
  const seen = new Set<string>();
  const unique: TripRow[] = [];
  for (const trip of trips) {
    const id = trip.vehicle_id ?? trip.owner_vehicle_id;
    if (!id || knownVehicleKeys.has(id) || seen.has(id)) continue;
    seen.add(id);
    unique.push(trip);
  }
  return unique;
}

async function fetchVehicleVaultDocumentsForTrips(
  trips: TripRow[],
): Promise<Map<string, ComplianceEntityDocument[]>> {
  const byKey = new Map<string, ComplianceEntityDocument[]>();
  const orgId = trips.find((trip) => trip.organization_id)?.organization_id ?? null;
  const vehicleIds = Array.from(
    new Set(
      trips.flatMap((trip) => [trip.vehicle_id, trip.owner_vehicle_id].filter((id): id is string => Boolean(id))),
    ),
  );

  if (vehicleIds.length > 0) {
    const { data, error } = await supabase().from("vehicles").select("id, vehicle_number, documents").in("id", vehicleIds);
    if (error && !isMissingColumnOrRelation(error)) throw new Error(error.message);
    for (const row of data ?? []) {
      const docs = vehicleVaultDocumentsToEntityDocs(row.id, (row.documents ?? null) as VehicleDocuments | null);
      indexVehicleVaultDocs(byKey, docs, row.id, normalizeVaultVehicleNumber(row.vehicle_number));
    }
  }

  const missingById = uniqueTripsNeedingVehicleViewer(
    trips,
    new Set(byKey.keys()),
    orgId,
  );
  if (missingById.length > 0 && orgId) {
    await runWithConcurrencyLimit(missingById, 4, async (trip) => {
      const vehicleId = trip.vehicle_id ?? trip.owner_vehicle_id;
      if (!vehicleId) return;
      const { vehicle } = await getVehicleForTripViewer(vehicleId, trip.id, orgId);
      if (!vehicle) return;
      const docs = vehicleVaultDocumentsToEntityDocs(vehicleId, (vehicle.documents ?? null) as VehicleDocuments | null);
      indexVehicleVaultDocs(
        byKey,
        docs,
        vehicleId,
        trip.vehicle_id,
        trip.owner_vehicle_id,
        normalizeVaultVehicleNumber(vehicle.vehicle_number),
      );
    });
  }

  const missingByNumber = trips.filter((trip) => {
    const number = normalizeVaultVehicleNumber(trip.vehicle_display_number);
    if (!number || !orgId) return false;
    const id = trip.vehicle_id ?? trip.owner_vehicle_id;
    return !((id && byKey.has(id)) || byKey.has(number));
  });
  if (missingByNumber.length > 0 && orgId) {
    const { data, error } = await supabase()
      .from("vehicles")
      .select("id, vehicle_number, documents")
      .eq("organization_id", orgId);
    if (error && !isMissingColumnOrRelation(error)) throw new Error(error.message);
    const byNumber = new Map<string, { id: string; documents: VehicleDocuments | null }>();
    for (const row of data ?? []) {
      const number = normalizeVaultVehicleNumber(row.vehicle_number);
      if (number) byNumber.set(number, { id: row.id, documents: (row.documents ?? null) as VehicleDocuments | null });
    }
    for (const trip of missingByNumber) {
      const number = normalizeVaultVehicleNumber(trip.vehicle_display_number);
      const match = number ? byNumber.get(number) : undefined;
      if (!match) continue;
      const docs = vehicleVaultDocumentsToEntityDocs(match.id, match.documents);
      indexVehicleVaultDocs(byKey, docs, match.id, trip.vehicle_id, trip.owner_vehicle_id, number);
    }
  }

  return byKey;
}

async function fetchDriverKycDocumentsForTrips(
  trips: TripRow[],
): Promise<Map<string, ComplianceEntityDocument[]>> {
  const byDriver = new Map<string, ComplianceEntityDocument[]>();
  const driverIds = Array.from(new Set(trips.map((trip) => trip.driver_id).filter((id): id is string => Boolean(id))));
  if (driverIds.length === 0) return byDriver;

  const { data: driverRows, error: driverError } = await supabase()
    .from("drivers")
    .select("id, user_id")
    .in("id", driverIds);
  if (driverError) {
    if (isMissingColumnOrRelation(driverError)) return byDriver;
    return byDriver;
  }

  const userIdByDriverId = new Map<string, string>();
  const userIds: string[] = [];
  for (const row of driverRows ?? []) {
    if (!row.user_id) continue;
    userIdByDriverId.set(row.id, row.user_id);
    userIds.push(row.user_id);
  }
  for (const driverId of driverIds) {
    if (!userIdByDriverId.has(driverId)) userIds.push(driverId);
  }
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) return byDriver;

  const { data: kycRows, error: kycError } = await supabase()
    .from("driver_kyc_documents")
    .select("id, driver_user_id, doc_type, status, storage_path, verified_at, rejection_notes, created_at")
    .in("driver_user_id", uniqueUserIds)
    .in("doc_type", ["license", "aadhaar"])
    .is("deleted_at", null);
  if (kycError) {
    if (isMissingColumnOrRelation(kycError)) return byDriver;
    return byDriver;
  }

  const driverIdByUserId = new Map<string, string>();
  for (const [driverId, userId] of userIdByDriverId) driverIdByUserId.set(userId, driverId);

  for (const row of kycRows ?? []) {
    const driverId = driverIdByUserId.get(row.driver_user_id) ?? row.driver_user_id;
    const mapped: ComplianceEntityDocument = {
      id: row.id,
      entity_type: "driver",
      entity_id: driverId,
      doc_type: row.doc_type,
      status: row.status,
      storage_path: row.storage_path,
      expiry_date: null,
      verified_at: row.verified_at,
      notes: row.rejection_notes,
      created_at: row.created_at,
      source: "driver-kyc",
    };
    const list = byDriver.get(driverId) ?? [];
    list.push(mapped);
    byDriver.set(driverId, list);
  }
  return byDriver;
}

/**
 * Batched compliance read for a page of trips — trips + trip_documents +
 * flags + transactions + Asset Vault vehicle JSON + driver KYC. No per-card RPC.
 * Reuses `getTripsByOrganization`'s existing paginated trips read rather than
 * adding a second trips query pattern.
 */
export async function buildComplianceTripSummaries(
  trips: TripRow[],
): Promise<ComplianceTripSummary[]> {
  const tripIds = trips.map((t) => t.id);
  const [docsByTrip, flagsByTrip, txnsByTrip, entityDocsById, vaultVehicleDocs, driverKycDocs] = await Promise.all([
    fetchTripDocumentsForTrips(tripIds),
    fetchComplianceTripFlags(tripIds),
    fetchComplianceTransactions(tripIds),
    fetchEntityDocumentsForTrips(trips),
    fetchVehicleVaultDocumentsForTrips(trips),
    fetchDriverKycDocumentsForTrips(trips),
  ]);

  return trips.map((trip) => {
    const documents = docsByTrip.get(trip.id) ?? [];
    const flags = flagsByTrip.get(trip.id);
    const txns = txnsByTrip.get(trip.id) ?? { advance: [], balance: [] };
    const taggedAdvance = toPaymentSummary(txns.advance);
    const advance = taggedAdvance ?? advanceFromTripReceipts(trip);
    const balance = toPaymentSummary(txns.balance);
    // Phase 4: the gate is pod_received_at (the pre-existing, pervasively-used
    // signal), not the courier/AWB/received-by columns — those are display
    // metadata only. See ComplianceTripFlags.pod_received_at above.
    const hardCopyReceived = tripPodIsReceived({ pod_received_at: flags?.pod_received_at ?? null });
    const entityVehicleDocs = trip.vehicle_id
      ? (entityDocsById.get(trip.vehicle_id) ?? []).filter((d) => d.entity_type === "vehicle").map(toEntityDocument)
      : [];
    const vaultVehicle =
      (trip.vehicle_id ? vaultVehicleDocs.get(trip.vehicle_id) : undefined) ??
      (trip.owner_vehicle_id ? vaultVehicleDocs.get(trip.owner_vehicle_id) : undefined) ??
      vaultVehicleDocs.get(normalizeVaultVehicleNumber(trip.vehicle_display_number)) ??
      [];
    const vehicleDocuments = mergeComplianceEntityDocs(entityVehicleDocs, vaultVehicle);
    const entityDriverDocs = trip.driver_id
      ? (entityDocsById.get(trip.driver_id) ?? []).filter((d) => d.entity_type === "driver").map(toEntityDocument)
      : [];
    const kycDriver = trip.driver_id ? (driverKycDocs.get(trip.driver_id) ?? []) : [];
    const driverDocuments = mergeComplianceEntityDocs(kycDriver, entityDriverDocs);
    const checklist = buildComplianceChecklist({
      tripDocuments: documents,
      vehicleDocuments,
      driverDocuments,
    });

    const documentCounts = {
      total: documents.length,
      verified: documents.filter((d) => d.status === "verified").length,
      rejected: documents.filter((d) => d.status === "rejected").length,
      pending: documents.filter((d) => d.status === "pending").length,
    };

    const stage = deriveComplianceStage({
      documentCount: documentCounts.total,
      complianceVerifiedAt: flags?.compliance_verified_at ?? null,
      advance,
      tripStatus: trip.status,
      hardCopyReceived,
      balance,
    });

    return {
      trip,
      stage,
      documents,
      vehicleDocuments,
      driverDocuments,
      documentCounts,
      checklist,
      complianceVerifiedAt: flags?.compliance_verified_at ?? null,
      complianceVerifiedBy: flags?.compliance_verified_by ?? null,
      complianceDecision: flags?.compliance_decision ?? null,
      complianceExceptionReason: flags?.compliance_exception_reason ?? null,
      complianceOutstandingSummary: flags?.compliance_outstanding_summary ?? null,
      advance,
      balance,
      hardCopyPod: {
        received: hardCopyReceived,
        receivedAt: trip.pod_received_at ?? null,
        courier: flags?.pod_hard_copy_courier ?? null,
        awbNumber: flags?.pod_hard_copy_awb_number ?? null,
        receivedBy: flags?.pod_hard_copy_received_by ?? null,
      },
    };
  });
}

/** Whether every Compliance-required document type on a trip is verified. */
export function canMarkComplianceVerified(documents: ComplianceDocumentRow[]): {
  ok: boolean;
  missing: string[];
} {
  const byType = new Map(documents.map((d) => [d.document_type, d]));
  const missing: string[] = [];
  for (const type of REQUIRED_COMPLIANCE_DOCUMENT_TYPES) {
    const doc = byType.get(type);
    if (!doc || doc.status !== "verified") missing.push(type);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Client-side mirror of `approve_trip_compliance_with_exception`'s outstanding
 * capture — for display only. The RPC re-derives this server-side; this is
 * never trusted as authorization, only used to render the confirmation panel.
 */
export function buildComplianceOutstandingSummary(
  documents: ComplianceDocumentRow[],
): ComplianceOutstandingSummary {
  const byType = new Map(documents.map((d) => [d.document_type, d]));
  const missing: string[] = [];
  const pending_verification: string[] = [];
  const rejected: string[] = [];
  for (const type of REQUIRED_COMPLIANCE_DOCUMENT_TYPES) {
    const doc = byType.get(type);
    if (!doc) missing.push(type);
    else if (doc.status === "pending") pending_verification.push(type);
    else if (doc.status === "rejected") rejected.push(type);
  }
  return { missing, pending_verification, rejected };
}

/**
 * A trip is eligible for "Approve with Exception" only while it hasn't been
 * decided yet and at least one required document is outstanding — a fully
 * compliant trip should go through normal `mark_trip_compliance_verified`.
 */
export function canApproveComplianceWithException(input: {
  documents: ComplianceDocumentRow[];
  complianceVerifiedAt: string | null;
}): { ok: boolean; outstanding: ComplianceOutstandingSummary } {
  const outstanding = buildComplianceOutstandingSummary(input.documents);
  const hasOutstanding =
    outstanding.missing.length > 0 || outstanding.pending_verification.length > 0 || outstanding.rejected.length > 0;
  return { ok: hasOutstanding && !input.complianceVerifiedAt, outstanding };
}
