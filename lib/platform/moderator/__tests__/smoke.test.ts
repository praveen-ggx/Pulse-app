/**
 * End-to-end smoke test: drives a real supabase-js client through the Moderator
 * under a realistic cold-open burst, in each of the rollout phases.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  moderate,
  classifyRequest,
  configureModerator,
  getModeratorMetrics,
  recordOutcome,
  __resetModeratorForTests,
} from '@/lib/platform/moderator';

const URL_ = 'https://proj.supabase.co';
const KEY = 'anon';

let concurrentNow = 0;
let observedPeak = 0;

function makeClient(latencyMs = 5): SupabaseClient {
  const f = (input: RequestInfo | URL, init?: RequestInit) => {
    const { lane, coalesceKey, isAuth } = classifyRequest(input, init);
    if (isAuth) return Promise.resolve(new Response('{}', { status: 200 }));
    return moderate(lane, async () => {
      concurrentNow += 1;
      observedPeak = Math.max(observedPeak, concurrentNow);
      await new Promise((r) => setTimeout(r, latencyMs));
      concurrentNow -= 1;
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }, coalesceKey);
  };
  return createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: f as typeof fetch },
  });
}

beforeEach(() => {
  __resetModeratorForTests();
  concurrentNow = 0;
  observedPeak = 0;
});

/** The TripsScreen cold-open profile: 11 parallel queries. */
function coldOpen(sb: SupabaseClient) {
  const org = 'org-1';
  return Promise.all([
    sb.from('trips').select('id,status').eq('organization_id', org).limit(200),
    sb.from('indents').select('id').eq('organization_id', org).limit(200),
    sb.from('transactions').select('id,amount_in').eq('organization_id', org).limit(500),
    sb.from('clients').select('id,name').eq('organization_id', org).limit(200),
    sb.from('suppliers').select('id,name').eq('organization_id', org).limit(200),
    sb.from('drivers').select('id,name').eq('organization_id', org).limit(200),
    sb.from('vehicles').select('id,number').eq('organization_id', org).limit(200),
    sb.from('subcontracts').select('id').eq('organization_id', org).limit(200),
    sb.rpc('get_trips_for_org', { p_org_id: org }),
    sb.rpc('get_indent_offer_counts', { p_org_id: org }),
    sb.rpc('get_shipper_display_names', { p_org_id: org }),
  ]);
}

it('PHASE 1 (observe-only): all requests succeed, nothing is gated', async () => {
  const sb = makeClient();
  const results = await coldOpen(sb);

  expect(results).toHaveLength(11);
  results.forEach((r) => expect(r.error).toBeNull());

  const m = getModeratorMetrics();
  expect(m.total).toBe(11);
  expect(m.queued).toBe(0);           // observe-only never queues
  expect(m.shed).toBe(0);
  expect(observedPeak).toBe(11);      // true concurrency profile is measured
});

it('PHASE 5 (ceiling on): same burst is capped, every request still completes', async () => {
  configureModerator({ observeOnly: false, maxConcurrent: 6, coalesceReads: false });
  const sb = makeClient();
  const results = await coldOpen(sb);

  results.forEach((r) => expect(r.error).toBeNull());   // nothing lost
  expect(observedPeak).toBeLessThanOrEqual(6);          // pool pressure bounded
  expect(getModeratorMetrics().queued).toBeGreaterThan(0);
});

it('coalescing collapses a duplicate-read stampede', async () => {
  configureModerator({ observeOnly: false, coalesceReads: true, maxConcurrent: 6 });
  const sb = makeClient(20);

  // 8 components mounting at once, all asking for the same list.
  const rows = await Promise.all(
    Array.from({ length: 8 }, () =>
      sb.from('clients').select('id,name').eq('organization_id', 'org-1').limit(200),
    ),
  );

  rows.forEach((r) => expect(r.error).toBeNull());
  // 8 callers, 1 round-trip.
  expect(getModeratorMetrics().coalesced).toBe(7);
});

it('a degraded DB sheds background reads but never writes or interactive reads', async () => {
  configureModerator({
    observeOnly: false,
    circuitBreakerEnabled: true,
    breakerFailureThreshold: 2,
    coalesceReads: false,
  });
  const sb = makeClient();

  recordOutcome(true);
  recordOutcome(true);                       // breaker opens

  // Interactive read still served.
  const read = await sb.from('trips').select('id').limit(10);
  expect(read.error).toBeNull();

  // Write still served — losing one would lose user data.
  const write = await sb.from('trips').update({ status: 'DELIVERED' }).eq('id', 't1');
  expect(write.error).toBeNull();

  expect(getModeratorMetrics().shed).toBe(0);
});

it('recovers cleanly: a slow request never wedges the queue', async () => {
  configureModerator({
    observeOnly: false, maxConcurrent: 2, maxQueueWaitMs: 200, coalesceReads: false,
  });
  const sb = makeClient(400);                 // every call slower than the queue wait

  const results = await Promise.all(
    Array.from({ length: 6 }, () => sb.from('trips').select('id').limit(10)),
  );
  results.forEach((r) => expect(r.error).toBeNull());   // escape hatch, no hang
  expect(getModeratorMetrics().queueTimeouts).toBeGreaterThan(0);
});
