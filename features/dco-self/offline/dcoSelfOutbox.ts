import AsyncStorage from "@react-native-async-storage/async-storage";

/** v2 — party_b_id / paymentMode payloads. Do not read PR #65 v1 drafts. */
const STORAGE_KEY = "pulse.dco_self_outbox.v2";

export type DcoSelfOutboxKind =
  | "upsert_party"
  | "tag"
  | "issue"
  | "correct"
  | "collect"
  | "exchange_claim";

export type DcoSelfOutboxItem = {
  id: string;
  kind: DcoSelfOutboxKind;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
  lastAttemptAt: string | null;
  acknowledgedAt: string | null;
  lastError: string | null;
};

const KIND_ORDER: Record<DcoSelfOutboxKind, number> = {
  upsert_party: 0,
  tag: 1,
  issue: 2,
  correct: 3,
  collect: 4,
  exchange_claim: 5,
};

function fingerprint(kind: DcoSelfOutboxKind, payload: Record<string, unknown>): string {
  return [
    kind,
    String(payload.partyBId ?? ""),
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

async function readAll(): Promise<DcoSelfOutboxItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DcoSelfOutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(items: DcoSelfOutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function rememberDcoSelfOutbox(input: {
  kind: DcoSelfOutboxKind;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<DcoSelfOutboxItem> {
  const items = await readAll();
  const fp = fingerprint(input.kind, input.payload);
  const existing = items.find(
    (item) => !item.acknowledgedAt && fingerprint(item.kind, item.payload) === fp,
  );
  if (existing) return existing;
  const key =
    String(input.idempotencyKey ?? "").trim() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const next: DcoSelfOutboxItem = {
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

export async function markDcoSelfOutboxAttempted(id: string): Promise<void> {
  const items = await readAll();
  await writeAll(
    items.map((item) =>
      item.id === id ? { ...item, lastAttemptAt: new Date().toISOString() } : item,
    ),
  );
}

export async function acknowledgeDcoSelfOutbox(id: string): Promise<void> {
  const items = await readAll();
  await writeAll(
    items.map((item) =>
      item.id === id
        ? { ...item, acknowledgedAt: new Date().toISOString(), lastError: null }
        : item,
    ),
  );
}

export async function rejectDcoSelfOutbox(id: string, message: string): Promise<void> {
  const items = await readAll();
  await writeAll(
    items.map((item) =>
      item.id === id
        ? { ...item, lastAttemptAt: new Date().toISOString(), lastError: message }
        : item,
    ),
  );
}

export async function cancelDcoSelfOutbox(id: string): Promise<void> {
  const items = await readAll();
  await writeAll(items.filter((item) => item.id !== id));
}

export async function updateDcoSelfOutboxPayload(
  id: string,
  payload: Record<string, unknown>,
): Promise<DcoSelfOutboxItem | null> {
  const items = await readAll();
  let updated: DcoSelfOutboxItem | null = null;
  await writeAll(
    items.map((item) => {
      if (item.id !== id || item.acknowledgedAt) return item;
      updated = { ...item, payload, lastError: null };
      return updated;
    }),
  );
  return updated;
}

export async function listPendingDcoSelfOutbox(): Promise<DcoSelfOutboxItem[]> {
  const items = await readAll();
  return items
    .filter((item) => !item.acknowledgedAt)
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt.localeCompare(b.createdAt),
    );
}
