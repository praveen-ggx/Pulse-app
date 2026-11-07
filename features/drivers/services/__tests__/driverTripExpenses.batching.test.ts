const calls: { table: string; ids: string[] }[] = [];
let inFlight = 0;
let maxInFlight = 0;

function mockQuery(table: string) {
  const state: { ids: string[] } = { ids: [] };
  const builder = {
    select() {
      return builder;
    },
    in(_column: string, ids: string[]) {
      state.ids = ids;
      return builder;
    },
    eq() {
      calls.push({ table, ids: state.ids });
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight -= 1;
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
    expect(elapsed).toBeLessThan(180);
  });
});
