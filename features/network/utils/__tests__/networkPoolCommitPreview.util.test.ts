import {
  describePoolCommitPending,
  formatPoolCommitUntil,
  poolCommitPreviewFacts,
  forgetPoolCommitPreview,
  readPoolCommitPreview,
  rememberPoolCommitPreview,
} from "@/features/network/utils/networkPoolCommitPreview.util";

describe("networkPoolCommitPreview", () => {
  it("formats the valid-until day for the card", () => {
    expect(formatPoolCommitUntil("2026-11-01")).toBe("1 Nov 2026");
  });

  it("shows committed vehicles, remaining awards and until date", () => {
    expect(
      poolCommitPreviewFacts({
        vehicleLimit: 2,
        awardedCount: 0,
        validUntilDate: "2026-11-01",
      }),
    ).toEqual({
      committed: "2 vehicles",
      remaining: "2 left",
      until: "1 Nov 2026",
    });
  });

  it("describes how many committed awards are still pending", () => {
    expect(describePoolCommitPending(null, 1)).toBe("1 pending");
    expect(
      describePoolCommitPending(
        { vehicleLimit: 2, awardedCount: 0, validUntilDate: "2026-11-01" },
        1,
      ),
    ).toBe("2 of 2 pending");
    expect(
      describePoolCommitPending(
        { vehicleLimit: 3, awardedCount: 1, validUntilDate: "2026-11-01" },
        2,
      ),
    ).toBe("2 of 3 pending");
  });

  it("remembers a preview for the pool card", () => {
    rememberPoolCommitPreview("lane-a", {
      vehicleLimit: 3,
      awardedCount: 1,
      validUntilDate: "2026-12-15",
    });
    expect(readPoolCommitPreview("lane-a")).toEqual({
      vehicleLimit: 3,
      awardedCount: 1,
      validUntilDate: "2026-12-15",
    });
  });

  it("returns the same object on repeated reads so cards do not loop", () => {
    rememberPoolCommitPreview("lane-stable", {
      vehicleLimit: 2,
      awardedCount: 0,
      validUntilDate: "2026-12-15",
    });
    expect(readPoolCommitPreview("lane-stable")).toBe(
      readPoolCommitPreview("lane-stable"),
    );
  });

  it("forgets a cancelled pool commit preview", () => {
    rememberPoolCommitPreview("lane-b", {
      vehicleLimit: 2,
      awardedCount: 0,
      validUntilDate: "2026-12-15",
    });
    forgetPoolCommitPreview("lane-b");
    expect(readPoolCommitPreview("lane-b")).toBeNull();
  });
});
