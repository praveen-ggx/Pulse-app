/**
 * Proves the Moderator actually intercepts real supabase-js traffic:
 * .from().select(), .rpc(), writes, and .functions.invoke() — not just that
 * the wiring compiles.
 */
import { createClient } from '@supabase/supabase-js';
import {
  moderate,
  classifyRequest,
} from '@/lib/platform/moderator';

const URL_ = 'https://proj.supabase.co';
const KEY = 'anon-key';

// Mirror of the production wiring in lib/supabase.ts.
function makeModeratedClient(seen: string[]) {
  const moderatedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const { lane, coalesceKey, isAuth } = classifyRequest(input, init);
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (isAuth) {
      seen.push(`BYPASS(auth) ${raw}`);
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    return moderate(
      lane,
      () => {
        seen.push(`MODERATED(${lane}) ${raw}`);
        return Promise.resolve(
          new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
        );
      },
      coalesceKey,
    );
  };
  return createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: moderatedFetch as typeof fetch },
  });
}

it('routes table reads, RPC, writes and edge-function invokes through the Moderator', async () => {
  const seen: string[] = [];
  const sb = makeModeratedClient(seen);

  await sb.from('trips').select('id').eq('organization_id', 'org-1').limit(10);
  await sb.rpc('get_trips_for_org', { p_org_id: 'org-1' });
  await sb.from('transactions').insert({ id: 'tx-1' });
  await sb.from('trips').update({ status: 'x' }).eq('id', 't1');
  await sb.from('trips').delete().eq('id', 't1');
  await sb.functions.invoke('penny-drop', { body: {} });

  // Every single call must have been moderated; none may have slipped past.
  expect(seen).toHaveLength(6);
  expect(seen.every((s) => s.startsWith('MODERATED'))).toBe(true);

  // Spot-check the actual URLs so a future refactor that changes routing is visible.
  expect(seen.some((s) => s.includes('/rest/v1/trips?select=id'))).toBe(true);
  expect(seen.some((s) => s.includes('/rest/v1/rpc/get_trips_for_org'))).toBe(true);
  expect(seen.some((s) => s.includes('/functions/v1/penny-drop'))).toBe(true);
});
