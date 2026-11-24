const mockRpc = jest.fn();
let mockHost = "db-a.supabase.co";

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
  getAccessToken: jest.fn(),
  getSupabaseBaseUrl: () => `https://${mockHost}`,
}));

import {
  getComplianceOpsPipelinePage,
  resetCompliancePipelineRpcProbe,
} from "@/features/trips/services/trips.service";
import { queryKeys } from "@/lib/queryKeys";

const missingFunction = {
  code: "PGRST202",
  message: "Could not find the function public.list_compliance_ops_pipeline_keyset in the schema cache",
  status: 404,
};

beforeEach(() => {
  mockRpc.mockReset();
  mockHost = "db-a.supabase.co";
  resetCompliancePipelineRpcProbe();
});

describe("compliance pipeline RPC probe", () => {
  it("returns a page when the function is installed", async () => {
    mockRpc.mockResolvedValue({
      data: { rows: [{ id: "trip-1", created_at: "2026-01-01T00:00:00.000Z", status: "loading" }], has_more: false, total: 1 },
      error: null,
    });

    const page = await getComplianceOpsPipelinePage("org-1", { includeAssigned: true });

    expect(page.missing).toBe(false);
    expect(page.error).toBeNull();
    expect(page.trips.map((trip) => trip.id)).toEqual(["trip-1"]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][0]).toBe("list_compliance_ops_pipeline_keyset");
    expect(mockRpc.mock.calls[0][1].p_include_assigned).toBe(true);
  });

  it("remembers a missing function for this database and does not call it again", async () => {
    mockRpc.mockResolvedValue({ data: null, error: missingFunction });

    const first = await getComplianceOpsPipelinePage("org-1");
    const second = await getComplianceOpsPipelinePage("org-2");

    expect(first.missing).toBe(true);
    expect(first.error).toBeNull();
    expect(second.missing).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("tries the function again for a different database", async () => {
    mockRpc.mockResolvedValue({ data: null, error: missingFunction });
    await getComplianceOpsPipelinePage("org-1");
    mockHost = "db-b.supabase.co";
    mockRpc.mockResolvedValue({
      data: { rows: [], has_more: false, total: 0 },
      error: null,
    });

    const page = await getComplianceOpsPipelinePage("org-1");

    expect(page.missing).toBe(false);
    expect(page.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("does not treat an authentication failure as a missing function", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST301", message: "JWT expired", status: 401 },
    });

    const first = await getComplianceOpsPipelinePage("org-1");
    const second = await getComplianceOpsPipelinePage("org-1");

    expect(first.missing).toBe(false);
    expect(first.error?.message).toMatch(/JWT expired/);
    expect(second.error?.message).toMatch(/JWT expired/);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("does not remember a thrown network failure", async () => {
    mockRpc.mockRejectedValue(new Error("Network request failed"));

    await expect(getComplianceOpsPipelinePage("org-1")).rejects.toThrow(/Network request failed/);
    await expect(getComplianceOpsPipelinePage("org-1")).rejects.toThrow(/Network request failed/);

    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("does not treat a timeout as a missing function", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
    });

    const page = await getComplianceOpsPipelinePage("org-1");
    await getComplianceOpsPipelinePage("org-1");

    expect(page.missing).toBe(false);
    expect(page.error?.message).toMatch(/timeout/);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("keeps compliance catalogs for two organizations on different cache keys", () => {
    expect(queryKeys.trips.compliance("org-a")).not.toEqual(queryKeys.trips.compliance("org-b"));
  });
});
