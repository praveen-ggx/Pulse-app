import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SaveFuelEntryInput, SaveTollEntryInput } from "../types";

const OUTBOX_KEY = "trip_operations_outbox_v1";

type QueueStatus = "pending" | "retrying" | "failed";

interface QueueBase {
  id: string;
  createdAt: string;
  retryCount: number;
  status: QueueStatus;
  lastError: string | null;
}

export interface FuelMetadataQueueItem extends QueueBase {
  kind: "fuel_metadata";
  payload: Omit<SaveFuelEntryInput, "billPhotoLocalUri">;
}

export interface FuelPhotoQueueItem extends QueueBase {
  kind: "fuel_photo";
  payload: {
    tripId: string;
    userId: string | null;
    localUri: string;
  };
}

export interface TollMetadataQueueItem extends QueueBase {
  kind: "toll_metadata";
  payload: Omit<SaveTollEntryInput, "receiptLocalUri">;
}

export interface TollPhotoQueueItem extends QueueBase {
  kind: "toll_photo";
  payload: {
    tripId: string;
    userId: string | null;
    localUri: string;
  };
}

export type OperationsQueueItem =
  | FuelMetadataQueueItem
  | FuelPhotoQueueItem
  | TollMetadataQueueItem
  | TollPhotoQueueItem;

function randomId(): string {
  return `ops_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Id for one fuel/toll save. Generated before the online attempt and used as both the
 * insert's idempotency_key and the outbox item id, so a replay of a save that already
 * committed (timeout after commit) hits the unique index instead of duplicating it.
 */
export function newOperationsQueueItemId(): string {
  return randomId();
}

async function readQueue(): Promise<OperationsQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OperationsQueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: OperationsQueueItem[]) {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

export async function listOperationsOutbox() {
  return readQueue();
}

async function enqueue(item: OperationsQueueItem) {
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
  return item.id;
}

export async function enqueueFuelMetadata(
  payload: FuelMetadataQueueItem["payload"],
  id: string = randomId(),
) {
  return enqueue({
    id,
    kind: "fuel_metadata",
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
    lastError: null,
  });
}

export async function enqueueFuelPhoto(payload: FuelPhotoQueueItem["payload"]) {
  return enqueue({
    id: randomId(),
    kind: "fuel_photo",
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
    lastError: null,
  });
}

export async function enqueueTollMetadata(
  payload: TollMetadataQueueItem["payload"],
  id: string = randomId(),
) {
  return enqueue({
    id,
    kind: "toll_metadata",
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
    lastError: null,
  });
}

export async function enqueueTollPhoto(payload: TollPhotoQueueItem["payload"]) {
  return enqueue({
    id: randomId(),
    kind: "toll_photo",
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
    lastError: null,
  });
}

export async function markOperationsQueueItemDone(id: string) {
  const queue = await readQueue();
  await writeQueue(queue.filter((item) => item.id !== id));
}

export async function markOperationsQueueItemRetry(id: string, message: string) {
  const queue = await readQueue();
  const next: OperationsQueueItem[] = queue.map((item) => {
    if (item.id !== id) return item;
    const status: QueueStatus = item.retryCount + 1 >= 3 ? "failed" : "retrying";
    return {
      ...item,
      retryCount: item.retryCount + 1,
      status,
      lastError: message,
    };
  });
  await writeQueue(next);
}
