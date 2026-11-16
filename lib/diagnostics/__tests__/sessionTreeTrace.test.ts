import {
  createSessionTreeTracer,
  formatSessionTreeTraceEntry,
  redactPathname,
  type SessionTreeSnapshot,
  type SessionTreeTraceEntry,
} from '@/lib/diagnostics/sessionTreeTrace';

const base: SessionTreeSnapshot = {
  branch: 'splash',
  pathname: '/find-loads',
  status: 'restoring',
  sessionAttached: false,
  cacheOwnedByUser: false,
  instance: 1,
};

function setup() {
  let t = 1_000_000;
  const logged: SessionTreeTraceEntry[] = [];
  const tracer = createSessionTreeTracer({ now: () => t, log: (e) => logged.push(e) });
  return { tracer, logged, tick: (ms: number) => (t += ms) };
}

describe('sessionTreeTrace', () => {
  it('logs the initial snapshot and then only on change', () => {
    const { tracer, logged } = setup();
    tracer.record(base);
    tracer.record(base);
    tracer.record({ ...base });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ n: 1, prevBranch: null, branchChanged: true, changed: ['initial'] });

    tracer.record({ ...base, status: 'authenticated' });
    expect(logged).toHaveLength(2);
    expect(logged[1]).toMatchObject({ n: 2, branchChanged: false, changed: ['status'], marker: null });
  });

  it('numbers transitions monotonically and reports prev/current branch', () => {
    const { tracer, logged, tick } = setup();
    tracer.record(base);
    tick(500);
    tracer.record({ ...base, branch: 'data-plane', sessionAttached: true, cacheOwnedByUser: true });
    expect(logged.map((e) => e.n)).toEqual([1, 2]);
    expect(logged[1]).toMatchObject({ prevBranch: 'splash', branch: 'data-plane', branchChanged: true });
    expect(logged[1].changed).toEqual(expect.arrayContaining(['branch', 'sessionAttached', 'cacheOwnedByUser']));
  });

  it('marks an A<->B ping-pong and a burst of branch changes', () => {
    const { tracer, logged, tick } = setup();
    const seq = ['splash', 'public', 'splash', 'public', 'splash', 'public'] as const;
    for (const branch of seq) {
      tracer.record({ ...base, branch });
      tick(10);
    }
    expect(logged[2].marker).toBeNull();
    expect(logged[3].marker).toMatch(/^REPEAT splash<->public/);
    expect(logged[5].marker).toMatch(/REPEAT splash<->public; BURST 6 branch changes/);
    expect(formatSessionTreeTraceEntry(logged[5])).toMatch(/^\[SessionTreeTrace\] ⚠ REPEAT/);
  });

  it('does not flag a normal splash -> data-plane handoff', () => {
    const { tracer, logged, tick } = setup();
    tracer.record(base);
    tick(2000);
    tracer.record({ ...base, status: 'authenticated' });
    tracer.record({ ...base, status: 'authenticated', branch: 'data-plane', sessionAttached: true, cacheOwnedByUser: true });
    expect(logged.every((e) => e.marker === null)).toBe(true);
  });

  it('redacts id-like path segments and query strings', () => {
    expect(redactPathname('/trip/3f2b8c1e-1a2b-4c3d-9e8f-001122334455?token=abc')).toBe('/trip/:id');
    expect(redactPathname('/driver/9008008008')).toBe('/driver/:id');
    expect(redactPathname('/invite/AbCdEf1234567890xyz')).toBe('/invite/:id');
    expect(redactPathname('/find-loads')).toBe('/find-loads');
    expect(redactPathname(null)).toBe('');
  });
});
