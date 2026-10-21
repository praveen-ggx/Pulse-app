/**
 * Per-user ownership of the persisted query cache.
 *
 * The TanStack cache is persisted per device and its keys are org-scoped, not
 * user-scoped. Signing out did not clear it, so the next login on the same
 * browser hydrated the previous user's lists: a Ground Ops login saw an admin's
 * Compliance queue (345 trips instead of their own), and one Ground Ops login
 * saw another's. Server access rules were correct; the leak was client-side.
 *
 * The cache now carries the id of the user it belongs to. Once the persisted
 * cache has been restored and auth has settled, a different user — or nobody —
 * wipes it before any authenticated screen mounts.
 */
import { useIsRestoring, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** Persisted with the rest of the cache; never garbage-collected (see makeQueryClient). */
export const CACHE_OWNER_QUERY_KEY = ['cache-owner'] as const;

/**
 * Make the cache belong to `userId` (null = signed out). Clears every query when
 * the cache holds another user's data, or data of unknown ownership (written
 * before this tag existed). Returns true when it cleared.
 */
export function reconcileQueryCacheOwner(client: QueryClient, userId: string | null): boolean {
  const owner = client.getQueryData<string>(CACHE_OWNER_QUERY_KEY) ?? null;
  if (owner === userId) return false;

  const hasUnownedData = client
    .getQueryCache()
    .getAll()
    .some((q) => q.queryKey[0] !== CACHE_OWNER_QUERY_KEY[0]);
  const cleared = owner !== null || hasUnownedData;
  if (cleared) client.clear();
  if (userId) client.setQueryData(CACHE_OWNER_QUERY_KEY, userId);
  return cleared;
}

/**
 * True once the cache is known to belong to `userId`. Gate the authenticated
 * data plane on it so no screen reads (or writes into) a previous user's cache.
 * `settled` = auth has decided who is signed in (a user, or definitely nobody).
 */
export function useQueryCacheOwner(userId: string | null, settled: boolean): boolean {
  const client = useQueryClient();
  const isRestoring = useIsRestoring();
  const [readyFor, setReadyFor] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (isRestoring || !settled) return;
    reconcileQueryCacheOwner(client, userId);
    setReadyFor(userId);
  }, [client, isRestoring, settled, userId]);

  return !isRestoring && readyFor === userId;
}
