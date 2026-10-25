/**
 * Lightweight network DM inbox cache (conversation rows + partner logos).
 * Used so the people strip can paint before the live fetch returns.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NetworkConversation, NetworkPartner } from "../types/chat.types";

const STORAGE_KEY = "pulse-network-chat-bootstrap-v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface NetworkChatPersistPayload {
  orgId: string;
  savedAt: number;
  conversations: NetworkConversation[];
  partners: NetworkPartner[];
}

function stripBodies(conversations: NetworkConversation[]): NetworkConversation[] {
  return conversations.map((c) => ({
    ...c,
    messages: (c.last_message_preview ?? "").trim()
      ? [
          {
            id: `preview-${c.id}`,
            conversation_id: c.id,
            sender_org_id: "",
            sender_user_id: null,
            sender_name: "",
            content: c.last_message_preview ?? "",
            is_read_by_other: true,
            read_at: null,
            created_at: c.last_message_at ?? c.updated_at,
          },
        ]
      : [],
  }));
}

export async function persistNetworkChatBootstrap(
  orgId: string,
  conversations: NetworkConversation[],
  partners: NetworkPartner[],
): Promise<void> {
  if (!orgId.trim()) return;
  try {
    const payload: NetworkChatPersistPayload = {
      orgId: orgId.trim(),
      savedAt: Date.now(),
      conversations: stripBodies(conversations).slice(0, 40),
      partners: partners.slice(0, 40),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* best-effort */
  }
}

export async function loadNetworkChatBootstrap(
  orgId: string,
): Promise<{ conversations: NetworkConversation[]; partners: NetworkPartner[] } | null> {
  if (!orgId.trim()) return null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NetworkChatPersistPayload;
    if (parsed.orgId !== orgId.trim()) return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      return null;
    }
    if (!Array.isArray(parsed.conversations) || !Array.isArray(parsed.partners)) {
      return null;
    }
    return {
      conversations: stripBodies(parsed.conversations),
      partners: parsed.partners,
    };
  } catch {
    return null;
  }
}
