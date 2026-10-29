import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ELR_SOURCE_DOCUMENT_TYPES,
  emptyElrCompletionDraft,
  type ElrCompletionDraft,
} from "@/features/trips/services/elrCompletion.util";

/** Choice fields only take one of their options; anything else stays empty. */
const CHOICE_OPTIONS: Partial<Record<keyof ElrCompletionDraft, readonly string[]>> = {
  consignorGst: ["registered", "unregistered"],
  consigneeGst: ["registered", "unregistered"],
  transporterGst: ["registered", "unregistered"],
  weightUnit: ["kg", "tons"],
  sourceDocumentType: ELR_SOURCE_DOCUMENT_TYPES.map((type) => type.id),
};

const keyFor = (tripId: string) => `elr-draft:v1:${tripId.trim()}`;

/** Restores a saved E-LR draft. Incomplete JSON becomes null. */
export function parseElrDraft(raw: string | null): ElrCompletionDraft | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ElrCompletionDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    const base = emptyElrCompletionDraft();
    const next = { ...base };
    for (const key of Object.keys(base) as Array<keyof ElrCompletionDraft>) {
      const value = parsed[key];
      if (typeof value !== "string") continue;
      const options = CHOICE_OPTIONS[key];
      if (options && !options.includes(value)) continue;
      (next as Record<keyof ElrCompletionDraft, string>)[key] = value;
    }
    return next;
  } catch {
    return null;
  }
}

export async function readElrDraft(tripId: string): Promise<ElrCompletionDraft | null> {
  if (!tripId.trim()) return null;
  return parseElrDraft(await AsyncStorage.getItem(keyFor(tripId)));
}

/** Stores LR answers for this trip only. Does not write trips, clients, or vehicles. */
export async function writeElrDraft(tripId: string, draft: ElrCompletionDraft): Promise<void> {
  const id = tripId.trim();
  if (!id) return;
  await AsyncStorage.setItem(keyFor(id), JSON.stringify(draft));
}

export async function clearElrDraft(tripId: string): Promise<void> {
  const id = tripId.trim();
  if (!id) return;
  await AsyncStorage.removeItem(keyFor(id));
}
