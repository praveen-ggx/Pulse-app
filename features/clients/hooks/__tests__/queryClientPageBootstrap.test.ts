import { unwrapPartyBootstrapBundle } from "@/features/clients/utils/unwrapPartyBootstrap.util";

describe("unwrapPartyBootstrapBundle", () => {
  it("keeps the scoped bundle when the RPC is missing", () => {
    const bundle = { client: { id: "c1" } };
    expect(
      unwrapPartyBootstrapBundle({
        error: null,
        bundle,
      }),
    ).toBe(bundle);
  });

  it("throws on a real fetch error", () => {
    expect(() =>
      unwrapPartyBootstrapBundle({
        error: new Error("timeout"),
        bundle: null,
      }),
    ).toThrow("timeout");
  });
});
