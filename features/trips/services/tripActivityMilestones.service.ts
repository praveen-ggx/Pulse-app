import {
  enrichDocumentAuditRows,
  milestoneFromDocumentAudit,
  milestoneFromWorkflowEvent,
  milestonesFromTripDocument,
  type ComplianceCardMilestone,
} from "@/features/tripCompliance/utils/complianceCardActivity.util";
import { getDocumentsByTripId } from "@/features/trips/services/tripDocuments.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripAuditMilestone } from "@/lib/trips/buildTripAuditLog.util";
import { supabase } from "@/lib/supabase";

function asMilestone(item: ComplianceCardMilestone): TripAuditMilestone {
  return {
    id: item.id,
    at: item.at,
    title: item.title,
    actorUserId: item.actorUserId,
    detail: item.detail,
    contextLabel: item.contextLabel,
    lane: item.lane,
    category: item.category,
    preview: item.preview ?? null,
  };
}

function mergeMilestone(
  merged: Map<string, TripAuditMilestone>,
  item: TripAuditMilestone | null | undefined,
) {
  if (!item?.at) return;
  const key = `${item.title}|${item.at.slice(0, 19)}`;
  const prev = merged.get(key);
  if (!prev) {
    merged.set(key, item);
    return;
  }
  if (!prev.actorUserId && item.actorUserId) {
    merged.set(key, { ...prev, actorUserId: item.actorUserId });
  }
}

/** Vault uploads, document edits, and workflow events for the trip activity drawer. */
export async function listTripActivityMilestones(
  trip: TripRow,
  vaultDocuments: Parameters<typeof milestonesFromTripDocument>[0][] = [],
): Promise<TripAuditMilestone[]> {
  const tripId = String(trip.id ?? "").trim();
  const orgId = String(trip.organization_id ?? "").trim();
  const indentId = String(trip.indent_id ?? "").trim();
  if (!tripId) return [];

  const [events, liveDocs] = await Promise.all([
    supabase()
      .from("trip_workflow_events")
      .select("id, event_type, payload, created_at, actor_id")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(200),
    vaultDocuments.length > 0
      ? Promise.resolve({ documents: vaultDocuments, error: null })
      : getDocumentsByTripId(tripId, {
          includeOcr: false,
          includeStorageFallback: false,
        }),
  ]);

  const documents = !liveDocs.error ? (liveDocs.documents ?? []) : vaultDocuments;
  const entityIds = [
    tripId,
    indentId,
    String(trip.vehicle_id ?? "").trim(),
    String(trip.driver_id ?? "").trim(),
    ...documents.map((doc) => String(doc.id ?? "").trim()),
  ].filter(Boolean);

  const audits = orgId
    ? await supabase()
        .from("document_audit_log")
        .select(
          "id, document_id, action, actor_id, created_at, entity_id, entity_type, notes, metadata",
        )
        .eq("organization_id", orgId)
        .in("entity_id", entityIds)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [], error: null };

  const merged = new Map<string, TripAuditMilestone>();
  /** Live create milestones superseded by durable `document_audit_log` create rows. */
  const auditedCreateDocIds = new Set<string>();
  if (!audits.error) {
    for (const row of audits.data ?? []) {
      const action = String((row as { action?: string | null }).action ?? "")
        .trim()
        .toLowerCase();
      if (action !== "created" && action !== "uploaded") continue;
      const meta = (row as { metadata?: Record<string, unknown> | null }).metadata;
      const docId = String(meta?.trip_document_id ?? "").trim();
      if (docId) auditedCreateDocIds.add(docId);
    }
  }

  for (const doc of documents) {
    for (const item of milestonesFromTripDocument(doc)) {
      if (
        auditedCreateDocIds.has(String(doc.id ?? "").trim()) &&
        item.id.startsWith("vault-upload-")
      ) {
        continue;
      }
      mergeMilestone(merged, asMilestone(item));
    }
  }
  if (!events.error) {
    for (const row of events.data ?? []) {
      const item = milestoneFromWorkflowEvent(row);
      if (item) mergeMilestone(merged, asMilestone(item));
    }
  }
  if (!audits.error) {
    for (const row of enrichDocumentAuditRows(
      (audits.data ?? []) as Parameters<typeof milestoneFromDocumentAudit>[0][],
    )) {
      const mile = milestoneFromDocumentAudit(row);
      if (mile) mergeMilestone(merged, asMilestone(mile));
    }
  }

  if (trip.finance_verified_at) {
    mergeMilestone(merged, {
      id: `trip-finance-verified-${trip.id}`,
      at: trip.finance_verified_at,
      title: "verified finance",
      actorUserId: trip.finance_verified_by ?? null,
      detail: "Advance approved by Finance",
      contextLabel: "Finance",
      lane: "activity",
      category: "compliance",
    });
  }
  if (trip.compliance_verified_at) {
    mergeMilestone(merged, {
      id: `trip-compliance-verified-${trip.id}`,
      at: trip.compliance_verified_at,
      title: "verified compliance",
      actorUserId: trip.compliance_verified_by ?? null,
      detail: "Trip marked compliance verified",
      contextLabel: "Compliance",
      lane: "activity",
      category: "compliance",
    });
  }

  return Array.from(merged.values());
}
