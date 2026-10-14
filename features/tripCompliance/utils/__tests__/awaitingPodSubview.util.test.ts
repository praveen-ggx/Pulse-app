import {
  awaitingPodAgeSubview,
  countAwaitingPodSubviews,
  daysSinceTripCompleted,
  isPartiallyReceivedPod,
  matchesAwaitingPodSubview,
} from "@/features/tripCompliance/utils/awaitingPodSubview.util";

const NOW = new Date("2026-10-01T06:30:00.000Z");

function trip(
  completedAt: string | null,
  pod?: {
    courier?: string | null;
    awb?: string | null;
    received?: boolean;
    lrNumbers?: string[];
    receivedLrNumbers?: string[];
  },
) {
  return {
    trip: { completed_at: completedAt },
    hardCopyPod: {
      received: pod?.received ?? false,
      receivedAt: null,
      courier: pod?.courier ?? null,
      awbNumber: pod?.awb ?? null,
      receivedBy: null,
      lrNumbers: pod?.lrNumbers,
      receivedLrNumbers: pod?.receivedLrNumbers,
    },
  };
}

describe("awaiting POD subviews", () => {
  it("counts days from the completion date on the India calendar", () => {
    expect(daysSinceTripCompleted("2026-10-01T02:00:00+05:30", NOW)).toBe(0);
    expect(daysSinceTripCompleted("2026-09-28T18:00:00+05:30", NOW)).toBe(3);
    expect(daysSinceTripCompleted("2026-09-24T10:00:00+05:30", NOW)).toBe(7);
    expect(daysSinceTripCompleted("2026-09-16T10:00:00+05:30", NOW)).toBe(15);
    expect(daysSinceTripCompleted("2026-09-01T10:00:00+05:30", NOW)).toBe(30);
    expect(daysSinceTripCompleted("2026-08-31T10:00:00+05:30", NOW)).toBe(31);
    expect(daysSinceTripCompleted(null, NOW)).toBeNull();
  });

  it("puts each completion date in one age tab", () => {
    expect(awaitingPodAgeSubview("2026-09-29T10:00:00+05:30", NOW)).toBe("age_0_3");
    expect(awaitingPodAgeSubview("2026-09-25T10:00:00+05:30", NOW)).toBe("age_4_7");
    expect(awaitingPodAgeSubview("2026-09-20T10:00:00+05:30", NOW)).toBe("age_8_15");
    expect(awaitingPodAgeSubview("2026-09-10T10:00:00+05:30", NOW)).toBe("age_16_30");
    expect(awaitingPodAgeSubview("2026-08-01T10:00:00+05:30", NOW)).toBe("age_over_30");
    expect(awaitingPodAgeSubview(null, NOW)).toBeNull();
  });

  it("stays partial until every LR on the trip is received", () => {
    const twoOfThree = { lrNumbers: ["AI1", "AI2", "AI3"], receivedLrNumbers: ["AI1", "AI2"] };
    expect(isPartiallyReceivedPod(trip("2026-10-01", twoOfThree))).toBe(true);
    expect(isPartiallyReceivedPod(trip("2026-10-01", { lrNumbers: ["AI1", "AI2", "AI3"] }))).toBe(false);
    expect(
      isPartiallyReceivedPod(
        trip("2026-10-01", {
          lrNumbers: ["AI1", "AI2", "AI3"],
          receivedLrNumbers: ["AI1", "AI2", "AI3"],
          received: true,
        }),
      ),
    ).toBe(false);
    expect(isPartiallyReceivedPod(trip("2026-10-01", { awb: "DKT-5001" }))).toBe(false);
  });

  it("counts the partial tag separately from the age tabs", () => {
    const rows = [
      trip("2026-10-01T10:00:00+05:30", {
        awb: "DKT-1",
        lrNumbers: ["AI1", "AI2", "AI3"],
        receivedLrNumbers: ["AI1", "AI2"],
      }),
      trip("2026-09-20T10:00:00+05:30"),
      trip(null),
    ];
    expect(countAwaitingPodSubviews(rows, NOW)).toEqual({
      all: 3,
      partial: 1,
      age_0_3: 1,
      age_4_7: 0,
      age_8_15: 1,
      age_16_30: 0,
      age_over_30: 0,
    });
    expect(matchesAwaitingPodSubview(rows[0], "partial", NOW)).toBe(true);
    expect(matchesAwaitingPodSubview(rows[0], "age_0_3", NOW)).toBe(true);
    expect(matchesAwaitingPodSubview(rows[2], "age_0_3", NOW)).toBe(false);
    expect(matchesAwaitingPodSubview(rows[2], "all", NOW)).toBe(true);
  });
});
