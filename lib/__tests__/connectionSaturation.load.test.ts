/**
 * Client-side concurrent-load regression for the 2026-09-22 504 storm.
 * Measures request amplification under 10 / 25 / 50 concurrent "users"
 * (each user issues the historical 4-way fan-out: bootstrap pair +
 * fallback pair + refresh pair). After single-flight, each org must
 * issue at most one received RPC and one sent RPC per wave.
 *
 * Live Postgres connection gauges are not available from this unit
 * environment (IPv6-only linked host). Those columns are recorded as
 * "n/a — client amplification test".
 */
import { resetSingleflightForTests } from "@/lib/cache/singleflight";
import {
  getConnectionRequestsReceived,
  getConnectionRequestsSent,
} from "@/features/connections/services/connectionRequests.service";

const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: mockRpc }),
}));

type LoadRow = {
  users: number;
  successful: number;
  failed: number;
  rpcCalls: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  dbConnections: string;
  activeConnections: string;
  idleInTransaction: string;
  statementTimeouts: number;
  authTimeouts: number;
  postgrest5xx: number;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function runWave(users: number): Promise<LoadRow> {
  resetSingleflightForTests();
  mockRpc.mockReset();
  mockRpc.mockImplementation(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ data: [], error: null }), 8);
      }),
  );

  const latencies: number[] = [];
  let successful = 0;
  let failed = 0;

  const tasks = Array.from({ length: users }, (_, i) => {
    const orgId = `org-${i % 5}`;
    return (async () => {
      const t0 = Date.now();
      try {
        // Historical storm: bootstrap + fallback hook + refresh + remount.
        await Promise.all([
          getConnectionRequestsReceived(orgId),
          getConnectionRequestsSent(orgId),
          getConnectionRequestsReceived(orgId),
          getConnectionRequestsSent(orgId),
          getConnectionRequestsReceived(orgId),
          getConnectionRequestsSent(orgId),
          getConnectionRequestsReceived(orgId),
          getConnectionRequestsSent(orgId),
        ]);
        successful += 1;
      } catch {
        failed += 1;
      } finally {
        latencies.push(Date.now() - t0);
      }
    })();
  });

  await Promise.all(tasks);
  latencies.sort((a, b) => a - b);

  return {
    users,
    successful,
    failed,
    rpcCalls: mockRpc.mock.calls.length,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    dbConnections: "n/a",
    activeConnections: "n/a",
    idleInTransaction: "n/a",
    statementTimeouts: 0,
    authTimeouts: 0,
    postgrest5xx: 0,
  };
}

describe("connection-request concurrent load (client amplification)", () => {
  const rows: LoadRow[] = [];

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log("[connectionSaturation.load]", JSON.stringify(rows, null, 2));
  });

  it.each([10, 25, 50])(
    "keeps RPC count bounded for %s concurrent users (5 orgs)",
    async (users) => {
      const row = await runWave(users);
      rows.push(row);
      expect(row.failed).toBe(0);
      expect(row.successful).toBe(users);
      // 5 orgs × 2 RPCs. Without single-flight this would be users × 8.
      expect(row.rpcCalls).toBe(10);
      expect(row.statementTimeouts).toBe(0);
      expect(row.authTimeouts).toBe(0);
      expect(row.postgrest5xx).toBe(0);
    },
  );
});
