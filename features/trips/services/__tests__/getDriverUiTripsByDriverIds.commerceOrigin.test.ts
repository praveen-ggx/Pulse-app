import { getDriverTripExperience } from "@/features/trips/domain/driverTripExperience";
import { getDriverUiTripsByDriverIds } from "@/features/trips/services/trips.service";
import type { DriverTripRow } from "@/types/trip-views";

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ from: mockFrom, rpc: mockRpc }),
  getAccessToken: jest.fn(),
}));

jest.mock("@/lib/platform/events/InProcessEventBus", () => ({
  getPlatformEventBus: () => ({ publish: jest.fn() }),
}));

function row(partial: Partial<DriverTripRow> & Pick<DriverTripRow, "id">): DriverTripRow {
  return {
    driver_id: "driver-1",
    driver_display_trip_id: partial.id,
    status: "assigned",
    pickup_location: "Mumbai",
    pickup_address: "Mumbai",
    pickup_scheduled_at: null,
    dropoff_location: "Pune",
    dropoff_address: "Pune",
    dropoff_scheduled_at: null,
    instructions: null,
    vehicle_id: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    organization_id: "org-1",
    ...partial,
  };
}

function builder(result: { data: unknown; error: unknown }) {
  const query: { selects: string[]; ranges: unknown[][]; orders: unknown[][]; ors: string[] } = {
    selects: [],
    ranges: [],
    orders: [],
    ors: [],
  };
  const chain: Record<string, unknown> = {
    select: jest.fn((cols: string) => {
      query.selects.push(cols);
      return chain;
    }),
    in: jest.fn(() => chain),
    order: jest.fn((...args: unknown[]) => {
      query.orders.push(args);
      return chain;
    }),
    or: jest.fn((filter: string) => {
      query.ors.push(filter);
      return chain;
    }),
    range: jest.fn((...args: unknown[]) => {
      query.ranges.push(args);
      return chain;
    }),
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
    query,
  };
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getDriverUiTripsByDriverIds commerce origin", () => {
  it("reads one trips_driver_view page and does not query indents or stop orders", async () => {
    const viewRows = [
      row({
        id: "trip-ftl",
        indent_id: "indent-ftl",
        source_indent_id: null,
        execution_plan_id: null,
        is_commerce: false,
      }),
      row({
        id: "trip-commerce",
        indent_id: "indent-commerce",
        source_indent_id: null,
        execution_plan_id: "plan-1",
        is_commerce: true,
      }),
      row({
        id: "trip-mover",
        indent_id: null,
        source_indent_id: "indent-mover",
        execution_plan_id: "plan-mover",
        is_commerce: true,
        source: "mover_asset",
      }),
    ];
    const tables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      tables.push(table);
      if (table === "drivers") {
        return builder({ data: [{ organization_id: "org-1" }], error: null });
      }
      if (table === "trips_driver_view") {
        return builder({ data: viewRows, error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = await getDriverUiTripsByDriverIds(["driver-1"], {
      limit: 50,
      offset: 0,
    });

    expect(res.error).toBeNull();
    expect(tables).toEqual(["drivers", "trips_driver_view"]);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(tables).not.toContain("indents");

    const viewQuery = mockFrom.mock.results[1].value.query as {
      selects: string[];
      ranges: unknown[][];
      orders: unknown[][];
    };
    expect(viewQuery.selects).toEqual(["*"]);
    expect(viewQuery.orders).toEqual([["created_at", { ascending: false }]]);
    expect(viewQuery.ranges).toEqual([[0, 50]]);

    const byId = Object.fromEntries(res.trips.map((trip) => [trip.id, trip]));
    expect(getDriverTripExperience(byId["trip-ftl"])).toBe("STANDARD_FTL");
    expect(byId["trip-commerce"].execution_plan_id).toBe("plan-1");
    expect(byId["trip-commerce"].is_commerce).toBe(true);
    expect(getDriverTripExperience(byId["trip-commerce"])).toBe("COMMERCE_MULTI_ORDER");
    expect(byId["trip-mover"].indent_id).toBeNull();
    expect(byId["trip-mover"].source_indent_id).toBe("indent-mover");
    expect(getDriverTripExperience(byId["trip-mover"])).toBe("COMMERCE_MULTI_ORDER");
  });

  it("does not fall back to the trips table when a status filter matches nothing", async () => {
    const tables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      tables.push(table);
      if (table === "drivers") return builder({ data: [{ organization_id: "org-1" }], error: null });
      if (table === "trips_driver_view") return builder({ data: [], error: null });
      if (table === "trips") return builder({ data: [{ id: "history" }], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const res = await getDriverUiTripsByDriverIds(["driver-1"], {
      limit: 80,
      offset: 0,
      excludeStatuses: ["completed", "cancelled"],
    });

    expect(res.error).toBeNull();
    expect(res.trips).toEqual([]);
    expect(tables).toEqual(["drivers", "trips_driver_view"]);
    const viewQuery = mockFrom.mock.results.find((call) => call.value.query.ors.length > 0)
      ?.value.query as { ors: string[] };
    expect(viewQuery.ors[0]).toContain("status.is.null");
    expect(viewQuery.ors[0]).toContain("completed");
  });

  it("skips the drivers org lookup when the caller already has those ids", async () => {
    const tables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      tables.push(table);
      if (table === "trips_driver_view") {
        return builder({ data: [row({ id: "trip-open", status: "assigned" })], error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = await getDriverUiTripsByDriverIds(["driver-1"], {
      limit: 80,
      offset: 0,
      knownOrganizationIds: ["org-1"],
    });

    expect(res.error).toBeNull();
    expect(res.trips.map((trip) => trip.id)).toEqual(["trip-open"]);
    expect(tables).toEqual(["trips_driver_view"]);
  });
});
