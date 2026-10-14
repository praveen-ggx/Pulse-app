import { refundTestMarketplaceFeeAndRevokeIndent } from "../marketBids.service";

const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: mockRpc }),
}));

beforeEach(() => {
  mockRpc.mockReset();
});

describe("refundTestMarketplaceFeeAndRevokeIndent", () => {
  it("calls only the test-fee revoke RPC", async () => {
    mockRpc.mockResolvedValue({
      data: { award_revoked_at: "2026-10-05T00:00:00.000Z", ok: true },
      error: null,
    });
    const res = await refundTestMarketplaceFeeAndRevokeIndent(
      "indent-1",
      "Shipper reversed the test marketplace fee and revoked the award.",
    );
    expect(res.error).toBeNull();
    expect(res.awardRevokedAt).toBe("2026-10-05T00:00:00.000Z");
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "refund_test_marketplace_fee_and_revoke_indent",
      {
        p_indent_id: "indent-1",
        p_reason: "Shipper reversed the test marketplace fee and revoked the award.",
      },
    );
    expect(mockRpc).not.toHaveBeenCalledWith("revoke_indent_award", expect.anything());
  });

  it("returns the provider refusal and does not invent a revoked time", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message:
          "unsupported_provider: only a test_online marketplace fee can be reversed this way (provider=cash)",
      },
    });
    const res = await refundTestMarketplaceFeeAndRevokeIndent("indent-1", "reason");
    expect(res.awardRevokedAt).toBeNull();
    expect(res.error?.message).toMatch(/unsupported_provider/);
  });
});
