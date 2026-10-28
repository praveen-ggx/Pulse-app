import { mapWithConcurrency } from "../mapWithConcurrency.util";

describe("mapWithConcurrency", () => {
  it("never runs more than the limit at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = await mapWithConcurrency(items, 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 8));
      inFlight -= 1;
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(result).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
  });

  it("returns an empty array for no items", async () => {
    const mapper = jest.fn();
    await expect(mapWithConcurrency([], 4, mapper)).resolves.toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });
});
