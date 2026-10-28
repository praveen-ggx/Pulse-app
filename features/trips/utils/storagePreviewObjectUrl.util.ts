/**
 * In-app preview for private Storage objects.
 *
 * On web, a signed HTTPS URL is not a successful preview: the browser blocks
 * it (CORS / framing). Download with the signed-in client and paint the Blob.
 * A signed URL is fetched only as a second attempt to obtain that Blob.
 * Native keeps the signed URL, which the image/PDF viewer can load.
 *
 * Blob URLs are reference-counted. Revoke only when the last viewer releases.
 */
import { supabase } from "@/lib/supabase";

export type StoragePreviewFailureKind = "missing" | "unauthorized" | "expired" | "failed";

export type StoragePreviewResult =
  | { ok: true; url: string; release: () => void }
  | { ok: false; kind: StoragePreviewFailureKind };

type CacheEntry = { url: string; refs: number; revoke: boolean };
type LoadResult = { blob: Blob } | { kind: StoragePreviewFailureKind };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<LoadResult>>();
const holdsByUrl = new Map<string, Array<() => void>>();

/** Local picker / in-memory preview — do not send these to Storage. */
export function isInlinePreviewUri(value: string | null | undefined): boolean {
  return /^(blob:|data:|file:|content:)/i.test(String(value ?? "").trim());
}

export function canMaterializeStoragePreview(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  );
}

export function storagePreviewFailureMessage(kind: StoragePreviewFailureKind): string {
  if (kind === "missing") return "This document is missing.";
  if (kind === "unauthorized") return "You don't have access to this document.";
  if (kind === "expired") return "This preview expired. Try again.";
  return "Could not load this document.";
}

function classifyStorageFailure(
  error: { message?: string | null; statusCode?: string | number | null } | null | undefined,
  fallback: StoragePreviewFailureKind = "failed",
): StoragePreviewFailureKind {
  const status = Number(error?.statusCode ?? 0);
  const message = String(error?.message ?? "").toLowerCase();
  if (status === 404 || message.includes("not found") || message.includes("nosuchkey")) {
    return "missing";
  }
  if (
    message.includes("expired") ||
    message.includes("jwt expired") ||
    (status === 400 && message.includes("exp"))
  ) {
    return "expired";
  }
  if (
    status === 401 ||
    status === 403 ||
    message.includes("unauthorized") ||
    message.includes("permission") ||
    message.includes("jwt")
  ) {
    return "unauthorized";
  }
  return fallback;
}

function releaseEntry(key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  cache.delete(key);
  if (entry.revoke) {
    URL.revokeObjectURL(entry.url);
  }
}

function retain(key: string, url: string, revoke: boolean): () => void {
  const existing = cache.get(key);
  if (existing) {
    existing.refs += 1;
  } else {
    cache.set(key, { url, refs: 1, revoke });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseEntry(key);
  };
}

