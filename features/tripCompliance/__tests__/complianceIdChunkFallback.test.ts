/**
 * Batched id reads behind Compliance Export Report: the trips-flags column
 * fallback is decided per batch, and driver phone lookups never return a
 * partial map on failure.
 */
type Call = { table: string; select: string; ids: string[] };
type Reply = { data: unknown[] | null; error: { code?: string; message: string } | null };

const calls: Call[] = [];
let reply: (call: Call) => Reply = () => ({ data: [], error: null });

const client = {
  from(table: string) {
    const call: Call = { table, select: "", ids: [] };
    const builder = {
      select(columns: string) {
        call.select = columns;
        return builder;
      },
      eq: () => builder,
      in(column: string, values: string[]) {
        if (column === "id" || column === "trip_id") call.ids = [...values];
        return builder;
      },
      then(resolve: (r: Reply) => unknown, reject?: (e: unknown) => unknown) {
        calls.push(call);
        return Promise.resolve(reply(call)).then(resolve, reject);
      },
    };
    return builder;
  },
};

jest.mock("@/lib/supabase", () => ({ supabase: () => client }));

import { getDriverPhonesByIds } from "@/features/drivers/services/drivers.service";
import { fetchComplianceTripFlags } from "@/features/tripCompliance/services/tripComplianceRead.service";

const tripIds = Array.from({ length: 250 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const secondBatchId = tripIds[150];

beforeEach(() => {
  calls.length = 0;
});

describe("fetchComplianceTripFlags column fallback", () => {
  it("falls back only for the batch whose select failed", async () => {
    reply = (call) => {
      const hasFlagColumns = call.select.includes("finance_flag_note");
      if (hasFlagColumns && call.ids.includes(secondBatchId)) {
        return { data: null, error: { code: "42703", message: "column trips.finance_flag_note does not exist" } };
      }
      return {
        data: call.ids.map((id) => ({
          id,
          compliance_verified_at: "2026-11-01T00:00:00Z",
          ...(hasFlagColumns ? { finance_flag_note: "flagged" } : {}),
        })),
        error: null,
      };
    };

    const flags = await fetchComplianceTripFlags(tripIds);

    expect(flags.size).toBe(250);
    expect(Math.max(...calls.map((call) => call.ids.length))).toBeLessThanOrEqual(100);
    expect(flags.get(tripIds[0])?.finance_flag_note).toBe("flagged");
    expect(flags.get(secondBatchId)?.finance_flag_note).toBeNull();
    expect(flags.get(secondBatchId)?.compliance_verified_at).toBe("2026-11-01T00:00:00Z");
    // The third batch starts from the full select again — batch 2's fallback does not leak.
    expect(flags.get(tripIds[249])?.finance_flag_note).toBe("flagged");
    const thirdBatchCalls = calls.filter((call) => call.ids.includes(tripIds[249]));
    expect(thirdBatchCalls).toHaveLength(1);
    expect(thirdBatchCalls[0].select).toContain("finance_flag_note");
  });

  it("throws on a real error in any batch instead of returning partial flags", async () => {
    reply = (call) =>
      call.ids.includes(secondBatchId)
        ? { data: null, error: { message: "Bad Request" } }
        : { data: call.ids.map((id) => ({ id })), error: null };

    await expect(fetchComplianceTripFlags(tripIds)).rejects.toThrow("Bad Request");
  });
});

describe("getDriverPhonesByIds", () => {
  const driverIds = tripIds;

  it("resolves every driver across batches of at most 100", async () => {
    reply = (call) => ({ data: call.ids.map((id) => ({ id, phone: ` 9${id.slice(-9)} ` })), error: null });

    const { error, phoneByDriverId } = await getDriverPhonesByIds(driverIds);

    expect(error).toBeNull();
    expect(phoneByDriverId.size).toBe(250);
    expect(phoneByDriverId.get(driverIds[249])).toBe(`9${driverIds[249].slice(-9)}`);
    expect(calls.map((call) => call.ids.length)).toEqual([100, 100, 50]);
  });

  it("reports a batch failure as an error with no partial phones", async () => {
    reply = (call) =>
      call.ids.includes(secondBatchId)
        ? { data: null, error: { message: "Bad Request" } }
        : { data: call.ids.map((id) => ({ id, phone: "9000000000" })), error: null };

    const { error, phoneByDriverId } = await getDriverPhonesByIds(driverIds);

    expect(error?.message).toBe("Bad Request");
    expect(phoneByDriverId.size).toBe(0);
  });
});
