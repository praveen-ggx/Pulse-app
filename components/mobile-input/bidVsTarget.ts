/**
 * Live bid amount vs shipper target — shared by story BidSheet,
 * FullscreenNumericEntry (Get Load / driver direct), and confirm modals.
 */
import { formatINR } from "@/lib/format";

export type BidVsTargetTone = "over" | "under" | "match";

export type BidVsTargetDelta = {
  tone: BidVsTargetTone;
  /** Tiny caption under the amount, e.g. "+₹ 1,200 vs target". */
  caption: string;
};

export type TargetBand = { min: number; max: number };

function positiveRate(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

/** One shipper target, or the low and high targets across a pool. */
export function targetBand(
  min: number | null | undefined,
  max?: number | null,
): TargetBand | null {
  const lo = positiveRate(min);
  const hi = positiveRate(max);
  if (lo == null && hi == null) return null;
  const low = lo ?? hi!;
  const high = hi ?? lo!;
  return low <= high ? { min: low, max: high } : { min: high, max: low };
}

export function targetBandIsRange(band: TargetBand): boolean {
  return band.max - band.min >= 0.5;
}

export function formatTargetBand(band: TargetBand): string {
  if (!targetBandIsRange(band)) return formatINR(band.min);
  return `${formatINR(band.min)} – ${formatINR(band.max)}`;
}

/**
 * Compare typed bid amount to target rate.
 * Returns null when either side is missing / not positive.
 */
export function resolveBidVsTarget(
  amount: number,
  target: number | null | undefined,
): BidVsTargetDelta | null {
  if (target == null || !(target > 0)) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const diff = amount - target;
  if (Math.abs(diff) < 0.5) {
    return { tone: "match", caption: "At target" };
  }
  if (diff > 0) {
    return {
      tone: "over",
      caption: `+${formatINR(diff)} vs target`,
    };
  }
  return {
    tone: "under",
    caption: `−${formatINR(Math.abs(diff))} vs target`,
  };
}

/**
 * A single target keeps the point comparison. A spread says whether the
 * typed rate is under, inside, or over that band.
 */
export function resolveBidVsTargetBand(
  amount: number,
  band: TargetBand | null,
): BidVsTargetDelta | null {
  if (band == null) return null;
  if (!targetBandIsRange(band)) return resolveBidVsTarget(amount, band.min);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount < band.min - 0.5) {
    return { tone: "under", caption: `${formatINR(band.min - amount)} under the range` };
  }
  if (amount > band.max + 0.5) {
    return { tone: "over", caption: `${formatINR(amount - band.max)} over the range` };
  }
  if (Math.abs(amount - band.min) < 0.5) {
    return { tone: "match", caption: "Low end of the range" };
  }
  if (Math.abs(amount - band.max) < 0.5) {
    return { tone: "match", caption: "High end of the range" };
  }
  return { tone: "match", caption: "Inside the range" };
}
