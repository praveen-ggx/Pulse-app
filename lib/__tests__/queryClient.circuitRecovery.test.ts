/**
 * After an outage: invalidations dropped while the circuit was open are replayed once
 * when it closes, and mutations keep running while onlineManager reports offline (so
 * fuel / toll saves can still queue to the offline outbox).
 */
import { QueryObserver, onlineManager } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import {
  noteSupabaseHealthy,
  noteSupabaseOriginDown,
  resetSupabaseCircuit,
} from "@/lib/supabaseHttp.util";

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/platform/scalability/queryCacheMetrics", () => ({
  recordInvalidateQueries: jest.fn(),
  recordInvalidationStorm: jest.fn(),
  recordRefetchQueries: jest.fn(),
  recordSetQueryData: jest.fn(),
}));
jest.mock("@/lib/hooks/appQueryGateState", () => ({
  isWithinAppQueryBootQuietPeriod: () => false,
}));

async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("query client circuit recovery", () => {
  beforeEach(() => {
    resetSupabaseCircuit();
    onlineManager.setOnline(true);
  });
  afterEach(() => {
    resetSupabaseCircuit();
    onlineManager.setOnline(true);
  });

  it("replays one active refetch when the circuit closes after dropping invalidations", async () => {
    const client = makeQueryClient();
    const queryFn = jest.fn(async () => "v");
    const observerUnsub = new QueryObserver(client, { queryKey: ["trips"], queryFn }).subscribe(() => {});
    await client.fetchQuery({ queryKey: ["trips"], queryFn });
    expect(queryFn).toHaveBeenCalledTimes(1);

    noteSupabaseOriginDown();
    await client.invalidateQueries({ queryKey: ["trips"] });
    await client.invalidateQueries({ queryKey: ["trips"] });
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(1); // dropped while open

    noteSupabaseHealthy();
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(2); // replayed once

    noteSupabaseHealthy();
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(2); // nothing more to replay
    observerUnsub();
    client.clear();
  });

  it("does not refetch on close when nothing was dropped", async () => {
    const client = makeQueryClient();
    const queryFn = jest.fn(async () => "v");
    const unsub = new QueryObserver(client, { queryKey: ["x"], queryFn }).subscribe(() => {});
    await client.fetchQuery({ queryKey: ["x"], queryFn });
    noteSupabaseOriginDown();
    noteSupabaseHealthy();
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(1);
    unsub();
    client.clear();
  });

  it("runs mutations while onlineManager is offline instead of pausing them", async () => {
    const client = makeQueryClient();
    onlineManager.setOnline(false);
    const mutationFn = jest.fn(async () => ({ queued: true }));
    const result = await client
      .getMutationCache()
      // gcTime 0: don't leave a 5-minute gc timer keeping Jest alive.
      .build(client, { mutationFn, gcTime: 0 })
      .execute(undefined);
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ queued: true });
    client.clear();
  });
});
