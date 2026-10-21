/**
 * The persisted query cache must never be served to a different user than the
 * one who filled it (Ground Ops login saw an admin's / another Ground Ops' queue).
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  CACHE_OWNER_QUERY_KEY,
  reconcileQueryCacheOwner,
  useQueryCacheOwner,
} from '@/lib/cache/cacheOwner';

const COMPLIANCE_KEY = ['q', 'tripCompliance', 'pipeline', 'org-1'];

function clientWith(owner: string | null, data = true): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  if (owner) client.setQueryData(CACHE_OWNER_QUERY_KEY, owner);
  if (data) client.setQueryData(COMPLIANCE_KEY, ['trip-of-' + (owner ?? 'unknown')]);
  return client;
}

describe('reconcileQueryCacheOwner', () => {
  it('keeps the cache for the same user', () => {
    const client = clientWith('user-a');
    expect(reconcileQueryCacheOwner(client, 'user-a')).toBe(false);
    expect(client.getQueryData(COMPLIANCE_KEY)).toEqual(['trip-of-user-a']);
  });

  it('clears another user\'s cache and tags it for the new user', () => {
    const client = clientWith('user-a');
    expect(reconcileQueryCacheOwner(client, 'user-b')).toBe(true);
    expect(client.getQueryData(COMPLIANCE_KEY)).toBeUndefined();
    expect(client.getQueryData(CACHE_OWNER_QUERY_KEY)).toBe('user-b');
  });

  it('clears on sign-out and leaves no owner', () => {
    const client = clientWith('user-a');
    expect(reconcileQueryCacheOwner(client, null)).toBe(true);
    expect(client.getQueryData(COMPLIANCE_KEY)).toBeUndefined();
    expect(client.getQueryData(CACHE_OWNER_QUERY_KEY)).toBeUndefined();
  });

  it('clears data of unknown ownership (cache written before the tag existed)', () => {
    const client = clientWith(null);
    expect(reconcileQueryCacheOwner(client, 'user-a')).toBe(true);
    expect(client.getQueryData(COMPLIANCE_KEY)).toBeUndefined();
    expect(client.getQueryData(CACHE_OWNER_QUERY_KEY)).toBe('user-a');
  });

  it('does nothing on an empty cache with nobody signed in', () => {
    const client = clientWith(null, false);
    expect(reconcileQueryCacheOwner(client, null)).toBe(false);
  });
});

describe('owner tag persistence', () => {
  it('survives dehydrate → hydrate and is never garbage-collected', () => {
    const { makeQueryClient } = require('@/lib/queryClient');
    const { dehydrate, hydrate } = require('@tanstack/react-query');
    const before: QueryClient = makeQueryClient();
    before.setQueryData(CACHE_OWNER_QUERY_KEY, 'user-a');
    const ownerQuery = before.getQueryCache().find({ queryKey: CACHE_OWNER_QUERY_KEY });
    expect(ownerQuery?.gcTime).toBe(Infinity);

    const after: QueryClient = makeQueryClient();
    hydrate(after, JSON.parse(JSON.stringify(dehydrate(before))));
    expect(after.getQueryData(CACHE_OWNER_QUERY_KEY)).toBe('user-a');
    before.clear();
    after.clear();
  });
});

describe('useQueryCacheOwner', () => {
  function render(client: QueryClient, initial: { userId: string | null; settled: boolean }) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(({ userId, settled }) => useQueryCacheOwner(userId, settled), {
      wrapper,
      initialProps: initial,
    });
  }

  it('is not ready until auth has settled, then wipes a previous user\'s cache', async () => {
    const client = clientWith('user-a');
    const hook = render(client, { userId: null, settled: false });
    expect(hook.result.current).toBe(false);
    expect(client.getQueryData(COMPLIANCE_KEY)).toEqual(['trip-of-user-a']);

    hook.rerender({ userId: 'user-b', settled: true });
    await waitFor(() => expect(hook.result.current).toBe(true));
    expect(client.getQueryData(COMPLIANCE_KEY)).toBeUndefined();
    expect(client.getQueryData(CACHE_OWNER_QUERY_KEY)).toBe('user-b');
  });

  it('goes not-ready on a user switch until the cache is reconciled', async () => {
    const client = clientWith('user-a');
    const hook = render(client, { userId: 'user-a', settled: true });
    await waitFor(() => expect(hook.result.current).toBe(true));
    expect(client.getQueryData(COMPLIANCE_KEY)).toEqual(['trip-of-user-a']);

    act(() => hook.rerender({ userId: 'user-b', settled: true }));
    await waitFor(() => expect(hook.result.current).toBe(true));
    expect(client.getQueryData(COMPLIANCE_KEY)).toBeUndefined();
  });
});
