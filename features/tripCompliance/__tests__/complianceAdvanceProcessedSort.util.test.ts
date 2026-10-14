import {
  compareComplianceSummariesByAdvanceProcessed,
  sortAdvanceProcessedSummaries,
} from "@/features/tripCompliance/utils/complianceAdvanceProcessedSort.util";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";

function summary(input: {
  id: string;
  postedAt?: string | null;
  paidAt?: string | null;
}): ComplianceTripSummary {
  return {
    trip: { id: input.id },
    advance: {
      amount: 1000,
      paymentMode: "UPI",
      utr: null,
      paidAt: input.paidAt ?? "2026-10-01",
      actorId: null,
      transactionId: `tx-${input.id}`,
      postedAt: input.postedAt,
    },
  } as unknown as ComplianceTripSummary;
}

describe("sortAdvanceProcessedSummaries", () => {
  it("puts the most recently posted advance first", () => {
    const older = summary({ id: "a", postedAt: "2026-10-01T08:00:00Z" });
    const newer = summary({ id: "b", postedAt: "2026-10-07T10:00:00Z" });
    const mid = summary({ id: "c", postedAt: "2026-10-05T12:00:00Z" });
    expect(sortAdvanceProcessedSummaries([older, newer, mid]).map((s) => s.trip.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("falls back to Paid at when postedAt is missing", () => {
    const byPaid = summary({ id: "paid", postedAt: null, paidAt: "2026-10-06" });
    const byPosted = summary({
      id: "posted",
      postedAt: "2026-10-01T00:00:00Z",
      paidAt: "2026-09-01",
    });
    expect(compareComplianceSummariesByAdvanceProcessed(byPaid, byPosted)).toBeLessThan(0);
  });

  it("keeps trips without advance timestamps after dated ones", () => {
    const dated = summary({ id: "dated", postedAt: "2026-10-01T00:00:00Z" });
    const undated = summary({ id: "undated", postedAt: null, paidAt: "" });
    expect(sortAdvanceProcessedSummaries([undated, dated]).map((s) => s.trip.id)).toEqual([
      "dated",
      "undated",
    ]);
  });
});
