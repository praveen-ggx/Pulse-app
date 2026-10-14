import {
  formatPodReceivingAging,
  podAgingEndDate,
  podDelaySubmissionAmount,
  podReceivingAging,
} from "@/features/debit-control/utils/podAging.util";

describe("pod receiving aging", () => {
  it("waits for both dates", () => {
    expect(podReceivingAging("2026-09-01", "")).toBeNull();
    expect(podReceivingAging("", "2026-09-20")).toBeNull();
  });

  it("charges nothing through the 15th day", () => {
    expect(podReceivingAging("2026-09-01", "2026-09-16")).toEqual({ days: 15, penalty: 0 });
  });

  it("charges 50 rupees per delay day from day 16 through day 25", () => {
    expect(podReceivingAging("2026-09-01", "2026-09-17")).toEqual({ days: 16, penalty: 50 });
    expect(podReceivingAging("2026-09-01", "2026-09-26")).toEqual({ days: 25, penalty: 500 });
  });

  it("charges a flat 1000 from day 26 once the POD is received", () => {
    expect(podReceivingAging("2026-09-01", "2026-09-27", true)).toEqual({ days: 26, penalty: 1000 });
    expect(podReceivingAging("2026-09-01", "2026-10-11", true)).toEqual({ days: 40, penalty: 1000 });
    expect(formatPodReceivingAging(podReceivingAging("2026-09-01", "2026-09-27", true))).toBe("11 days - ₹1,000");
  });

  it("charges a flat 1500 from day 26 while the POD is not received", () => {
    expect(podReceivingAging("2026-09-01", "2026-09-27")).toEqual({ days: 26, penalty: 1500 });
    expect(podReceivingAging("2026-09-01", "2026-10-11")).toEqual({ days: 40, penalty: 1500 });
  });

  it("does not charge when today is on or before the completed date", () => {
    expect(podReceivingAging("2026-09-16", "2026-09-16")).toEqual({ days: 0, penalty: 0 });
    expect(podReceivingAging("2026-09-17", "2026-09-16")?.penalty).toBe(0);
  });

  it("counts from -15 to 0 with no penalty, then from 1 with the charge", () => {
    expect(formatPodReceivingAging(null)).toBe("—");
    expect(formatPodReceivingAging(podReceivingAging("2026-09-01", "2026-09-01"))).toBe("-15 days");
    expect(formatPodReceivingAging(podReceivingAging("2026-09-01", "2026-09-15"))).toBe("-1 day");
    expect(formatPodReceivingAging(podReceivingAging("2026-09-01", "2026-09-16"))).toBe("0 days");
    expect(formatPodReceivingAging(podReceivingAging("2026-09-01", "2026-09-17"))).toBe("1 day - ₹50");
    expect(formatPodReceivingAging(podReceivingAging("2026-09-01", "2026-09-26"))).toBe("10 days - ₹500");
    expect(formatPodReceivingAging(podReceivingAging("2026-09-01", "2026-09-27"))).toBe("11 days - ₹1,500");
  });

  it("stops at the dispatch date, and uses today only when dispatch is empty", () => {
    expect(podAgingEndDate("2026-09-30", "2026-10-05")).toBe("2026-09-30");
    expect(podAgingEndDate("", "2026-10-05")).toBe("2026-10-05");
    expect(formatPodReceivingAging(podReceivingAging("2026-09-16", "2026-09-30"))).toBe("-1 day");
    expect(podReceivingAging("2026-09-16", "2026-09-30")?.penalty).toBe(0);
  });

  it("fills POD delay submission only after the free window", () => {
    expect(podDelaySubmissionAmount(0)).toBe("");
    expect(podDelaySubmissionAmount(podReceivingAging("2026-09-01", "2026-09-16")?.penalty)).toBe("");
    expect(podDelaySubmissionAmount(podReceivingAging("2026-09-01", "2026-09-17")?.penalty)).toBe("50");
    expect(podDelaySubmissionAmount(podReceivingAging("2026-09-01", "2026-09-19")?.penalty)).toBe("150");
    expect(podDelaySubmissionAmount(0, 1500)).toBe("1500");
    expect(podDelaySubmissionAmount(200, 1500)).toBe("1700");
    expect(podDelaySubmissionAmount(200, 1500)).toBe("1700");
  });
});
