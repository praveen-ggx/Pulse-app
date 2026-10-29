/**
 * Document changes since a Compliance hold / finance reject — shown on Resubmit
 * confirmation and stored in `compliance_resubmit_note` for the next verifier.
 */
import {
  COMPLIANCE_DECLINE_REASON_MAX,
  COMPLIANCE_DECLINE_REASON_MIN,
} from "@/features/tripCompliance/tripCompliance.types";
import { labelForDocType } from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import type { DocumentAuditMilestoneRow } from "@/features/tripCompliance/utils/complianceCardActivity.util";
import { enrichDocumentAuditRows } from "@/features/tripCompliance/utils/complianceCardActivity.util";

export type ResubmitChangeKind = "uploaded" | "deleted";

export type ResubmitChangeItem = {
  kind: ResubmitChangeKind;
  /** e.g. "RC", "Insurance", "LR" */
  docLabel: string;
  fileName?: string | null;
  at: string;
};

export type ResubmitChangeLog = {
  sinceIso: string;
  items: ResubmitChangeItem[];
};

function parseTime(iso: string | null | undefined): number {
  const t = Date.parse(String(iso ?? "").trim());
  return Number.isFinite(t) ? t : NaN;
}

function fileNameFromMeta(metadata: Record<string, unknown> | null | undefined): string {
  for (const key of ["file_name", "fileName", "old_file_name", "new_file_name"]) {
    const value = String(metadata?.[key] ?? "").trim();
    if (value) return value;
  }
  const path = String(
    metadata?.storage_path ?? metadata?.old_storage_path ?? metadata?.new_storage_path ?? "",
  ).trim();
  const base = path.split("/").pop()?.split("?")[0]?.trim() ?? "";
  return base && /\.[a-z0-9]+$/i.test(base) ? base : "";
}

function docLabelFromMeta(metadata: Record<string, unknown> | null | undefined): string {
  const type = String(metadata?.document_type ?? metadata?.doc_type ?? "").trim();
  if (type) return labelForDocType(type);
  const name = fileNameFromMeta(metadata);
  return name || "document";
}

function itemKey(item: ResubmitChangeItem): string {
  return `${item.kind}|${item.docLabel}|${item.fileName ?? ""}|${item.at.slice(0, 19)}`;
}

/** Durable create / delete audits after the decline timestamp. */
export function resubmitChangeLogFromAudits(
  rows: DocumentAuditMilestoneRow[],
  sinceIso: string,
): ResubmitChangeItem[] {
  const since = parseTime(sinceIso);
  if (!Number.isFinite(since)) return [];
  const items: ResubmitChangeItem[] = [];
  for (const row of enrichDocumentAuditRows(rows)) {
    const at = String(row.created_at ?? "").trim();
    const atMs = parseTime(at);
    if (!Number.isFinite(atMs) || atMs < since) continue;
    const action = String(row.action ?? "").trim().toLowerCase();
    if (action === "created" || action === "uploaded") {
      items.push({
        kind: "uploaded",
        docLabel: docLabelFromMeta(row.metadata),
        fileName: fileNameFromMeta(row.metadata) || null,
        at,
      });
      continue;
    }
    if (action === "deleted") {
      items.push({
        kind: "deleted",
        docLabel: docLabelFromMeta(row.metadata),
        fileName: fileNameFromMeta(row.metadata) || null,
        at,
      });
    }
  }
  return items;
}

/** Live trip / entity rows created after the decline (covers vault uploads without audits). */
export function resubmitChangeLogFromLiveDocs(input: {
  sinceIso: string;
  tripDocuments?: Array<{
    document_type?: string | null;
    file_name?: string | null;
    uploaded_at?: string | null;
    status?: string | null;
  }>;
  entityDocuments?: Array<{
    doc_type?: string | null;
    notes?: string | null;
    storage_path?: string | null;
    created_at?: string | null;
    status?: string | null;
  }>;
}): ResubmitChangeItem[] {
  const since = parseTime(input.sinceIso);
  if (!Number.isFinite(since)) return [];
  const items: ResubmitChangeItem[] = [];
  for (const doc of input.tripDocuments ?? []) {
    if (doc.status === "rejected" || doc.status === "replaced") continue;
    const at = String(doc.uploaded_at ?? "").trim();
    const atMs = parseTime(at);
    if (!Number.isFinite(atMs) || atMs < since) continue;
    const type = String(doc.document_type ?? "").trim();
    items.push({
      kind: "uploaded",
      docLabel: type ? labelForDocType(type) : "document",
      fileName: doc.file_name?.trim() || null,
      at,
    });
  }
  for (const doc of input.entityDocuments ?? []) {
    if (doc.status === "rejected" || doc.status === "replaced") continue;
    const at = String(doc.created_at ?? "").trim();
    const atMs = parseTime(at);
    if (!Number.isFinite(atMs) || atMs < since) continue;
    const type = String(doc.doc_type ?? "").trim();
    const pathName =
      String(doc.storage_path ?? "")
        .split("/")
        .pop()
        ?.split("?")[0]
        ?.trim() ?? "";
    items.push({
      kind: "uploaded",
      docLabel: type ? labelForDocType(type) : "document",
      fileName: doc.notes?.trim() || (/\.[a-z0-9]+$/i.test(pathName) ? pathName : null),
      at,
    });
  }
  return items;
}

