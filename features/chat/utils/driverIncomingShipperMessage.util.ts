import type {
  MessageSenderRole,
  TripConversation,
} from "@/features/chat/types/chat.types";
import { supabase } from "@/lib/supabase";

/**
 * Roles that mean the commercial / shipper side wrote into the driver’s
 * trip thread. Driver + system messages must never raise the inbound toast.
 */
const SHIPPER_SIDE_ROLES = new Set<string>([
  "client",
  "dispatcher",
  "supplier",
]);

export function isShipperSideChatSender(
  role: string | null | undefined,
): boolean {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase();
  return SHIPPER_SIDE_ROLES.has(normalized);
}

export function isDriverOwnChatSender(
  role: string | null | undefined,
): boolean {
  return String(role ?? "").trim().toLowerCase() === "driver";
}

/**
 * Peer label for the driver shell. Driver-lane `party_name` is often the
 * driver’s own name (set at ensureConversation) — never show that as the shipper.
 */
export function resolveDriverFacingShipperName(
  conv: Pick<
    TripConversation,
    | "party_type"
    | "party_name"
    | "trip_organization_name"
    | "indent_creator_organization_name"
  >,
): string {
  const indentShipper = (conv.indent_creator_organization_name ?? "").trim();
  const tripOrg = (conv.trip_organization_name ?? "").trim();
  if (indentShipper) return indentShipper;
  if (tripOrg) return tripOrg;
  // Driver-lane `party_name` historically stored the driver’s own name — never
  // use it as the peer label. Inbox enrichment fills trip_organization_name.
  if (conv.party_type === "driver") return "Shipper";
  const party = (conv.party_name ?? "").trim();
  return party || "Shipper";
}

/**
 * Latest non-deleted message sender_role per conversation (newest first scan).
 */
export async function fetchLastMessageSenderRoles(
  conversationIds: string[],
): Promise<Map<string, MessageSenderRole>> {
  const out = new Map<string, MessageSenderRole>();
  const ids = [
    ...new Set(
      conversationIds.map((id) => String(id ?? "").trim()).filter(Boolean),
    ),
  ];
  if (ids.length === 0) return out;

  const { data, error } = await supabase()
    .from("trip_messages")
    .select("conversation_id, sender_role, created_at")
    .in("conversation_id", ids)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(Math.min(ids.length * 4, 200));

  if (error) return out;

  for (const row of data ?? []) {
    const cid = String(
      (row as { conversation_id?: string }).conversation_id ?? "",
    ).trim();
    if (!cid || out.has(cid)) continue;
    const role = String(
      (row as { sender_role?: string }).sender_role ?? "",
    ).trim() as MessageSenderRole;
    if (!role) continue;
    out.set(cid, role);
  }
  return out;
}
