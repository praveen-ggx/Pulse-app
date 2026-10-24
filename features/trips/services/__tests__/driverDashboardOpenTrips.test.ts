import { readFileSync } from "fs";
import { join } from "path";

import { driverDashboardOpenTripQuery } from "@/features/trips/domain/driverDashboardTripList";
import { getDriverUiTripsByDriverIds } from "@/features/trips/services/trips.service";
import type { DriverTripRow } from "@/types/trip-views";

const mockFrom = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ from: mockFrom, rpc: jest.fn() }),
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
  const query: { ors: string[]; orders: unknown[][]; ranges: unknown[][] } = {
    ors: [],
    orders: [],
    ranges: [],
  };
  const chain: Record<string, unknown> = {
    select: jest.fn(() => chain),
    in: jest.fn(() => chain),
    or: jest.fn((filter: string) => {
      query.ors.push(filter);
      return chain;
    }),
    order: jest.fn((...args: unknown[]) => {
      query.orders.push(args);
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

describe("dashboard open-trip read", () => {
  it("asks the database for open trips only, started work first, capped at 80", async () => {
    const tables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      tables.push(table);
      return builder({
        data: [row({ id: "live", status: "in_progress", started_at: "2026-10-01T01:00:00Z" })],
        error: null,
      });
    });

    const res = await getDriverUiTripsByDriverIds(
      ["driver-1"],
      driverDashboardOpenTripQuery(["org-1"]),
    );

    expect(res.error).toBeNull();
    expect(res.trips.map((trip) => trip.status)).toEqual(["in_progress"]);
    expect(tables).toEqual(["trips_driver_view"]);
    const view = mockFrom.mock.results[0].value.query as {
      ors: string[];
      orders: unknown[][];
      ranges: unknown[][];
    };
    expect(view.ors[0]).toContain("completed");
    expect(view.ors[0]).toContain("cancelled");
    expect(view.ors[0]).toContain("delivered");
    expect(view.ors[0]).not.toContain("in_progress");
    expect(view.orders[0]?.[0]).toBe("started_at");
    expect(view.orders[1]?.[0]).toBe("created_at");
    expect(view.orders[2]?.[0]).toBe("id");
    expect(view.ranges).toEqual([[0, 79]]);
  });

  it("keeps at most 80 rows when the response is longer than the cap", async () => {
    const rows = Array.from({ length: 81 }, (_, index) =>
      row({ id: `trip-${String(index).padStart(2, "0")}` }),
    );
    mockFrom.mockImplementation(() => builder({ data: rows, error: null }));

    const res = await getDriverUiTripsByDriverIds(
      ["driver-1"],
      driverDashboardOpenTripQuery(["org-1"]),
    );

    expect(res.trips).toHaveLength(80);
    expect(res.trips[0]?.id).toBe("trip-00");
    expect(res.trips.some((trip) => trip.id === "trip-80")).toBe(false);
  });

  it("returns empty when no open trips exist and does not load history", async () => {
    const tables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      tables.push(table);
      if (table === "trips") {
        return builder({
          data: [row({ id: "old", status: "completed" })],
          error: null,
        });
      }
      return builder({ data: [], error: null });
    });

    const res = await getDriverUiTripsByDriverIds(
      ["driver-1"],
      driverDashboardOpenTripQuery(["org-1"]),
    );

    expect(res.error).toBeNull();
    expect(res.trips).toEqual([]);
    expect(tables).toEqual(["trips_driver_view"]);
  });

  it("still returns historical trips when history does not use the dashboard filter", async () => {
    const tables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      tables.push(table);
      if (table === "drivers") {
        return builder({ data: [{ organization_id: "org-1" }], error: null });
      }
      return builder({
        data: [row({ id: "done", status: "completed" })],
        error: null,
      });
    });

    const res = await getDriverUiTripsByDriverIds(["driver-1"]);

    expect(res.error).toBeNull();
    expect(res.trips.map((trip) => trip.id)).toEqual(["done"]);
    const view = mockFrom.mock.results.find((call) => call.value.query.orders.length > 0)
      ?.value.query as { ors: string[]; orders: unknown[][] };
    expect(view.ors).toEqual([]);
    expect(view.orders).toEqual([["created_at", { ascending: false }]]);
    expect(tables).not.toContain("trips");
  });
});

describe("history and wallet stay on their own trip reads", () => {
  it("does not pass the dashboard open-trip query into history or wallet", () => {
    const history = readFileSync(
      join(process.cwd(), "features/drivers/screens/DriverTripHistoryScreen.tsx"),
      "utf8",
    );
    const wallet = readFileSync(
      join(process.cwd(), "features/drivers/screens/DriverWalletScreen.tsx"),
      "utf8",
    );
    expect(history).toContain("getDriverUiTripsByDriverIds(driverIds, { signal: ac.signal })");
    expect(wallet).toContain("getDriverUiTripsByDriverIds(driverIds)");
    expect(history).not.toContain("driverDashboardOpenTripQuery");
    expect(wallet).not.toContain("driverDashboardOpenTripQuery");
    expect(history).not.toContain("excludeStatuses");
    expect(wallet).not.toContain("excludeStatuses");
  });
});
