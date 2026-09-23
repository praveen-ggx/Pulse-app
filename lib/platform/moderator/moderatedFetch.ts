/**
 * Moderated fetch for Supabase calls that do NOT go through the supabase-js
 * client — i.e. hand-rolled `fetch()` to Edge Functions.
 *
 * The client's own `global.fetch` is moderated in lib/supabase.ts, so anything
 * issued via `supabase().from()/.rpc()/.functions.invoke()` is already covered.
 * Raw `fetch()` to `${supabaseUrl}/functions/v1/...` is not: it reaches the same
 * backend (and the same connection pool, whenever the function touches the DB)
 * while being invisible to the Moderator.
 *
 * Use this for those calls so every request to the backend passes one chokepoint.
 * @see docs/DB_LOAD_ARCHITECTURE_REVIEW.md
 */
import { moderate } from './requestModerator';
import { classifyRequest } from './requestClassifier';

/**
 * Drop-in replacement for `fetch` on Supabase Edge Function URLs.
 *
 * Edge Function calls are POSTs, so they are classified as writes: always the
 * interactive lane, never coalesced, never shed by the circuit breaker.
 */
export async function moderatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const { lane, coalesceKey } = classifyRequest(input, init);
  return moderate(lane, () => fetch(input, init), coalesceKey);
}
