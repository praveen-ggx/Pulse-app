const calls: { table: string; ids: string[]; columns: string }[] = [];
let inFlight = 0;
let maxInFlight = 0;
let failFuelTripId: string | null = null;

const SELECTS: Record<string, string> = {
  trip_fuel_entries: "id, trip_id, amount_inr, fuel_type, entered_at, status",
  trip_toll_entries: "id, trip_id, amount_inr, plaza_name, entered_at, status",
  trip_other_expenses: "id, trip_id, amount_inr, expense_category, description, entered_at, status",
};

function mockQuery(table: string) {
  const state: { ids: string[]; columns: string } = { ids: [], columns: "" };
  const builder = {
    select(columns: string) {
      state.columns = columns;
      return builder;
    },
    in(_column: string, ids: string[]) {
      state.ids = ids;
      return builder;
    },
    eq(column: string, value: string) {
      calls.push({ table, ids: state.ids, columns: state.columns });
      if (column !== "status" || value !== "active") {
        throw new Error(`unexpected filter ${column}=${value}`);
      }
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight -= 1;
          if (table === "trip_fuel_entries" && failFuelTripId && state.ids.includes(failFuelTripId)) {
            resolve({ data: null, error: { message: "fuel read failed" } });
            return;
          }
          resolve({
            data: state.ids.map((tripId) => ({
              id: `${table}-${tripId}`,
              trip_id: tripId,
              amount_inr: 10,
              entered_at: "2026-01-01T00:00:00.000Z",
              status: "active",
              fuel_type: "diesel",
              plaza_name: "Plaza",
              expense_category: "misc",
              description: null,
            })),
            error: null,
          });
        }, 30);
      });
    },
  };
  return builder;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => mockQuery(table),
  }),
}));

import { listDriverTripExpensesByTripIds } from "../driverTripExpenses.service";

describe("listDriverTripExpensesByTripIds", () => {
  beforeEach(() => {
    calls.length = 0;
    inFlight = 0;
    maxInFlight = 0;
    failFuelTripId = null;
  });

  it("keeps batch order while overlapping four batches", async () => {
    const ids = Array.from({ length: 80 * 8 }, (_, index) => `trip-${index}`);
    const started = Date.now();
    const { error, entries } = await listDriverTripExpensesByTripIds(ids);
    const elapsed = Date.now() - started;

    expect(error).toBeNull();
    const fuelIds = entries.filter((entry) => entry.kind === "fuel").map((entry) => entry.tripId);
    expect(fuelIds).toEqual(ids);
    expect(calls.filter((call) => call.table === "trip_fuel_entries").map((call) => call.ids[0])).toEqual(
      ids.filter((_, index) => index % 80 === 0),
    );
    expect(maxInFlight).toBeGreaterThan(3);
    expect(maxInFlight).toBeLessThanOrEqual(12);
    expect(elapsed).toBeLessThan(180);
    for (const call of calls) {
      expect(call.columns).toBe(SELECTS[call.table]);
      expect(call.ids).toHaveLength(80);
    }
  });

  it("returns no rows when one batch fails", async () => {
    const ids = Array.from({ length: 80 * 2 }, (_, index) => `trip-${index}`);
    failFuelTripId = "trip-80";
    const { error, entries } = await listDriverTripExpensesByTripIds(ids);
    expect(error?.message).toBe("fuel read failed");
    expect(entries).toEqual([]);
  });

  it("does not query when there are no trip ids", async () => {
    const empty = await listDriverTripExpensesByTripIds([]);
    const blank = await listDriverTripExpensesByTripIds(["", "  "]);
    expect(empty).toEqual({ error: null, entries: [] });
    expect(blank).toEqual({ error: null, entries: [] });
    expect(calls).toEqual([]);
  });

  it("dedupes trip ids before fetching", async () => {
    const { error, entries } = await listDriverTripExpensesByTripIds(["a", "a", " a "]);
    expect(error).toBeNull();
    expect(entries.filter((entry) => entry.kind === "fuel").map((entry) => entry.tripId)).toEqual(["a"]);
    expect(calls.filter((call) => call.table === "trip_fuel_entries")).toEqual([
      { table: "trip_fuel_entries", ids: ["a"], columns: SELECTS.trip_fuel_entries },
    ]);
  });
});
