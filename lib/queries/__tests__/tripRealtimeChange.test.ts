import { QueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { flushInvalidations } from "@/lib/platform/moderator";
import { queryKeys } from "@/lib/queryKeys";
import {
  applyTripRealtimeCatalogUpdate,
  resetTripRealtimeDedupeForTests,
} from "@/lib/queries/tripRealtimeChange";
import {
  clearAllRealtimeChannels,
  subscribeSharedPostgresChanges,
} from "@/lib/realtimeRegistry";

type OpenedChannel = { topic: string; specs: Array<Record<string, unknown>> };

const mockOpenedChannels: OpenedChannel[] = [];
const mockRemoveChannel = jest.fn(async () => "ok");

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    channel(topic: string) {
      const specs: Array<Record<string, unknown>> = [];
      const channel = {
        on(_type: string, spec: Record<string, unknown>) {
          specs.push(spec);
          return channel;
        },
        subscribe() {
          mockOpenedChannels.push({ topic, specs });
          return channel;
        },
      };
      return channel;
    },
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    getChannels: () => [],
  }),
}));

type Row = { id: string; client_name?: string; status?: string; organization_id?: string };

function payload(
  eventType: "INSERT" | "UPDATE" | "DELETE",
  next: Record<string, unknown> | null,
  previous: Record<string, unknown> | null,
  commit = "2026-11-17T16:00:00.000Z",
): RealtimePostgresChangesPayload<Record<string, unknown>> {
  return {
    schema: "public",
    table: "trips",
    commit_timestamp: commit,
    eventType,
    new: next ?? {},
    old: previous ?? {},
    errors: [],
  } as RealtimePostgresChangesPayload<Record<string, unknown>>;
}

