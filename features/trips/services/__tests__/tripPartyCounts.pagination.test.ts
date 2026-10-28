/**
 * getTripPartyCountsForOrg used `.limit(2000)`, but prod PostgREST caps every
 * response at 1000 rows — past 1000 trips the client / supplier / driver
 * counts silently undercounted.
 */
import { createFakePostgrest, fakeUuid, shuffled, type FakeRow } from "@/lib/__tests__/fakePostgrest";

const mockServer = createFakePostgrest();
jest.mock("@/lib/supabase", () => ({
  supabase: () => mockServer.client,
  getAccessToken: jest.fn(),
}));
jest.mock("@/lib/platform/events/InProcessEventBus", () => ({
  getPlatformEventBus: () => ({ publish: jest.fn() }),
}));

import { getTripPartyCountsForOrg } from "@/features/trips/services/trips.service";

const ORG = "org-a";

function trip(n: number, over: Partial<FakeRow> = {}): FakeRow {
  return {
    id: fakeUuid(n, 5),
    organization_id: ORG,
    deleted_at: null,
    client_id: `client-${n % 7}`,
    supplier_id: `supplier-${n % 11}`,
    driver_id: n % 5 === 0 ? null : `driver-${n % 13}`,
    ...over,
  };
}

function expected(rows: FakeRow[]) {
  const out = { byClientId: {} as Record<string, number>, bySupplierId: {} as Record<string, number>, byDriverId: {} as Record<string, number> };
  for (const r of rows) {
    if (r.client_id) out.byClientId[r.client_id as string] = (out.byClientId[r.client_id as string] ?? 0) + 1;
    if (r.supplier_id) out.bySupplierId[r.supplier_id as string] = (out.bySupplierId[r.supplier_id as string] ?? 0) + 1;
    if (r.driver_id) out.byDriverId[r.driver_id as string] = (out.byDriverId[r.driver_id as string] ?? 0) + 1;
  }
  return out;
}

beforeEach(() => {
  mockServer.requests.length = 0;
  mockServer.state.failRequest = null;
});

describe("getTripPartyCountsForOrg pagination", () => {
  it("counts all 1500 live org trips; deleted trips and other orgs excluded", async () => {
    const live = Array.from({ length: 1500 }, (_, n) => trip(n));
    const deleted = Array.from({ length: 30 }, (_, n) => trip(10_000 + n, { deleted_at: "2026-10-01" }));
    const foreign = Array.from({ length: 400 }, (_, n) => trip(20_000 + n, { organization_id: "org-b" }));
    mockServer.tables.trips = shuffled([...live, ...deleted, ...foreign]);

    const { error, counts } = await getTripPartyCountsForOrg(ORG);

    expect(error).toBeNull();
    expect(counts).toEqual(expected(live));
    expect(Object.values(counts.byClientId).reduce((a, b) => a + b, 0)).toBe(1500);
    for (const req of mockServer.requests) {
      expect(req.filters).toContain(`organization_id=eq.${ORG}`);
      expect(req.filters).toContain("deleted_at=is.null");
    }
  });

  it("surfaces a page error instead of partial counts", async () => {
    mockServer.tables.trips = Array.from({ length: 1200 }, (_, n) => trip(n));
    mockServer.state.failRequest = (_req, n) => n === 2;
    const { error, counts } = await getTripPartyCountsForOrg(ORG);
    expect(error?.message).toBe("fake page failure");
    expect(counts).toEqual({ byClientId: {}, bySupplierId: {}, byDriverId: {} });
  });
});
