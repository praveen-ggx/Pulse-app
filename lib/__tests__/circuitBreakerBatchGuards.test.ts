/**
 * End-to-end regression for the 2026-09-22 DB-pressure incident: a client-side
 * TimeoutError (our own ~12s abort while Postgres was still working — the
 * `57014 canceling statement due to user request` pattern in the incident log)
 * must open the same circuit a received 503/504 would, and every independent
 * caller of the batch-producing service functions (Give Load, Customers/
 * Suppliers, Trips — regardless of whether the trigger was a mount, a
 * refocus, a cache invalidation, or a second device) must fail fast with zero
 * outbound Supabase requests while that circuit is open.
 */
import {
  isSupabaseCircuitOpen,
  noteSupabaseOriginDown,
  noteSupabaseOriginDownIfClientTimeout,
  resetSupabaseCircuit,
  SUPABASE_CIRCUIT_COOLDOWN_MS,
} from "@/lib/supabaseHttp.util";

const mockSupabase = jest.fn(() => {
  throw new Error("supabase() must not be called while the circuit is open");
});

jest.mock("@/lib/supabase", () => ({
  supabase: (...args: unknown[]) => mockSupabase(...args),
}));

import { getIndentOfferCountsForOwnerIndents } from "@/features/network/services/bids.service";
import { getIndentStoryStates } from "@/features/network/services/indentStoryPosts.service";
import {
  getOrganizationLocationsByIds,
  getOrganizationLocationsByNames,
} from "@/features/organization/services/organization.service";
import { fetchTripFinanceAdjustmentsByTripIds } from "@/features/trips/services/tripAdjustments";

afterEach(() => {
  resetSupabaseCircuit();
  mockSupabase.mockClear();
});

function clientTimeout(): Error {
  const timeout = new Error("Request timed out");
  timeout.name = "TimeoutError";
  return timeout;
}

describe("complete chain: TimeoutError → circuit OPEN → no PostgREST", () => {
  it("opens the circuit from the fetch-wrapper helper, then every batch producer fails fast", async () => {
    expect(isSupabaseCircuitOpen()).toBe(false);

    // Same helper fetchWithTimeoutAndRetry calls after a client TimeoutError.
    expect(noteSupabaseOriginDownIfClientTimeout(clientTimeout())).toBe(true);
    expect(isSupabaseCircuitOpen()).toBe(true);

    const [stories, offers, byIds, byNames, adjustments] = await Promise.all([
      getIndentStoryStates("org-1", ["indent-1"]),
      getIndentOfferCountsForOwnerIndents("org-1", ["indent-1"]),
      getOrganizationLocationsByIds(["org-a"]),
      getOrganizationLocationsByNames(["Acme"]),
      fetchTripFinanceAdjustmentsByTripIds(["trip-1"]),
    ]);

    expect(mockSupabase).not.toHaveBeenCalled();
    expect(stories).toEqual({ error: null, byIndentId: {} });
    expect(offers).toEqual({ error: null, counts: {} });
    expect(byIds).toEqual({ error: null, locations: [] });
    expect(byNames).toEqual({ error: null, locations: [] });
    expect(adjustments).toEqual(new Map());
  });

  it("blocks the 13–17s repeating trigger (refocus / invalidation / second device) for the full 45s window", async () => {
    jest.useFakeTimers();
    const t0 = Date.now();
    try {
      noteSupabaseOriginDownIfClientTimeout(clientTimeout());

      for (const offset of [13_000, 17_000, SUPABASE_CIRCUIT_COOLDOWN_MS - 1]) {
        expect(isSupabaseCircuitOpen(t0 + offset)).toBe(true);
        mockSupabase.mockClear();
        await Promise.all([
          getIndentStoryStates("org-1", ["indent-1"]),
          getIndentOfferCountsForOwnerIndents("org-1", ["indent-1"]),
          getOrganizationLocationsByIds(["org-a"]),
          fetchTripFinanceAdjustmentsByTripIds(["trip-1"]),
          getIndentStoryStates("org-2", ["indent-9"]),
        ]);
        expect(mockSupabase).not.toHaveBeenCalled();
      }

      expect(isSupabaseCircuitOpen(t0 + SUPABASE_CIRCUIT_COOLDOWN_MS)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("circuit-open guards on each 2026-09-22 batch producer", () => {
  beforeEach(() => {
    noteSupabaseOriginDown();
  });

  it("getIndentStoryStates (Give Load posts) fails fast with no Supabase request", async () => {
    const result = await getIndentStoryStates("org-1", ["indent-1", "indent-2"]);
    expect(mockSupabase).not.toHaveBeenCalled();
    expect(result).toEqual({ error: null, byIndentId: {} });
  });

  it("getIndentOfferCountsForOwnerIndents (Give Load direct_quotes) fails fast with no Supabase request", async () => {
    const result = await getIndentOfferCountsForOwnerIndents("org-1", ["indent-1"]);
    expect(mockSupabase).not.toHaveBeenCalled();
    expect(result).toEqual({ error: null, counts: {} });
  });

  it("getOrganizationLocationsByIds (Connections screen) fails fast with no Supabase request", async () => {
    const result = await getOrganizationLocationsByIds(["org-a", "org-b"]);
    expect(mockSupabase).not.toHaveBeenCalled();
    expect(result).toEqual({ error: null, locations: [] });
  });

  it("getOrganizationLocationsByNames (Connections screen ilike fallback) fails fast with no Supabase request", async () => {
    const result = await getOrganizationLocationsByNames(["Acme Logistics"]);
    expect(mockSupabase).not.toHaveBeenCalled();
    expect(result).toEqual({ error: null, locations: [] });
  });

  it("fetchTripFinanceAdjustmentsByTripIds (Trips screen) fails fast with no Supabase request", async () => {
    const result = await fetchTripFinanceAdjustmentsByTripIds(["trip-1", "trip-2"]);
    expect(mockSupabase).not.toHaveBeenCalled();
    expect(result).toEqual(new Map());
  });

  it("blocks every independent caller during the open window: screen A/B/C, a refocus repeat, and a second device", async () => {
    // Each call below stands in for a different real-world trigger of the
    // exact same batch — a mounted screen, a tab refocus, a cache
    // invalidation, or a second device in the same org — but they are
    // indistinguishable to the guard: it must block all of them for the
    // life of the 45s circuit window, not just the caller that tripped it.
    await Promise.all([
      getIndentStoryStates("org-1", ["indent-1"]), // Give Load screen A
      getIndentStoryStates("org-1", ["indent-1"]), // refocus repeat of the same query
      getIndentOfferCountsForOwnerIndents("org-1", ["indent-1"]), // Give Load screen B
      getOrganizationLocationsByIds(["org-a"]), // Connections screen
      getOrganizationLocationsByNames(["Acme"]), // Connections screen ilike fallback
      fetchTripFinanceAdjustmentsByTripIds(["trip-1"]), // Trips screen
      getIndentStoryStates("org-2", ["indent-9"]), // a second device / different org
    ]);
    expect(mockSupabase).not.toHaveBeenCalled();
  });
});