describe("trip realtime catalog updates", () => {
  beforeEach(() => {
    resetTripRealtimeDedupeForTests();
  });

  function client() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidated: string[] = [];
    const original = qc.invalidateQueries.bind(qc);
    qc.invalidateQueries = ((filters?: { queryKey?: readonly unknown[] }) => {
      invalidated.push(JSON.stringify(filters?.queryKey ?? null));
      return original(filters as never);
    }) as typeof qc.invalidateQueries;
    return { qc, invalidated };
  }

  async function seed(qc: QueryClient, rows: Row[]) {
    qc.setQueryData(queryKeys.trips.compliance("org-a"), rows);
    qc.setQueryData(queryKeys.trips.finite("org-a"), rows.map((row) => ({ ...row })));
    qc.setQueryData(queryKeys.tripCompliance.pipeline("org-a"), [{ id: "pipeline" }]);
  }

  function hits(invalidated: string[], key: readonly unknown[]) {
    const serialized = JSON.stringify(key);
    return invalidated.filter((entry) => entry === serialized).length;
  }

  it("patches an existing row from a partial UPDATE and does not reload compliance or the pipeline", async () => {
    const { qc, invalidated } = client();
    await seed(qc, [{ id: "t1", client_name: "Before", status: "delivered", organization_id: "org-a" }]);

    const decision = applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload(
        "UPDATE",
        { id: "t1", organization_id: "org-a", client_name: "After", status: "delivered", pod_received_at: null },
        { id: "t1" },
      ),
    );

    flushInvalidations();
    expect(decision.duplicate).toBe(false);
    expect(decision.settlementChanged).toBe(false);
    expect(decision.podChanged).toBe(false);
    expect(decision.complianceFallback).toBe(false);
    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(0);
    expect(hits(invalidated, queryKeys.tripCompliance.pipeline("org-a"))).toBe(0);
    expect(qc.getQueryData<Row[]>(queryKeys.trips.compliance("org-a"))?.[0].client_name).toBe("After");
  });

  it("ignores a duplicate UPDATE delivery", async () => {
    const { qc, invalidated } = client();
    await seed(qc, [{ id: "t1", client_name: "Before", organization_id: "org-a" }]);
    const event = payload(
      "UPDATE",
      { id: "t1", organization_id: "org-a", client_name: "After" },
      { id: "t1", client_name: "Before" },
    );

    applyTripRealtimeCatalogUpdate(qc, "org-a", event);
    const second = applyTripRealtimeCatalogUpdate(qc, "org-a", event);
    flushInvalidations();

    expect(second.duplicate).toBe(true);
    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(0);
    expect(qc.getQueryData<Row[]>(queryKeys.trips.compliance("org-a"))?.[0].client_name).toBe("After");
  });

  it("does not apply an update for another organisation", async () => {
    const { qc, invalidated } = client();
    await seed(qc, [{ id: "t1", client_name: "Before", organization_id: "org-a" }]);

    const decision = applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("UPDATE", { id: "t1", organization_id: "org-b", client_name: "Other" }, { id: "t1", organization_id: "org-b" }),
    );

    flushInvalidations();
    expect(decision.ignore).toBe(true);
    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(0);
    expect(qc.getQueryData<Row[]>(queryKeys.trips.compliance("org-a"))?.[0].client_name).toBe("Before");
  });

  it("reloads the compliance catalog once when a membership change is not already cached", async () => {
    const { qc, invalidated } = client();
    await seed(qc, [{ id: "t1", organization_id: "org-a" }]);

    const decision = applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload(
        "UPDATE",
        { id: "t2", organization_id: "org-a", status: "delivered" },
        { id: "t2", organization_id: "org-a", status: "in_progress" },
      ),
    );
    flushInvalidations();

    expect(decision.complianceFallback).toBe(true);
    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(1);
    expect(hits(invalidated, queryKeys.tripCompliance.pipeline("org-a"))).toBe(0);
  });

  it("does not reload the catalog for a partial update of a trip that is not cached", async () => {
    const { qc, invalidated } = client();
    await seed(qc, [{ id: "t1", organization_id: "org-a" }]);

    const decision = applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("UPDATE", { id: "t2", organization_id: "org-a", client_name: "New" }, { id: "t2" }),
    );
    flushInvalidations();

    expect(decision.complianceFallback).toBe(false);
    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(0);
  });

  it("schedules one compliance reload for DELETE and leaves the pipeline alone", async () => {
    const { qc, invalidated } = client();
    await seed(qc, [{ id: "t1", organization_id: "org-a" }]);

    applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("DELETE", null, { id: "t1", organization_id: "org-a" }),
    );
    flushInvalidations();

    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(1);
    expect(hits(invalidated, queryKeys.trips.all("org-a"))).toBe(1);
    expect(hits(invalidated, queryKeys.tripCompliance.pipeline("org-a"))).toBe(0);
  });

  it("schedules the hub list and the compliance catalog once for INSERT", async () => {
    const { qc, invalidated } = client();
    await seed(qc, []);

    applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("INSERT", { id: "t9", organization_id: "org-a", client_name: "Added" }, null),
    );
    flushInvalidations();

    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(1);
    expect(hits(invalidated, queryKeys.trips.all("org-a"))).toBe(1);
    expect(hits(invalidated, queryKeys.tripCompliance.pipeline("org-a"))).toBe(0);
  });

  it("ignores an INSERT for another organisation", () => {
    const { qc, invalidated } = client();
    applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("INSERT", { id: "t9", organization_id: "org-b", client_name: "Foreign" }, null),
    );
    flushInvalidations();
    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(0);
    expect(qc.getQueryData(queryKeys.trips.compliance("org-a"))).toBeUndefined();
  });

  it("patches a complete UPDATE payload", async () => {
    const { qc, invalidated } = client();
    await seed(qc, [{ id: "t1", client_name: "Before", status: "in_progress", organization_id: "org-a" }]);
    applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload(
        "UPDATE",
        { id: "t1", organization_id: "org-a", client_name: "After", status: "delivered" },
        { id: "t1", organization_id: "org-a", client_name: "Before", status: "in_progress" },
      ),
    );
    flushInvalidations();
    expect(qc.getQueryData<Row[]>(queryKeys.trips.compliance("org-a"))?.[0].client_name).toBe("After");
    expect(qc.getQueryData<Row[]>(queryKeys.trips.compliance("org-a"))?.[0].status).toBe("delivered");
    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(0);
    expect(hits(invalidated, queryKeys.tripCompliance.pipeline("org-a"))).toBe(0);
  });

  it("applies two legitimate UPDATEs with different commit timestamps", async () => {
    const { qc, invalidated } = client();
    await seed(qc, [{ id: "t1", client_name: "Before", organization_id: "org-a" }]);
    applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("UPDATE", { id: "t1", organization_id: "org-a", client_name: "First" }, { id: "t1" }, "2026-11-17T16:00:00.000Z"),
    );
    applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("UPDATE", { id: "t1", organization_id: "org-a", client_name: "Second" }, { id: "t1" }, "2026-11-17T16:00:01.000Z"),
    );
    flushInvalidations();
    expect(qc.getQueryData<Row[]>(queryKeys.trips.compliance("org-a"))?.[0].client_name).toBe("Second");
    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(0);
  });

  it("does not treat a different UPDATE with the same commit timestamp as a duplicate", async () => {
    const { qc } = client();
    await seed(qc, [{ id: "t1", client_name: "Before", organization_id: "org-a" }]);
    const commit = "2026-11-17T16:00:00.000Z";
    applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("UPDATE", { id: "t1", organization_id: "org-a", client_name: "First" }, { id: "t1" }, commit),
    );
    const second = applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("UPDATE", { id: "t1", organization_id: "org-a", client_name: "Second" }, { id: "t1" }, commit),
    );
    expect(second.duplicate).toBe(false);
    expect(qc.getQueryData<Row[]>(queryKeys.trips.compliance("org-a"))?.[0].client_name).toBe("Second");
  });

  it("does not let an older UPDATE overwrite a newer one", async () => {
    const { qc, invalidated } = client();
    await seed(qc, [{ id: "t1", client_name: "Before", organization_id: "org-a" }]);
    applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("UPDATE", { id: "t1", organization_id: "org-a", client_name: "Newer" }, { id: "t1" }, "2026-11-17T16:00:02.000Z"),
    );
    const older = applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("UPDATE", { id: "t1", organization_id: "org-a", client_name: "Older" }, { id: "t1" }, "2026-11-17T16:00:01.000Z"),
    );
    flushInvalidations();
    expect(older.ignore).toBe(true);
    expect(qc.getQueryData<Row[]>(queryKeys.trips.compliance("org-a"))?.[0].client_name).toBe("Newer");
    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(0);
  });

  it("ignores a DELETE for another organisation", async () => {
    const { qc, invalidated } = client();
    await seed(qc, [{ id: "t1", client_name: "Before", organization_id: "org-a" }]);
    const decision = applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("DELETE", null, { id: "t1", organization_id: "org-b" }),
    );
    flushInvalidations();
    expect(decision.ignore).toBe(true);
    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(0);
    expect(qc.getQueryData<Row[]>(queryKeys.trips.compliance("org-a"))).toHaveLength(1);
  });

  it("coalesces rapid INSERT and DELETE catalog invalidations into one read per key", () => {
    const { qc, invalidated } = client();
    applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("INSERT", { id: "t1", organization_id: "org-a" }, null, "2026-11-17T16:00:00.000Z"),
    );
    applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("INSERT", { id: "t2", organization_id: "org-a" }, null, "2026-11-17T16:00:00.100Z"),
    );
    applyTripRealtimeCatalogUpdate(
      qc,
      "org-a",
      payload("DELETE", null, { id: "t1", organization_id: "org-a" }, "2026-11-17T16:00:00.200Z"),
    );
    flushInvalidations();
    expect(hits(invalidated, queryKeys.trips.compliance("org-a"))).toBe(1);
    expect(hits(invalidated, queryKeys.trips.all("org-a"))).toBe(1);
    expect(hits(invalidated, queryKeys.tripCompliance.pipeline("org-a"))).toBe(0);
  });
});

