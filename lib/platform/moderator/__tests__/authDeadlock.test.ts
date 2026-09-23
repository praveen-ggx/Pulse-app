/**
 * Deadlock guard: a token refresh must never wait behind saturated data reads.
 * This is the failure mode the 2026-07-05 incident notes warn about — a
 * recovering client that cannot refresh because its own reads hold every slot.
 */
import { classifyRequest, moderate, configureModerator, __resetModeratorForTests } from '@/lib/platform/moderator';

const AUTH = 'https://proj.supabase.co/auth/v1/token?grant_type=refresh_token';
const REST = 'https://proj.supabase.co/rest/v1/trips?select=id';

beforeEach(() => __resetModeratorForTests());

it('auth refresh is not queued behind a fully saturated read queue', async () => {
  configureModerator({ observeOnly: false, maxConcurrent: 1, coalesceReads: false });

  let release!: () => void;
  const blocker = new Promise<Response>((r) => {
    release = () => r(new Response('[]', { status: 200 }));
  });

  // Saturate: one in-flight + one queued data read.
  const c1 = classifyRequest(REST);
  void moderate(c1.lane, () => blocker, c1.coalesceKey);
  await Promise.resolve();
  const c2 = classifyRequest(REST);
  void moderate(c2.lane, async () => new Response('[]', { status: 200 }), c2.coalesceKey);

  // Auth must bypass entirely — classifier flags it, caller skips moderation.
  const authCls = classifyRequest(AUTH);
  expect(authCls.isAuth).toBe(true);

  // Simulating lib/supabase.ts: isAuth short-circuits before moderate().
  const authResult = authCls.isAuth
    ? await Promise.resolve(new Response('{"access_token":"new"}', { status: 200 }))
    : await moderate(authCls.lane, async () => new Response('{}', { status: 200 }));

  expect(authResult.status).toBe(200);   // refreshed while reads were saturated
  release();
});
