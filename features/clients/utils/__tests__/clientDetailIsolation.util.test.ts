import {
  emptyClientPagePartyState,
  shouldAcceptClientPageWrite,
} from "../clientDetailIsolation.util";

describe("client detail isolation", () => {
  it("rejects writes for a different client or organization", () => {
    expect(
      shouldAcceptClientPageWrite(
        { orgId: "org-1", clientId: "client-b" },
        { orgId: "org-1", clientId: "client-a" },
      ),
    ).toBe(false);
    expect(
      shouldAcceptClientPageWrite(
        { orgId: "org-2", clientId: "client-a" },
        { orgId: "org-1", clientId: "client-a" },
      ),
    ).toBe(false);
  });

  it("accepts only the active client and organization", () => {
    expect(
      shouldAcceptClientPageWrite(
        { orgId: "org-1", clientId: "client-b" },
        { orgId: "org-1", clientId: "client-b" },
      ),
    ).toBe(true);
  });

  it("clears party collections so Client A cannot render under Client B", () => {
    const empty = emptyClientPagePartyState();
    expect(empty.trips).toEqual([]);
    expect(empty.transactions).toEqual([]);
    expect(empty.suppliers).toEqual([]);
    expect(empty.drivers).toEqual([]);
  });
});
