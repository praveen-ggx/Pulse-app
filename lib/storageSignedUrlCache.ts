/**
 * Shared signed-URL cache for private Supabase storage buckets.
 *
 * - ~58 minute TTL (signed URLs last 60 minutes).
 * - Concurrent callers for the same path share one in-flight promise.
 * - getUrls() batches uncached paths into one createSignedUrls call.
 * - Failed / empty paths are never stored as valid URLs.
 * - Fails fast while the shared Supabase origin circuit is open.
 */
import { isSupabaseCircuitOpen } from "@/lib/supabaseHttp.util";

export const SIGNED_URL_EXPIRY_SEC = 3600;
export const SIGNED_URL_CACHE_TTL_MS = (SIGNED_URL_EXPIRY_SEC - 120) * 1000;

export type SignOneResult = {
  signedUrl: string | null;
  error?: string | null;
};

export type SignManyRow = {
  path: string;
  signedUrl: string | null;
  error?: string | null;
};

export type StorageSignedUrlCacheOptions = {
  signOne: (path: string, expiresInSec: number) => Promise<SignOneResult>;
  signMany: (paths: string[], expiresInSec: number) => Promise<SignManyRow[]>;
  expirySec?: number;
  cacheTtlMs?: number;
};

type CacheEntry = {
  url: string;
  expiresAtMs: number;
};

export type StorageSignedUrlCache = {
  getUrl: (storagePath: string) => Promise<string | null>;
  getUrls: (storagePaths: string[]) => Promise<Record<string, string | null>>;
  invalidate: (storagePath: string) => void;
  invalidatePrefix: (prefix: string) => void;
  peek: (storagePath: string) => string | null;
};

function trimPath(storagePath: string | null | undefined): string {
  return (storagePath ?? "").trim();
}

export function createStorageSignedUrlCache(
  options: StorageSignedUrlCacheOptions,
): StorageSignedUrlCache {
  const expirySec = options.expirySec ?? SIGNED_URL_EXPIRY_SEC;
  const cacheTtlMs = options.cacheTtlMs ?? SIGNED_URL_CACHE_TTL_MS;

  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<string | null>>();

  function pruneExpired(now = Date.now()): void {
    for (const [path, entry] of cache) {
      if (entry.expiresAtMs <= now) cache.delete(path);
    }
  }

  function peek(storagePath: string): string | null {
    const path = trimPath(storagePath);
    if (!path) return null;
    const entry = cache.get(path);
    if (!entry) return null;
    if (entry.expiresAtMs <= Date.now()) {
      cache.delete(path);
      return null;
    }
    return entry.url;
  }

  function remember(path: string, url: string): void {
    pruneExpired();
    cache.set(path, {
      url,
      expiresAtMs: Date.now() + cacheTtlMs,
    });
  }

  function invalidate(storagePath: string): void {
    const path = trimPath(storagePath);
    if (!path) return;
    cache.delete(path);
    inflight.delete(path);
  }

  function invalidatePrefix(prefix: string): void {
    const start = trimPath(prefix);
    if (!start) return;
    for (const path of [...cache.keys()]) {
      if (path.startsWith(start)) cache.delete(path);
    }
    for (const path of [...inflight.keys()]) {
      if (path.startsWith(start)) inflight.delete(path);
    }
  }

  function resolveRow(
    path: string,
    row: SignManyRow | undefined,
  ): string | null {
    if (!row || row.error) return null;
    const url = row.signedUrl?.trim() || null;
    return url;
  }

  function finish(path: string, pending: Promise<string | null>, url: string | null): string | null {
    if (inflight.get(path) === pending && url) remember(path, url);
    if (inflight.get(path) === pending) inflight.delete(path);
    return url;
  }

  function getUrl(storagePath: string): Promise<string | null> {
    const path = trimPath(storagePath);
    if (!path) return Promise.resolve(null);

    const cached = peek(path);
    if (cached) return Promise.resolve(cached);
    if (isSupabaseCircuitOpen()) return Promise.resolve(null);

    const existing = inflight.get(path);
    if (existing) return existing;

    const pending: Promise<string | null> = options
      .signOne(path, expirySec)
      .then((result) => finish(path, pending, result.signedUrl?.trim() || null))
      .catch(() => finish(path, pending, null));

    inflight.set(path, pending);
    return pending;
  }

  async function getUrls(
    storagePaths: string[],
  ): Promise<Record<string, string | null>> {
    const unique = [
      ...new Set(storagePaths.map((path) => trimPath(path)).filter(Boolean)),
    ];
    const result: Record<string, string | null> = {};
    const toSign: string[] = [];
    const waiting: Promise<void>[] = [];

    for (const path of unique) {
      const cached = peek(path);
      if (cached) {
        result[path] = cached;
        continue;
      }
      const existing = inflight.get(path);
      if (existing) {
        waiting.push(
          existing.then((url) => {
            result[path] = url;
          }),
        );
        continue;
      }
      if (isSupabaseCircuitOpen()) {
        result[path] = null;
        continue;
      }
      toSign.push(path);
    }

    if (toSign.length === 1) {
      const path = toSign[0]!;
      waiting.push(
        getUrl(path).then((url) => {
          result[path] = url;
        }),
      );
    } else if (toSign.length > 1) {
      let resolveBatch!: (rows: SignManyRow[] | null) => void;
      const batchResult = new Promise<SignManyRow[] | null>((resolve) => {
        resolveBatch = resolve;
      });
      const pendingByPath = new Map<string, Promise<string | null>>();

      for (const path of toSign) {
        const pending: Promise<string | null> = batchResult.then((rows) => {
          if (!rows) return finish(path, pending, null);
          const byPath = new Map(
            rows.map((row) => [trimPath(row.path), row] as const),
          );
          const index = toSign.indexOf(path);
          const row = byPath.get(path) ?? rows[index];
          return finish(path, pending, resolveRow(path, row));
        });
        pendingByPath.set(path, pending);
        inflight.set(path, pending);
      }

      try {
        const rows = await options.signMany(toSign, expirySec);
        resolveBatch(rows);
      } catch {
        resolveBatch(null);
      }

      waiting.push(
        ...toSign.map(async (path) => {
          result[path] = (await pendingByPath.get(path)) ?? null;
        }),
      );
    }

    await Promise.all(waiting);
    return result;
  }

  return { getUrl, getUrls, invalidate, invalidatePrefix, peek };
}
