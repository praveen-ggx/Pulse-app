import {
  fetchLightTripDetailFinance,
  fetchTripDetailBundle,
} from "@/lib/queries/useTripDetailBundleQuery";

jest.mock("@/lib/queryClient", () => ({
  shouldRetryQuery: () => false,
}));

const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockStorageList = jest.fn();
const mockTxLimit = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: mockFrom,
    rpc: mockRpc,
    storage: {
      from: () => ({ list: mockStorageList }),
    },
  }),
}));

type QueryResult = { data: unknown; error: unknown };

function thenable(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = jest.fn(self);
  builder.eq = jest.fn(self);
  builder.in = jest.fn(self);
  builder.order = jest.fn(self);
  builder.limit = jest.fn(self);
  builder.abortSignal = jest.fn(self);
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const deliveredTrip = {
  id: "trip-delivered",
  organization_id: "org-1",
  status: "delivered",
  completed_at: "2026-09-19T00:00:00Z",
  driver_id: "driver-1",
  driver_display_name: "Ravi",
};

const txs = [{ id: "tx-1", trip_id: "trip-delivered", amount_in: 100, amount_out: 0 }];

beforeEach(() => {
  jest.clearAllMocks();
  mockTxLimit.mockImplementation(() => Promise.resolve({ data: txs, error: null }));
  mockRpc.mockImplementation((name: string) => {
    if (name === "get_trip_driver_phones") {
      return Promise.resolve({
        data: [{ trip_id: "trip-delivered", phone: "9876543210" }],
        error: null,
      });
    }
    return thenable({ data: null, error: null });
  });
  mockFrom.mockImplementation((table: string) => {
    if (table === "trips") {
      return thenable({ data: deliveredTrip, error: null });
    }
    if (table === "trip_documents") {
      throw new Error("trip_documents must not load on delivered first paint");
    }
    if (table === "transactions") {
      const builder = thenable({ data: txs, error: null });
      builder.limit = mockTxLimit;
      return builder;
    }
    if (table === "trip_finance_adjustments") {
      return thenable({ data: [], error: null });
    }
    throw new Error(`unexpected table: ${table}`);
  });
});

describe("fetchTripDetailBundle — delivered light path", () => {
  it("loads the trip row and driver phone — no documents, ledger, or full bundle RPC", async () => {
    const bundle = await fetchTripDetailBundle(
      "trip-delivered",
      "org-1",
      undefined,
      true,
    );

    expect(mockRpc).toHaveBeenCalledWith("get_trip_driver_phones", {
      p_trip_ids: ["trip-delivered"],
    });
    expect(mockRpc).not.toHaveBeenCalledWith(
      "get_trip_detail_bundle",
      expect.anything(),
    );
    expect(mockStorageList).not.toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith("trips");
    expect(mockFrom).not.toHaveBeenCalledWith("trip_documents");
    expect(mockFrom).not.toHaveBeenCalledWith("transactions");
    expect(bundle?.trip.id).toBe("trip-delivered");
    expect(bundle?.documents).toEqual([]);
    expect(bundle?.transactions).toEqual([]);
    expect(bundle?.driver).toMatchObject({
      id: "driver-1",
      name: "Ravi",
      phone: "9876543210",
    });
  });

  it("loads transactions and adjustments only via fetchLightTripDetailFinance", async () => {
    const slice = await fetchLightTripDetailFinance("trip-delivered");
    expect(slice.transactions).toEqual(txs);
    expect(mockTxLimit).toHaveBeenCalledWith(50);
    expect(mockFrom).toHaveBeenCalledWith("transactions");
    expect(mockFrom).toHaveBeenCalledWith("trip_finance_adjustments");
  });

  it("keeps get_trip_detail_bundle for active trips", async () => {
    mockRpc.mockReturnValue(
      thenable({
        data: {
          trip: { id: "trip-active", status: "in_progress" },
          documents: [],
          transactions: [],
          assignment_audit: [],
          adjustments: [],
          driver: null,
          vehicle: null,
          client_detail: null,
          supplier_detail: null,
          otp: null,
          latest_driver_location: null,
        },
        error: null,
      }),
    );

    const bundle = await fetchTripDetailBundle(
      "trip-active",
      "org-1",
      undefined,
      false,
    );

    expect(mockRpc).toHaveBeenCalledWith("get_trip_detail_bundle", {
      p_trip_id: "trip-active",
      p_viewer_org_id: "org-1",
    });
    expect(bundle?.trip.id).toBe("trip-active");
  });

  it("on bundle RPC failure still does not scan trip_documents or storage", async () => {
    mockRpc.mockReturnValue(thenable({ data: null, error: { message: "503" } }));

    const bundle = await fetchTripDetailBundle(
      "trip-delivered",
      "org-1",
      undefined,
      false,
    );

    expect(mockRpc).toHaveBeenCalled();
    expect(bundle?.trip.id).toBe("trip-delivered");
    expect(bundle?.documents).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalledWith("trip_documents");
    expect(mockStorageList).not.toHaveBeenCalled();
  });
});
