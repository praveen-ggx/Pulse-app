import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DcoSelfParty } from "@/features/dco-self/services/dcoSelfReceivable.service";

const PARTIES_KEY = "pulse.dco_self_local_parties.v2";
const TAGS_KEY = "pulse.dco_self_local_tags.v2";
const MAP_KEY = "pulse.dco_self_party_id_map.v2";

function newLocalId(): string {
  return `local:${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export type DcoSelfLocalParty = DcoSelfParty & {
  localId: string;
  syncStatus: "pending" | "synced" | "rejected";
  lastError?: string | null;
};

export type DcoSelfLocalTripTag = {
  tripId: string;
  partyBId: string;
  partyName: string;
  createdAt: string;
  syncStatus: "pending" | "synced" | "rejected";
  lastError?: string | null;
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function listLocalDcoSelfParties(): Promise<DcoSelfLocalParty[]> {
  return readJson<DcoSelfLocalParty[]>(PARTIES_KEY, []);
}

export async function rememberLocalDcoSelfParty(input: {
  name: string;
  phone?: string | null;
}): Promise<DcoSelfLocalParty> {
  const parties = await listLocalDcoSelfParties();
  const name = String(input.name ?? "").trim();
  const phone = input.phone ?? null;
  const existing = parties.find(
    (row) =>
      row.syncStatus !== "synced" &&
      row.name.trim().toLowerCase() === name.toLowerCase() &&
      String(row.phone ?? "") === String(phone ?? ""),
  );
  if (existing) return existing;
  const localId = newLocalId();
  const next: DcoSelfLocalParty = {
    id: localId,
    localId,
    name,
    phone,
    syncStatus: "pending",
    lastError: null,
  };
  parties.unshift(next);
  await AsyncStorage.setItem(PARTIES_KEY, JSON.stringify(parties));
  return next;
}

export async function markLocalDcoSelfPartySynced(
  localId: string,
  server: DcoSelfParty,
): Promise<void> {
  const parties = await listLocalDcoSelfParties();
  await AsyncStorage.setItem(
    PARTIES_KEY,
    JSON.stringify(
      parties.map((row) =>
        row.localId === localId || row.id === localId
          ? { ...row, ...server, id: server.id, localId, syncStatus: "synced", lastError: null }
          : row,
      ),
    ),
  );
  const map = await readJson<Record<string, string>>(MAP_KEY, {});
  map[localId] = server.id;
  await AsyncStorage.setItem(MAP_KEY, JSON.stringify(map));
}

export async function markLocalDcoSelfPartyRejected(
  localId: string,
  message: string,
): Promise<void> {
  const parties = await listLocalDcoSelfParties();
  await AsyncStorage.setItem(
    PARTIES_KEY,
    JSON.stringify(
      parties.map((row) =>
        row.localId === localId || row.id === localId
          ? { ...row, syncStatus: "rejected", lastError: message }
          : row,
      ),
    ),
  );
}

export async function resolveDcoSelfPartyBId(partyBId: string): Promise<string> {
  if (!partyBId.startsWith("local:")) return partyBId;
  const map = await readJson<Record<string, string>>(MAP_KEY, {});
  return map[partyBId] ?? partyBId;
}

export async function mergeDcoSelfParties(server: DcoSelfParty[]): Promise<DcoSelfParty[]> {
  const local = await listLocalDcoSelfParties();
  const seen = new Set(server.map((row) => row.id));
  const extras = local
    .filter((row) => row.syncStatus !== "synced" && !seen.has(row.id))
    .map((row) => ({ id: row.id, name: row.name, phone: row.phone }));
  return [...extras, ...server];
}

export async function listLocalDcoSelfTripTags(): Promise<DcoSelfLocalTripTag[]> {
  return readJson<DcoSelfLocalTripTag[]>(TAGS_KEY, []);
}

export async function rememberLocalDcoSelfTripTag(input: {
  tripId: string;
  partyBId: string;
  partyName: string;
}): Promise<DcoSelfLocalTripTag> {
  const tags = await listLocalDcoSelfTripTags();
  const next: DcoSelfLocalTripTag = {
    tripId: input.tripId,
    partyBId: input.partyBId,
    partyName: input.partyName,
    createdAt: new Date().toISOString(),
    syncStatus: "pending",
    lastError: null,
  };
  const idx = tags.findIndex((row) => row.tripId === input.tripId);
  if (idx >= 0) tags[idx] = next;
  else tags.unshift(next);
  await AsyncStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  return next;
}

export async function markLocalDcoSelfTripTagSynced(
  tripId: string,
  partyBId?: string,
): Promise<void> {
  const tags = await listLocalDcoSelfTripTags();
  await AsyncStorage.setItem(
    TAGS_KEY,
    JSON.stringify(
      tags.map((row) =>
        row.tripId === tripId
          ? {
              ...row,
              partyBId: partyBId ?? row.partyBId,
              syncStatus: "synced",
              lastError: null,
            }
          : row,
      ),
    ),
  );
}

export async function markLocalDcoSelfTripTagRejected(
  tripId: string,
  message: string,
): Promise<void> {
  const tags = await listLocalDcoSelfTripTags();
  await AsyncStorage.setItem(
    TAGS_KEY,
    JSON.stringify(
      tags.map((row) =>
        row.tripId === tripId ? { ...row, syncStatus: "rejected", lastError: message } : row,
      ),
    ),
  );
}

export async function cancelLocalDcoSelfTripTag(tripId: string): Promise<void> {
  const tags = await listLocalDcoSelfTripTags();
  await AsyncStorage.setItem(
    TAGS_KEY,
    JSON.stringify(tags.filter((row) => row.tripId !== tripId)),
  );
}

export async function localTagForTrip(tripId: string): Promise<DcoSelfLocalTripTag | null> {
  const tags = await listLocalDcoSelfTripTags();
  return tags.find((row) => row.tripId === tripId) ?? null;
}