async function signedUrlFor(bucket: string, path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase().storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

async function blobFromSignedUrl(signedUrl: string): Promise<LoadResult> {
  try {
    const response = await fetch(signedUrl);
    if (!response.ok) {
      return {
        kind: classifyStorageFailure(
          { statusCode: response.status, message: response.statusText },
          "failed",
        ),
      };
    }
    const blob = await response.blob();
    if (!blob || blob.size === 0) return { kind: "failed" };
    return { blob };
  } catch {
    return { kind: "failed" };
  }
}

async function loadWebBlob(bucket: string, path: string, signedUrl?: string | null): Promise<LoadResult> {
  let downloadKind: StoragePreviewFailureKind = "failed";
  try {
    const { data, error } = await supabase().storage.from(bucket).download(path);
    if (!error && data && data.size > 0) return { blob: data };
    downloadKind = classifyStorageFailure(error, "failed");
  } catch {
    downloadKind = "failed";
  }

  // A missing object is already decided. Signing/fetching it only adds Storage 400s.
  if (downloadKind === "missing") return { kind: "missing" };

  const signed = (signedUrl ?? "").trim() || (await signedUrlFor(bucket, path));
  if (!signed) return { kind: downloadKind };
  const fetched = await blobFromSignedUrl(signed);
  if ("blob" in fetched) return fetched;
  return { kind: fetched.kind === "failed" ? downloadKind : fetched.kind };
}

export async function openStoragePreview(input: {
  bucket: string;
  path: string;
  signedUrl?: string | null;
}): Promise<StoragePreviewResult> {
  const path = input.path.trim();
  const bucket = input.bucket.trim();
  if (!path || !bucket) return { ok: false, kind: "missing" };
  if (isInlinePreviewUri(path)) {
    return { ok: true, url: path, release: () => {} };
  }
  if (/^https?:\/\//i.test(path) && /\/storage\/v1\/(?:object|render\/image)\//i.test(path)) {
    if (canMaterializeStoragePreview()) {
      const fetched = await blobFromSignedUrl(path);
      if ("blob" in fetched) {
        const url = URL.createObjectURL(fetched.blob);
        const release = retain(`signed:${path}`, url, true);
        return { ok: true, url, release };
      }
      return { ok: false, kind: fetched.kind };
    }
    return { ok: true, url: path, release: () => {} };
  }
  if (/^https?:\/\//i.test(path)) {
    return { ok: true, url: path, release: () => {} };
  }

  const key = `${bucket}:${path}`;

  if (!canMaterializeStoragePreview()) {
    // Native viewers can paint a signed URL, but only after the object is
    // confirmed. A signed URL for a missing object is not a successful preview.
    const probe = await loadWebBlob(bucket, path, input.signedUrl);
    if ("kind" in probe) return { ok: false, kind: probe.kind };
    const signed = (input.signedUrl ?? "").trim() || (await signedUrlFor(bucket, path));
    if (!signed) return { ok: false, kind: "failed" };
    return { ok: true, url: signed, release: () => {} };
  }

  const cached = cache.get(key);
  if (cached) {
    const release = retain(key, cached.url, cached.revoke);
    return { ok: true, url: cached.url, release };
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = loadWebBlob(bucket, path, input.signedUrl).finally(() => {
      if (inflight.get(key) === pending) inflight.delete(key);
    });
    inflight.set(key, pending);
  }
  const loaded = await pending;
  if ("kind" in loaded) return { ok: false, kind: loaded.kind };

  const again = cache.get(key);
  const url = again?.url ?? URL.createObjectURL(loaded.blob);
  const release = retain(key, url, true);
  return { ok: true, url, release };
}

/** Remember a successful preview so a string-returning caller can release it later. */
export function holdStoragePreview(result: StoragePreviewResult): string | null {
  if (!result.ok) return null;
  const stack = holdsByUrl.get(result.url) ?? [];
  stack.push(result.release);
  holdsByUrl.set(result.url, stack);
  return result.url;
}

export function releaseStoragePreviewUrl(url: string | null | undefined): void {
  const key = (url ?? "").trim();
  if (!key) return;
  const stack = holdsByUrl.get(key);
  const release = stack?.pop();
  if (stack && stack.length === 0) holdsByUrl.delete(key);
  release?.();
}

export async function previewPrivateObject(
  bucket: string,
  path: string,
  signedUrl?: string | null,
): Promise<{ url: string | null; kind: StoragePreviewFailureKind | null }> {
  const result = await openStoragePreview({ bucket, path, signedUrl });
  if (!result.ok) return { url: null, kind: result.kind };
  return { url: holdStoragePreview(result), kind: null };
}

/**
 * @deprecated Prefer openStoragePreview. A web failure returns null — never a
 * signed URL the browser cannot paint.
 */
export async function materializeStoragePreviewUrl(
  bucket: string,
  storagePath: string,
  signedUrl?: string | null,
): Promise<string | null> {
  const preview = await previewPrivateObject(bucket, storagePath, signedUrl);
  return preview.url;
}

export function resetStoragePreviewCacheForTests(): void {
  for (const entry of cache.values()) {
    if (entry.revoke) URL.revokeObjectURL(entry.url);
  }
  cache.clear();
  inflight.clear();
  holdsByUrl.clear();
}

/** Drop a cached blob after Storage upserts the same object path. */
export function invalidateStoragePreviewPath(bucket: string, path: string): void {
  const trimmedBucket = bucket.trim();
  const trimmedPath = path.trim();
  if (!trimmedBucket || !trimmedPath) return;
  const exact = `${trimmedBucket}:${trimmedPath}`;
  inflight.delete(exact);
  evictPreviewCacheKey(exact);
}

export function invalidateStoragePreviewPrefix(bucket: string, prefix: string): void {
  const trimmedBucket = bucket.trim();
  const trimmedPrefix = prefix.trim();
  if (!trimmedBucket || !trimmedPrefix) return;
  const keyPrefix = `${trimmedBucket}:`;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(keyPrefix) && key.includes(trimmedPrefix)) evictPreviewCacheKey(key);
  }
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(keyPrefix) && key.includes(trimmedPrefix)) inflight.delete(key);
  }
}

function evictPreviewCacheKey(key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  cache.delete(key);
  if (entry.revoke) URL.revokeObjectURL(entry.url);
}
