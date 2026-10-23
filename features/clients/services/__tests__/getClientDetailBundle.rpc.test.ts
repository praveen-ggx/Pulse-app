import { getClientDetailBundle } from "@/features/clients/services/clients.service";

const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock("@/lib/platform", () => ({
  CustomerService: {},
}));

jest.mock("@/lib/enrichConnectionPartnerAvatars", () => ({
  enrichConnectionPartnerAvatars: async (rows: unknown) => rows,
}));

describe("getClientDetailBundle RPC choice", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("calls only the lightweight profile RPC, never get_client_page_bootstrap", async () => {
    mockRpc.mockResolvedValue({
      data: {
        client: {
          id: "c1",
          organization_id: "org-1",
          name: "Aero",
        },
        ratings: [],
        warehouses: [],
        contracts: [],
      },
      error: null,
    });

    const result = await getClientDetailBundle("org-1", "c1");

    expect(result.error).toBeNull();
    expect(result.client?.id).toBe("c1");
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("get_client_detail_bundle", {
      p_org_id: "org-1",
      p_client_id: "c1",
    });
    expect(mockRpc.mock.calls.some((call) => call[0] === "get_client_page_bootstrap")).toBe(
      false,
    );
  });

  it("falls back to get_client_details without retrying the heavy page RPC", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_client_detail_bundle") {
        return Promise.resolve({ data: null, error: { message: "missing" } });
      }
      if (name === "get_client_details") {
        return Promise.resolve({
          data: { id: "c1", organization_id: "org-1", name: "Aero" },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
    });

    const result = await getClientDetailBundle("org-1", "c1");

    expect(result.error).toBeNull();
    expect(result.client?.id).toBe("c1");
    expect(mockRpc.mock.calls.map((call) => call[0])).toEqual([
      "get_client_detail_bundle",
      "get_client_details",
    ]);
  });
});
