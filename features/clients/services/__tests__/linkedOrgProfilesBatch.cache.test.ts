/**
 * get_connection_partner_display_batch: per-id results are reused for 60s per
 * signed-in user, only uncached ids are requested, failed chunks are retried,
 * and a different user never sees another user's cached rows.
 */
const mockRpc = jest.fn();
let mockUserId = "user-1";

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: "t", user: { id: mockUserId } } } }),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

import {
  clearLinkedOrgProfilesBatchCache,
  getLinkedOrgProfilesBatch,
} from "../clients.service";

function reply(ids: string[]) {
  return {
    data: Object.fromEntries(ids.map((id) => [id, { organizationName: `Org ${id}` }])),
    error: null,
  };
}

beforeEach(() => {
  jest.useRealTimers();
  clearLinkedOrgProfilesBatchCache();
  mockUserId = "user-1";
  mockRpc.mockReset();
  mockRpc.mockImplementation((_fn: string, args: { p_linked_organization_ids: string[] }) =>
    Promise.resolve(reply(args.p_linked_organization_ids)),
  );
});

const requested = () =>
  mockRpc.mock.calls.flatMap((c) => (c[1] as { p_linked_organization_ids: string[] }).p_linked_organization_ids);

describe("getLinkedOrgProfilesBatch cache", () => {
  it("serves repeat lookups from cache and fetches only new ids", async () => {
    const first = await getLinkedOrgProfilesBatch(["a", "b"]);
    expect(Object.keys(first).sort()).toEqual(["a", "b"]);
    const second = await getLinkedOrgProfilesBatch(["b", "c"]);
    expect(Object.keys(second).sort()).toEqual(["b", "c"]);
    expect(requested()).toEqual(["a", "b", "c"]);
  });

  it("refetches after the 60s window", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    await getLinkedOrgProfilesBatch(["a"]);
    now.mockReturnValue(1_000_000 + 61_000);
    await getLinkedOrgProfilesBatch(["a"]);
    expect(requested()).toEqual(["a", "a"]);
    now.mockRestore();
  });

  it("does not share cached rows across users", async () => {
    await getLinkedOrgProfilesBatch(["a"]);
    mockUserId = "user-2";
    await getLinkedOrgProfilesBatch(["a"]);
    expect(requested()).toEqual(["a", "a"]);
  });

  it("retries a failed chunk on the next call", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    expect(await getLinkedOrgProfilesBatch(["a"])).toEqual({});
    const again = await getLinkedOrgProfilesBatch(["a"]);
    expect(Object.keys(again)).toEqual(["a"]);
    expect(requested()).toEqual(["a", "a"]);
  });

  it("splits large sets into 24-id chunks and runs them concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockRpc.mockImplementation((_fn: string, args: { p_linked_organization_ids: string[] }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((r) => setTimeout(r, 2)).then(() => {
        inFlight -= 1;
        return reply(args.p_linked_organization_ids);
      });
    });
    const ids = Array.from({ length: 100 }, (_, i) => `org-${i}`);
    const out = await getLinkedOrgProfilesBatch(ids);
    expect(Object.keys(out)).toHaveLength(100);
    expect(mockRpc).toHaveBeenCalledTimes(5);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });
});
