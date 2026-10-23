import { querySupplierPageBootstrap } from "@/features/suppliers/hooks/useSupplierPageBootstrapQuery";
import { fetchSupplierPageBootstrap } from "@/features/suppliers/services/supplierPageBootstrap.service";

jest.mock("@/features/suppliers/services/supplierPageBootstrap.service", () => ({
  fetchSupplierPageBootstrap: jest.fn(),
}));

const fetchMock = fetchSupplierPageBootstrap as jest.MockedFunction<
  typeof fetchSupplierPageBootstrap
>;

describe("querySupplierPageBootstrap", () => {
  it("keeps the scoped bundle when the RPC is missing", async () => {
    const bundle = { supplier: { id: "s1" } } as Awaited<
      ReturnType<typeof querySupplierPageBootstrap>
    >;
    fetchMock.mockResolvedValue({
      error: null,
      missingRpc: true,
      bundle,
    });
    await expect(querySupplierPageBootstrap("org", "s1")).resolves.toBe(bundle);
  });

  it("throws on a real fetch error", async () => {
    fetchMock.mockResolvedValue({
      error: new Error("timeout"),
      missingRpc: false,
      bundle: null,
    });
    await expect(querySupplierPageBootstrap("org", "s1")).rejects.toThrow("timeout");
  });
});
