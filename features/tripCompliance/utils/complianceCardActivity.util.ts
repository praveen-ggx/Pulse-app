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

export type ComplianceCardLane = "document" | "activity";

export type ComplianceCardMilestone = {
  id: string;
  at: string;
  title: string;
  actorUserId?: string | null;
  detail: string;
  contextLabel: string;
  lane: ComplianceCardLane;
};

function push(
  items: ComplianceCardMilestone[],
  item: ComplianceCardMilestone | null,
) {
  if (!item?.at) return;
  items.push(item);
}

function entityDocMilestones(doc: ComplianceEntityDocument): ComplianceCardMilestone[] {
  const items: ComplianceCardMilestone[] = [];
  const kind = labelForDocType(doc.doc_type);
  if (doc.created_at) {
    push(items, {
      id: `entity-upload-${doc.id}`,
      at: doc.created_at,
      title: `uploaded ${kind}`,
      actorUserId: doc.created_by ?? null,
      detail: [doc.entity_type, kind].filter(Boolean).join(" · "),
      contextLabel: "Document Upload",
      lane: "document",
    });
  }
  if (doc.verified_at && doc.status === "verified") {
    push(items, {
      id: `entity-verified-${doc.id}`,
      at: doc.verified_at,
      title: `verified ${kind}`,
      actorUserId: doc.verified_by ?? null,
      detail: [doc.entity_type, kind].filter(Boolean).join(" · "),
      contextLabel: "Document Verification",
      lane: "document",
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
      push(items, {
        id: `doc-upload-${doc.id}`,
        at: doc.uploaded_at,
        title: `uploaded ${kind}`,
        actorUserId: doc.uploaded_by ?? null,
        detail: doc.file_name,
        contextLabel: "Document Upload",
        lane: "document",
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
  { title: string; contextLabel: string; fallbackDetail: string }
> = {
  "pod.hard_copy_courier_dispatched": {
    title: "logged hard copy POD",
    contextLabel: "Awaiting POD",
    fallbackDetail: "Hard copy dispatched by courier",
  },
  "pod.hard_copy_received": {
    title: "recorded hard copy POD",
    contextLabel: "Awaiting POD",
    fallbackDetail: "Hard copy received",
  },
  [POD_VALIDATED_EVENT]: {
    title: "validated POD",
    contextLabel: "POD Verification",
    fallbackDetail: "POD verification completed",
  },
  [POD_REVALIDATE_EVENT]: {
    title: "requested POD revalidation",
    contextLabel: "Settlement Verification",
    fallbackDetail: "Sent back to POD Verification",
  },
  [POD_NOT_FOUND_EVENT]: {
    title: "reported POD not found",
    contextLabel: "POD Verification",
    fallbackDetail: "Returned to Awaiting POD",
  },
  "pod.debit_control_draft": {
    title: "saved POD charges",
    contextLabel: "POD Verification",
    fallbackDetail: "Exception charges saved from POD",
  },
  "compliance.advance_document_cost": {
    title: "logged advance document cost",
    contextLabel: "Compliance",
    fallbackDetail: "Advance document cost posted",
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
      lane: "activity",
    };
  }
  if (type.startsWith("compliance.") || type.startsWith("pod.")) {
    return {
      id: `wf-${row.id ?? type}-${at}`,
      at,
      title: type.replace(/^[a-z]+\./, "").replace(/_/g, " "),
      actorUserId,
      detail: reason || type,
      contextLabel: "Compliance",
      lane: "activity",
    };
  }
  return null;
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
  action?: string | null;
  actor_id?: string | null;
  created_at?: string | null;
  entity_id?: string | null;
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

export function milestoneFromDocumentAudit(
  row: DocumentAuditMilestoneRow,
): ComplianceCardMilestone | null {
  const at = String(row.created_at ?? "").trim();
  const action = String(row.action ?? "").trim().toLowerCase();
  if (!at) return null;
  if (action !== "deleted" && action !== "replaced") return null;
  const fileName = auditFileName(row.metadata);
  const kind = fileName || "document";
  const replacedWith = String(row.metadata?.new_file_name ?? "").trim();
  return {
    id: `doc-audit-${row.id ?? `${action}-${row.entity_id ?? "x"}`}-${at}`,
    at,
    title: action === "deleted" ? `deleted ${kind}` : `replaced ${kind}`,
    actorUserId: row.actor_id ?? null,
    detail:
      action === "replaced"
        ? [replacedWith ? `Replaced with ${replacedWith}` : null, row.notes?.trim() || null]
            .filter(Boolean)
            .join(" · ") || kind
        : row.notes?.trim() || fileName || "Document removed from this trip",
    contextLabel: action === "deleted" ? "Document Deleted" : "Document Replaced",
    lane: "document",
  };
}
