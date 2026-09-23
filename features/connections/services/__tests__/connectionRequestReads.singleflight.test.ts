import { resetSingleflightForTests } from "@/lib/cache/singleflight";
import {
  getConnectionRequestsReceived,
  getConnectionRequestsSent,
} from "@/features/connections/services/connectionRequests.service";

const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: mockRpc }),
}));

describe("connection request RPC single-flight", () => {
  beforeEach(() => {
    resetSingleflightForTests();
    mockRpc.mockReset();
    mockRpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ data: [], error: null }), 15);
        }),
    );
  });

  it("collapses duplicate concurrent received/sent reads per org", async () => {
    const orgId = "org-1";
    await Promise.all([
      getConnectionRequestsReceived(orgId),
      getConnectionRequestsReceived(orgId),
      getConnectionRequestsSent(orgId),
      getConnectionRequestsSent(orgId),
      getConnectionRequestsReceived(orgId),
      getConnectionRequestsSent(orgId),
    ]);

    const received = mockRpc.mock.calls.filter(
      ([name]) => name === "get_connection_requests_received_with_names",
    );
    const sent = mockRpc.mock.calls.filter(
      ([name]) => name === "get_connection_requests_sent_with_names",
    );
    expect(received).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("surfaces RPC permission errors without retrying inside the service", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "permission denied for function get_connection_requests_received_with_names" },
    });
    const res = await getConnectionRequestsReceived("org-1");
    expect(res.error?.message).toMatch(/permission denied/);
    expect(res.requests).toEqual([]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
