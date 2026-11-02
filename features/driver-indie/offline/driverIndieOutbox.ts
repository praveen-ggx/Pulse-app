import AsyncStorage from "@react-native-async-storage/async-storage";

/** v2 — party_id / paymentMode payloads. Do not read PR #65 v1 drafts. */
const STORAGE_KEY = "pulse.driver_indie_outbox.v1";

export type DriverIndieOutboxKind =
  | "upsert_party"
  | "tag"
  | "issue"
  | "correct"
  | "collect"
  ;

export type DriverIndieOutboxItem = {
  id: string;
  kind: DriverIndieOutboxKind;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
  lastAttemptAt: string | null;
  acknowledgedAt: string | null;
  lastError: string | null;
};

const KIND_ORDER: Record<DriverIndieOutboxKind, number> = {
  upsert_party: 0,
  tag: 1,
  issue: 2,
  correct: 3,
  collect: 4,
};

function fingerprint(kind: DriverIndieOutboxKind, payload: Record<string, unknown>): string {
  return [
    kind,
    String(payload.partyId ?? ""),
    String(payload.localPartyId ?? ""),
    String(payload.receivableId ?? ""),
    String(payload.tripId ?? ""),
    String(payload.name ?? ""),
    String(payload.phone ?? ""),
    String(payload.amount ?? ""),
    String(payload.billed ?? ""),
    String(payload.paymentMode ?? ""),
    String(payload.reference ?? ""),
    String(payload.paidOn ?? ""),
  ].join("|");
}

async function readAll(): Promise<DriverIndieOutboxItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DriverIndieOutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(items: DriverIndieOutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function rememberDriverIndieOutbox(input: {
  kind: DriverIndieOutboxKind;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<DriverIndieOutboxItem> {
  const items = await readAll();
  const fp = fingerprint(input.kind, input.payload);
  const existing = items.find(
    (item) => !item.acknowledgedAt && fingerprint(item.kind, item.payload) === fp,
  );
  if (existing) return existing;
  const key =
    String(input.idempotencyKey ?? "").trim() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const next: DriverIndieOutboxItem = {
    id: key,
    kind: input.kind,
    idempotencyKey: key,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    acknowledgedAt: null,
    lastError: null,
  };
  items.push(next);
  await writeAll(items);
  return next;
}

export async function markDriverIndieOutboxAttempted(id: string): Promise<void> {
  const items = await readAll();
  await writeAll(
    items.map((item) =>
      item.id === id ? { ...item, lastAttemptAt: new Date().toISOString() } : item,
    ),
  );
}

export async function acknowledgeDriverIndieOutbox(id: string): Promise<void> {
  const items = await readAll();
  await writeAll(
    items.map((item) =>
      item.id === id
        ? { ...item, acknowledgedAt: new Date().toISOString(), lastError: null }
        : item,
    ),
  );
}

export async function rejectDriverIndieOutbox(id: string, message: string): Promise<void> {
  const items = await readAll();
  await writeAll(
    items.map((item) =>
      item.id === id
        ? { ...item, lastAttemptAt: new Date().toISOString(), lastError: message }
        : item,
    ),
  );
}

export async function cancelDriverIndieOutbox(id: string): Promise<void> {
  const items = await readAll();
  await writeAll(items.filter((item) => item.id !== id));
}

export async function updateDriverIndieOutboxPayload(
  id: string,
  payload: Record<string, unknown>,
): Promise<DriverIndieOutboxItem | null> {
  const items = await readAll();
  let updated: DriverIndieOutboxItem | null = null;
  await writeAll(
    items.map((item) => {
      if (item.id !== id || item.acknowledgedAt) return item;
      updated = { ...item, payload, lastError: null };
      return updated;
    }),
  );
  return updated;
}

export async function listPendingDriverIndieOutbox(): Promise<DriverIndieOutboxItem[]> {
  const items = await readAll();
  return items
    .filter((item) => !item.acknowledgedAt)
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt.localeCompare(b.createdAt),
    );
}
