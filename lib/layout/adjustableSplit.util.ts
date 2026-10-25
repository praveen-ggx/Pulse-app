const memory = new Map<string, number>();
const PREFIX = "pulse.split.";

export function clampSplitSize(
  next: number,
  minSize: number,
  maxSize: number,
  containerSize: number,
  otherMinSize: number,
): number {
  if (containerSize <= 0) {
    return Math.round(Math.min(maxSize, Math.max(minSize, next)));
  }
  const hi = Math.min(maxSize, Math.max(minSize, containerSize - otherMinSize));
  return Math.round(Math.min(hi, Math.max(minSize, next)));
}

export function readSplitSize(key: string, fallback: number): number {
  const cached = memory.get(key);
  if (typeof cached === "number" && Number.isFinite(cached)) return cached;
  try {
    const raw = globalThis.localStorage?.getItem(`${PREFIX}${key}`);
    const parsed = raw == null ? NaN : Number(raw);
    if (Number.isFinite(parsed)) {
      memory.set(key, parsed);
      return parsed;
    }
  } catch {
    /* private mode / native */
  }
  return fallback;
}

export function hasSplitSize(key: string): boolean {
  if (memory.has(key)) return true;
  try {
    return globalThis.localStorage?.getItem(`${PREFIX}${key}`) != null;
  } catch {
    return false;
  }
}

export function writeSplitSize(key: string, size: number): void {
  memory.set(key, size);
  try {
    globalThis.localStorage?.setItem(`${PREFIX}${key}`, String(size));
  } catch {
    /* private mode / native */
  }
}
