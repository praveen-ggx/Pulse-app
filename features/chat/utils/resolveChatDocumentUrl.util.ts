/**
 * Resolves a Supabase storage path to a time-limited HTTPS URL for chat document_share messages.
 *
 * Canonical bucket: `trip-documents` (same as tripDocuments.service / POD photos).
 * Current objects are signed exactly once — no `documents` / `pod-documents` probing.
 *
 * Signed URLs are valid for 60 min; caching at 50 min avoids serving an about-to-expire URL.
 *
 * ONLY plain `/object/sign/` URLs are produced. Two endpoints are unusable here:
 *   • `/render/image/sign/…` (imgproxy transforms) → 403 FeatureNotEnabled,
 *     "feature not enabled for this tenant". createSignedUrl still hands back a
 *     signed transform URL, so the failure only surfaces as a broken <Image>.
 *   • `/object/public/…` and `/render/image/public/…` → 400 NoSuchBucket, because
 *     every bucket here is private. getPublicUrl is a pure string builder and
 *     never errors, so this fallback could only ever produce a broken URL.
 * Re-enable transforms only after confirming the endpoint returns 200 for this project.
 */
import { supabase } from '@/lib/supabase';

const SIGNED_EXPIRY_SEC = 3600;
const CACHE_TTL_MS = 50 * 60 * 1000;

const CANONICAL_BUCKET = 'trip-documents' as const;

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Session-scoped blob URL cache, reference-counted.
 * Each tryChatDocumentBlobObjectUrl caller must call revoke when it drops the
 * URL. The object URL is revoked when the last caller releases it, or when
 * invalidateChatDocumentUrlCaches runs after the object is deleted.
 */
const blobUrlCache = new Map<string, { url: string; refs: number }>();

/**
 * In-flight request dedup — separate from the TTL caches above, which only short-circuit
 * *after* a request completes. Without this, N components mounting for the same storagePath
 * before the cache is warm each fire their own createSignedUrl/download call. Keyed the same
 * way as the corresponding cache; cleared once the shared promise settles either way.
 */
const inFlightSignedUrl = new Map<string, Promise<string | null>>();
const inFlightBlobUrl = new Map<string, Promise<string | null>>();

type ImageTransformResize = "cover" | "contain";

function signCanonicalBucket(
  path: string,
): Promise<{ url: string } | null> {
  return supabase()
    .storage.from(CANONICAL_BUCKET)
    .createSignedUrl(path, SIGNED_EXPIRY_SEC)
    .then(({ data, error }) => {
      if (!error && data?.signedUrl) return { url: data.signedUrl };
      return null;
    })
    .catch(() => null);
}

