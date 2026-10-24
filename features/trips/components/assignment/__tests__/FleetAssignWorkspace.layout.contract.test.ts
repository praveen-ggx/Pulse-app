import { readFileSync } from "fs";
import { join } from "path";

describe("Fleet assign stays a full-page workspace", () => {
  it("does not pass the Change driver popup layout", () => {
    const src = readFileSync(
      join(__dirname, "../FleetAssignWorkspace.tsx"),
      "utf8",
    );
    expect(src).toContain("TripAssignmentWorkspace");
    expect(src).not.toMatch(/layout\s*=\s*["']popup["']/);
    expect(src).toContain("wizardStep");
    expect(src).toContain("panelScope");
    expect(src).toContain("Save assignment");
    expect(src).toContain("Continue");
  });

  it("keeps the assignment route on TripAssignmentFlowScreen", () => {
    const src = readFileSync(
      join(__dirname, "../../../../../app/trip/[id]/assignment.tsx"),
      "utf8",
    );
    expect(src).toContain("TripAssignmentFlowScreen");
  });
});
