/**
 * Stage-revoke activity for trip chat — driver rolls a step back; client sees
 * a system update card (not a plain grey line).
 */
import type { TripMessageRow } from "@/features/chat/types/chat.types";
import { mergeMessageMetadataForEventPayload } from "@/features/chat/utils/eventPayloadMerge.util";

export type StageRevokeChatPayload = {
  reason: string;
  /** Flow step the driver landed on after undo. */
  toStep: string;
  /** Human label for that step (e.g. "En route"). */
  toLabel: string;
  /** Previous flow step before revoke, when known. */
  fromStep?: string | null;
  /** Trip status after undo, when known. */
  newStatus?: string | null;
  driverName?: string | null;
};

export function buildStageRevokeChatContent(p: StageRevokeChatPayload): string {
  const who = (p.driverName ?? "").trim() || "Driver";
  const where = (p.toLabel ?? "").trim() || "previous stage";
  const reason = (p.reason ?? "").trim();
  const base = `${who} stepped back to ${where}`;
  return reason ? `${base} — ${reason}` : base;
}

export function buildStageRevokeChatMetadata(
  p: StageRevokeChatPayload,
): Record<string, unknown> {
  return {
    event_payload: {
      stage_revoke: true,
      reason: (p.reason ?? "").trim() || null,
      to_step: (p.toStep ?? "").trim() || null,
      to_label: (p.toLabel ?? "").trim() || null,
      from_step: (p.fromStep ?? "").trim() || null,
      new_status: (p.newStatus ?? "").trim() || null,
      changed_by_name: (p.driverName ?? "").trim() || null,
    },
  };
}

export function isStageRevokeChatMessage(
  message: Pick<TripMessageRow, "content" | "metadata" | "message_type">,
): boolean {
  const m = mergeMessageMetadataForEventPayload(message);
  const ep = m?.event_payload;
  if (ep && typeof ep === "object" && !Array.isArray(ep)) {
    if ((ep as { stage_revoke?: unknown }).stage_revoke === true) return true;
  }
  const content = String(message.content ?? "").trim();
  return /^stage revoked\b/i.test(content) || /\bstepped back to\b/i.test(content);
}

export function parseStageRevokeDisplay(message: Pick<TripMessageRow, "content" | "metadata">): {
  title: string;
  reason: string | null;
  toLabel: string | null;
  driverName: string | null;
} {
  const m = mergeMessageMetadataForEventPayload(message);
  const ep =
    m?.event_payload &&
    typeof m.event_payload === "object" &&
    !Array.isArray(m.event_payload)
      ? (m.event_payload as Record<string, unknown>)
      : null;

  const reason =
    (typeof ep?.reason === "string" && ep.reason.trim()) ||
    String(message.content ?? "").match(/—\s*(.+)$/)?.[1]?.trim() ||
    null;
  const toLabel =
    (typeof ep?.to_label === "string" && ep.to_label.trim()) || null;
  const driverName =
    (typeof ep?.changed_by_name === "string" && ep.changed_by_name.trim()) ||
    null;

  const content = String(message.content ?? "").trim();
  let title = content;
  if (toLabel) {
    const who = driverName || "Driver";
    title = `${who} stepped back to ${toLabel}`;
  } else if (/^stage revoked\b/i.test(content)) {
    title = content.replace(/^stage revoked\s*[—\-:]?\s*/i, "Stepped back — ");
  }

  return { title, reason, toLabel, driverName };
}

/** Notes-line detector for driver-local `[UPDATE|…]` renders. */
export function isStageRevokeStatusNote(message: string): boolean {
  return /^stage revoked\b/i.test(String(message ?? "").trim());
}
