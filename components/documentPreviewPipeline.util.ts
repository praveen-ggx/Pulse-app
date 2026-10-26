/**
 * Shared document-preview pipeline — identity, queue, cache, cleanup.
 * JPEG/bitmap values are display artifacts; the source PDF is unchanged.
 */

export type PreviewTier = "thumb" | "full";

export const PREVIEW_EDGE: Record<PreviewTier, number> = {
  thumb: 480,
  full: 1200,
};

export type DocumentPreviewRequest = {
  documentKey: string;
  version: string;
  page?: number;
  tier: PreviewTier;
};

export type DocumentPreviewStats = {
  renders: number;
  hits: number;
  misses: number;
  errors: number;
  inflightPeak: number;
  queuePeak: number;
};

export type PreviewGetOptions = {
  signal?: AbortSignal;
  priority?: number;
};

export function normalizePreviewPage(page?: number): number {
  if (!Number.isFinite(page) || page == null) return 1;
  return Math.max(1, Math.round(page));
}

export function documentPreviewCacheKey(request: DocumentPreviewRequest): string {
  const key = request.documentKey.trim();
  const version = request.version.trim() || "0";
  return `${key}|${version}|${normalizePreviewPage(request.page)}|${request.tier}`;
}

export function previewTierForBox(width: number, height: number): PreviewTier {
  return Math.max(width, height) >= 280 ? "full" : "thumb";
}

/** Prefer storage path + row id. Never use an expiring signed URL as identity. */
export function documentPreviewIdentity(input: {
  storagePath?: string | null;
  documentId?: string | null;
  fileId?: string | null;
}): { documentKey: string; version: string } | null {
  const storagePath = String(input.storagePath ?? "").trim();
  const documentId = String(input.documentId ?? "").trim();
  const fileId = String(input.fileId ?? "").trim();
  const documentKey = storagePath || documentId || fileId;
  if (!documentKey) return null;
  return {
    documentKey,
    version: documentId || fileId || storagePath,
  };
}

export function isLikelyExpiredSignedUrlError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return /401|403|expired|jwt|signature/i.test(text);
}

type QueueJob<T> = {
  key: string;
  priority: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

type Inflight<T> = {
  promise: Promise<T>;
  waiters: number;
  abort: AbortController;
};

export function createDocumentPreviewPipeline<T>(options: {
  render: (request: DocumentPreviewRequest, ctx: { signal: AbortSignal }) => Promise<T>;
  dispose?: (value: T) => void;
  concurrency?: number;
  maxEntries?: number;
}) {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const maxEntries = Math.max(4, options.maxEntries ?? 40);
  const cache = new Map<string, T>();
  const inflight = new Map<string, Inflight<T>>();
  const queue: QueueJob<T>[] = [];
  let active = 0;
  const stats: DocumentPreviewStats = {
    renders: 0,
    hits: 0,
    misses: 0,
    errors: 0,
    inflightPeak: 0,
    queuePeak: 0,
  };

  function bumpPeaks(): void {
    stats.inflightPeak = Math.max(stats.inflightPeak, inflight.size);
    stats.queuePeak = Math.max(stats.queuePeak, queue.length);
  }

  function remember(key: string, value: T): void {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, value);
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (!oldest) break;
      const stale = cache.get(oldest);
      cache.delete(oldest);
      if (stale !== undefined) options.dispose?.(stale);
    }
  }

  function pump(): void {
    while (active < concurrency && queue.length > 0) {
      queue.sort((a, b) => b.priority - a.priority);
      const job = queue.shift();
      if (!job) return;
      active += 1;
      void job
        .run()
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  function enqueue(job: QueueJob<T>): void {
    queue.push(job);
    bumpPeaks();
    pump();
  }

  function dropQueued(key: string, reason: unknown): void {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index]?.key !== key) continue;
      const job = queue.splice(index, 1)[0];
      job?.reject(reason);
    }
  }

  function get(request: DocumentPreviewRequest, getOptions: PreviewGetOptions = {}): Promise<T> {
    const key = documentPreviewCacheKey(request);
    const cached = cache.get(key);
    if (cached !== undefined) {
      stats.hits += 1;
      return Promise.resolve(cached);
    }

    const existing = inflight.get(key);
    if (existing) {
      stats.hits += 1;
      existing.waiters += 1;
      const shared = existing.promise;
      if (getOptions.signal) {
        const onAbort = () => {
          existing.waiters -= 1;
          if (existing.waiters <= 0) {
            existing.abort.abort();
            dropQueued(key, existing.abort.signal.reason ?? new Error("cancelled"));
            inflight.delete(key);
          }
        };
        if (getOptions.signal.aborted) {
          onAbort();
          return Promise.reject(getOptions.signal.reason ?? new Error("cancelled"));
        }
        getOptions.signal.addEventListener("abort", onAbort, { once: true });
      }
      return shared;
    }

    stats.misses += 1;
    const abort = new AbortController();
    if (getOptions.signal?.aborted) {
      return Promise.reject(getOptions.signal.reason ?? new Error("cancelled"));
    }
    if (getOptions.signal) {
      getOptions.signal.addEventListener(
        "abort",
        () => abort.abort(getOptions.signal?.reason),
        { once: true },
      );
    }

    let resolveJob!: (value: T) => void;
    let rejectJob!: (error: unknown) => void;
    const started = new Promise<T>((resolve, reject) => {
      resolveJob = resolve;
      rejectJob = reject;
    });

    const entry: Inflight<T> = {
      promise: started,
      waiters: 1,
      abort,
    };
    inflight.set(key, entry);
    bumpPeaks();

    enqueue({
      key,
      priority: getOptions.priority ?? 0,
      resolve: resolveJob,
      reject: rejectJob,
      run: async () => {
        if (abort.signal.aborted) throw abort.signal.reason ?? new Error("cancelled");
        stats.renders += 1;
        try {
          const value = await options.render(request, { signal: abort.signal });
          if (abort.signal.aborted) {
            options.dispose?.(value);
            throw abort.signal.reason ?? new Error("cancelled");
          }
          remember(key, value);
          return value;
        } catch (error) {
          stats.errors += 1;
          throw error;
        }
      },
    });

    return started.finally(() => {
      if (inflight.get(key) === entry) inflight.delete(key);
    });
  }

  function peek(request: DocumentPreviewRequest): T | null {
    return cache.get(documentPreviewCacheKey(request)) ?? null;
  }

  function invalidateDocument(documentKey: string): void {
    const prefix = `${documentKey.trim()}|`;
    for (const key of [...cache.keys()]) {
      if (!key.startsWith(prefix)) continue;
      const value = cache.get(key);
      cache.delete(key);
      if (value !== undefined) options.dispose?.(value);
    }
    for (const key of [...inflight.keys()]) {
      if (!key.startsWith(prefix)) continue;
      inflight.get(key)?.abort.abort();
      dropQueued(key, new Error("invalidated"));
      inflight.delete(key);
    }
  }

  function resetStats(): void {
    stats.renders = 0;
    stats.hits = 0;
    stats.misses = 0;
    stats.errors = 0;
    stats.inflightPeak = 0;
    stats.queuePeak = 0;
  }

  function snapshot(): DocumentPreviewStats {
    return { ...stats };
  }

  function size(): number {
    return cache.size;
  }

  return { get, peek, invalidateDocument, resetStats, stats: snapshot, size };
}
