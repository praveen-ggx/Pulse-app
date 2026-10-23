import { unwrapPartyBootstrapBundle } from "@/features/clients/utils/unwrapPartyBootstrap.util";

describe("supplier page bootstrap unwrap", () => {
  it("keeps the scoped bundle when the RPC is missing", () => {
    const bundle = { supplier: { id: "s1" } };
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
