import AsyncStorage from "@react-native-async-storage/async-storage";

const PARTIES_KEY = "pulse.driver_offline_parties.v1";

export type DriverOfflineParty = {
  id: string;
  name: string;
  phone?: string | null;
  createdAt: string;
};

function newLocalId(): string {
  return `local:${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

async function readAll(): Promise<DriverOfflineParty[]> {
  const raw = await AsyncStorage.getItem(PARTIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DriverOfflineParty[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(rows: DriverOfflineParty[]): Promise<void> {
  await AsyncStorage.setItem(PARTIES_KEY, JSON.stringify(rows));
}

export async function listDriverOfflineParties(): Promise<DriverOfflineParty[]> {
  return readAll();
}

export async function rememberDriverOfflineParty(input: {
  name: string;
  phone?: string | null;
}): Promise<DriverOfflineParty> {
  const name = String(input.name ?? "").trim() || "Party";
  const phone = input.phone ?? null;
  const rows = await readAll();
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
