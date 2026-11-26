/**
 * Local "last seen" map for driver trip chat — used until a driver-side
 * unread column exists. Keys are conversation ids; values are ISO timestamps
 * of the latest last_message_at the driver has acknowledged.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "pulse.driver.chat.seen.v1";

export type DriverChatSeenMap = Record<string, string>;

export async function loadDriverChatSeenMap(): Promise<DriverChatSeenMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: DriverChatSeenMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveDriverChatSeenMap(
  map: DriverChatSeenMap,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore storage failures */
  }
}

export async function markDriverChatConversationSeen(
  conversationId: string,
  at: string,
  previous?: DriverChatSeenMap,
): Promise<DriverChatSeenMap> {
  const base = previous ?? (await loadDriverChatSeenMap());
  const next = { ...base, [conversationId]: at };
  await saveDriverChatSeenMap(next);
  return next;
}

/** Seed unseen baselines so cold start doesn't flood the driver with old mail. */
export async function baselineDriverChatSeen(
  rows: Array<{ id: string; last_message_at: string | null }>,
): Promise<DriverChatSeenMap> {
  const current = await loadDriverChatSeenMap();
  let changed = false;
  const next = { ...current };
  for (const row of rows) {
    const at = (row.last_message_at ?? "").trim();
    if (!row.id || !at) continue;
    if (!next[row.id]) {
      next[row.id] = at;
      changed = true;
    }
  }
  if (changed) await saveDriverChatSeenMap(next);
  return next;
}

export function isDriverChatMessageNewer(
  lastMessageAt: string | null | undefined,
  seenAt: string | null | undefined,
): boolean {
  const last = (lastMessageAt ?? "").trim();
  if (!last) return false;
  const seen = (seenAt ?? "").trim();
  if (!seen) return true;
  const lastMs = Date.parse(last);
  const seenMs = Date.parse(seen);
  if (!Number.isFinite(lastMs)) return false;
  if (!Number.isFinite(seenMs)) return true;
  return lastMs > seenMs;
}
