import { queryClientPageBootstrap } from "@/features/clients/hooks/useClientPageBootstrapQuery";
import { fetchClientPageBootstrap } from "@/features/clients/services/clientPageBootstrap.service";

jest.mock("@/features/clients/services/clientPageBootstrap.service", () => ({
  fetchClientPageBootstrap: jest.fn(),
}));

const fetchMock = fetchClientPageBootstrap as jest.MockedFunction<
  typeof fetchClientPageBootstrap
>;

describe("queryClientPageBootstrap", () => {
  it("keeps the scoped bundle when the RPC is missing", async () => {
    const bundle = { client: { id: "c1" } } as Awaited<
      ReturnType<typeof queryClientPageBootstrap>
    >;
    fetchMock.mockResolvedValue({
      error: null,
      missingRpc: true,
      bundle,
    });
    await expect(queryClientPageBootstrap("org", "c1")).resolves.toBe(bundle);
  });

  it("throws on a real fetch error", async () => {
    fetchMock.mockResolvedValue({
      error: new Error("timeout"),
      missingRpc: false,
      bundle: null,
    });
    await expect(queryClientPageBootstrap("org", "c1")).rejects.toThrow("timeout");
  });
});
