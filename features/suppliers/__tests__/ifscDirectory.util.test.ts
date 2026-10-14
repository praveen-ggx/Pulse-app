import { isWellFormedIfsc, lookupIfsc, resolveBankBranch } from "@/features/suppliers/utils/ifscDirectory.util";

describe("ifscDirectory.util", () => {
  const fetchMock = jest.fn();
  beforeAll(() => {
    (globalThis as { fetch: unknown }).fetch = fetchMock;
  });
  beforeEach(() => fetchMock.mockReset());

  it("recognises well-formed IFSC codes", () => {
    expect(isWellFormedIfsc("hdfc0001234")).toBe(true);
    expect(isWellFormedIfsc("HDFC1001234")).toBe(false);
    expect(isWellFormedIfsc("")).toBe(false);
  });

  it("looks up bank and branch once per IFSC", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ BANK: "HDFC Bank", BRANCH: "Salt Lake" }) });
    await expect(lookupIfsc("HDFC0009999")).resolves.toEqual({ bank: "HDFC Bank", branch: "Salt Lake" });
    await lookupIfsc("hdfc0009999");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prefers the stored branch and survives lookup failures", async () => {
    await expect(resolveBankBranch("  MG Road ", "HDFC0001111")).resolves.toBe("MG Road");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(resolveBankBranch(null, "SBIN0002222")).resolves.toBe("");
    await expect(resolveBankBranch(null, "bad")).resolves.toBe("");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ BANK: "SBI", BRANCH: "Erasama" }) });
    await expect(resolveBankBranch(null, "SBIN0002222")).resolves.toBe("Erasama");
  });
});
