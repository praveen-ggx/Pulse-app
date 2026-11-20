import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/lib/supabase";

/**
 * Old single key shared by every account on the phone — another driver who
 * signed in on the same phone saw the previous driver's parties. Now stored
 * per user; the old list is handed over once to the first user who reads it.
 */
const LEGACY_PARTIES_KEY = "pulse.driver_offline_parties.v1";

async function partiesKey(): Promise<string> {
  try {
    const { data } = await supabase().auth.getSession();
    const uid = data.session?.user?.id;
    if (uid) return `pulse.driver_offline_parties.v2:${uid}`;
  } catch {
    // no session available — fall through
  }
  return "pulse.driver_offline_parties.v2:anonymous";
}

export type DriverOfflineParty = {
  id: string;
  name: string;
  phone?: string | null;
  createdAt: string;
};

function newLocalId(): string {
  return `local:${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function parseRows(raw: string | null): DriverOfflineParty[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DriverOfflineParty[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readAll(): Promise<DriverOfflineParty[]> {
  const key = await partiesKey();
  const raw = await AsyncStorage.getItem(key);
  if (raw) return parseRows(raw);
  // One-time hand-over of the old shared list, then delete it.
  const legacy = await AsyncStorage.getItem(LEGACY_PARTIES_KEY);
  if (!legacy) return [];
  const rows = parseRows(legacy);
  await AsyncStorage.setItem(key, JSON.stringify(rows));
  await AsyncStorage.removeItem(LEGACY_PARTIES_KEY);
  return rows;
}

async function writeAll(rows: DriverOfflineParty[]): Promise<void> {
  await AsyncStorage.setItem(await partiesKey(), JSON.stringify(rows));
}

export async function listDriverOfflineParties(): Promise<DriverOfflineParty[]> {
  const rows = await readAll();
  const created = rows.filter((row) => isLocalDriverOfflinePartyId(row.id));
  if (created.length !== rows.length) await writeAll(created);
  return created;
}

export async function rememberDriverOfflineParty(input: {
  name: string;
  phone?: string | null;
}): Promise<DriverOfflineParty> {
  const name = String(input.name ?? "").trim() || "Party";
  const phone = input.phone ?? null;
  const rows = (await readAll()).filter((row) => isLocalDriverOfflinePartyId(row.id));
  const existing = rows.find(
    (row) =>
      row.name.trim().toLowerCase() === name.toLowerCase() &&
      String(row.phone ?? "") === String(phone ?? ""),
  );
  if (existing) return existing;
  const next: DriverOfflineParty = {
    id: newLocalId(),
    name,
    phone,
    createdAt: new Date().toISOString(),
  };
  rows.unshift(next);
  await writeAll(rows);
  return next;
}

export function isLocalDriverOfflinePartyId(id: string): boolean {
  return String(id ?? "").trim().startsWith("local:");
}
