/** Days after trip completion with no POD penalty. Day 16 is the first charged day. */
export const POD_RECEIVING_FREE_DAYS = 15;
/** Rupees per delay day for delay days 1 through 10 (calendar days 16 through 25). */
export const POD_AGING_PENALTY_PER_DAY = 50;
/** Last delay day that is still charged per day. Delay day 11 onward is the flat slab. */
export const POD_AGING_PER_DAY_LIMIT = 10;
/** Flat penalty from delay day 11 when the POD is still not received. */
export const POD_AGING_FLAT_PENALTY_OPEN = 1500;
/** Flat penalty from delay day 11 once the POD has been received. */
export const POD_AGING_FLAT_PENALTY_RECEIVED = 1000;

export type PodReceivingAging = {
  days: number;
  penalty: number;
};

function calendarDay(value: string): number | null {
  const day = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

/** Local calendar day, matching the date fields (YYYY-MM-DD). */
export function todayIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Penalty from days since trip completion.
 * 0–15: none. 16–25: ₹50 per delay day (₹50–₹500).
 * Day 26 onward: ₹1,000 if the POD is received, otherwise ₹1,500.
 */
export function podAgingPenalty(daysFromCompleted: number, podReceived = false): number {
  const delayDays = Math.max(0, daysFromCompleted - POD_RECEIVING_FREE_DAYS);
  if (delayDays <= 0) return 0;
  if (delayDays <= POD_AGING_PER_DAY_LIMIT) return delayDays * POD_AGING_PENALTY_PER_DAY;
  return podReceived ? POD_AGING_FLAT_PENALTY_RECEIVED : POD_AGING_FLAT_PENALTY_OPEN;
}

/**
 * End of the aging window. Dispatch date once the POD is sent, otherwise today,
 * so a submitted POD does not keep accruing after it left.
 */
export function podAgingEndDate(dispatchDate: string | null | undefined, today: string): string {
  const dispatch = String(dispatchDate ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dispatch) ? dispatch : today;
}

/** Days from the trip completed date through the dispatch date, or today if it is not dispatched yet. */
export function podReceivingAging(
  completedDate: string | null | undefined,
  asOfDate: string | null | undefined,
  podReceived = false,
): PodReceivingAging | null {
  const completed = calendarDay(String(completedDate ?? ""));
  const asOf = calendarDay(String(asOfDate ?? ""));
  if (completed == null || asOf == null) return null;
  const days = Math.round((asOf - completed) / 86_400_000);
  return { days, penalty: podAgingPenalty(days, podReceived) };
}

/**
 * Aging shown against the 15-day window.
 * Same day is -15, day 15 is 0 (no penalty), day 16 is 1 and the charge starts.
 */
export function podAgingOffset(days: number): number {
  return days - POD_RECEIVING_FREE_DAYS;
}

/** Amount that Vendor POD Delay Submission should show. Empty inside the free window. */
export function podDelaySubmissionAmount(
  penalty: number | null | undefined,
  extra = 0,
): string {
  const amount = (Number(penalty) || 0) + (Number(extra) || 0);
  return amount > 0 ? String(Math.round(amount)) : "";
}

/** `-15 days` through `0 days`, then `1 day - ₹50` once the penalty starts. */
export function formatPodReceivingAging(aging: PodReceivingAging | null): string {
  if (!aging) return "—";
  const offset = podAgingOffset(aging.days);
  const unit = Math.abs(offset) === 1 ? "day" : "days";
  const dayLabel = `${offset} ${unit}`;
  if (aging.penalty <= 0) return dayLabel;
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(aging.penalty);
  return `${dayLabel} - ${amount}`;
}
