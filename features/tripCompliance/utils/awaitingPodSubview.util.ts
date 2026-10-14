import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { lrReceiptForTrip } from "@/features/trips/utils/lrReceiptStatus.util";
import Theme from "@/constants/Theme";

/** India business calendar for “days since the trip was completed”. */
const COMPLETION_TIME_ZONE = "Asia/Kolkata";

export const AWAITING_POD_SUBVIEWS = [
  "all",
  "partial",
  "age_0_3",
  "age_4_7",
  "age_8_15",
  "age_16_30",
  "age_over_30",
] as const;

export type AwaitingPodSubview = (typeof AWAITING_POD_SUBVIEWS)[number];

export const AWAITING_POD_SUBVIEW_LABEL: Record<AwaitingPodSubview, string> = {
  all: "All",
  partial: "Partial Received POD",
  age_0_3: "0–3 days",
  age_4_7: "4–7 days",
  age_8_15: "8–15 days",
  age_16_30: "16–30 days",
  age_over_30: "Over 30 days",
};

export const AWAITING_POD_SUBVIEW_TONE: Record<AwaitingPodSubview, string> = {
  all: Theme.textPrimaryDark,
  partial: Theme.complianceStagePendingFg,
  age_0_3: Theme.complianceStageSuccessFg,
  age_4_7: Theme.complianceStageInfoFg,
  age_8_15: Theme.complianceStagePendingFg,
  age_16_30: Theme.complianceStageBalanceFg,
  age_over_30: Theme.complianceStageDocsFg,
};

type AwaitingPodSlice = Pick<ComplianceTripSummary, "hardCopyPod"> & {
  trip: { completed_at?: string | null };
};

/**
 * Some of the trip's LRs are hard-copy received and at least one is still pending.
 * The trip stays here until every LR is received.
 */
export function isPartiallyReceivedPod(summary: AwaitingPodSlice): boolean {
  if (summary.hardCopyPod.received) return false;
  return (
    lrReceiptForTrip(
      summary.hardCopyPod.lrNumbers ?? [],
      summary.hardCopyPod.receivedLrNumbers ?? [],
    ).kind === "partial"
  );
}

function calendarDayIndex(value: Date): number | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPLETION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  const [year, month, day] = parts.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

/** Whole days from completion to `now` on the India calendar. Null when the date is missing. */
export function daysSinceTripCompleted(
  completedAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const raw = completedAt?.trim();
  if (!raw) return null;
  const completed = new Date(raw);
  if (Number.isNaN(completed.getTime())) return null;
  const completedDay = calendarDayIndex(completed);
  const today = calendarDayIndex(now);
  if (completedDay == null || today == null) return null;
  return Math.round((today - completedDay) / 86_400_000);
}

export function awaitingPodAgeSubview(
  completedAt: string | null | undefined,
  now: Date = new Date(),
): Exclude<AwaitingPodSubview, "all" | "partial"> | null {
  const days = daysSinceTripCompleted(completedAt, now);
  if (days == null) return null;
  if (days <= 3) return "age_0_3";
  if (days <= 7) return "age_4_7";
  if (days <= 15) return "age_8_15";
  if (days <= 30) return "age_16_30";
  return "age_over_30";
}

export function matchesAwaitingPodSubview(
  summary: AwaitingPodSlice,
  subview: AwaitingPodSubview,
  now: Date = new Date(),
): boolean {
  if (subview === "all") return true;
  if (subview === "partial") return isPartiallyReceivedPod(summary);
  return awaitingPodAgeSubview(summary.trip.completed_at, now) === subview;
}

export function countAwaitingPodSubviews(
  summaries: readonly AwaitingPodSlice[],
  now: Date = new Date(),
): Record<AwaitingPodSubview, number> {
  const counts = {
    all: summaries.length,
    partial: 0,
    age_0_3: 0,
    age_4_7: 0,
    age_8_15: 0,
    age_16_30: 0,
    age_over_30: 0,
  } satisfies Record<AwaitingPodSubview, number>;
  for (const summary of summaries) {
    if (isPartiallyReceivedPod(summary)) counts.partial += 1;
    const age = awaitingPodAgeSubview(summary.trip.completed_at, now);
    if (age) counts[age] += 1;
  }
  return counts;
}
