import {
  hasFullPulseBoostDistribution,
  PULSE_BOOST_DISTRIBUTION_CHANNELS,
} from "@/features/reach/utils/reachDistribution.util";

describe("hasFullPulseBoostDistribution", () => {
  it("requires both fleet (Network / Pulse) and driver (Pilot / DCO)", () => {
    expect(hasFullPulseBoostDistribution(["fleet"])).toBe(false);
    expect(hasFullPulseBoostDistribution(["driver"])).toBe(false);
    expect(hasFullPulseBoostDistribution(PULSE_BOOST_DISTRIBUTION_CHANNELS)).toBe(
      true,
    );
  });
});
