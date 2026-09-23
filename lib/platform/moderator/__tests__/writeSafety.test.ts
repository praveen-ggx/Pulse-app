/**
 * Write-path safety. A queued read is a slow screen; a shed or deduped write is
 * lost user data, so these invariants are not negotiable.
 */
import { classifyRequest, LANE_HEADER } from '../requestClassifier';
import {
  moderate,
  configureModerator,
  recordOutcome,
  getModeratorMetrics,
  __resetModeratorForTests,
} from '../requestModerator';

const REST = 'https://proj.supabase.co/rest/v1';
const res = () => new Response('{}', { status: 200 });

beforeEach(() => __resetModeratorForTests());

describe('writes are never coalesced', () => {
  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('%s gets no coalesce key', (method) => {
    expect(classifyRequest(`${REST}/trips`, { method }).coalesceKey).toBeUndefined();
  });

  it('an RPC POST is not coalesced — it may have side effects', () => {
    expect(
      classifyRequest(`${REST}/rpc/place_bid`, { method: 'POST' }).coalesceKey,
    ).toBeUndefined();
  });

  it('two identical writes both execute', async () => {
    configureModerator({ observeOnly: false, coalesceReads: true });
    let calls = 0;
    const fire = () => {
      const c = classifyRequest(`${REST}/trips`, { method: 'POST' });
      return moderate(c.lane, async () => { calls += 1; return res(); }, c.coalesceKey);
    };
    await Promise.all([fire(), fire()]);
    expect(calls).toBe(2);
  });
});

describe('writes are never shed', () => {
  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    '%s stays in the interactive lane even if a caller asks for background',
    (method) => {
      const c = classifyRequest(`${REST}/trips`, {
        method,
        headers: { [LANE_HEADER]: 'background' },
      });
      expect(c.lane).toBe('interactive');
    },
  );

  it('an open circuit breaker does not drop a write', async () => {
    configureModerator({
      observeOnly: false,
      circuitBreakerEnabled: true,
      breakerFailureThreshold: 1,
    });
    recordOutcome(true); // breaker opens

    const c = classifyRequest(`${REST}/trips`, {
      method: 'POST',
      headers: { [LANE_HEADER]: 'bulk' }, // even a bulk-tagged write survives
    });
    await expect(moderate(c.lane, async () => res(), c.coalesceKey)).resolves.toBeDefined();
    expect(getModeratorMetrics().shed).toBe(0);
  });
});

describe('reads may still be backgrounded', () => {
  it('a GET honours an explicit background lane', () => {
    const c = classifyRequest(`${REST}/trips?select=id&limit=10`, {
      headers: { [LANE_HEADER]: 'background' },
    });
    expect(c.lane).toBe('background');
  });
});
