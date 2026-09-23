import {
  moderate,
  configureModerator,
  getModeratorMetrics,
  recordOutcome,
  RequestShedError,
  __resetModeratorForTests,
} from '../requestModerator';

const res = (body = '{}') => new Response(body, { status: 200 });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => __resetModeratorForTests());

describe('observeOnly (default)', () => {
  it('does not queue, coalesce, or shed — only counts', async () => {
    const d1 = deferred<Response>();
    const d2 = deferred<Response>();
    const calls: number[] = [];

    // maxConcurrent is 6, but observeOnly must not gate even beyond it.
    configureModerator({ maxConcurrent: 1 });
    const p1 = moderate('interactive', () => { calls.push(1); return d1.promise; }, 'same-key');
    const p2 = moderate('interactive', () => { calls.push(2); return d2.promise; }, 'same-key');

    // Both ran immediately: no semaphore, and no coalescing despite the shared key.
    expect(calls).toEqual([1, 2]);
    d1.resolve(res()); d2.resolve(res());
    await Promise.all([p1, p2]);

    const m = getModeratorMetrics();
    expect(m.total).toBe(2);
    expect(m.coalesced).toBe(0);
    expect(m.queued).toBe(0);
  });
});

describe('concurrency ceiling', () => {
  it('holds requests above maxConcurrent until a slot frees', async () => {
    configureModerator({ observeOnly: false, maxConcurrent: 2, coalesceReads: false });
    const ds = [deferred<Response>(), deferred<Response>(), deferred<Response>()];
    const started: number[] = [];
    const ps = ds.map((d, i) =>
      moderate('interactive', () => { started.push(i); return d.promise; }),
    );

    await Promise.resolve();
    expect(started).toEqual([0, 1]);          // third is queued
    expect(getModeratorMetrics().queueDepth).toBe(1);

    ds[0].resolve(res());
    await ps[0];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);       // freed slot admitted the third

    ds[1].resolve(res()); ds[2].resolve(res());
    await Promise.all(ps);
    expect(getModeratorMetrics().peakInFlight).toBeLessThanOrEqual(2);
  });

  it('serves interactive before background when saturated', async () => {
    configureModerator({ observeOnly: false, maxConcurrent: 1, coalesceReads: false });
    const blocker = deferred<Response>();
    const order: string[] = [];

    const p0 = moderate('interactive', () => blocker.promise);
    await Promise.resolve();

    const bg = moderate('background', async () => { order.push('background'); return res(); });
    const ia = moderate('interactive', async () => { order.push('interactive'); return res(); });

    blocker.resolve(res());
    await Promise.all([p0, bg, ia]);
    expect(order).toEqual(['interactive', 'background']);
  });

  it('releases a queued request when maxQueueWaitMs expires (escape hatch)', async () => {
    jest.useFakeTimers();
    configureModerator({
      observeOnly: false, maxConcurrent: 1, coalesceReads: false, maxQueueWaitMs: 1000,
    });
    const stuck = deferred<Response>();
    void moderate('interactive', () => stuck.promise);
    await Promise.resolve();

    let ran = false;
    const queued = moderate('interactive', async () => { ran = true; return res(); });

    jest.advanceTimersByTime(1000);
    await queued;
    expect(ran).toBe(true);                               // passed through, not hung
    expect(getModeratorMetrics().queueTimeouts).toBe(1);
    stuck.resolve(res());
    jest.useRealTimers();
  });
});

describe('coalescing', () => {
  it('collapses identical in-flight reads into one round-trip', async () => {
    configureModerator({ observeOnly: false, coalesceReads: true });
    const d = deferred<Response>();
    let calls = 0;
    const fn = () => { calls += 1; return d.promise; };

    const a = moderate('interactive', fn, 'k');
    const b = moderate('interactive', fn, 'k');
    d.resolve(res('{"v":1}'));
    const [ra, rb] = await Promise.all([a, b]);

    expect(calls).toBe(1);
    expect(getModeratorMetrics().coalesced).toBe(1);
    // Each caller must get an independently readable body.
    expect(await ra.json()).toEqual({ v: 1 });
    expect(await rb.json()).toEqual({ v: 1 });
  });

  it('does not share across different keys', async () => {
    configureModerator({ observeOnly: false, coalesceReads: true });
    let calls = 0;
    await Promise.all([
      moderate('interactive', async () => { calls += 1; return res(); }, 'a'),
      moderate('interactive', async () => { calls += 1; return res(); }, 'b'),
    ]);
    expect(calls).toBe(2);
  });
});

describe('circuit breaker', () => {
  it('sheds background but never interactive once open', async () => {
    configureModerator({
      observeOnly: false, circuitBreakerEnabled: true, breakerFailureThreshold: 2,
    });
    recordOutcome(true);
    recordOutcome(true);                                   // breaker opens

    await expect(moderate('background', async () => res())).rejects.toBeInstanceOf(RequestShedError);
    await expect(moderate('bulk', async () => res())).rejects.toBeInstanceOf(RequestShedError);
    await expect(moderate('interactive', async () => res())).resolves.toBeDefined();

    const m = getModeratorMetrics();
    expect(m.shed).toBe(2);
    expect(m.breakerOpens).toBe(1);
  });

  it('recovers after cooldown', async () => {
    jest.useFakeTimers();
    configureModerator({
      observeOnly: false, circuitBreakerEnabled: true,
      breakerFailureThreshold: 1, breakerCooldownMs: 5000,
    });
    recordOutcome(true);
    await expect(moderate('background', async () => res())).rejects.toBeInstanceOf(RequestShedError);

    jest.advanceTimersByTime(5000);
    await expect(moderate('background', async () => res())).resolves.toBeDefined();
    jest.useRealTimers();
  });

  it('a success resets the failure streak before the breaker opens', async () => {
    configureModerator({
      observeOnly: false, circuitBreakerEnabled: true, breakerFailureThreshold: 3,
    });
    recordOutcome(true);
    recordOutcome(true);
    recordOutcome(false);                                  // streak broken
    recordOutcome(true);
    recordOutcome(true);
    await expect(moderate('background', async () => res())).resolves.toBeDefined();
    expect(getModeratorMetrics().breakerOpens).toBe(0);
  });
});

describe('slot accounting', () => {
  it('frees the slot when the request throws', async () => {
    configureModerator({ observeOnly: false, maxConcurrent: 1, coalesceReads: false });
    await expect(
      moderate('interactive', async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    // Slot released — a later request still runs.
    await expect(moderate('interactive', async () => res())).resolves.toBeDefined();
    expect(getModeratorMetrics().inFlight).toBe(0);
  });
});
