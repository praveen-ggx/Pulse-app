import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "pulse.dco_self_outbox.v1";

export type DcoSelfOutboxKind = "issue" | "correct" | "collect";

export type DcoSelfOutboxItem = {
  id: string;
  kind: DcoSelfOutboxKind;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
  lastAttemptAt: string | null;
  acknowledgedAt: string | null;
};

function fingerprint(kind: DcoSelfOutboxKind, payload: Record<string, unknown>): string {
  return [
    kind,
    String(payload.partyBId ?? ""),
    String(payload.receivableId ?? ""),
    String(payload.tripId ?? ""),
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
  };
  items.push(next);
  await writeAll(items);
  return next;
}

export async function acknowledgeDcoSelfOutbox(id: string): Promise<void> {
  const items = await readAll();
  await writeAll(
    items.map((item) =>
      item.id === id ? { ...item, acknowledgedAt: new Date().toISOString() } : item,
    ),
  );
}