export function mergeResubmitChangeLog(
  sinceIso: string,
  ...groups: ResubmitChangeItem[][]
): ResubmitChangeLog {
  const byKey = new Map<string, ResubmitChangeItem>();
  for (const group of groups) {
    for (const item of group) {
      byKey.set(itemKey(item), item);
    }
  }
  const items = Array.from(byKey.values()).sort((a, b) => a.at.localeCompare(b.at));
  return { sinceIso, items };
}

export function formatResubmitChangeItemLine(item: ResubmitChangeItem): string {
  const verb = item.kind === "deleted" ? "Deleted" : "Uploaded";
  const file = item.fileName?.trim();
  return file ? `${verb} ${item.docLabel} (${file})` : `${verb} ${item.docLabel}`;
}

/** Short block for the note field / stored compliance_resubmit_note. */
/** Collapse duplicate upload/delete lines (same kind + doc + file). */
export function dedupeResubmitChangeItems(items: ResubmitChangeItem[]): ResubmitChangeItem[] {
  const byKey = new Map<string, ResubmitChangeItem>();
  for (const item of items) {
    const key = `${item.kind}|${item.docLabel}|${(item.fileName ?? "").toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev || item.at.localeCompare(prev.at) >= 0) byKey.set(key, item);
  }
  return Array.from(byKey.values()).sort((a, b) => a.at.localeCompare(b.at));
}

export function formatResubmitChangeLogBlock(log: ResubmitChangeLog): string {
  const items = dedupeResubmitChangeItems(log.items);
  if (items.length === 0) return "";
  const uploaded = items.filter((item) => item.kind === "uploaded");
  const deleted = items.filter((item) => item.kind === "deleted");
  const lines: string[] = ["Changes since hold/reject:"];
  for (const item of uploaded) lines.push(`• ${formatResubmitChangeItemLine(item)}`);
  for (const item of deleted) lines.push(`• ${formatResubmitChangeItemLine(item)}`);
  return lines.join("\n");
}

function trimChangeBlockToBudget(block: string, budget: number): string {
  if (block.length <= budget) return block;
  if (budget <= 1) return "…";
  const lines = block.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const next = kept.length === 0 ? line : `${kept.join("\n")}\n${line}`;
    if (next.length > budget - 1) break;
    kept.push(line);
  }
  if (kept.length === 0) return `${block.slice(0, Math.max(0, budget - 1)).trimEnd()}…`;
  const joined = kept.join("\n");
  return joined.length < block.length ? `${joined}\n…` : joined;
}

/**
 * Final note stored for Compliance / Finance. Change log first, then Ground Ops remark.
 * Fits `max` (default COMPLIANCE_DECLINE_REASON_MAX for the DB check). Prefer keeping
 * the Ground Ops remark; trim change-log lines when needed.
 */
export function composeResubmitComplianceNote(input: {
  changeLog?: ResubmitChangeLog | null;
  /** Pre-formatted change block (skips reformatting from `changeLog`). */
  changeBlock?: string;
  remark: string;
  max?: number;
}): string {
  const max = input.max ?? COMPLIANCE_DECLINE_REASON_MAX;
  const remark = input.remark.trim();
  const block = (
    input.changeBlock?.trim() ||
    (input.changeLog ? formatResubmitChangeLogBlock(input.changeLog) : "")
  ).trim();
  let combined = "";
  if (block && remark) combined = `${block}\n—\n${remark}`;
  else combined = block || remark;

  if (combined.length <= max) {
    return combined;
  }
  // Prefer keeping the remark; trim the change list by whole lines.
  if (remark) {
    const budget = Math.max(COMPLIANCE_DECLINE_REASON_MIN, max - remark.length - 5);
    const trimmedBlock = trimChangeBlockToBudget(block, budget);
    const next = trimmedBlock ? `${trimmedBlock}\n—\n${remark}` : remark;
    return next.slice(0, max);
  }
  return trimChangeBlockToBudget(combined, max).slice(0, max);
}

export function resubmitNoteMeetsMinimum(note: string): boolean {
  return note.trim().length >= COMPLIANCE_DECLINE_REASON_MIN;
}