/** Strip accidental bucket prefix so createSignedUrl targets the object key inside the bucket. */
export function normalizeTripDocumentsStoragePath(raw: string): string {
  let path = String(raw ?? '').trim();
  if (!path || /^https?:\/\//i.test(path)) return path;
  // Storage object keys never contain query params — reject Expo dev-server URLs or other junk.
  if (path.includes('?')) return '';
  const stripped = path.replace(/^\/*/, '');
  if (stripped.startsWith('trip-documents/')) return stripped.slice('trip-documents/'.length);
  if (stripped.startsWith('documents/')) return stripped.slice('documents/'.length);
  if (stripped.startsWith('pod-documents/')) return stripped.slice('pod-documents/'.length);
  return path;
}

/** Synchronous read of a valid cached signed URL — safe during render (no Supabase client I/O). */
export function peekChatDocumentSignedUrl(storagePath: string): string | null {
  const raw = String(storagePath ?? "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = normalizeTripDocumentsStoragePath(raw);
  if (!path) return null;
  const cached = signedUrlCache.get(path);
  if (cached && Date.now() < cached.expiresAt) return cached.url;
  return null;
}

/** Warm the signed-URL cache after upload so the sender paints without a Storage round-trip. */
export function warmChatDocumentSignedUrlCache(storagePath: string, signedUrl: string) {
  const path = normalizeTripDocumentsStoragePath(String(storagePath ?? "").trim());
  const url = String(signedUrl ?? "").trim();
  if (!path || !/^https?:\/\//i.test(url)) return;
  signedUrlCache.set(path, { url, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Warm the thumbnail cache after upload / prefetch.
 * Thumbnails and full images share one plain signed URL per path — transforms are
 * unavailable on this tenant (see file header), so there is no per-size cache slot.
 */
export function warmChatImageThumbnailCache(storagePath: string, signedUrl: string) {
  warmChatDocumentSignedUrlCache(storagePath, signedUrl);
}

async function fetchChatDocumentStorageUrl(path: string): Promise<string | null> {
  const signed = await signCanonicalBucket(path);
  if (signed) {
    signedUrlCache.set(path, { url: signed.url, expiresAt: Date.now() + CACHE_TTL_MS });
    return signed.url;
  }

  // No getPublicUrl fallback — every bucket here is private, so a public URL is a
  // guaranteed 400 (see file header). Returning null lets callers use the blob path.
  if (__DEV__) {
    console.warn('[resolveChatDocumentStorageUrl] no signed URL', path);
  }
  return null;
}

export async function resolveChatDocumentStorageUrl(storagePath: string): Promise<string | null> {
  const path = normalizeTripDocumentsStoragePath(String(storagePath ?? '').trim());
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  const cached = signedUrlCache.get(path);
  if (cached && Date.now() < cached.expiresAt) return cached.url;

  const pending = inFlightSignedUrl.get(path);
  if (pending) return pending;

  const request = fetchChatDocumentStorageUrl(path).finally(() => {
    inFlightSignedUrl.delete(path);
  });
  inFlightSignedUrl.set(path, request);
  return request;
}

/**
 * Downloads the object with the authenticated Supabase client and returns a blob: URL.
 * Use for inline preview on web when `<Image source={{ uri: signedUrl }}>` is blocked by CORS.
 * Caller must revoke the URL when unmounting.
 */
function retainChatBlob(path: string): { url: string; revoke: () => void } | null {
  const entry = blobUrlCache.get(path);
  if (!entry) return null;
  entry.refs += 1;
  let released = false;
  return {
    url: entry.url,
    revoke: () => {
      if (released) return;
      released = true;
      const current = blobUrlCache.get(path);
      if (!current || current.url !== entry.url) return;
      current.refs -= 1;
      if (current.refs > 0) return;
      blobUrlCache.delete(path);
      try {
        if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(current.url);
        }
      } catch {
        /* noop */
      }
    },
  };
}

async function fetchChatDocumentBlobObjectUrl(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase()
      .storage.from(CANONICAL_BUCKET)
      .download(path);
    if (!error && data) {
      const url = URL.createObjectURL(data);
      blobUrlCache.set(path, { url, refs: 0 });
      return url;
    }
  } catch {
    return null;
  }
  return null;
}

export async function tryChatDocumentBlobObjectUrl(
  storagePath: string,
): Promise<{ url: string; revoke: () => void } | null> {
  const path = normalizeTripDocumentsStoragePath(String(storagePath ?? '').trim());
  if (!path || /^https?:\/\//i.test(path)) return null;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null;
  }

  // Return cached blob URL — avoids re-downloading the same binary on every
  // component mount or parent re-render. Each caller holds one reference.
  if (blobUrlCache.has(path)) return retainChatBlob(path);

  const pending = inFlightBlobUrl.get(path);
  if (pending) {
    const url = await pending;
    return url ? retainChatBlob(path) : null;
  }

  const request = fetchChatDocumentBlobObjectUrl(path).finally(() => {
    inFlightBlobUrl.delete(path);
  });
  inFlightBlobUrl.set(path, request);
  const url = await request;
  return url ? retainChatBlob(path) : null;
}

/**
 * Instant read of a cached signed URL — use for initial React state so the first
 * paint does not schedule an effect-only network round-trip.
 *
 * Thumbnail and full-size resolve to the same plain signed URL, because imgproxy
 * transforms are unavailable on this tenant (see file header). The width / height /
 * quality / resize parameters are accepted for call-site compatibility and to keep
 * the intended fetch box documented, but they do not affect the URL.
 */
export function peekChatImageThumbnailUrl(
  storagePath: string,
  _width = 300,
  _height = 300,
  _quality = 70,
  _resize: ImageTransformResize = "cover",
): string | null {
  const raw = String(storagePath ?? "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = normalizeTripDocumentsStoragePath(raw);
  if (!path) return null;
  return peekChatDocumentSignedUrl(path);
}

export async function resolveChatImageThumbnail(
  storagePath: string,
  _width = 300,
  _height = 300,
  _quality = 70,
  _resize: ImageTransformResize = "cover",
): Promise<string | null> {
  const path = normalizeTripDocumentsStoragePath(String(storagePath ?? '').trim());
  if (!path || /^https?:\/\//i.test(path)) return storagePath || null;
  // Dedupe on path alone — shared with signedUrlCache / inFlightSignedUrl, so every
  // on-screen size for one object collapses into a single createSignedUrl call.
  return resolveChatDocumentStorageUrl(storagePath);
}

/** Lightbox: same signed object URL as the thumbnail (already cached by then). */
export async function resolveChatImageFullDisplayUrl(
  storagePath: string,
  maxEdge = 1280,
  quality = 80,
): Promise<string | null> {
  return resolveChatImageThumbnail(storagePath, maxEdge, maxEdge, quality);
}

/** Sync peek for the lightbox URL. */
export function peekChatImageFullDisplayUrl(
  storagePath: string,
  maxEdge = 1280,
  quality = 80,
): string | null {
  return peekChatImageThumbnailUrl(storagePath, maxEdge, maxEdge, quality);
}

/**
 * Drop signed/blob caches for a path after the object is removed from Storage.
 * Prevents chat from painting a cached URL that then 404s forever.
 */
export function invalidateChatDocumentUrlCaches(storagePath: string): void {
  const path = normalizeTripDocumentsStoragePath(String(storagePath ?? '').trim());
  if (!path || /^https?:\/\//i.test(path)) return;
  signedUrlCache.delete(path);
  inFlightSignedUrl.delete(path);
  inFlightBlobUrl.delete(path);
  const blob = blobUrlCache.get(path);
  if (blob) {
    blobUrlCache.delete(path);
    try {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(blob.url);
      }
    } catch {
      /* noop */
    }
  }
}

/**
 * Web fallback when signed URLs fail CORS on `<Image>` — same-origin fetch via JS often succeeds for viewing.
 */
export async function fetchSignedUrlAsObjectUrl(
  signedHttpsUrl: string,
): Promise<{ url: string; revoke: () => void } | null> {
  if (
    typeof fetch === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null;
  }
  const u = String(signedHttpsUrl ?? '').trim();
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const res = await fetch(u);
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return {
      url,
      revoke: () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* noop */
        }
      },
    };
  } catch {
    return null;
  }
}
