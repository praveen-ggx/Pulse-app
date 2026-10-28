import {
  getIndentDisplayNumber,
  type IndentRow,
} from "@/features/indents/services/indents.service";
import {
  indentCancelReasonLabel,
  indentFailedCategory,
  isIndentFailedStatus,
} from "@/features/indents/utils/indentCancelReason.util";

export type IndentHubActivityKind =
  | "created"
  | "shared"
  | "updated"
  | "awarded"
  | "completed"
  | "failed"
  | "revoked"
  | "trip";

export type IndentHubActivityRow = {
  id: string;
  indentId: string;
  indentRef: string;
  clientName: string;
  tripRef: string;
  route: string;
  createdByUserId: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  modifiedWhat: string | null;
  action: string;
  kind: IndentHubActivityKind;
  at: string;
  status: string;
};

const ACTIVITY_ROW_PX = 72;
const ACTIVITY_CHROME_PX = 214;
export const INDENT_ACTIVITY_DOUBLE_CLICK_MS = 400;

/** How many latest rows fit the drawer before the user scrolls. */
export function indentHubActivityPageSize(viewportHeight: number): number {
  const usable = Math.max(320, viewportHeight - ACTIVITY_CHROME_PX);
  return Math.max(8, Math.min(24, Math.floor(usable / ACTIVITY_ROW_PX)));
}

function latestIso(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const value of values) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    if (!best || raw > best) best = raw;
  }
  return best;
}

function titleStatus(status: string): string {
  const value = status.trim().toLowerCase();
  if (value === "awarded") return "Awarded";
  if (value === "cancelled") return "Cancelled";
  if (value === "expired") return "Expired";
  if (value === "broadcast" || value === "open") return "Open";
  if (value === "closed") return "Closed";
  if (value === "completed") return "Completed";
  return status.trim() || "Updated";
}

export function describeIndentModification(indent: {
  status?: string | null;
  cancel_reason?: string | null;
  award_revoked_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_saved_at?: string | null;
}): string | null {
  const created = String(indent.created_at ?? "").trim();
  const updated = latestIso(indent.updated_at, indent.last_saved_at);
  const revoked = String(indent.award_revoked_at ?? "").trim();
  const status = String(indent.status ?? "").trim();
  const failed = isIndentFailedStatus(status);
  const reason =
    indentCancelReasonLabel(indent.cancel_reason) ??
    (indentFailedCategory(indent) === "indent_expired" ? "Indent expired" : null);

  if (revoked && (!updated || revoked >= (updated ?? ""))) {
    return "Award revoked";
  }
  if (failed) {
    return reason ? `Marked failed · ${reason}` : `Marked failed · ${titleStatus(status)}`;
  }
  if (updated && created && updated > created) {
    return `Modified · ${titleStatus(status)}`;
  }
  return null;
}

function activityBase(indent: IndentRow) {
  return {
    indentId: indent.id,
    indentRef: getIndentDisplayNumber(indent),
    clientName: String(indent.client_name ?? "").trim(),
    tripRef: String(indent.trip_number ?? "").trim(),
    route: [indent.pickup_area, indent.drop_location].filter(Boolean).join(" → "),
    createdByUserId: indent.created_by_user_id ?? indent.owner_user_id ?? null,
    createdAt: String(indent.created_at ?? "").trim() || null,
    status: String(indent.status ?? "").trim(),
  };
}

function eventRow(
  indent: IndentRow,
  kind: IndentHubActivityKind,
  at: string,
  action: string,
): IndentHubActivityRow {
  const base = activityBase(indent);
  return {
    ...base,
    id: `${indent.id}:${kind}:${at}`,
    kind,
    action,
    modifiedWhat: action,
    modifiedAt: kind === "created" ? null : at,
    at,
  };
}

/** Every recorded change we can reconstruct from the indent row. */
export function indentToHubActivityEvents(indent: IndentRow): IndentHubActivityRow[] {
  const createdAt = String(indent.created_at ?? "").trim();
  if (!createdAt) return [];
  const status = String(indent.status ?? "").trim().toLowerCase();
  const sharedAt = String(indent.shared_at ?? "").trim();
  const savedAt = String(indent.last_saved_at ?? "").trim();
  const updatedAt = String(indent.updated_at ?? "").trim();
  const revokedAt = String(indent.award_revoked_at ?? "").trim();
  const tripRef = String(indent.trip_number ?? "").trim();
  const used = new Set<string>([createdAt]);
  const events: IndentHubActivityRow[] = [
    eventRow(indent, "created", createdAt, "created this indent"),
  ];

  if (sharedAt && !used.has(sharedAt)) {
    used.add(sharedAt);
    events.push(eventRow(indent, "shared", sharedAt, "shared this indent to the network"));
  }

  if (revokedAt) {
    used.add(revokedAt);
    events.push(eventRow(indent, "revoked", revokedAt, "revoked the award on this indent"));
  }

  if (isIndentFailedStatus(status)) {
    const when = latestIso(updatedAt, savedAt, revokedAt) ?? createdAt;
    const reason =
      indentCancelReasonLabel(indent.cancel_reason) ??
      (indentFailedCategory(indent) === "indent_expired" ? "Indent expired" : titleStatus(status));
    if (!used.has(`${when}:failed`)) {
      used.add(when);
      events.push(
        eventRow(indent, "failed", when, `marked this indent failed · ${reason}`),
      );
    }
  } else if (status === "completed") {
    const when = latestIso(updatedAt, savedAt) ?? createdAt;
    if (!used.has(when)) {
      used.add(when);
      events.push(eventRow(indent, "completed", when, "marked this indent completed"));
    }
  } else if (status === "awarded") {
    const when = latestIso(updatedAt, savedAt) ?? createdAt;
    if (!used.has(when)) {
      used.add(when);
      events.push(eventRow(indent, "awarded", when, "awarded this indent"));
    }
  }

  if (tripRef) {
    const when = latestIso(updatedAt, savedAt) ?? createdAt;
    events.push(
      eventRow(indent, "trip", when, `linked trip ${tripRef}`),
    );
  }

  if (savedAt && !used.has(savedAt) && savedAt > createdAt) {
    used.add(savedAt);
    events.push(eventRow(indent, "updated", savedAt, "updated this indent"));
  } else if (
    updatedAt &&
    !used.has(updatedAt) &&
    updatedAt > createdAt &&
    !isIndentFailedStatus(status) &&
    status !== "awarded" &&
    status !== "completed"
  ) {
    events.push(
      eventRow(indent, "updated", updatedAt, `updated this indent · ${titleStatus(status)}`),
    );
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function indentToHubActivityRow(indent: IndentRow): IndentHubActivityRow | null {
  return indentToHubActivityEvents(indent)[0] ?? null;
}

export function indentMatchesHubActivitySearch(
  row: IndentHubActivityRow,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.indentRef, row.clientName, row.tripRef, row.route, row.action, row.modifiedWhat]
    .map((value) => String(value ?? "").toLowerCase())
    .some((value) => value.includes(q));
}

/** First click selects; a second click within the window unselects. */
export function nextIndentActivitySelection(
  currentId: string | null,
  indentId: string,
  now: number,
  lastClickAt: number,
  windowMs = INDENT_ACTIVITY_DOUBLE_CLICK_MS,
): { selectedId: string | null; lastClickAt: number } {
  if (currentId === indentId && now - lastClickAt <= windowMs) {
    return { selectedId: null, lastClickAt: 0 };
  }
  return { selectedId: indentId, lastClickAt: now };
}
