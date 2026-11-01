import { tagTripWithDcoClient } from "../driverTripClient.service";

describe("tagTripWithDcoClient", () => {
  it("does not write organisation trip fields or notes", async () => {
    const { error } = await tagTripWithDcoClient("trip-1", { id: "c-1", name: "Ajio" }, { billed: 18500 });
    expect(error?.message).toMatch(/DCO Self book/);
  });

  it("denies marketplace before any write", async () => {
    await expect(
      tagTripWithDcoClient("mkt-1", { id: "c-1", name: "X" }, { source: "market_bid" }),
    ).resolves.toMatchObject({
      error: expect.objectContaining({ message: expect.stringMatching(/Marketplace/) }),
    });
  });
});
