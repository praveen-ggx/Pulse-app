/**
 * Network notifications service — cross-org indent → bid → award inbox.
 *
 * Rows are written exclusively by DB triggers (see
 * `supabase/migrations/20260801120000_network_notifications.sql`), so this
 * service is read + acknowledge only. Fails soft (empty list, no throw) when the
 * migration has not been applied yet, matching the shared-ledger service.
 */
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";
import { supabase } from "@/lib/supabase";

export type NetworkNotificationEventType =
  | "indent_created"
  | "bid_received"
  | "awarded"
  | "quote_requested"
  | "counter_offered"
  | "driver_disconnected"
  | "expense_reminder";

export type NetworkNotificationStatus = "open" | "read" | "handled" | "resolved";

export interface NetworkNotificationRow {
  id: string;
  organization_id: string;
  actor_org_id: string | null;
  event_type: NetworkNotificationEventType;
  status: NetworkNotificationStatus;
  title: string;
  subtitle: string | null;
  amount_meta: number | null;
  indent_id: string | null;
  quote_id: string | null;
  bid_id: string | null;
  payload_json: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  read_at: string | null;
  handled_at: string | null;
}

const TABLE = "network_notifications";

const TABLE_SELECT =
  "id, organization_id, actor_org_id, event_type, status, title, subtitle, " +
  "amount_meta, indent_id, quote_id, bid_id, payload_json, created_at, " +
  "updated_at, read_at, handled_at";

/** Cap the inbox page so a busy org never pulls an unbounded list. */
export const NETWORK_NOTIFICATION_PAGE_SIZE = 50;

/** True when the table/migration is absent, so callers can degrade quietly. */
function tableUnavailable(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("not found") ||
    m.includes("schema cache")
  );
}

function toRow(raw: Record<string, unknown>): NetworkNotificationRow {
  const amount = raw.amount_meta;
  return {
    id: String(raw.id),
    organization_id: String(raw.organization_id),
    actor_org_id: raw.actor_org_id ? String(raw.actor_org_id) : null,
    event_type: raw.event_type as NetworkNotificationEventType,
    status: (raw.status as NetworkNotificationStatus) ?? "open",
    title: String(raw.title ?? ""),
    subtitle: raw.subtitle ? String(raw.subtitle) : null,
    amount_meta:
      amount == null || amount === "" ? null : Number(amount),
    indent_id: raw.indent_id ? String(raw.indent_id) : null,
    quote_id: raw.quote_id ? String(raw.quote_id) : null,
    bid_id: raw.bid_id ? String(raw.bid_id) : null,
    payload_json:
      (raw.payload_json as Record<string, unknown> | null) ?? {},
    created_at: String(raw.created_at),
    updated_at: raw.updated_at ? String(raw.updated_at) : null,
    read_at: raw.read_at ? String(raw.read_at) : null,
    handled_at: raw.handled_at ? String(raw.handled_at) : null,
  };
}

export async function getNetworkNotifications(
  organizationId: string,
  statusFilter: "all" | "action_required" | "history" = "all",
  limit: number = NETWORK_NOTIFICATION_PAGE_SIZE,
): Promise<{
  error: Error | null;
  notifications: NetworkNotificationRow[];
  unavailable?: boolean;
}> {
  if (!organizationId) return { error: null, notifications: [] };

  let query = supabase()
    .from(TABLE)
    .select(TABLE_SELECT)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusFilter === "action_required") {
    query = query.eq("status", "open");
  } else if (statusFilter === "history") {
    query = query.in("status", ["read", "handled", "resolved"]);
  }

  const { data, error } = await query;
  if (error) {
    if (tableUnavailable(error.message)) {
      return { error: null, notifications: [], unavailable: true };
    }
    return { error: new Error(error.message), notifications: [] };
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return { error: null, notifications: rows.map(toRow) };
}

/** Unread badge count — head-only, no row payload transferred. */
export async function getNetworkNotificationsCount(
  organizationId: string,
): Promise<{ error: Error | null; count: number }> {
  if (!organizationId) return { error: null, count: 0 };

  const { count, error } = await supabase()
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "open");

  if (error) {
    if (tableUnavailable(error.message)) return { error: null, count: 0 };
    return { error: new Error(error.message), count: 0 };
  }
  return { error: null, count: count ?? 0 };
}

export async function markNetworkNotificationRead(
  id: string,
): Promise<{ error: Error | null }> {
  if (!id) return { error: null };
  const { error } = await supabase()
    .from(TABLE)
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open");
  if (error && !tableUnavailable(error.message)) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function markNetworkNotificationHandled(
  id: string,
  userId?: string | null,
): Promise<{ error: Error | null }> {
  if (!id) return { error: null };
  const { error } = await supabase()
    .from(TABLE)
    .update({
      status: "handled",
      handled_at: new Date().toISOString(),
      handled_by_user_id: userId ?? null,
    })
    .eq("id", id);
  if (error && !tableUnavailable(error.message)) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}

/**
 * Live inbox updates for one org. Goes through the shared ref-counted registry
 * so multiple mounted consumers reuse a single server channel.
 */
export function subscribeToNetworkNotifications(
  organizationId: string,
  onChange: () => void,
): () => void {
  return subscribeSharedPostgresChanges(
    `network-notifications:${organizationId}`,
    [
      {
        event: "*",
        schema: "public",
        table: TABLE,
        filter: `organization_id=eq.${organizationId}`,
      },
    ],
    () => onChange(),
  );
}

/** Mark every open row for an org read (inbox "mark all read"). */
export async function markAllNetworkNotificationsRead(
  organizationId: string,
): Promise<{ error: Error | null }> {
  if (!organizationId) return { error: null };
  const { error } = await supabase()
    .from(TABLE)
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("status", "open");
  if (error && !tableUnavailable(error.message)) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}
