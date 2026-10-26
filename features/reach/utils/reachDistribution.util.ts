/** Where a Reach campaign is delivered. */
export type ReachDistributionChannel = "fleet" | "driver";

/** Every Pulse Boost plan places on Network + Pulse + Pilot/DCO. */
export const PULSE_BOOST_DISTRIBUTION_CHANNELS: ReachDistributionChannel[] = [
  "fleet",
  "driver",
];

export function hasFullPulseBoostDistribution(
  channels: readonly string[] | null | undefined,
): boolean {
  const set = new Set((channels ?? []).map((c) => c.trim()));
  return set.has("fleet") && set.has("driver");
}
