import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DriverIndieParty } from "@/features/driver-indie/services/driverIndieReceivable.service";

const PARTIES_KEY = "pulse.driver_indie_local_parties.v1";
const TAGS_KEY = "pulse.driver_indie_local_tags.v1";
const MAP_KEY = "pulse.driver_indie_party_id_map.v1";

function newLocalId(): string {
  return `local:${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export type DriverIndieLocalParty = DriverIndieParty & {
  localId: string;
  syncStatus: "pending" | "synced" | "rejected";
  lastError?: string | null;
};

export type DriverIndieLocalTripTag = {
  tripId: string;
  partyId: string;
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

export async function listLocalDriverIndieParties(): Promise<DriverIndieLocalParty[]> {
  return readJson<DriverIndieLocalParty[]>(PARTIES_KEY, []);
}

export async function rememberLocalDriverIndieParty(input: {
  name: string;
  phone?: string | null;
}): Promise<DriverIndieLocalParty> {
  const parties = await listLocalDriverIndieParties();
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
  const next: DriverIndieLocalParty = {
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

export async function markLocalDriverIndiePartySynced(
  localId: string,
  server: DriverIndieParty,
): Promise<void> {
  const parties = await listLocalDriverIndieParties();
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

export async function markLocalDriverIndiePartyRejected(
  localId: string,
  message: string,
): Promise<void> {
  const parties = await listLocalDriverIndieParties();
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

export async function resolveDriverIndiePartyId(partyId: string): Promise<string> {
  if (!partyId.startsWith("local:")) return partyId;
  const map = await readJson<Record<string, string>>(MAP_KEY, {});
  return map[partyId] ?? partyId;
}

export async function mergeDriverIndieParties(server: DriverIndieParty[]): Promise<DriverIndieParty[]> {
  const local = await listLocalDriverIndieParties();
  const seen = new Set(server.map((row) => row.id));
  const extras = local
    .filter((row) => row.syncStatus !== "synced" && !seen.has(row.id))
    .map((row) => ({ id: row.id, name: row.name, phone: row.phone }));
  return [...extras, ...server];
}

export async function listLocalDriverIndieTripTags(): Promise<DriverIndieLocalTripTag[]> {
  return readJson<DriverIndieLocalTripTag[]>(TAGS_KEY, []);
}

export async function rememberLocalDriverIndieTripTag(input: {
  tripId: string;
  partyId: string;
  partyName: string;
}): Promise<DriverIndieLocalTripTag> {
  const tags = await listLocalDriverIndieTripTags();
  const next: DriverIndieLocalTripTag = {
    tripId: input.tripId,
    partyId: input.partyId,
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

export async function markLocalDriverIndieTripTagSynced(
  tripId: string,
  partyId?: string,
): Promise<void> {
  const tags = await listLocalDriverIndieTripTags();
  await AsyncStorage.setItem(
    TAGS_KEY,
    JSON.stringify(
      tags.map((row) =>
        row.tripId === tripId
          ? {
              ...row,
              partyId: partyId ?? row.partyId,
              syncStatus: "synced",
              lastError: null,
            }
          : row,
      ),
    ),
  );
}

export async function markLocalDriverIndieTripTagRejected(
  tripId: string,
  message: string,
): Promise<void> {
  const tags = await listLocalDriverIndieTripTags();
  await AsyncStorage.setItem(
    TAGS_KEY,
    JSON.stringify(
      tags.map((row) =>
        row.tripId === tripId ? { ...row, syncStatus: "rejected", lastError: message } : row,
      ),
    ),
  );
}

export async function cancelLocalDriverIndieTripTag(tripId: string): Promise<void> {
  const tags = await listLocalDriverIndieTripTags();
  await AsyncStorage.setItem(
    TAGS_KEY,
    JSON.stringify(tags.filter((row) => row.tripId !== tripId)),
  );
}

export async function localTagForTrip(tripId: string): Promise<DriverIndieLocalTripTag | null> {
  const tags = await listLocalDriverIndieTripTags();
  return tags.find((row) => row.tripId === tripId) ?? null;
}
