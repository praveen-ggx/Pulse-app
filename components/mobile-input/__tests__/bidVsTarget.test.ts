import { formatINR } from "@/lib/format";
import {
  formatTargetBand,
  resolveBidVsTarget,
  resolveBidVsTargetBand,
  targetBand,
} from "@/components/mobile-input/bidVsTarget";

describe("target band", () => {
  it("keeps a single shipper target as a point", () => {
    const band = targetBand(4233, 4233);
    expect(band).toEqual({ min: 4233, max: 4233 });
    expect(formatTargetBand(band!)).toBe(formatINR(4233));
    expect(resolveBidVsTargetBand(4233, band)).toEqual(resolveBidVsTarget(4233, 4233));
  });

  it("places a typed rate under, inside, or over a pool range", () => {
    const band = targetBand(4000, 5000);
    expect(formatTargetBand(band!)).toBe(`${formatINR(4000)} – ${formatINR(5000)}`);
    expect(resolveBidVsTargetBand(3500, band)?.caption).toBe(`${formatINR(500)} under the range`);
    expect(resolveBidVsTargetBand(4000, band)?.caption).toBe("Low end of the range");
    expect(resolveBidVsTargetBand(4500, band)?.caption).toBe("Inside the range");
    expect(resolveBidVsTargetBand(5000, band)?.caption).toBe("High end of the range");
    expect(resolveBidVsTargetBand(5600, band)?.caption).toBe(`${formatINR(600)} over the range`);
  });
});
