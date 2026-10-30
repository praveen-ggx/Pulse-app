import {
  POD_CHARGES_CHANGED_EVENT,
  POD_NOT_FOUND_EVENT,
  POD_REVALIDATE_EVENT,
  POD_VALIDATED_EVENT,
} from "@/features/debit-control/utils/debitControlPod.model";
import { podChargeChangeTitle } from "@/features/debit-control/utils/podChargeChangeLog.util";
import type {
  ComplianceEntityDocument,
  ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import { labelForDocType } from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import { vaultChooserSourceForEntityDoc } from "@/features/tripCompliance/utils/compliancePreviewSource.util";

export type ComplianceCardLane = "document" | "activity";

export type ComplianceCardDocPreview = {
  storagePath: string;
  fileName?: string | null;
  source?:
    | "trip"
    | "vehicle"
    | "vehicle-vault"
    | "compliance"
    | "entity"
    | "driver-kyc"
    | "supplier-kyc";
  organizationId?: string | null;
  entityId?: string | null;
  docType?: string | null;
};

export type ComplianceCardMilestone = {
  id: string;
  at: string;
  title: string;
  actorUserId?: string | null;
  detail: string;
  contextLabel: string;
  lane: ComplianceCardLane;
  category?: "compliance" | "status" | "trip" | "document" | "payment";
  /** When set, Activity can open the uploaded file. */
  preview?: ComplianceCardDocPreview | null;
};

function fileNameFromStoragePath(path: string | null | undefined): string {
  const base = String(path ?? "")
    .split("?")[0]
    ?.split("/")
    .pop()
    ?.trim();
  return base && /\.[a-z0-9]+$/i.test(base) ? base : "";
}

function push(
  items: ComplianceCardMilestone[],
  item: ComplianceCardMilestone | null,
) {
  if (!item?.at) return;
  items.push(item);
}

export function milestonesFromTripDocument(doc: {
  id: string;
  document_type?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
  uploaded_at?: string | null;
  uploaded_by?: string | null;
  status?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
  rejection_reason?: string | null;
}): ComplianceCardMilestone[] {
  const items: ComplianceCardMilestone[] = [];
  const kind = labelForDocType(doc.document_type ?? "other");
  const fileName = String(doc.file_name ?? "").trim();
  if (doc.uploaded_at) {
    const storagePath = String(doc.storage_path ?? "").trim();
    push(items, {
      id: `vault-upload-${doc.id}`,
      at: doc.uploaded_at,
      title: `created ${kind}`,
      actorUserId: doc.uploaded_by ?? null,
      detail: fileName || kind,
      contextLabel: "Document Created",
      lane: "document",
      category: "document",
      preview: storagePath
        ? {
            storagePath,
            fileName: fileName || null,
            source: "trip",
            docType: doc.document_type ?? null,
          }
        : null,
    });
  }
  if (doc.verified_at && doc.status === "verified") {
    push(items, {
      id: `vault-verified-${doc.id}`,
      at: doc.verified_at,
      title: `verified ${kind}`,
      actorUserId: doc.verified_by ?? null,
      detail: fileName || kind,
      contextLabel: "Document Verification",
      lane: "document",
      category: "document",
    });
  }
  if (doc.verified_at && doc.status === "rejected") {
    push(items, {
      id: `vault-rejected-${doc.id}`,
      at: doc.verified_at,
      title: `rejected ${kind}`,
      actorUserId: doc.verified_by ?? null,
      detail: doc.rejection_reason?.trim() || fileName || kind,
      contextLabel: "Document Verification",
      lane: "document",
      category: "document",
    });
  }
  return items;
}

function entityDocMilestones(doc: ComplianceEntityDocument): ComplianceCardMilestone[] {
  const items: ComplianceCardMilestone[] = [];
  const kind = labelForDocType(doc.doc_type);
  const storagePath = String(doc.storage_path ?? "").trim();
  const fileName =
    doc.notes?.trim() || fileNameFromStoragePath(storagePath) || "";
  const detail = fileName || [doc.entity_type, kind].filter(Boolean).join(" · ");
  const preview: ComplianceCardDocPreview | null = storagePath
    ? {
        storagePath,
        fileName: fileName || kind,
        // Vehicle RC tagged source=entity still often lives in vehicle-documents.
        source: vaultChooserSourceForEntityDoc(doc),
        entityId: doc.entity_id,
        docType: doc.doc_type,
      }
    : null;
  if (doc.created_at) {
    push(items, {
      id: `entity-upload-${doc.id}`,
      at: doc.created_at,
      title: `created ${kind}`,
      actorUserId: doc.created_by ?? null,
      detail,
      contextLabel: "Document Created",
      lane: "document",
      category: "document",
      preview,
    });
  }
  if (doc.verified_at && doc.status === "verified") {
    push(items, {
      id: `entity-verified-${doc.id}`,
      at: doc.verified_at,
      title: `verified ${kind}`,
      actorUserId: doc.verified_by ?? null,
      detail,
      contextLabel: "Document Verification",
      lane: "document",
      category: "document",
      preview,
    });
  }
  return items;
}

/** Card-level compliance events only — no trip created / in-transit / assignment. */
export function complianceCardMilestones(summary: ComplianceTripSummary): ComplianceCardMilestone[] {
  const items: ComplianceCardMilestone[] = [];

  for (const doc of summary.documents) {
    const kind = labelForDocType(doc.document_type ?? "other");
    if (doc.uploaded_at) {
      const storagePath = String(doc.storage_path ?? "").trim();
      push(items, {
        id: `doc-upload-${doc.id}`,
        at: doc.uploaded_at,
        title: `created ${kind}`,
        actorUserId: doc.uploaded_by ?? null,
        detail: doc.file_name,
        contextLabel: "Document Created",
        lane: "document",
        category: "document",
        preview: storagePath
          ? {
              storagePath,
              fileName: doc.file_name,
              source: "trip",
              docType: doc.document_type ?? null,
            }
          : null,
      });
    }
    if (doc.verified_at && doc.status === "verified") {
      push(items, {
        id: `doc-verified-${doc.id}`,
        at: doc.verified_at,
        title: `verified ${kind}`,
        actorUserId: doc.verified_by ?? null,
        detail: doc.file_name,
        contextLabel: "Document Verification",
        lane: "document",
      });
    }
    if (doc.verified_at && doc.status === "rejected") {
      push(items, {
        id: `doc-rejected-${doc.id}`,
        at: doc.verified_at,
        title: `rejected ${kind}`,
        actorUserId: doc.verified_by ?? null,
        detail: doc.rejection_reason?.trim() || doc.file_name,
        contextLabel: "Document Verification",
        lane: "document",
      });
    }
  }

  for (const doc of summary.vehicleDocuments) {
    items.push(...entityDocMilestones(doc));
  }
  for (const doc of summary.driverDocuments) {
    items.push(...entityDocMilestones(doc));
  }

  if (summary.complianceDeclinedAt) {
    push(items, {
      id: "compliance-declined",
      at: summary.complianceDeclinedAt,
      title: "declined compliance",
      actorUserId: summary.complianceDeclinedBy,
      detail: summary.complianceDeclineReason?.trim() || "Trip sent back",
      contextLabel: "Compliance Hold",
      lane: "activity",
    });
  }
  if (summary.complianceResubmittedAt) {
    push(items, {
      id: "compliance-resubmitted",
      at: summary.complianceResubmittedAt,
      title: "resubmitted documents",
      detail: summary.complianceResubmitNote?.trim() || "Ground Ops resubmitted this trip",
      contextLabel: "Document Upload",
      lane: "document",
    });
  }
  if (summary.complianceVerifiedAt) {
    push(items, {
      id: "compliance-verified",
      at: summary.complianceVerifiedAt,
      title:
        summary.complianceDecision === "approved_with_exception"
          ? "verified with exception"
          : "verified compliance",
      actorUserId: summary.complianceVerifiedBy,
      detail: summary.complianceExceptionReason?.trim() || "Trip marked compliance verified",
      contextLabel: "Compliance Verification",
      lane: "activity",
    });
  }
  if (summary.financeFlaggedAt) {
    push(items, {
      id: "finance-flagged",
      at: summary.financeFlaggedAt,
      title: "flagged for compliance",
      detail: summary.financeFlagNote?.trim() || "Finance asked Compliance to review",
      contextLabel: "Advance Verification",
      lane: "activity",
    });
  }
  if (summary.financeVerifiedAt) {
    push(items, {
      id: "finance-verified",
      at: summary.financeVerifiedAt,
      title: "approved advance",
      actorUserId: summary.financeVerifiedBy,
      detail: "Finance verified this trip for advance",
      contextLabel: "Advance Verification",
      lane: "activity",
    });
  }
  if (summary.hardCopyPod.revalidateRequested && summary.hardCopyPod.receivedAt) {
    push(items, {
      id: "pod-revalidate",
      at: summary.hardCopyPod.receivedAt,
      title: "sent for POD revalidation",
      detail: "Settlement sent this trip back to Debit Control",
      contextLabel: "Settlement Verification",
      lane: "activity",
    });
  }

  return items;
}

function workflowPayload(payload: unknown): {
  actor_id?: string | null;
  reason?: string | null;
  action?: string | null;
} {
  if (!payload) return {};
  if (typeof payload === "string") {
    try {
      return workflowPayload(JSON.parse(payload) as unknown);
    } catch {
      return {};
    }
  }
  if (typeof payload !== "object") return {};
  const row = payload as {
    actor_id?: string | null;
    actorId?: string | null;
    user_id?: string | null;
    created_by?: string | null;
    performed_by?: string | null;
    reason?: string | null;
    action?: string | null;
  };
  const actor =
    row.actor_id ?? row.actorId ?? row.user_id ?? row.created_by ?? row.performed_by ?? null;
  return {
    actor_id: typeof actor === "string" && actor.trim() ? actor.trim() : null,
    reason: row.reason ?? null,
    action: row.action ?? null,
  };
}

const WORKFLOW_COPY: Record<
  string,
  {
    title: string;
    contextLabel: string;
    fallbackDetail: string;
    category?: ComplianceCardMilestone["category"];
  }
> = {
  "finance.verified": {
    title: "verified finance",
    contextLabel: "Finance",
    fallbackDetail: "Advance approved by Finance",
    category: "compliance",
  },
  "compliance.verified": {
    title: "verified compliance",
    contextLabel: "Compliance",
    fallbackDetail: "Trip marked compliance verified",
    category: "compliance",
  },
  "compliance.declined": {
    title: "declined compliance",
    contextLabel: "Compliance",
    fallbackDetail: "Trip sent back from compliance",
    category: "compliance",
  },
  "trip.completed": {
    title: "marked delivered",
    contextLabel: "Delivered",
    fallbackDetail: "Trip completed",
    category: "status",
  },
  "trip.created": {
    title: "created trip",
    contextLabel: "Trip created",
    fallbackDetail: "Trip created",
    category: "trip",
  },
  "pod.hard_copy_courier_dispatched": {
    title: "logged hard copy POD",
    contextLabel: "Awaiting POD",
    fallbackDetail: "Hard copy dispatched by courier",
    category: "compliance",
  },
  "pod.hard_copy_received": {
    title: "recorded hard copy POD",
    contextLabel: "Awaiting POD",
    fallbackDetail: "Hard copy received",
    category: "compliance",
  },
  [POD_VALIDATED_EVENT]: {
    title: "validated POD",
    contextLabel: "POD Verification",
    fallbackDetail: "POD verification completed",
    category: "compliance",
  },
  [POD_REVALIDATE_EVENT]: {
    title: "requested POD revalidation",
    contextLabel: "Settlement Verification",
    fallbackDetail: "Sent back to POD Verification",
    category: "compliance",
  },
  [POD_NOT_FOUND_EVENT]: {
    title: "reported POD not found",
    contextLabel: "POD Verification",
    fallbackDetail: "Returned to Awaiting POD",
    category: "compliance",
  },
  "pod.debit_control_draft": {
    title: "saved POD charges",
    contextLabel: "POD Verification",
    fallbackDetail: "Exception charges saved from POD",
    category: "compliance",
  },
  "compliance.advance_document_cost": {
    title: "logged advance document cost",
    contextLabel: "Compliance",
    fallbackDetail: "Advance document cost posted",
    category: "compliance",
  },
};

export function milestoneFromWorkflowEvent(row: {
  id?: string;
  event_type?: string | null;
  created_at?: string | null;
  actor_id?: string | null;
  payload?: unknown;
}): ComplianceCardMilestone | null {
  const at = String(row.created_at ?? "").trim();
  const type = String(row.event_type ?? "").trim();
  if (!at || !type) return null;
  const payload = workflowPayload(row.payload);
  const actorUserId = row.actor_id ?? payload.actor_id ?? null;
  const reason = payload.reason?.trim() || null;
  if (type === POD_CHARGES_CHANGED_EVENT) {
    return {
      id: `wf-${row.id ?? type}-${at}`,
      at,
      title: podChargeChangeTitle(payload.action),
      actorUserId,
      detail: reason || "POD charges were changed",
      contextLabel: "POD Verification",
      lane: "activity",
      category: "compliance",
    };
  }
  const known = WORKFLOW_COPY[type];
  if (known) {
    return {
      id: `wf-${row.id ?? type}-${at}`,
      at,
      title: known.title,
      actorUserId,
      detail: reason || known.fallbackDetail,
      contextLabel: known.contextLabel,
      lane: known.category === "document" ? "document" : "activity",
      category: known.category,
    };
  }
  const prefix = type.split(".")[0];
  const category: ComplianceCardMilestone["category"] =
    prefix === "finance" || prefix === "compliance" || prefix === "pod"
      ? "compliance"
      : prefix === "trip"
        ? "status"
        : "status";
  return {
    id: `wf-${row.id ?? type}-${at}`,
    at,
    title: type.replace(/^[a-z]+\./, "").replace(/[._]/g, " "),
    actorUserId,
    detail: reason || type.replace(/[._]/g, " "),
    contextLabel:
      prefix === "pod"
        ? "POD"
        : prefix === "finance"
          ? "Finance"
          : prefix === "compliance"
            ? "Compliance"
            : "Journey",
    lane: "activity",
    category,
  };
}

const ACTOR_NEARBY_MS = 3 * 60_000;
const ACTOR_LEDGER_MS = 20 * 60_000;

/** Copy a nearby event's user onto rows that stored the action but not who did it. */
export function backfillMilestoneActors(
  items: readonly ComplianceCardMilestone[],
  extras: readonly { at: string; userId: string | null | undefined }[] = [],
): ComplianceCardMilestone[] {
  const fromItems: { at: number; userId: string }[] = [];
  const fromExtras: { at: number; userId: string }[] = [];
  const remember = (
    into: { at: number; userId: string }[],
    at: string | null | undefined,
    userId: string | null | undefined,
  ) => {
    const id = String(userId ?? "").trim();
    const time = Date.parse(String(at ?? ""));
    if (!id || !Number.isFinite(time)) return;
    into.push({ at: time, userId: id });
  };
  for (const item of items) remember(fromItems, item.at, item.actorUserId);
  for (const extra of extras) remember(fromExtras, extra.at, extra.userId);

  const nearest = (
    at: string,
    pool: readonly { at: number; userId: string }[],
    windowMs: number,
  ): string | null => {
    const time = Date.parse(at);
    if (!Number.isFinite(time) || pool.length === 0) return null;
    let best: { userId: string; delta: number } | null = null;
    for (const row of pool) {
      const delta = Math.abs(row.at - time);
      if (delta > windowMs) continue;
      if (!best || delta < best.delta) best = { userId: row.userId, delta };
    }
    return best?.userId ?? null;
  };

  return items.map((item) => {
    if (item.actorUserId) return item;
    const userId =
      nearest(item.at, fromItems, ACTOR_NEARBY_MS) ??
      nearest(item.at, fromExtras, ACTOR_LEDGER_MS);
    return userId ? { ...item, actorUserId: userId } : item;
  });
}

export type DocumentAuditMilestoneRow = {
  id?: string;
  document_id?: string | null;
  action?: string | null;
  actor_id?: string | null;
  created_at?: string | null;
  entity_id?: string | null;
  /** Column on document_audit_log — vehicle RC uses entity_type=vehicle. */
  entity_type?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
};

function auditFileName(metadata: Record<string, unknown> | null | undefined): string {
  const keys = ["old_file_name", "new_file_name", "file_name", "fileName"];
  for (const key of keys) {
    const value = String(metadata?.[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function auditDocId(row: DocumentAuditMilestoneRow): string {
  return String(
    row.document_id ?? row.metadata?.document_id ?? row.metadata?.trip_document_id ?? "",
  ).trim();
}

function metadataHasDocLabel(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return false;
  return Boolean(
    String(metadata.doc_type ?? metadata.document_type ?? "").trim() ||
      String(metadata.storage_path ?? metadata.old_storage_path ?? "").trim() ||
      auditFileName(metadata),
  );
}

/**
 * Older entity_documents INSERT audits have no metadata. Pair them with later
 * update/delete rows for the same document_id so Activity still shows
 * "created RC" after the file is gone.
 */
export function enrichDocumentAuditRows(
  rows: DocumentAuditMilestoneRow[],
): DocumentAuditMilestoneRow[] {
  const metaByDocId = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const docId = auditDocId(row);
    if (!docId || !metadataHasDocLabel(row.metadata)) continue;
    const prev = metaByDocId.get(docId) ?? {};
    metaByDocId.set(docId, { ...prev, ...row.metadata });
  }
  return rows.map((row) => {
    const action = String(row.action ?? "").trim().toLowerCase();
    if (action !== "created" && action !== "uploaded") return row;
    if (metadataHasDocLabel(row.metadata)) return row;
    const docId = auditDocId(row);
    const borrowed = docId ? metaByDocId.get(docId) : null;
    if (!borrowed) return row;
    return {
      ...row,
      metadata: { ...borrowed, ...(row.metadata ?? {}) },
    };
  });
}

export function milestoneFromDocumentAudit(
  row: DocumentAuditMilestoneRow,
): ComplianceCardMilestone | null {
  const at = String(row.created_at ?? "").trim();
  const action = String(row.action ?? "").trim().toLowerCase();
  if (!at || !action) return null;
  const fileName = auditFileName(row.metadata);
  const docType = String(
    row.metadata?.document_type ?? row.metadata?.doc_type ?? "",
  ).trim();
  // Prefer doc-type label ("LR") so delete matches upload/verify wording.
  const kind = (docType ? labelForDocType(docType) : "") || fileName || "document";
  const replacedWith = String(row.metadata?.new_file_name ?? "").trim();
  const titleByAction: Record<string, string> = {
    created: `created ${kind}`,
    uploaded: `created ${kind}`,
    updated: `edited ${kind}`,
    verified: `verified ${kind}`,
    rejected: `rejected ${kind}`,
    replaced: `replaced ${kind}`,
    deleted: `deleted ${kind}`,
    downloaded: `downloaded ${kind}`,
  };
  const contextByAction: Record<string, string> = {
    created: "Document Created",
    uploaded: "Document Created",
    updated: "Document Edited",
    verified: "Document Verification",
    rejected: "Document Verification",
    replaced: "Document Replaced",
    deleted: "Document Deleted",
    downloaded: "Document Download",
  };
  const storagePath = String(
    row.metadata?.storage_path ??
      row.metadata?.old_storage_path ??
      row.metadata?.new_storage_path ??
      "",
  ).trim();
  // Still-bare creates (no sibling update/delete to borrow from) stay hidden —
  // live entity milestones cover in-flight uploads.
  if (
    (action === "created" || action === "uploaded") &&
    !storagePath &&
    !docType &&
    !fileName
  ) {
    return null;
  }
  const entityType = String(
    row.entity_type ?? row.metadata?.entity_type ?? "",
  )
    .trim()
    .toLowerCase();
  const metaSource = String(row.metadata?.source ?? "")
    .trim()
    .toLowerCase();
  const isTripAudit =
    entityType === "trip" ||
    entityType === "trip_document" ||
    metaSource === "workspace_vehicle_document";
  const previewSource: ComplianceCardDocPreview["source"] = isTripAudit
    ? "trip"
    : vaultChooserSourceForEntityDoc({
        source:
          metaSource === "vehicle-vault" ||
          metaSource === "driver-kyc" ||
          metaSource === "supplier-kyc" ||
          metaSource === "entity"
            ? (metaSource as ComplianceEntityDocument["source"])
            : undefined,
        entity_type:
          entityType === "vehicle" ||
          entityType === "driver" ||
          entityType === "supplier"
            ? entityType
            : undefined,
        doc_type: docType || null,
        storage_path: storagePath || null,
      });
  return {
    id: `doc-audit-${row.id ?? `${action}-${row.entity_id ?? "x"}`}-${at}`,
    at,
    title: titleByAction[action] ?? `${action} ${kind}`,
    actorUserId: row.actor_id ?? null,
    detail:
      action === "replaced"
        ? [replacedWith ? `Replaced with ${replacedWith}` : null, row.notes?.trim() || null]
            .filter(Boolean)
            .join(" · ") || kind
        : action === "deleted"
          ? row.notes?.trim() || fileName || "Document removed from this trip"
          : row.notes?.trim() || fileName || fileNameFromStoragePath(storagePath) || kind,
    contextLabel: contextByAction[action] ?? "Document",
    lane: "document",
    category: "document",
    preview:
      storagePath && action !== "deleted"
        ? {
            storagePath,
            fileName: fileName || fileNameFromStoragePath(storagePath) || null,
            source: previewSource,
            entityId: row.entity_id ?? null,
            docType: docType || null,
          }
        : null,
  };
}
