/** Last vehicle-commit the operator set on a Network pool bid (client preview). */
import { useSyncExternalStore } from "react";

export type PoolCommitPreview = {
  vehicleLimit: number;
  awardedCount: number;
  validUntilDate: string;
};

const PREFIX = "pulse.poolBidCommit.v1.";
const memory = new Map<string, PoolCommitPreview>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function readStorage(poolId: string): PoolCommitPreview | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(PREFIX + poolId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PoolCommitPreview>;
    const vehicleLimit = Math.floor(Number(parsed.vehicleLimit));
    if (!Number.isFinite(vehicleLimit) || vehicleLimit < 1) return null;
    const awardedCount = Math.max(0, Math.floor(Number(parsed.awardedCount ?? 0)));
    const validUntilDate = String(parsed.validUntilDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntilDate)) return null;
    return { vehicleLimit, awardedCount, validUntilDate };
  } catch {
    return null;
  }
}

function writeStorage(poolId: string, preview: PoolCommitPreview) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(PREFIX + poolId, JSON.stringify(preview));
  } catch {
    /* private mode / native */
  }
}

export function readPoolCommitPreview(poolId: string): PoolCommitPreview | null {
  const cached = memory.get(poolId);
  if (cached) return cached;
  const stored = readStorage(poolId);
  if (stored) memory.set(poolId, stored);
  return stored;
}

export function rememberPoolCommitPreview(
  poolId: string,
  preview: PoolCommitPreview,
): void {
  memory.set(poolId, preview);
  writeStorage(poolId, preview);
  notify();
}

export function forgetPoolCommitPreview(poolId: string): void {
  memory.delete(poolId);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(PREFIX + poolId);
    }
  } catch {
    /* private mode / native */
  }
  notify();
}

export function subscribePoolCommitPreviews(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePoolCommitPreview(poolId: string): PoolCommitPreview | null {
  return useSyncExternalStore(
    subscribePoolCommitPreviews,
    () => readPoolCommitPreview(poolId),
    () => readPoolCommitPreview(poolId),
  );
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatPoolCommitUntil(isoDate: string): string {
  const day = isoDate.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return day;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export function poolCommitRemaining(preview: PoolCommitPreview): number {
  return Math.max(0, preview.vehicleLimit - preview.awardedCount);
}

export function poolCommitPreviewFacts(preview: PoolCommitPreview): {
  committed: string;
  remaining: string;
  until: string;
} {
  const left = poolCommitRemaining(preview);
  return {
    committed: `${preview.vehicleLimit} vehicle${preview.vehicleLimit === 1 ? "" : "s"}`,
    remaining: `${left} left`,
    until: formatPoolCommitUntil(preview.validUntilDate),
  };
}

/** Footer line: how many of this operator's committed awards are still pending. */
export function describePoolCommitPending(
  preview: PoolCommitPreview | null,
  fallbackPending: number,
): string {
  if (!preview) {
    const n = Math.max(0, Math.floor(fallbackPending));
    return `${n} pending`;
  }
  const left = poolCommitRemaining(preview);
  return `${left} of ${preview.vehicleLimit} pending`;
}
