import { normalizeOrgLrNumber } from "@/features/trips/services/orgLrNumber.util";
import {
  hardCopyPodLrKey,
  type HardCopyPodLrOption,
} from "@/features/trips/utils/hardCopyPodLrSelection.util";

/** Some LRs received and at least one still pending. */
export type LrReceiptKind = "none" | "partial" | "complete";

export type LrReceipt = {
  received: string[];
  pending: string[];
  kind: LrReceiptKind;
};

const REMARKS_KIND = "lr_receipt";

function uniqueLrNumbers(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const lr = raw.trim();
    if (!lr) continue;
    const key = normalizeOrgLrNumber(lr);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(lr);
  }
  return out;
}

/**
 * Split a trip's LR numbers into received and pending.
 * A trip with no LR numbers is `none` (the whole-trip POD path still applies).
 * Matching ignores spacing and case.
 */
export function lrReceiptForTrip(
  allLrs: readonly string[],
  receivedLrs: readonly string[],
): LrReceipt {
  const all = uniqueLrNumbers(allLrs);
  const receivedKeys = new Set(
    receivedLrs.map((lr) => normalizeOrgLrNumber(lr)).filter(Boolean),
  );
  const received: string[] = [];
  const pending: string[] = [];
  for (const lr of all) {
    if (receivedKeys.has(normalizeOrgLrNumber(lr))) received.push(lr);
    else pending.push(lr);
  }
  let kind: LrReceiptKind = "none";
  if (all.length > 0 && pending.length === 0) kind = "complete";
  else if (received.length > 0 && pending.length > 0) kind = "partial";
  return { received, pending, kind };
}

export function mergeReceivedLrNumbers(...groups: readonly (readonly string[])[]): string[] {
  return uniqueLrNumbers(groups.flat());
}

/** True when this LR was already logged as hard-copy received for its trip. */
export function hardCopyPodLrAlreadyReceived(
  option: Pick<HardCopyPodLrOption, "tripId" | "lrNumber" | "alreadyReceived">,
  openedTripId: string,
  storedReceivedLrs: readonly string[],
): boolean {
  if (option.alreadyReceived) return true;
  if (option.tripId.trim() !== openedTripId.trim()) return false;
  const key = normalizeOrgLrNumber(option.lrNumber);
  return storedReceivedLrs.some((lr) => normalizeOrgLrNumber(lr) === key);
}

/**
 * Received set after this courier save, and whether every LR on the trip is covered.
 * A trip with no LR documents is complete so the existing single-trip save still marks it received.
 */
export function courierLrReceiptPlan(input: {
  tripId: string;
  options: readonly HardCopyPodLrOption[];
  selectedKeys: ReadonlySet<string>;
  openedTripId: string;
  storedReceivedLrs: readonly string[];
}): { receivedLrs: string[]; complete: boolean } {
  const own = input.options.filter((option) => option.tripId === input.tripId);
  const selected = own
    .filter((option) => input.selectedKeys.has(hardCopyPodLrKey(option)))
    .map((option) => option.lrNumber);
  const prior = own
    .filter((option) =>
      hardCopyPodLrAlreadyReceived(option, input.openedTripId, input.storedReceivedLrs),
    )
    .map((option) => option.lrNumber);
  const receivedLrs = mergeReceivedLrNumbers(prior, selected);
  const receipt = lrReceiptForTrip(
    own.map((option) => option.lrNumber),
    receivedLrs,
  );
  return {
    receivedLrs,
    complete: own.length === 0 || receipt.kind === "complete",
  };
}

/** Persist received LR numbers inside the courier remarks the workflow event already stores. */
export function encodeCourierLrRemarks(input: {
  text?: string | null;
  receivedLrs: readonly string[];
}): string | null {
  const text = input.text?.trim() || null;
  const receivedLrs = uniqueLrNumbers(input.receivedLrs);
  if (receivedLrs.length === 0) return text;
  return JSON.stringify({
    v: 1,
    kind: REMARKS_KIND,
    text,
    received_lrs: receivedLrs,
  });
}

export function decodeCourierLrRemarks(raw: string | null | undefined): {
  text: string | null;
  receivedLrs: string[];
} {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { text: null, receivedLrs: [] };
  if (!trimmed.startsWith("{")) return { text: trimmed, receivedLrs: [] };
  try {
    const parsed = JSON.parse(trimmed) as {
      kind?: unknown;
      text?: unknown;
      received_lrs?: unknown;
    };
    if (parsed.kind !== REMARKS_KIND) return { text: trimmed, receivedLrs: [] };
    const text = typeof parsed.text === "string" && parsed.text.trim() ? parsed.text.trim() : null;
    const receivedLrs = Array.isArray(parsed.received_lrs)
      ? uniqueLrNumbers(parsed.received_lrs.filter((value): value is string => typeof value === "string"))
      : [];
    return { text, receivedLrs };
  } catch {
    return { text: trimmed, receivedLrs: [] };
  }
}
