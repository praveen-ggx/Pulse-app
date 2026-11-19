const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: mockRpc }),
  getAccessToken: jest.fn(),
}));

import { countMyOrgMarketBids, listMyOrgMarketBids, useMarketBidsPageRpc } from "../findLoadsForOrg.service";

beforeEach(() => {
  mockRpc.mockReset();
  useMarketBidsPageRpc(true);
});

afterEach(() => {
  useMarketBidsPageRpc(false);
});

function row(id: string, createdAt: string) {
  return { id, indent_id: `indent-${id}`, created_at: createdAt, status: "pending", amount: 1 };
}

describe("listMyOrgMarketBids", () => {
  it("uses the deployed list while the page function is off", async () => {
    useMarketBidsPageRpc(false);
    mockRpc.mockResolvedValue({ data: [row("only", "2026-11-16T00:00:00Z")], error: null });
    const { error, bids } = await listMyOrgMarketBids("org-1");
    expect(error).toBeNull();
    expect(bids.map((bid) => bid.id)).toEqual(["only"]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("list_my_org_market_bids", {
      p_org_id: "org-1",
      p_limit: 100,
    });
  });

  it("keeps reading after a full page", async () => {
    const first = Array.from({ length: 100 }, (_, index) => row(`a${index}`, `2026-11-16T00:00:${String(index).padStart(2, "0")}Z`));
    const last = first[first.length - 1];
    mockRpc.mockImplementation((name: string, args: { p_before_id?: string | null }) => {
      if (name !== "list_my_org_market_bids_page") return Promise.resolve({ data: null, error: { message: "no" } });
      if (!args.p_before_id) return Promise.resolve({ data: first, error: null });
      return Promise.resolve({
        data: [row("awarded", "2026-11-01T00:00:00Z")],
        error: null,
      });
    });

    const { error, bids } = await listMyOrgMarketBids("org-1");
    expect(error).toBeNull();
    expect(bids).toHaveLength(101);
    expect(bids[100]?.id).toBe("awarded");
    expect(mockRpc).toHaveBeenLastCalledWith("list_my_org_market_bids_page", {
      p_org_id: "org-1",
      p_limit: 100,
      p_before_created_at: last.created_at,
      p_before_id: last.id,
    });
  });

  it("does not treat a missing page function as an empty book", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "list_my_org_market_bids_page") {
        return Promise.resolve({
          data: null,
          error: { code: "PGRST202", message: "Could not find the function list_my_org_market_bids_page" },
        });
      }
      return Promise.resolve({ data: [row("only", "2026-11-16T00:00:00Z")], error: null });
    });
    const { error, bids } = await listMyOrgMarketBids("org-1");
    expect(error).toBeNull();
    expect(bids.map((bid) => bid.id)).toEqual(["only"]);
  });
});

describe("countMyOrgMarketBids", () => {
  it("reads the organization total", async () => {
    mockRpc.mockResolvedValue({
      data: { total: 162, pending: 11, accepted: 1, rejected: 150, withdrawn: 0, superseded: 0 },
      error: null,
    });
    const { error, counts } = await countMyOrgMarketBids("org-1");
    expect(error).toBeNull();
    expect(counts).toEqual({ total: 162, pending: 11, accepted: 1, rejected: 150, withdrawn: 0, superseded: 0 });
  });

  it("returns no totals when the count function is not deployed", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function count_my_org_market_bids" },
    });
    const { error, counts } = await countMyOrgMarketBids("org-1");
    expect(error).toBeNull();
    expect(counts).toBeNull();
  });
});
