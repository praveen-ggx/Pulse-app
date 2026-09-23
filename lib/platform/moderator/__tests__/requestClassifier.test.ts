import { classifyRequest, LANE_HEADER } from '../requestClassifier';

const REST = 'https://proj.supabase.co/rest/v1';

describe('bypass rules', () => {
  it.each([
    ['auth', 'https://proj.supabase.co/auth/v1/token?grant_type=refresh_token'],
    ['storage', 'https://proj.supabase.co/storage/v1/object/pods/a.jpg'],
    ['realtime', 'https://proj.supabase.co/realtime/v1/websocket'],
  ])('never coalesces or reclassifies %s traffic', (_label, url) => {
    const c = classifyRequest(url);
    expect(c.coalesceKey).toBeUndefined();
    expect(c.lane).toBe('interactive');
  });

  it('flags auth so the caller can bypass moderation entirely', () => {
    expect(classifyRequest(`${REST}/trips?select=id`).isAuth).toBe(false);
    expect(classifyRequest('https://proj.supabase.co/auth/v1/token').isAuth).toBe(true);
  });
});

describe('shape guard', () => {
  it('flags select=* and missing limit', () => {
    const c = classifyRequest(`${REST}/trips?select=*&organization_id=eq.1`);
    expect(c.violations).toEqual(expect.arrayContaining(['select-star', 'unbounded']));
  });

  it('accepts an explicit column list with a limit', () => {
    const c = classifyRequest(`${REST}/trips?select=id,status&limit=200`);
    expect(c.violations).toEqual([]);
  });

  it('treats a Range header as bounded', () => {
    const c = classifyRequest(`${REST}/trips?select=id`, {
      headers: { Range: '0-199' },
    });
    expect(c.violations).not.toContain('unbounded');
  });

  it('treats .single()/.maybeSingle() as bounded', () => {
    const c = classifyRequest(`${REST}/trips?select=id&id=eq.7`, {
      headers: { Accept: 'application/vnd.pgrst.object+json' },
    });
    expect(c.violations).not.toContain('unbounded');
  });

  it('treats aggregates as bounded', () => {
    const c = classifyRequest(`${REST}/trips?select=count()`);
    expect(c.violations).not.toContain('unbounded');
  });

  it('does not shape-check writes', () => {
    const c = classifyRequest(`${REST}/trips`, { method: 'POST' });
    expect(c.violations).toEqual([]);
    expect(c.coalesceKey).toBeUndefined();
  });
});

describe('coalesce keys', () => {
  it('matches identical reads regardless of param order', () => {
    const a = classifyRequest(`${REST}/trips?select=id&status=eq.active`);
    const b = classifyRequest(`${REST}/trips?status=eq.active&select=id`);
    expect(a.coalesceKey).toBe(b.coalesceKey);
  });

  it('separates different filters', () => {
    const a = classifyRequest(`${REST}/trips?select=id&status=eq.active`);
    const b = classifyRequest(`${REST}/trips?select=id&status=eq.closed`);
    expect(a.coalesceKey).not.toBe(b.coalesceKey);
  });

  it('never shares a key across users — RLS safety', () => {
    const url = `${REST}/trips?select=id`;
    const a = classifyRequest(url, { headers: { Authorization: 'Bearer user-a' } });
    const b = classifyRequest(url, { headers: { Authorization: 'Bearer user-b' } });
    expect(a.coalesceKey).not.toBe(b.coalesceKey);
  });

  it('only coalesces GETs', () => {
    expect(classifyRequest(`${REST}/trips`, { method: 'PATCH' }).coalesceKey).toBeUndefined();
  });
});

describe('lane selection', () => {
  it('defaults to interactive', () => {
    expect(classifyRequest(`${REST}/trips?select=id`).lane).toBe('interactive');
  });

  it('honours an explicit lane header', () => {
    const c = classifyRequest(`${REST}/trips?select=id`, {
      headers: { [LANE_HEADER]: 'background' },
    });
    expect(c.lane).toBe('background');
  });

  it('ignores a bogus lane header', () => {
    const c = classifyRequest(`${REST}/trips?select=id`, {
      headers: { [LANE_HEADER]: 'nonsense' },
    });
    expect(c.lane).toBe('interactive');
  });
});