describe("trip organisation subscription lifecycle", () => {
  beforeEach(() => {
    mockOpenedChannels.length = 0;
    mockRemoveChannel.mockClear();
    clearAllRealtimeChannels();
  });

  afterEach(() => {
    clearAllRealtimeChannels();
    jest.useRealTimers();
  });

  const orgSpec = {
    event: "*" as const,
    schema: "public",
    table: "trips",
    filter: "organization_id=eq.org-a",
  };
  const chatSpec = {
    event: "UPDATE" as const,
    schema: "public",
    table: "trips",
    filter: "organization_id=eq.org-a",
  };

  it("shares one organisation channel between Compliance and Trips and keeps chat UPDATE-only", () => {
    const compliance = subscribeSharedPostgresChanges("trips:org:org-a", [orgSpec], () => {});
    const trips = subscribeSharedPostgresChanges("trips:org:org-a", [orgSpec], () => {});
    const chat = subscribeSharedPostgresChanges("trips:chat_hub:org-a", [chatSpec], () => {});

    expect(mockOpenedChannels).toHaveLength(2);
    expect(mockOpenedChannels[0].topic.startsWith("shared:trips:org:org-a:")).toBe(true);
    expect(mockOpenedChannels[0].specs[0]).toMatchObject(orgSpec);
    expect(mockOpenedChannels[1].topic.startsWith("shared:trips:chat_hub:org-a:")).toBe(true);
    expect(mockOpenedChannels[1].specs[0]).toMatchObject(chatSpec);

    compliance();
    trips();
    chat();
  });

  it("cancels teardown when the organisation channel is resubscribed during the grace window", () => {
    jest.useFakeTimers();
    const first = subscribeSharedPostgresChanges("trips:org:org-a", [orgSpec], () => {});
    first();
    const second = subscribeSharedPostgresChanges("trips:org:org-a", [orgSpec], () => {});
    expect(mockOpenedChannels).toHaveLength(1);
    jest.advanceTimersByTime(15_000);
    expect(mockRemoveChannel).not.toHaveBeenCalled();
    second();
    jest.advanceTimersByTime(15_000);
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
